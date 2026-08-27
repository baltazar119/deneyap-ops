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

async function checkReviseTaskLimit(userId: string): Promise<boolean> {
  const serviceClient = getServiceClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { count } = await serviceClient
    .from('ai_usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'revise_task')
    .gte('created_at', startOfDay.toISOString())

  return (count ?? 0) < AI_DAILY_LIMITS.reviseTask
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES: string[] = TASK_TYPE_VALUES
const VALID_PRIORITIES  = ['critical', 'high', 'normal', 'low']
function isValidCategory(v: unknown): boolean { return typeof v === 'string' && VALID_CATEGORIES.includes(v) }
function isValidPriority(v: unknown): boolean  { return typeof v === 'string' && VALID_PRIORITIES.includes(v) }

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      draft_task_id?: string
      revision_note?: string
      org_id?: string
    }

    const yetki = await aiYetkiCoz(req, body.org_id)
    if (!yetki.ok) return yetki.res
    const { userId, orgId } = yetki

    const withinLimit = await checkReviseTaskLimit(userId)
    if (!withinLimit) {
      return NextResponse.json(
        { error: `Günlük AI görev revizyon limitine ulaşıldı (${AI_DAILY_LIMITS.reviseTask}/gün). Yarın tekrar deneyin.` },
        { status: 429 }
      )
    }

    const { draft_task_id } = body
    const revision_note = (body.revision_note ?? '').trim().slice(0, 500)

    if (!draft_task_id || !revision_note) {
      return NextResponse.json({ error: 'draft_task_id ve revision_note gerekli.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY ortam değişkeni yapılandırılmamış.' }, { status: 500 })
    }

    const supabaseAdmin = getServiceClient()

    // ── Mevcut görevi getir ───────────────────────────────────────────────────
    const { data: currentTask } = await supabaseAdmin
      .from('draft_tasks')
      .select('id, title, description, category, priority, estimated_hours, acceptance_criteria, order_index, draft_sets!inner(organization_id)')
      .eq('id', draft_task_id)
      .single()

    if (!currentTask) {
      return NextResponse.json({ error: 'Görev bulunamadı.' }, { status: 404 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentOrgId = (Array.isArray((currentTask as any).draft_sets)
      ? (currentTask as any).draft_sets[0]
      : (currentTask as any).draft_sets)?.organization_id
    if (parentOrgId !== orgId) {
      return NextResponse.json({ error: 'Bu görev sizin çalışma alanınıza ait değil.' }, { status: 403 })
    }

    // ── Gemini çağrısı ────────────────────────────────────────────────────────
    const ai = new GoogleGenAI({ apiKey })

    const systemInstruction = `Sen bir proje yöneticisi asistanısın. Verilen görevi revize et.
Sadece TEK bir JSON objesi döndür, array değil. Türkçe yaz.

Format:
{
  "title": "string",
  "description": "string (2-3 cümle)",
  "category": "mechanical|electrical|software|training|event|supply|admin|reporting|other",
  "priority": "critical|high|normal|low",
  "estimated_hours": number veya null,
  "acceptance_criteria": ["string", ...]
}

Kurallar:
- Sadece revize notundaki değişiklikleri yap, geri kalanı koru
- category ve priority alanları sadece izin verilen değerleri kullan`

    const taskJson = JSON.stringify({
      title: currentTask.title,
      description: currentTask.description,
      category: currentTask.category,
      priority: currentTask.priority,
      estimated_hours: currentTask.estimated_hours,
      acceptance_criteria: currentTask.acceptance_criteria,
    }, null, 2)

    const userPrompt = `Mevcut görev:\n${taskJson}\n\nRevize notu: ${revision_note}\n\nBu notu dikkate alarak görevi güncelle.`

    let rawText: string
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction,
          maxOutputTokens: 2048,
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
      console.error('[ai-tasks/revise-task] Gemini API hatası:', geminiErr)
      const msg = geminiErr?.message ?? ''
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        return NextResponse.json({ error: 'Gemini API anahtarı geçersiz.' }, { status: 500 })
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        return NextResponse.json({ error: 'Gemini API kotası aşıldı. Birkaç dakika bekleyip tekrar deneyin.' }, { status: 429 })
      }
      return NextResponse.json({ error: `Gemini API hatası: ${msg || 'Bilinmeyen hata'}` }, { status: 500 })
    }

    // ── JSON parse ────────────────────────────────────────────────────────────
    let parsed: any
    try {
      const objMatch = rawText.match(/\{[\s\S]*\}/)
      if (!objMatch) throw new Error('JSON objesi bulunamadı')
      parsed = JSON.parse(objMatch[0])
    } catch (parseErr) {
      console.error('[ai-tasks/revise-task] JSON parse hatası:', parseErr, '\nHam yanıt:', rawText.slice(0, 300))
      return NextResponse.json({ error: 'AI yanıtı işlenemedi. Lütfen tekrar deneyin.' }, { status: 422 })
    }

    // ── Veritabanını güncelle ─────────────────────────────────────────────────
    const updates = {
      title:               String(parsed.title ?? currentTask.title),
      description:         String(parsed.description ?? currentTask.description),
      category:            isValidCategory(parsed.category) ? parsed.category : currentTask.category,
      priority:            isValidPriority(parsed.priority) ? parsed.priority : currentTask.priority,
      estimated_hours:     typeof parsed.estimated_hours === 'number' ? parsed.estimated_hours : currentTask.estimated_hours,
      acceptance_criteria: Array.isArray(parsed.acceptance_criteria)
        ? parsed.acceptance_criteria.map(String).filter(Boolean)
        : currentTask.acceptance_criteria,
    }

    const { data: updatedTask, error: updateError } = await supabaseAdmin
      .from('draft_tasks')
      .update(updates)
      .eq('id', draft_task_id)
      .select('*')
      .single()

    if (updateError) {
      console.error('[ai-tasks/revise-task] update hatası:', updateError)
      return NextResponse.json({ error: 'Görev güncellenemedi.' }, { status: 500 })
    }

    // Kullanım logu
    await getServiceClient().from('ai_usage_logs').insert({
      user_id: userId,
      organization_id: orgId,
      action: 'revise_task',
    })

    return NextResponse.json({ task: updatedTask })
  } catch (err: any) {
    console.error('[ai-tasks/revise-task] beklenmeyen hata:', err)
    return NextResponse.json({ error: `Sunucu hatası: ${err?.message ?? ''}` }, { status: 500 })
  }
}
