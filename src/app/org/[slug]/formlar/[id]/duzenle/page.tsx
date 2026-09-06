'use client'

export const dynamic = 'force-dynamic'

import { useParams } from 'next/navigation'
import FormDuzenleyici from '../../_components/FormDuzenleyici'

export default function FormDuzenlePage() {
  const params = useParams<{ id: string }>()
  return <FormDuzenleyici formId={params?.id} />
}
