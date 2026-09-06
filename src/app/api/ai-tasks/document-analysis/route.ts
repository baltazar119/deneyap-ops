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
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const orgId = formData.get('orgId') as string | null

    const yetki = await aiYetkiCoz(req, orgId)
    if (!yetki.ok) return yetki.res
    const { userId } = yetki

    if (!await checkAnalyzeLimit(userId)) {
      return NextResponse.json({ error: `Günlük analiz limitine ulaşıldı (${AI_DAILY_LIMITS.analyze}/gün).` }, { status: 429 })
    }

    if (!file) return NextResponse.json({ error: 'Dosya gerekli.' }, { status: 400 })

    const fileName = file.name.toLowerCase()
    const isPdf = fileName.endsWith('.pdf')
    const isTxt = fileName.endsWith('.txt')

    if (!isPdf && !isTxt) {
      return NextResponse.json({ error: 'Sadece PDF ve TXT dosyaları destekleniyor.' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Dosya boyutu 10MB\'ı aşamaz.' }, { status: 400 })
    }

    let content = ''

    if (isTxt) {
      content = await file.text()
    } else {
      // PDF: pdf-parse ile metin çıkar
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      try {
        // Dynamic import to avoid build-time issues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await import('pdf-parse') as any
        const pdfParse = mod.default ?? mod
        const pdfData = await pdfParse(buffer)
        content = pdfData.text
      } catch {
        return NextResponse.json({ error: 'PDF metin çıkarma başarısız. Taranmış PDF\'ler desteklenmiyor.' }, { status: 422 })
      }
    }

    if (!content.trim()) {
      return NextResponse.json({ error: 'Dosyadan metin çıkarılamadı.' }, { status: 422 })
    }

    // İlk 15.000 karakter (token limiti)
    const truncatedContent = content.trim().slice(0, 15000)

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI yapılandırma hatası.' }, { status: 500 })

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `Sen bir teknik doküman analiz uzmanısın. Aşağıdaki dokümanı analiz ederek riskleri, eksiklikleri ve tutarsızlıkları belirle.

Dosya Adı: ${file.name}
İçerik (${truncatedContent.length} karakter):
---
${truncatedContent}
---

YALNIZCA bu JSON formatını döndür:
{
  "document_type": "<doküman türü, örn: Teknik Şartname, İş Planı, Tasarım Belgesi>",
  "summary": "<3-4 cümle doküman özeti>",
  "risks": [
    {
      "title": "<risk başlığı>",
      "severity": "<low|medium|high|critical>",
      "description": "<riskin açıklaması>"
    }
  ],
  "gaps": [
    {
      "title": "<eksik alan başlığı>",
      "description": "<neden eksik ve ne olmalı>"
    }
  ],
  "inconsistencies": [
    {
      "title": "<tutarsızlık başlığı>",
      "description": "<tutarsızlığın açıklaması>"
    }
  ],
  "recommendations": [
    "<öneri 1>",
    "<öneri 2>",
    "<öneri 3>"
  ],
  "overall_quality": "<poor|fair|good|excellent>",
  "readiness_score": <0-100>
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
    const sc = getServiceClient()
    await sc.from('ai_usage_logs').insert({ user_id: userId, organization_id: orgId, action: 'analyze' })

    return NextResponse.json({ analysis, fileName: file.name })
  } catch (err) {
    console.error('[document-analysis] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
