import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cronYetkili } from '@/lib/cronAuth'
import { sendEmailBatch, type TopluMesaj } from '@/lib/email'
import { raporVerisi } from '@/lib/rapor/veri'
import { raporPdfUret } from '@/lib/rapor/pdf/uret'
import { donemCoz } from '@/lib/rapor/donem'
import { raporUretebilirMi } from '@/lib/rapor/kapsam'
import { esc } from '@/lib/html'
import { toSlug } from '@/lib/turkce'
import type { RaporVerisi } from '@/lib/rapor/hesapla'
import type { OrgYetki } from '@/lib/server/apiAuth'
import type { OrgRole, PlanType } from '@/types/database'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Haftalık rapor e-postası — her üyeye KENDİ kapsamıyla, PDF ekli.
 *
 * İl Sorumlusu kendi ilinin raporunu, Yetkili Yönetici kişi verisi olmayan
 * özeti alır. Kapsamı raporKapsami() belirlediği için burada ayrı bir kural
 * yok — elle indirilen raporla birebir aynı çıktı.
 *
 * Süre bütçesi: Vercel fonksiyonu 60 sn. Bütçe dolunca durur ve kalanı
 * bildirir; cron bir sonraki turda devam eder.
 */

const BUTCE_MS = 45_000

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: onbelleksizFetch },
    },
  )
}

export async function GET(req: NextRequest) {
  if (!cronYetkili(req)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  // ?deneme=1 → PDF'ler üretilir, alıcılar hesaplanır ama E-POSTA GÖNDERİLMEZ.
  // Zamanlamayı açmadan önce çıktıyı doğrulamak için.
  const denemeModu = new URL(req.url).searchParams.get('deneme') === '1'

  const t0 = Date.now()
  const db = admin()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deneyap-ops.vercel.app'
  const donem = donemCoz('gecen-hafta')

  const { data: orgs } = await db.from('organizations').select('id, slug, name, plan')
  if (!orgs?.length) return NextResponse.json({ ok: true, gonderilen: 0 })

  const mesajlar: TopluMesaj[] = []
  let atlanan = 0
  let butceDoldu = false

  for (const org of orgs as { id: string; slug: string; name: string; plan: PlanType }[]) {
    if (Date.now() - t0 > BUTCE_MS) { butceDoldu = true; break }

    const { data: ayar } = await db
      .from('automation_settings')
      .select('haftalik_rapor')
      .eq('organization_id', org.id)
      .maybeSingle()
    if (ayar && ayar.haftalik_rapor === false) continue

    const { data: uyeler } = await db
      .from('organization_members')
      .select('user_id, role, il')
      .eq('organization_id', org.id)

    for (const u of (uyeler ?? []) as { user_id: string; role: OrgRole; il: string | null }[]) {
      if (Date.now() - t0 > BUTCE_MS) { butceDoldu = true; break }
      if (!raporUretebilirMi(u.role)) continue

      // '*' ile okuyoruz: adı verilen bir kolon şemada yoksa PostgREST tüm
      // sorguyu reddediyor, tercih null kalıyor ve kod sessizce "herkese
      // gönder"e düşüyordu. Bu testte fark edildi.
      const { data: tercih, error: tercihHata } = await db
        .from('email_preferences')
        .select('*')
        .eq('user_id', u.user_id)
        .maybeSingle()

      if (tercihHata) {
        console.error('[haftalik-rapor] tercih okunamadı, güvenli tarafta kalıp atlanıyor:', tercihHata.message)
        atlanan++; continue
      }

      const t = tercih as { email_enabled?: boolean; weekly_report?: boolean } | null
      if (t && (t.email_enabled === false || t.weekly_report === false)) {
        atlanan++; continue
      }

      const { data: authUser } = await db.auth.admin.getUserById(u.user_id)
      const eposta = authUser?.user?.email
      if (!eposta) { atlanan++; continue }

      const { data: profil } = await db
        .from('profiles').select('full_name').eq('id', u.user_id).maybeSingle()

      // raporVerisi bir OrgYetki bekliyor. Cron'da kullanıcı oturumu yok;
      // yalnızca okunan alanları dolduruyoruz. asUser burada kullanılmıyor
      // çünkü rapor okuması service-role ile yapılıp kapsamı kod uyguluyor.
      const yetki = {
        user: { id: u.user_id, email: eposta },
        org: { id: org.id, slug: org.slug, name: org.name, plan: org.plan },
        rol: u.role,
        il: u.il,
        admin: db,
        asUser: db,
        token: '',
        ip: 'cron',
      } as unknown as OrgYetki

      try {
        const veri = await raporVerisi(yetki, donem)
        if (veri.kpi.toplam === 0) { atlanan++; continue }   // boş rapor gönderme

        const pdf = await raporPdfUret(veri)
        const ad = toSlug(`${veri.meta.raporAdi}-${donem.etiket}`) || 'deneyap-rapor'

        mesajlar.push({
          to: eposta,
          subject: `${veri.meta.raporAdi} — ${donem.etiket}`,
          html: raporEpostasi(veri, profil?.full_name ?? null, org.slug, appUrl),
          secenekler: {
            ekler: [{ filename: `${ad}.pdf`, content: pdf, contentType: 'application/pdf' }],
          },
        })
      } catch (e) {
        console.error('[haftalik-rapor] rapor üretilemedi:', u.user_id, e)
        atlanan++
      }
    }
  }

  if (!mesajlar.length) {
    return NextResponse.json({ ok: true, gonderilen: 0, atlanan, butceDoldu })
  }

  if (denemeModu) {
    return NextResponse.json({
      ok: true,
      deneme: true,
      gonderilmedi: mesajlar.length,
      atlanan,
      butceDoldu,
      alicilar: mesajlar.map(m => ({
        to: m.to,
        konu: m.subject,
        ekBoyutu: m.secenekler?.ekler?.[0]?.content.length ?? 0,
      })),
    })
  }

  const kalanSure = Math.max(5_000, BUTCE_MS - (Date.now() - t0))
  const sonuc = await sendEmailBatch(mesajlar, { butceMs: kalanSure })

  return NextResponse.json({
    ok: true,
    gonderilen: sonuc.gonderilen,
    basarisiz: sonuc.basarisiz,
    kalan: sonuc.kalan,
    atlanan,
    butceDoldu,
  })
}

/** Rapor e-postasının gövdesi — ayrıntı PDF ekinde, burada özet */
function raporEpostasi(
  v: RaporVerisi,
  ad: string | null,
  slug: string,
  appUrl: string,
): string {
  const enRiskli = v.ilKirilimi.filter(i => i.geciken > 0).slice(0, 5)

  const satir = (etiket: string, deger: string | number, renk = '#0d1a2a') =>
    `<tr><td style="padding:6px 0;font-size:14px;color:#64748b;">${esc(etiket)}</td>` +
    `<td style="padding:6px 0;font-size:16px;font-weight:700;color:${renk};text-align:right;">${deger}</td></tr>`

  const riskBloku = enRiskli.length
    ? `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.6px;">Gecikme olan iller</p>
       <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
         ${enRiskli.map(i =>
           `<tr><td style="padding:4px 0;font-size:13px;color:#0d1a2a;">${esc(i.il)}</td>` +
           `<td style="padding:4px 0;font-size:13px;color:#dc2626;font-weight:700;text-align:right;">${i.geciken} geciken</td></tr>`,
         ).join('')}
       </table>`
    : ''

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:linear-gradient(135deg,#0d1a2a,#182c3f);padding:24px 28px;border-radius:16px 16px 0 0;">
    <span style="font-size:20px;font-weight:800;color:#fff;">DENEYAP OYS</span><br/>
    <span style="font-size:11px;color:rgba(122,207,230,0.7);">${esc(v.meta.raporAdi)}</span>
  </td></tr>
  <tr><td style="background:#fff;padding:28px;border-left:1px solid #d2e4ee;border-right:1px solid #d2e4ee;">
    <p style="margin:0 0 6px;font-size:14px;color:#64748b;">${esc(v.meta.donem.etiket)}</p>
    <h2 style="margin:0 0 18px;font-size:20px;font-weight:800;color:#0d1a2a;">Merhaba${ad ? ', ' + esc(ad) : ''}</h2>
    <p style="margin:0 0 18px;font-size:14px;color:#64748b;line-height:1.6;">
      ${esc(v.meta.kapsamEtiketi)} kapsamındaki haftalık durumunuz.
      Ayrıntılı rapor <strong>ekte PDF olarak</strong> yer alıyor.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #d2e4ee;border-bottom:1px solid #d2e4ee;margin-bottom:18px;">
      ${satir('Toplam görev', v.kpi.toplam)}
      ${satir('Tamamlanan', v.kpi.tamamlanan, '#059669')}
      ${satir('Devam eden', v.kpi.devamEden, '#2288c9')}
      ${satir('Termini geçen', v.kpi.geciken, v.kpi.geciken ? '#dc2626' : '#64748b')}
      ${satir('Tamamlanma oranı', '%' + v.kpi.tamamlanmaOrani)}
    </table>
    ${riskBloku}
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${appUrl}/org/${esc(slug)}/raporlar"
        style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#2abbd5,#2288c9);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;">
        Rapor Merkezini Aç
      </a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 28px;border:1px solid #d2e4ee;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#64748b;">
      Haftalık raporu <a href="${appUrl}/org/${esc(slug)}/profile" style="color:#2288c9;text-decoration:none;">profil ayarlarınızdan</a> kapatabilirsiniz.
    </p>
  </td></tr>
</table></td></tr></table></body></html>`
}
