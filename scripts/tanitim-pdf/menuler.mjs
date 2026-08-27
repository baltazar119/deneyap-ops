/**
 * Rol → menü haritası. src/lib/navigation.ts içindeki gerçek getNavLinks()
 * çıktısının PDF'e taşınmış hâli — kaynağı tek, burada kopyası duruyor
 * çünkü PDF üretim betiği uygulamanın kendi derleme zincirine girmiyor.
 * navigation.ts değişirse burası da elle güncellenmeli.
 */

export const ROLLER = [
  {
    ad: 'Merkez Operasyon Ekibi / Koordinatör',
    kisaAd: 'Merkez · Koordinatör',
    renk: '#2288c9',
    anaEkran: 'Panel',
    aciklama:
      'Tüm illeri ve tüm görevleri görür. Görev oluşturur, atar, Excel içe aktarır, ' +
      'ekibi yönetir, tam kapsamlı rapor alır.',
    menu: [
      { grup: 'ANA', ogeler: ['Panel'] },
      { grup: 'İŞ', ogeler: ['Görevler', 'Kanban', 'Takvim', 'Timeline', 'Sprintler'] },
      { grup: 'İZLEME', ogeler: ['Operasyon Riski', 'Raporlar'] },
      { grup: 'EKİP', ogeler: ['Ekip', 'Sohbet', 'Toplantılar', 'Dosyalar', 'AI Asistan*', 'Danışmanlık*'] },
      { grup: 'KİŞİSEL', ogeler: ['Listelerim', 'Profilim', 'Ayarlar'] },
    ],
  },
  {
    ad: 'İl Sorumlusu',
    kisaAd: 'İl Sorumlusu',
    renk: '#059669',
    anaEkran: 'Panelim',
    aciklama:
      'Yalnızca kendi ilini ve kendisine atanan görevleri görür. Durum günceller, ' +
      'açıklama girer, kendi ilinin raporunu alır.',
    menu: [
      { grup: 'ANA', ogeler: ['Panelim'] },
      { grup: 'İŞ', ogeler: ['Kanban', 'Takvim', 'Timeline'] },
      { grup: 'İZLEME', ogeler: ['Raporlar'] },
      { grup: 'EKİP', ogeler: ['Sohbet', 'Toplantılar', 'Dosyalar'] },
      { grup: 'KİŞİSEL', ogeler: ['Listelerim', 'Profilim'] },
    ],
  },
  {
    ad: 'Yetkili Yönetici',
    kisaAd: 'Yetkili Yönetici',
    renk: '#7c3aed',
    anaEkran: 'Panel',
    aciklama:
      'Salt izleme rolü. Kişi bazlı görev detayı görmez; yalnızca özet göstergeler, ' +
      'oranlar ve raporlarla programın genel gidişatını takip eder.',
    menu: [
      { grup: 'ANA', ogeler: ['Panel'] },
      { grup: 'İZLEME', ogeler: ['Raporlar', 'Operasyon Riski'] },
      { grup: 'İŞ', ogeler: ['Görevler', 'Timeline'] },
      { grup: 'KİŞİSEL', ogeler: ['Profilim'] },
    ],
  },
]

export const ROLLER_NOT =
  '* AI Asistan ve Danışmanlık yalnızca Pro planda görünür. Menüdeki sıralama rastgele ' +
  'değil: her rolün en sık kullandığı ekran listenin başındadır — Merkez ekip için ' +
  '"Panel", İl Sorumlusu için doğrudan "Panelim" (kendi görev listesi).'
