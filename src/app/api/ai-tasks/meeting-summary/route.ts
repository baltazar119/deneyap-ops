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

    const { orgId, notes } = await req.json()
    if (!orgId) return NextResponse.json({ error: 'orgId gerekli.' }, { status: 400 })
    if (!notes?.trim()) return NextResponse.json({ error: 'Toplantı notları boş olamaz.' }, { status: 400 })

    const truncatedNotes = notes.trim().slice(0, 8000)

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI yapılandırma hatası.' }, { status: 500 })

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `Sen bir toplantı asistanısın. Aşağıdaki toplantı notlarından özet çıkar, kararları ve aksiyon maddelerini belirle, görev önerileri üret.

Toplantı Notları:
---
${truncatedNotes}
---

YALNIZCA bu JSON formatını döndür:
{
  "summary": "<3-5 cümle toplantı özeti>",
  "decisions": [
    "<alınan karar 1>",
    "<alınan karar 2>"
  ],
  "action_items": [
    {
      "item": "<aksiyon maddesi>",
      "owner": "<sorumlu kişi adı veya 'Belirsiz'>",
      "due": "<son tarih veya 'Belirtilmemiş'>"
    }
  ],
  "suggested_tasks": [
    {
      "title": "<görev başlığı>",
      "description": "<görevin ne olduğunu açıkla, 2-3 cümle>",
      "category": "<mechanical|electrical|software|training|event|supply|admin|reporting|other>",
      "priority": "<critical|high|normal|low>",
      "estimated_hours": <sayı veya null>
    }
  ],
  "key_topics": ["<konu 1>", "<konu 2>", "<konu 3>"]
}`

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.4, responseMimeType: 'application/json' },
    })

    const raw = result.text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI yanıtı işlenemedi.' }, { status: 500 })

    const summary = JSON.parse(jsonMatch[0])
    const sc = getServiceClient()
    await sc.from('ai_usage_logs').insert({ user_id: userId, organization_id: orgId, action: 'analyze' })

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[meeting-summary] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
