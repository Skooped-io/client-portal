import type { Metadata } from 'next'
import SeoPage from './seo-client'

export const metadata: Metadata = { title: 'SEO' }
export const revalidate = 300

// Server wrapper — currently passes through to client component.
// Real data is in Supabase (seo_metrics table) and can be fetched here
// and passed as props when the client component is updated to accept them.
export default function SeoServerPage() {
  return <SeoPage />
}
