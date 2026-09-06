import { NextRequest, NextResponse } from 'next/server'
import { TASK_TYPE_VALUES } from '@/lib/taskTypes'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { AI_DAILY_LIMITS } from '@/lib/featureGate'
import { aiYetkiCoz } from '@/lib/server/apiAuth'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

// ── Service Client ────────────────────────────────────────────────────────────

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

// ── Prompt Injection Koruma ───────────────────────────────────────────────────

function sanitizePromptInput(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/ignore\s{0,20}(instruction|system|prompt|previous)/gi, '[FILTERED]')
    .replace(/\[(SYSTEM|INST|SYS)\]/gi, '[FILTERED]')
}

// ── Günlük Limit Kontrolü ────────────────────────────────────────────────────

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

// ── Kullanım Logu ────────────────────────────────────────────────────────────

async function logUsage(userId: string, orgId: string | null, action: 'generate' | 'revise' | 'revise_task') {
  const serviceClient = getServiceClient()
  await serviceClient.from('ai_usage_logs').insert({
    user_id: userId,
    organization_id: orgId ?? null,
    action,
  })
}

// ── Gemini Prompt ─────────────────────────────────────────────────────────────

function buildSystemInstruction(taskCount: number, projectContext?: string): string {
  const contextSection = projectContext?.trim()
    ? `\n\nProje Bağlamı (görevleri bu bağlama göre oluştur):\n${projectContext.trim()}`
    : ''

  return `Sen bir proje yöneticisi asistanısın. Verilen hedefe göre görev listesi oluştur.${contextSection}

Sadece JSON array döndür, başka hiçbir şey yazma. Türkçe yaz.
Tam olarak ${taskCount} görev üret, ne az ne fazla.

Format:
[
  {
    "title": "string",
    "description": "string (2-3 cümle, ne yapılacağını açıklar)",
    "category": "mechanical|electrical|software|training|event|supply|admin|reporting|other",
    "priority": "critical|high|normal|low",
    "estimated_hours": number veya null,
    "acceptance_criteria": ["string", ...],
    "order_index": number
  }
]

Kurallar:
- Tam olarak ${taskCount} görev üret
- Gereksiz mikro görev üretme
- Her görev bağımsız ve uygulanabilir olsun
- category ve priority alanları sadece izin verilen değerleri kullan`
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      goal?: string
      context?: string
      taskCount?: number
      projectContext?: string
      org_id?: string
    }

    const yetki = await aiYetkiCoz(req, body.org_id)
    if (!yetki.ok) return yetki.res
    const { userId, orgId } = yetki

    // Günlük limit kontrolü
    const withinLimit = await checkGenerateReviseLimit(userId)
    if (!withinLimit) {
      return NextResponse.json(
        { error: `Günlük AI limitine ulaşıldı (${AI_DAILY_LIMITS.generateRevise}/gün). Yarın tekrar deneyin.` },
        { status: 429 }
      )
    }

    // Input kısaltma + prompt injection koruma
    const goal = sanitizePromptInput((body.goal ?? '').trim().slice(0, 500))
    const context = sanitizePromptInput((body.context ?? '').trim().slice(0, 500))
    const safeProjectContext = sanitizePromptInput((body.projectContext ?? '').slice(0, 3000))
    const taskCount = Math.min(15, Math.max(1, body.taskCount ?? 5))

    if (!goal) {
      return NextResponse.json({ error: 'Hedef boş olamaz.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY ortam değişkeni yapılandırılmamış.' },
        { status: 500 },
      )
    }

    // ── Gemini çağrısı ────────────────────────────────────────────────────────
    const ai = new GoogleGenAI({ apiKey })
    const systemInstruction = buildSystemInstruction(taskCount, safeProjectContext)
    const userPrompt = `Hedef: ${goal}\n\nEk Bağlam: ${context || 'Belirtilmedi'}\n\nBu hedefe ulaşmak için net, uygulanabilir ${taskCount} görev oluştur.`

    let rawText: string
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction,
          // 2048 sabitken 10+ görev + acceptance_criteria istendiğinde yanıt
          // ortasında kesiliyor, JSON.parse "Expected ',' or '}'" ile
          // patlıyordu — kesilme, hata değil, deterministikti (aynı görev
          // sayısıyla her seferinde tekrar ederdi). Görev başına pay bırakıyoruz.
          maxOutputTokens: Math.min(8192, 800 + taskCount * 450),
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      })
      const finishReason = result.candidates?.[0]?.finishReason
      rawText = (result.text ?? '').trim()
      console.log('[ai-tasks/generate] Gemini yanıtı (ilk 300 karakter):', rawText.slice(0, 300), 'finishReason:', finishReason)
      if (finishReason === 'MAX_TOKENS') {
        return NextResponse.json(
          { error: 'Yanıt çok uzun oldu ve kesildi. Daha az görev sayısı ile tekrar deneyin.' },
          { status: 422 },
        )
      }
    } catch (geminiErr: any) {
      console.error('[ai-tasks/generate] Gemini API hatası:', geminiErr)
      const msg = geminiErr?.message ?? ''
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        return NextResponse.json({ error: 'Gemini API anahtarı geçersiz. GEMINI_API_KEY değerini kontrol edin.' }, { status: 500 })
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        return NextResponse.json({ error: 'Gemini API kotası aşıldı. Birkaç dakika bekleyip tekrar deneyin.' }, { status: 429 })
      }
      return NextResponse.json({ error: `Gemini API hatası: ${msg || 'Bilinmeyen hata'}` }, { status: 500 })
    }

    // ── JSON parse ────────────────────────────────────────────────────────────
    let parsedTasks: any[]
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('JSON array bulunamadı')
      parsedTasks = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsedTasks) || parsedTasks.length === 0) {
        throw new Error('Boş görev listesi döndü')
      }
    } catch (parseErr) {
      console.error('[ai-tasks/generate] JSON parse hatası:', parseErr, '\nHam yanıt:', rawText.slice(0, 300))
      return NextResponse.json(
        { error: 'AI yanıtı işlenemedi. Lütfen tekrar deneyin.' },
        { status: 422 },
      )
    }

    // ── Veritabanına kaydet ────────────────────────────────────────────────────
    const supabaseAdmin = getServiceClient()
    const titlePreview = goal.length > 60 ? goal.slice(0, 57) + '…' : goal

    const { data: draftSet, error: setError } = await supabaseAdmin
      .from('draft_sets')
      .insert({
        title: titlePreview,
        goal_summary: goal,
        status: 'draft',
        version: 1,
        created_by: userId,
        organization_id: orgId,
      })
      .select('*')
      .single()

    if (setError || !draftSet) {
      console.error('[ai-tasks/generate] draft_sets insert hatası:', setError)
      return NextResponse.json({ error: 'Taslak kaydedilemedi.' }, { status: 500 })
    }

    const taskRows = parsedTasks.map((t: any, i: number) => ({
      draft_set_id:        draftSet.id,
      title:               String(t.title ?? 'Görev'),
      description:         String(t.description ?? ''),
      category:            isValidCategory(t.category) ? t.category : 'other',
      priority:            isValidPriority(t.priority) ? t.priority : 'normal',
      estimated_hours:     typeof t.estimated_hours === 'number' ? t.estimated_hours : null,
      acceptance_criteria: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria.map(String) : [],
      order_index:         typeof t.order_index === 'number' ? t.order_index : i,
    }))

    const { data: draftTasks, error: tasksError } = await supabaseAdmin
      .from('draft_tasks')
      .insert(taskRows)
      .select('*')

    if (tasksError) {
      await supabaseAdmin.from('draft_sets').delete().eq('id', draftSet.id)
      console.error('[ai-tasks/generate] draft_tasks insert hatası:', tasksError)
      return NextResponse.json({ error: 'Görevler kaydedilemedi.' }, { status: 500 })
    }

    // ── Kullanım logu ─────────────────────────────────────────────────────────
    await logUsage(userId, orgId, 'generate')

    return NextResponse.json({ draft_set: draftSet, tasks: draftTasks ?? [] })
  } catch (err: any) {
    console.error('[ai-tasks/generate] beklenmeyen hata:', err)
    const msg = err?.message ?? String(err) ?? 'Bilinmeyen hata'
    return NextResponse.json({ error: `Sunucu hatası: ${msg}` }, { status: 500 })
  }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES: string[] = TASK_TYPE_VALUES
const VALID_PRIORITIES  = ['critical', 'high', 'normal', 'low']

function isValidCategory(v: unknown): boolean { return typeof v === 'string' && VALID_CATEGORIES.includes(v) }
function isValidPriority(v: unknown): boolean  { return typeof v === 'string' && VALID_PRIORITIES.includes(v) }
