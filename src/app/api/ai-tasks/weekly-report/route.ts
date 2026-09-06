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

async function checkAnalyzeLimit(userId: string) {
  const sc = getServiceClient()
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { count } = await sc.from('ai_usage_logs').select('*', { count: 'exact', head: true })
    .eq('user_id', userId).eq('action', 'analyze').gte('created_at', startOfDay.toISOString())
  return (count ?? 0) < AI_DAILY_LIMITS.analyze
}

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await req.json()

    const yetki = await aiYetkiCoz(req, orgId)
    if (!yetki.ok) return yetki.res
    const { userId } = yetki

    if (!await checkAnalyzeLimit(userId)) {
      return NextResponse.json({ error: `Günlük analiz limitine ulaşıldı (${AI_DAILY_LIMITS.analyze}/gün).` }, { status: 429 })
    }

    const sc = getServiceClient()
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    const today = now.toISOString().slice(0, 10)
    const weekAgoStr = weekAgo.toISOString()

    // Assignee adları için
    const profileMap: Record<string, string> = {}
    const getAssigneeName = (id: string | null) => id ? (profileMap[id] ?? 'Bilinmiyor') : 'Atanmamış'

    // Tamamlanan görevler (son 7 gün içinde done durumuna geçen)
    const { data: completedTasks } = await sc.from('tasks')
      .select('id, title, priority, assignee_id, due_date, task_type')
      .eq('organization_id', orgId)
      .eq('status', 'done')
      .gte('updated_at', weekAgoStr)

    // Geciken görevler (due_date geçmiş, henüz done değil)
    const { data: overdueTasks } = await sc.from('tasks')
      .select('id, title, priority, assignee_id, due_date, status')
      .eq('organization_id', orgId)
      .neq('status', 'done')
      .lt('due_date', today)
      .not('due_date', 'is', null)

    // Kritik görevler (priority=critical, done değil)
    const { data: criticalTasks } = await sc.from('tasks')
      .select('id, title, status, assignee_id, due_date')
      .eq('organization_id', orgId)
      .eq('priority', 'critical')
      .neq('status', 'done')

    // Assignee'leri çek
    const allIds = [
      ...(completedTasks ?? []).map((t: any) => t.assignee_id),
      ...(overdueTasks ?? []).map((t: any) => t.assignee_id),
      ...(criticalTasks ?? []).map((t: any) => t.assignee_id),
    ].filter(Boolean)
    const uniqueIds = Array.from(new Set(allIds))
    if (uniqueIds.length > 0) {
      const { data: profiles } = await sc.from('profiles').select('id, full_name').in('id', uniqueIds)
      profiles?.forEach((p: any) => { profileMap[p.id] = p.full_name || 'İsimsiz' })
    }

    const weekLabel = `${weekAgo.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} — ${now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`

    const reportData = {
      week: weekLabel,
      today,
      completed: (completedTasks ?? []).map((t: any) => ({
        title: t.title,
        priority: t.priority,
        assignee: getAssigneeName(t.assignee_id),
        type: t.task_type,
      })),
      overdue: (overdueTasks ?? []).map((t: any) => ({
        title: t.title,
        priority: t.priority,
        assignee: getAssigneeName(t.assignee_id),
        due_date: t.due_date,
        status: t.status,
      })),
      critical_active: (criticalTasks ?? []).map((t: any) => ({
        title: t.title,
        status: t.status,
        assignee: getAssigneeName(t.assignee_id),
        due_date: t.due_date,
      })),
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI yapılandırma hatası.' }, { status: 500 })

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `Sen bir proje yönetimi asistanısın. Aşağıdaki haftalık veriyi analiz ederek rapor oluştur.

Hafta: ${reportData.week}
Tamamlanan görev sayısı: ${reportData.completed.length}
Geciken görev sayısı: ${reportData.overdue.length}
Aktif kritik görev sayısı: ${reportData.critical_active.length}

Tamamlanan Görevler:
${JSON.stringify(reportData.completed.slice(0, 10), null, 2)}

Geciken Görevler:
${JSON.stringify(reportData.overdue.slice(0, 10), null, 2)}

Kritik Aktif Görevler:
${JSON.stringify(reportData.critical_active.slice(0, 5), null, 2)}

YALNIZCA bu JSON formatını döndür:
{
  "week": "${reportData.week}",
  "completed_count": ${reportData.completed.length},
  "overdue_count": ${reportData.overdue.length},
  "critical_count": ${reportData.critical_active.length},
  "performance_score": <0-100>,
  "highlights": ["<başarı 1>", "<başarı 2>"],
  "concerns": ["<endişe 1>", "<endişe 2>"],
  "ai_comment": "<3-4 cümle genel yorum, takıma motivasyon veya uyarı>",
  "next_week_focus": ["<odak alanı 1>", "<odak alanı 2>", "<odak alanı 3>"],
  "sections": {
    "completed": ${JSON.stringify(reportData.completed.slice(0, 8))},
    "overdue": ${JSON.stringify(reportData.overdue.slice(0, 8))},
    "critical": ${JSON.stringify(reportData.critical_active.slice(0, 5))}
  }
}`

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.4, responseMimeType: 'application/json' },
    })

    const raw = result.text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI yanıtı işlenemedi.' }, { status: 500 })

    const report = JSON.parse(jsonMatch[0])
    await sc.from('ai_usage_logs').insert({ user_id: userId, organization_id: orgId, action: 'analyze' })

    return NextResponse.json({ report })
  } catch (err) {
    console.error('[weekly-report] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
