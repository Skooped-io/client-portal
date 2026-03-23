import type { Metadata } from 'next'
import ActivityPage from './activity-client'

export const metadata: Metadata = { title: 'Activity' }
export const revalidate = 300

export default function ActivityServerPage() {
  return <ActivityPage />
}
