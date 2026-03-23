import type { Metadata } from 'next'
import AdsPage from './ads-client'

export const metadata: Metadata = { title: 'Ads' }
export const revalidate = 300

export default function AdsServerPage() {
  return <AdsPage />
}
