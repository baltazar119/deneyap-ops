import { NextRequest, NextResponse } from 'next/server'
import { TASK_TYPE_VALUES } from '@/lib/taskTypes'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { AI_DAILY_LIMITS } from '@/lib/featureGate'
import { aiYetkiCoz } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function sanitizePromptInput(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/ignore\s{0,20}(instruction|system|prompt|previous)/gi, '[FILTERED]')
    .replace(/\[(SYSTEM|INST|SYS)\]/gi, '[FILTERED]')
}

async function checkGenerateReviseLimit(userId: string): Promise<boolean> {
  const serviceClient = getServiceClient()
  // UTC başlangıcı — sunucunun yerel timezone'undan bağımsız
  const startOfDay = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z')

  const { count } = await serviceClient
    .from('ai_usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('action', ['generate', 'revise'])
    .gte('created_at', startOfDay.toISOString())

  return (count ?? 0) < AI_DAILY_LIMITS.generateRevise
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES: string[] = TASK_TYPE_VALUES
const VALID_PRIORITIES  = ['critical', 'high', 'normal', 'low']
function isValidCategory(v: unknown): boolean { return typeof v === 'string' && VALID_CATEGORIES.includes(v) }
function isValidPriority(v: unknown): boolean  { return typeof v === 'string' && VALID_PRIORITIES.includes(v) }

function buildReviseSystemInstruction(projectContext?: string): string {
  const contextSection = projectContext?.trim()
    ? `\n\nProje Bağlamı:\n${projectContext.trim()}`
    : ''

  return `Sen bir proje yöneticisi asistanısın. Mevcut görev listesini revize notuna göre güncelle.${contextSection}

Sadece JSON array döndür, başka hiçbir şey yazma. Türkçe yaz.

Format:
[
  {
    "title": "string",
    "description": "string (2-3 cümle)",
    "category": "mechanical|electrical|software|training|event|supply|admin|reporting|other",
    "priority": "critical|high|normal|low",
    "estimated_hours": number veya null,
    "acceptance_criteria": ["string", ...],
    "order_index": number
  }
]

Kurallar:
- Revize notunu dikkate al, uygun görevleri koru, gereksizleri çıkar, yenilerini ekle
- category ve priority alanları sadece izin verilen değerleri kullan`
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      draft_set_id?: string
      revision_note?: string
      projectContext?: string
      org_id?: string
    }

    const yetki = await aiYetkiCoz(req, body.org_id)
    if (!yetki.ok) return yetki.res
    const { userId, orgId } = yetki

    const withinLimit = await checkGenerateReviseLimit(userId)
    if (!withinLimit) {
      return NextResponse.json(
        { error: `Günlük AI limitine ulaşıldı (${AI_DAILY_LIMITS.generateRevise}/gün). Yarın tekrar deneyin.` },
        { status: 429 }
      )
    }

    const draft_set_id = body.draft_set_id
    const revision_note = sanitizePromptInput((body.revision_note ?? '').trim().slice(0, 500))
    const safeProjectContext = sanitizePromptInput((body.projectContext ?? '').slice(0, 3000))

    if (!draft_set_id || !revision_note) {
      return NextResponse.json({ error: 'draft_set_id ve revision_note gerekli.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY ortam değişkeni yapılandırılmamış.' }, { status: 500 })
    }

    const supabaseAdmin = getServiceClient()

    const { data: currentSet } = await supabaseAdmin
      .from('draft_sets')
      .select('*')
      .eq('id', draft_set_id)
      .single()

    if (!currentSet) {
      return NextResponse.json({ error: 'Taslak bulunamadı.' }, { status: 404 })
    }
    if (currentSet.organization_id !== orgId) {
      return NextResponse.json({ error: 'Bu taslak sizin çalışma alanınıza ait değil.' }, { status: 403 })
    }

    const { data: currentTasks } = await supabaseAdmin
      .from('draft_tasks')
      .select('title, description, category, priority, estimated_hours, acceptance_criteria, order_index')
      .eq('draft_set_id', draft_set_id)
      .order('order_index', { ascending: true })

    const ai = new GoogleGenAI({ apiKey })
    const systemInstruction = buildReviseSystemInstruction(safeProjectContext)
    const currentTasksText = JSON.stringify(currentTasks ?? [], null, 2)
    const userPrompt = `Mevcut görevler:\n${currentTasksText}\n\nRevize notu: ${revision_note}\n\nBu notu dikkate alarak görev listesini güncelle.`

    let rawText: string
    try {
      const taskCount = Math.max((currentTasks ?? []).length, 1)
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction,
          // bkz. ai-tasks/generate — sabit 2048 çok görevde yanıtı ortasında kesip
          // JSON.parse'ı deterministik olarak patlatıyordu
          maxOutputTokens: Math.min(8192, 800 + taskCount * 450),
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      })
      if (result.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        return NextResponse.json(
          { error: 'Yanıt çok uzun oldu ve kesildi. Revize notunu kısaltıp tekrar deneyin.' },
          { status: 422 },
        )
      }
      rawText = (result.text ?? '').trim()
    } catch (geminiErr: any) {
      console.error('[ai-tasks/revise] Gemini API hatası:', geminiErr)
      const msg = geminiErr?.message ?? ''
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        return NextResponse.json({ error: 'Gemini API anahtarı geçersiz.' }, { status: 500 })
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        return NextResponse.json({ error: 'Gemini API kotası aşıldı. Birkaç dakika bekleyip tekrar deneyin.' }, { status: 429 })
      }
      return NextResponse.json({ error: `Gemini API hatası: ${msg || 'Bilinmeyen hata'}` }, { status: 500 })
    }

    let parsedTasks: any[]
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('JSON array bulunamadı')
      parsedTasks = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsedTasks) || parsedTasks.length === 0) {
        throw new Error('Boş görev listesi')
      }
    } catch (parseErr) {
      console.error('[ai-tasks/revise] JSON parse hatası:', parseErr, '\nHam yanıt:', rawText.slice(0, 300))
      return NextResponse.json({ error: 'AI yanıtı işlenemedi. Lütfen tekrar deneyin.' }, { status: 422 })
    }

    const { data: newSet, error: setError } = await supabaseAdmin
      .from('draft_sets')
      .insert({
        title:            currentSet.title,
        goal_summary:     currentSet.goal_summary,
        status:           'draft',
        version:          (currentSet.version ?? 1) + 1,
        created_by:       userId,
        sprint_id:        currentSet.sprint_id ?? null,
        organization_id:  currentSet.organization_id,
      })
      .select('*')
      .single()

    if (setError || !newSet) {
      console.error('[ai-tasks/revise] yeni draft_set insert hatası:', setError)
      return NextResponse.json({ error: 'Yeni taslak oluşturulamadı.' }, { status: 500 })
    }

    const taskRows = parsedTasks.map((t: any, i: number) => ({
      draft_set_id:        newSet.id,
      title:               String(t.title ?? 'Görev'),
      description:         String(t.description ?? ''),
      category:            isValidCategory(t.category) ? t.category : 'other',
      priority:            isValidPriority(t.priority) ? t.priority : 'normal',
      estimated_hours:     typeof t.estimated_hours === 'number' ? t.estimated_hours : null,
      acceptance_criteria: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria.map(String) : [],
      order_index:         typeof t.order_index === 'number' ? t.order_index : i,
    }))

    const { data: newTasks, error: tasksError } = await supabaseAdmin
      .from('draft_tasks')
      .insert(taskRows)
      .select('*')

    if (tasksError) {
      await supabaseAdmin.from('draft_sets').delete().eq('id', newSet.id)
      console.error('[ai-tasks/revise] draft_tasks insert hatası:', tasksError)
      return NextResponse.json({ error: 'Görevler kaydedilemedi.' }, { status: 500 })
    }

    // Kullanım logu
    await getServiceClient().from('ai_usage_logs').insert({
      user_id: userId,
      organization_id: orgId,
      action: 'revise',
    })

    return NextResponse.json({ draft_set: newSet, tasks: newTasks ?? [] })
  } catch (err: any) {
    console.error('[ai-tasks/revise] beklenmeyen hata:', err)
    const msg = err?.message ?? String(err) ?? 'Bilinmeyen hata'
    return NextResponse.json({ error: `Sunucu hatası: ${msg}` }, { status: 500 })
  }
}
