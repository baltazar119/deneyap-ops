import type { Metadata, Viewport } from 'next'
import { Inter, Lora } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const lora = Lora({ subsets: ['latin'], variable: '--font-lora', weight: ['400', '500', '700'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'DENEYAP OYS',
  description: 'DENEYAP operasyon yönetim sistemi',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr">
      <body className={`${inter.className} ${lora.variable}`}>
        {children}
      </body>
    </html>
  )
}
