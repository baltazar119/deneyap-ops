import 'server-only'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { RaporBelgesi } from './belge'
import type { RaporVerisi } from '../hesapla'

/**
 * Rapor verisinden PDF üretir (sunucu tarafı).
 *
 * Cast gerekiyor çünkü renderToBuffer imzası ReactElement<DocumentProps>
 * bekliyor; RaporBelgesi kendi prop tipiyle sarmalanmış bir bileşen ama
 * kökünde <Document> döndürüyor.
 */
export async function raporPdfUret(v: RaporVerisi): Promise<Buffer> {
  const belge = <RaporBelgesi v={v} /> as unknown as React.ReactElement<DocumentProps>
  return renderToBuffer(belge)
}
