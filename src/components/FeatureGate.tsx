'use client'

import { useOrg } from '@/lib/supabase/orgContext'
import { isFeatureEnabled, FEATURE_LABELS, type Feature } from '@/lib/featureGate'

interface FeatureGateProps {
  feature: Feature
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { isPro, hasAiAddon, loading } = useOrg()

  if (loading) return null

  if (!isFeatureEnabled(feature, isPro ? 'pro' : 'free', hasAiAddon)) {
    return fallback ? <>{fallback}</> : <UpgradePrompt feature={feature} isPro={isPro} />
  }

  return <>{children}</>
}

function UpgradePrompt({ feature, isPro }: { feature: Feature; isPro: boolean }) {
  // ai_assistant için özel mesaj: Pro varsa "AI eklentisi ekleyin", yoksa "Pro alın"
  const isAiFeature = feature === 'ai_assistant'
  const needsAiAddon = isAiFeature && isPro

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-[#0d1a2a] border border-[#2288c9]/30 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
        {/* Rozet */}
        <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-400 text-black text-xs font-bold px-3 py-1 rounded-full mb-5">
          <span>{needsAiAddon ? '🤖' : '⚡'}</span>
          <span>{needsAiAddon ? 'AI EKLENTİSİ GEREKLİ' : 'PRO ÖZELLIK'}</span>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">
          {FEATURE_LABELS[feature]}
        </h2>
        <p className="text-[#8baac4] text-sm mb-6 leading-relaxed">
          {needsAiAddon ? (
            <>
              Bu özellik <strong className="text-white">Pro + AI Eklentisi</strong> gerektirir.
              Hesabınıza AI paketi eklenmesi için yöneticinizle iletişime geçin.
            </>
          ) : (
            <>
              Bu özellik <strong className="text-white">Pro plan</strong> gerektirir.
              Ekibinizin tüm özelliklere erişmesi için yöneticinizle iletişime geçin.
            </>
          )}
        </p>

        <div className="bg-[#0a1420] rounded-xl p-4 mb-6 text-left">
          <p className="text-xs text-[#8baac4] font-medium mb-2 uppercase tracking-wide">
            {needsAiAddon ? 'AI Eklentisi içerir:' : 'Pro plan içerir:'}
          </p>
          <ul className="space-y-1.5">
            {needsAiAddon ? [
              '🤖 AI Görev Asistanı (Gemini)',
              '📋 Otomatik Görev Listesi Üretimi',
              '🔄 Görev Revizyonu',
              '🎯 Proje Bağlamı Desteği',
              '📊 Günlük 20 AI Çağrısı',
            ].map(item => (
              <li key={item} className="text-sm text-[#c4d8ea] flex items-center gap-2">
                <span>{item}</span>
              </li>
            )) : [
              '🤖 AI Görev Asistanı (Eklenti ile)',
              '💬 Danışmanlık Modülü',
              '📁 Google Drive Entegrasyonu',
              '👥 Sınırsız Üye',
              '📧 Email Bildirimleri',
              '🎨 Özel Marka',
              '📊 CSV Dışa Aktarma',
            ].map(item => (
              <li key={item} className="text-sm text-[#c4d8ea] flex items-center gap-2">
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-[#8baac4]">
          {needsAiAddon ? 'AI eklentisi için platform yönetimine başvurun.' : 'Yükseltme için ekip sahibine danışın.'}
        </p>
      </div>
    </div>
  )
}
