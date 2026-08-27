import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { AI_DAILY_LIMITS } from '@/lib/featureGate'
import { aiYetkiCoz } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
    const today = new Date().toISOString().slice(0, 10)

    // Aktif görevler (done hariç, due_date olan)
    const { data: activeTasks } = await sc.from('tasks')
      .select('id, title, status, priority, assignee_id, due_date, estimated_hours, start_date, created_at')
      .eq('organization_id', orgId)
      .neq('status', 'done')
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })

    if (!activeTasks || activeTasks.length === 0) {
      return NextResponse.json({ error: 'Analiz için yeterli görev bulunamadı.' }, { status: 404 })
    }

    // Kişi bazlı geçmiş gecikme sayısı
    const { data: historicalOverdue } = await sc.from('tasks')
      .select('assignee_id')
      .eq('organization_id', orgId)
      .eq('status', 'done')
      .lt('due_date', 'created_at') // Approximation: completed tasks that were overdue

    // Daha iyi yaklaşım: gerçekten geciken + done olanlar
    const { data: overdoneHistory } = await sc.from('tasks')
      .select('assignee_id')
      .eq('organization_id', orgId)
      .neq('status', 'done')
      .lt('due_date', today)

    const overdueByPerson: Record<string, number> = {}
    overdoneHistory?.forEach((t: any) => {
      if (t.assignee_id) overdueByPerson[t.assignee_id] = (overdueByPerson[t.assignee_id] ?? 0) + 1
    })

    // Profil adları
    const assigneeIds = Array.from(new Set(activeTasks.map((t: any) => t.assignee_id).filter(Boolean)))
    const profileMap: Record<string, string> = {}
    if (assigneeIds.length > 0) {
      const { data: profiles } = await sc.from('profiles').select('id, full_name').in('id', assigneeIds)
      profiles?.forEach((p: any) => { profileMap[p.id] = p.full_name || 'İsimsiz' })
    }

    const taskData = activeTasks.slice(0, 20).map((t: any) => {
      const daysUntilDue = t.due_date
        ? Math.ceil((new Date(t.due_date).getTime() - Date.now()) / 86400000)
        : null
      const assigneeOverdueCount = t.assignee_id ? (overdueByPerson[t.assignee_id] ?? 0) : 0

      return {
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee: t.assignee_id ? (profileMap[t.assignee_id] ?? 'Bilinmiyor') : 'Atanmamış',
        due_date: t.due_date,
        days_until_due: daysUntilDue,
        estimated_hours: t.estimated_hours,
        assignee_overdue_history: assigneeOverdueCount,
      }
    })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI yapılandırma hatası.' }, { status: 500 })

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `Sen bir proje risk tahmin asistanısın. Aşağıdaki görev verilerini analiz ederek gecikme tahminleri yap.

Bugün: ${today}

Aktif Görevler:
${JSON.stringify(taskData, null, 2)}

Her görev için gecikme olasılığını değerlendir. Kalan günler az, öncelik yüksek, kişinin geçmişte gecikmesi varsa risk yüksek.

YALNIZCA bu JSON formatını döndür:
{
  "predictions": [
    {
      "task_id": "<id>",
      "title": "<başlık>",
      "assignee": "<kişi>",
      "due_date": "<tarih>",
      "days_until_due": <sayı veya null>,
      "delay_probability": <0-100>,
      "risk_level": "<low|medium|high|critical>",
      "reason": "<neden gecikme riski var, 1-2 cümle>",
      "suggested_action": "<önerilen aksiyon>"
    }
  ],
  "overall_risk": "<low|medium|high|critical>",
  "high_risk_count": <sayı>,
  "summary": "<2-3 cümle genel değerlendirme>"
}

Sadece gerçek risk taşıyanları listele (delay_probability > 30). Düşük riskli görevleri dahil etme.`

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, responseMimeType: 'application/json' },
    })

    const raw = result.text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI yanıtı işlenemedi.' }, { status: 500 })

    const prediction = JSON.parse(jsonMatch[0])
    await sc.from('ai_usage_logs').insert({ user_id: userId, organization_id: orgId, action: 'analyze' })

    return NextResponse.json({ prediction })
  } catch (err) {
    console.error('[delay-prediction] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
