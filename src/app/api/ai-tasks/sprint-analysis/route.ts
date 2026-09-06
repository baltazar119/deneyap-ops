import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { AI_DAILY_LIMITS } from '@/lib/featureGate'
import { aiYetkiCoz } from '@/lib/server/apiAuth'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

async function checkAnalyzeLimit(userId: string): Promise<boolean> {
  const sc = getServiceClient()
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { count } = await sc.from('ai_usage_logs').select('*', { count: 'exact', head: true })
    .eq('user_id', userId).eq('action', 'analyze').gte('created_at', startOfDay.toISOString())
  return (count ?? 0) < AI_DAILY_LIMITS.analyze
}

async function logUsage(userId: string, orgId: string | null) {
  await getServiceClient().from('ai_usage_logs').insert({ user_id: userId, organization_id: orgId, action: 'analyze' })
}

export async function POST(req: NextRequest) {
  try {
    const { orgId, sprintId } = await req.json()

    const yetki = await aiYetkiCoz(req, orgId)
    if (!yetki.ok) return yetki.res
    const { userId } = yetki

    if (!await checkAnalyzeLimit(userId)) {
      return NextResponse.json({ error: `Günlük analiz limitine ulaşıldı (${AI_DAILY_LIMITS.analyze}/gün).` }, { status: 429 })
    }

    const sc = getServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    // Sprint bul (verilen veya aktif)
    let sprint: any = null
    if (sprintId) {
      const { data } = await sc.from('sprints').select('*').eq('id', sprintId).single()
      sprint = data
    } else {
      const { data } = await sc.from('sprints').select('*').eq('organization_id', orgId).eq('is_active', true).single()
      sprint = data
    }
    if (!sprint) return NextResponse.json({ error: 'Aktif sprint bulunamadı.' }, { status: 404 })

    // Sprint görevlerini çek
    const { data: tasks } = await sc.from('tasks')
      .select('id, title, status, priority, assignee_id, due_date, estimated_hours, start_date')
      .eq('organization_id', orgId).eq('sprint_id', sprint.id)

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ error: 'Bu sprintte görev bulunamadı.' }, { status: 404 })
    }

    // Assignee adlarını çek
    const assigneeIds = Array.from(new Set(tasks.map((t: any) => t.assignee_id).filter(Boolean)))
    const profileMap: Record<string, string> = {}
    if (assigneeIds.length > 0) {
      const { data: profiles } = await sc.from('profiles').select('id, full_name').in('id', assigneeIds)
      profiles?.forEach((p: any) => { profileMap[p.id] = p.full_name || 'İsimsiz' })
    }

    const taskList = tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee_id ? (profileMap[t.assignee_id] ?? 'Atanmamış') : 'Atanmamış',
      due_date: t.due_date,
      estimated_hours: t.estimated_hours,
    }))

    const sprintInfo = {
      name: sprint.name,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      today,
      days_remaining: Math.max(0, Math.ceil((new Date(sprint.end_date).getTime() - Date.now()) / 86400000)),
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI yapılandırma hatası.' }, { status: 500 })

    const ai = new GoogleGenAI({ apiKey })
    const model = ai.models

    const prompt = `Sen bir proje risk analisti asistanısın. Aşağıdaki sprint verisini analiz et ve JSON formatında sonuç döndür.

Sprint Bilgisi:
${JSON.stringify(sprintInfo, null, 2)}

Görevler (${taskList.length} adet):
${JSON.stringify(taskList, null, 2)}

Görev Durumları: backlog=başlamadı, doing=devam ediyor, testing=test, blocked=engellenmiş, done=tamamlandı

Analiz et ve YALNIZCA bu JSON formatını döndür (başka açıklama yazma):
{
  "risk_score": <0-100 arası sayı>,
  "risk_level": "<low|medium|high|critical>",
  "success_probability": <0-100 arası sayı>,
  "summary": "<2-3 cümle genel değerlendirme>",
  "at_risk_tasks": [
    {"task_id": "<id>", "title": "<başlık>", "risk_reason": "<neden riskli>", "risk_level": "<low|medium|high|critical>"}
  ],
  "workload_balance": {
    "balanced": <true|false>,
    "comment": "<iş yükü dengesi hakkında 1-2 cümle>"
  },
  "recommendations": ["<öneri 1>", "<öneri 2>", "<öneri 3>"]
}`

    const result = await model.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, responseMimeType: 'application/json' },
    })

    const raw = result.text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI yanıtı işlenemedi.' }, { status: 500 })

    const analysis = JSON.parse(jsonMatch[0])
    await logUsage(userId, orgId)

    return NextResponse.json({ analysis, sprint: sprintInfo })
  } catch (err) {
    console.error('[sprint-analysis] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
