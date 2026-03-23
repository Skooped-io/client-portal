import type { Metadata } from 'next'
import AnalyticsPage from './analytics-client'

export const metadata: Metadata = { title: 'Analytics' }
export const revalidate = 300

export default function AnalyticsServerPage() {
  return <AnalyticsPage />
}
