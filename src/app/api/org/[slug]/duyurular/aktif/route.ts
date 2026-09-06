import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { gosterilecekDuyurular } from '@/lib/duyuru'
import type { Duyuru } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * GET — kullanıcıya ŞU AN gösterilecek duyurular.
 *
 * HEDEFLEME BURADA UYGULANIYOR, istemcide değil. İstemci tarafı bir filtre
 * yeterli olmazdı: hedeflenmemiş kullanıcı yine tüm duyuruları çeker ve ağ
 * sekmesinden okurdu. Bu uç yalnızca kullanıcının görmeye hakkı olanları
 * döndürür.
 *
 * Yanıt: `{ duyurular: [...] }` — yayında + hedefte + OKUNMAMIŞ olanlar,
 * önem sırasına göre.
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin, user, rol, il } = y.yetki

  // Üyenin DENEYAP'ı — hedeflemenin üçüncü boyutu. Kolon yoksa (061
  // uygulanmamışsa) null kabul edilir ve DENEYAP hedeflemesi eşleşmez;
  // rol/il hedeflemesi çalışmaya devam eder.
  const { data: uyelik } = await admin
    .from('organization_members')
    .select('deneyap_id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .maybeSingle()

  const [{ data: duyurular, error }, { data: okunanlar }] = await Promise.all([
    admin.from('duyurular').select('*').eq('organization_id', org.id).eq('yayinda', true),
    admin.from('duyuru_okundu').select('duyuru_id').eq('user_id', user.id),
  ])

  if (error) {
    // 062 uygulanmadıysa ekranı çökertme: duyuru yok say. Popup hiç açılmaz,
    // uygulamanın geri kalanı etkilenmez.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return NextResponse.json({ duyurular: [], migrationGerekli: true })
    }
    console.error('[duyurular/aktif]', error)
    return NextResponse.json({ error: 'Duyurular alınamadı.' }, { status: 500 })
  }

  const okunanIdler = new Set(
    ((okunanlar ?? []) as { duyuru_id: string }[]).map(o => o.duyuru_id),
  )

  const gosterilecek = gosterilecekDuyurular(
    (duyurular ?? []) as Duyuru[],
    {
      role: rol,
      il,
      deneyapId: (uyelik as { deneyap_id?: string | null } | null)?.deneyap_id ?? null,
    },
    okunanIdler,
  )

  return NextResponse.json({ duyurular: gosterilecek })
}
