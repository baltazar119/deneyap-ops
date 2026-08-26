import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { AI_DAILY_LIMITS } from '@/lib/featureGate'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function getVerifiedAdminUserId(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { error: 'Yetkisiz erişim.', status: 401 }
  const sc = getServiceClient()
  const { data: { user } } = await sc.auth.getUser(token)
  if (!user) return { error: 'Yetkisiz erişim.', status: 401 }
  const { data: profile } = await sc.from('profiles').select('role, plan, ai_addon').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Yetkisiz erişim.', status: 401 }
  if (profile?.plan !== 'pro' || !profile?.ai_addon) return { error: 'AI Asistan eklentisi gerekli.', status: 403 }
  return { userId: user.id }
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
    const authResult = await getVerifiedAdminUserId(req)
    if ('error' in authResult) return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    const { userId } = authResult

    if (!await checkAnalyzeLimit(userId)) {
      return NextResponse.json({ error: `Günlük analiz limitine ulaşıldı (${AI_DAILY_LIMITS.analyze}/gün).` }, { status: 429 })
    }

    const { orgId } = await req.json()
    if (!orgId) return NextResponse.json({ error: 'orgId gerekli.' }, { status: 400 })

    const sc = getServiceClient()

    // Org üyelerini çek
    const { data: members } = await sc.from('organization_members').select('user_id, role').eq('organization_id', orgId)
    const memberIds = members?.map((m: any) => m.user_id) ?? []

    // Profil adlarını çek
    const profileMap: Record<string, string> = {}
    if (memberIds.length > 0) {
      const { data: profiles } = await sc.from('profiles').select('id, full_name').in('id', memberIds)
      profiles?.forEach((p: any) => { profileMap[p.id] = p.full_name || 'İsimsiz' })
    }

    // Aktif görevleri çek (done hariç)
    const { data: tasks } = await sc.from('tasks')
      .select('id, title, status, priority, assignee_id, estimated_hours, due_date')
      .eq('organization_id', orgId)
      .not('status', 'eq', 'done')

    // Kişi bazlı iş yükü hesapla
    const workloadMap: Record<string, { name: string; tasks: any[]; totalHours: number }> = {}

    // Önce tüm üyeleri ekle (görev olmayan üyeler için de)
    memberIds.forEach((id: string) => {
      if (profileMap[id]) {
        workloadMap[id] = { name: profileMap[id], tasks: [], totalHours: 0 }
      }
    })

    // Görevleri kişilere ata
    tasks?.forEach((t: any) => {
      if (t.assignee_id && workloadMap[t.assignee_id]) {
        workloadMap[t.assignee_id].tasks.push({ title: t.title, priority: t.priority, due_date: t.due_date })
        workloadMap[t.assignee_id].totalHours += t.estimated_hours ?? 0
      }
    })

    const teamData = Object.values(workloadMap).map(p => ({
      name: p.name,
      task_count: p.tasks.length,
      estimated_hours: p.totalHours,
      tasks: p.tasks.slice(0, 5), // İlk 5 görev
    }))

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI yapılandırma hatası.' }, { status: 500 })

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `Sen bir iş yükü optimizasyon asistanısın. Aşağıdaki takım iş yükü verisini analiz et.

Takım Üyeleri ve İş Yükleri:
${JSON.stringify(teamData, null, 2)}

Toplam aktif görev: ${tasks?.length ?? 0}

YALNIZCA bu JSON formatını döndür:
{
  "team": [
    {
      "name": "<isim>",
      "task_count": <sayı>,
      "estimated_hours": <sayı>,
      "status": "<idle|normal|busy|overloaded>",
      "comment": "<1 cümle değerlendirme>"
    }
  ],
  "suggestions": [
    {
      "task_title": "<görev başlığı>",
      "from": "<mevcut kişi>",
      "to": "<önerilen kişi>",
      "reason": "<neden bu kişiye>"
    }
  ],
  "summary": "<2-3 cümle genel değerlendirme>",
  "balance_score": <0-100 arası, 100=mükemmel denge>
}`

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, responseMimeType: 'application/json' },
    })

    const raw = result.text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI yanıtı işlenemedi.' }, { status: 500 })

    const analysis = JSON.parse(jsonMatch[0])
    await sc.from('ai_usage_logs').insert({ user_id: userId, organization_id: orgId, action: 'analyze' })

    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('[workload] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
