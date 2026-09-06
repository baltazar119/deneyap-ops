import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'
import { rateLimit, getClientIp } from '@/lib/rateLimit'
import { tokenOzeti, gonderimAcikMi } from '@/lib/formToken'
import { cevaplariDogrula } from '@/lib/form/dogrula'
import { sablonDoldur, cevapOzetiMetni, terminHesapla } from '@/lib/form/sablon'
import type { Form, FormAlani } from '@/lib/form/tipler'

export const dynamic = 'force-dynamic'

/**
 * Form doldurma ucu — HEM açık bağlantı HEM üye formu buradan geçer.
 *
 * Tek uç olması bilinçli: iki ayrı yol, iki ayrı doğrulama zinciri ve
 * ikisinden birinin unutulması demekti. Erişim farkı tek bir yerde:
 * `form.erisim === 'uyeler'` ise token'ın ÜSTÜNE oturum + org üyeliği aranır.
 *
 * Token tek başına org verisine erişim vermez; yalnızca kendi gönderimindeki
 * formu açar. Yanıtlar service-role ile yazılır (anon INSERT politikası
 * bilerek yok — bkz. migration 066).
 */

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: onbelleksizFetch } },
  )
}

interface Cozum {
  db: SupabaseClient
  gonderim: { id: string; organization_id: string; form_id: string; gorev_id: string | null;
              alici_user_id: string | null; durum: string; son_gecerlilik: string | null;
              gonderen_id: string | null }
  form: Form
  /** Üye formunda doğrulanmış kullanıcı; açık bağlantıda null. */
  kullaniciId: string | null
}

/**
 * Token'ı çöz, gönderimi ve formu getir, erişim kuralını uygula.
 *
 * Hata mesajları kasten AYRINTISIZ: geçersiz token ile başkasına ait geçerli
 * token aynı cevabı almalı, yoksa token tahmini için sinyal olur.
 */
async function coz(req: NextRequest, token: string): Promise<Cozum | NextResponse> {
  const db = adminClient()

  const { data: gonderim } = await db
    .from('form_gonderimleri')
    .select('id, organization_id, form_id, gorev_id, alici_user_id, durum, son_gecerlilik, gonderen_id')
    .eq('token_ozeti', tokenOzeti(token))
    .maybeSingle()

  if (!gonderim) {
    return NextResponse.json({ error: 'Bu form bağlantısı geçersiz.' }, { status: 404 })
  }

  const { data: form } = await db
    .from('formlar')
    .select('*')
    .eq('id', (gonderim as { form_id: string }).form_id)
    .maybeSingle()
  if (!form) return NextResponse.json({ error: 'Bu form bağlantısı geçersiz.' }, { status: 404 })

  const f = form as Form
  let kullaniciId: string | null = null

  if (f.erisim === 'uyeler') {
    // Token yetmiyor: oturum ve ORG ÜYELİĞİ de aranıyor.
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return NextResponse.json(
        { error: 'Bu formu doldurmak için giriş yapmalısınız.', girisGerekli: true },
        { status: 401 },
      )
    }
    const { data: { user } } = await db.auth.getUser(jwt)
    if (!user) {
      return NextResponse.json(
        { error: 'Oturum geçersiz veya süresi dolmuş.', girisGerekli: true },
        { status: 401 },
      )
    }
    const { data: uyelik } = await db
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', (gonderim as { organization_id: string }).organization_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!uyelik) {
      return NextResponse.json({ error: 'Bu formu doldurma yetkiniz yok.' }, { status: 403 })
    }
    kullaniciId = user.id
  }

  return { db, gonderim: gonderim as Cozum['gonderim'], form: f, kullaniciId }
}

/** GET — doldurulacak formun tanımı. Org'un başka hiçbir verisi dönmez. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  const { allowed } = await rateLimit(`form-get:${ip}`, 60, 60_000)
  if (!allowed) return NextResponse.json({ error: 'Çok fazla istek. Biraz bekleyin.' }, { status: 429 })

  const sonuc = await coz(req, params.token)
  if (sonuc instanceof NextResponse) return sonuc
  const { gonderim, form } = sonuc

  const durum = gonderimAcikMi(gonderim)

  // Yanıt YÜZEYİ dar tutuluyor: org id'si, gönderen, görev id'si gibi iç
  // bilgiler açık bağlantıyla gelen kişiye gitmemeli.
  return NextResponse.json({
    acik: durum.acik,
    sebep: durum.sebep ?? null,
    form: {
      baslik: form.baslik,
      aciklama: form.aciklama,
      alanlar: form.alanlar as FormAlani[],
      erisim: form.erisim,
    },
  })
}

/** POST — cevabı kaydet, bağlı görevi tamamla, sonraki görevi aç. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  // Yazma sınırı okumadan sıkı: açık bağlantı spam'e karşı korunmalı.
  const { allowed } = await rateLimit(`form-post:${ip}`, 10, 60_000)
  if (!allowed) return NextResponse.json({ error: 'Çok fazla istek. Biraz bekleyin.' }, { status: 429 })

  const sonuc = await coz(req, params.token)
  if (sonuc instanceof NextResponse) return sonuc
  const { db, gonderim, form, kullaniciId } = sonuc

  const durum = gonderimAcikMi(gonderim)
  if (!durum.acik) return NextResponse.json({ error: durum.sebep }, { status: 409 })

  const alanlar = (form.alanlar ?? []) as FormAlani[]
  const { cevaplar, hatalar } = cevaplariDogrula(alanlar, (await req.json().catch(() => ({}))).cevaplar)
  if (hatalar.length) {
    return NextResponse.json({ error: hatalar[0].mesaj, hatalar }, { status: 400 })
  }

  // ── 1) Yanıtı kaydet ──
  const { data: yanit, error: yanitHatasi } = await db
    .from('form_yanitlari')
    .insert({
      organization_id: gonderim.organization_id,
      gonderim_id: gonderim.id,
      cevaplar,
      yanitlayan_user_id: kullaniciId,
      yanitlayan_ip: ip === 'unknown' ? null : ip,
    })
    .select()
    .single()

  if (yanitHatasi) {
    console.error('[form yanit]', yanitHatasi)
    return NextResponse.json({ error: 'Cevaplar kaydedilemedi.' }, { status: 500 })
  }

  // ── 2) Gönderimi kapat ──
  // Yanıt kaydedildikten SONRA: sıra ters olsaydı ve yanıt yazımı hata
  // verseydi, gönderim doldurulmuş sayılıp cevap kaybolurdu.
  await db.from('form_gonderimleri')
    .update({ durum: 'yanitlandi' })
    .eq('id', gonderim.id)

  // ── 3) Bağlı görevi tamamla ──
  // Org eşleşmesi gönderim oluşturulurken doğrulandı; burada yine
  // organization_id ile sınırlıyoruz — service-role RLS'i baypas ediyor.
  if (gonderim.gorev_id) {
    await db.from('tasks')
      .update({ status: 'done' })
      .eq('id', gonderim.gorev_id)
      .eq('organization_id', gonderim.organization_id)
  }

  // ── 4) Sonraki görevi aç ──
  let olusanGorevId: string | null = null
  if (form.sonraki_gorev_aktif && form.sonraki_gorev_baslik) {
    const baslik = sablonDoldur(form.sonraki_gorev_baslik, alanlar, cevaplar).slice(0, 200)
    const aciklamaSablon = sablonDoldur(form.sonraki_gorev_aciklama, alanlar, cevaplar)
    // Cevap özeti her zaman ekleniyor: yeni görevi alan kişi, hangi cevaplar
    // yüzünden bu işin açıldığını görmeli.
    const aciklama = [aciklamaSablon, `— ${form.baslik} cevapları —`, cevapOzetiMetni(alanlar, cevaplar)]
      .filter(Boolean).join('\n\n')

    const atanan =
      form.sonraki_gorev_atanan_kaynak === 'sabit' ? form.sonraki_gorev_atanan_id
      : form.sonraki_gorev_atanan_kaynak === 'yanitlayan' ? kullaniciId
      : gonderim.gonderen_id

    // İl/DENEYAP kaynak görevden devralınıyor: yeni iş aynı sahanın işi.
    let il: string | null = null
    let deneyapId: string | null = null
    if (gonderim.gorev_id) {
      const { data: kaynak } = await db
        .from('tasks').select('il, deneyap_id')
        .eq('id', gonderim.gorev_id).maybeSingle()
      il = (kaynak as { il: string | null } | null)?.il ?? null
      deneyapId = (kaynak as { deneyap_id: string | null } | null)?.deneyap_id ?? null
    }

    if (baslik) {
      const { data: yeniGorev, error: gorevHatasi } = await db
        .from('tasks')
        .insert({
          organization_id: gonderim.organization_id,
          title: baslik,
          description: aciklama || null,
          status: 'backlog',
          priority: form.sonraki_gorev_oncelik,
          task_type: form.sonraki_gorev_tur,
          assignee_id: atanan,
          due_date: terminHesapla(form.sonraki_gorev_termin_gun),
          il, deneyap_id: deneyapId,
          created_by: gonderim.gonderen_id ?? kullaniciId,
        })
        .select('id')
        .single()

      if (gorevHatasi) {
        // Görev açılamazsa CEVAP YİNE DE DURUR. Kullanıcıya "kaydedilemedi"
        // demek, kaydedilmiş bir cevabı tekrar doldurtmak olurdu.
        console.error('[form sonraki gorev]', gorevHatasi)
      } else {
        olusanGorevId = (yeniGorev as { id: string }).id
        await db.from('form_yanitlari').update({ olusan_gorev_id: olusanGorevId }).eq('id', (yanit as { id: string }).id)
      }
    }
  }

  // ── 5) Gönderene haber ver ──
  // Tarayıcı istemcisi kullanan createNotification burada çalışmaz (oturum
  // yok, RLS engeller); service-role ile doğrudan yazılıyor.
  if (gonderim.gonderen_id && gonderim.gonderen_id !== kullaniciId) {
    const { error: bildirimHatasi } = await db.from('notifications').insert({
      user_id: gonderim.gonderen_id,
      type: 'system',
      event_type: 'form_yanitlandi',
      title: 'Form Dolduruldu',
      description: `"${form.baslik}" formu yanıtlandı.`,
      actor_id: kullaniciId,
      is_read: false,
      organization_id: gonderim.organization_id,
    })
    if (bildirimHatasi) console.error('[form yanit bildirim]', bildirimHatasi)
  }

  return NextResponse.json({ ok: true, olusanGorevId })
}
