import type { Metadata } from 'next'
import ReportsPage from './reports-client'

export const metadata: Metadata = { title: 'Reports' }
export const revalidate = 300

export default function ReportsServerPage() {
  return <ReportsPage />
}
