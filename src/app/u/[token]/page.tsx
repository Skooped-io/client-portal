import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { CaptureClient } from './capture-client'

// Public tokenized crew upload page. Same pattern as /r/[token]: always
// fetched fresh so a revoked token 404s immediately.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Send Job Photos',
  robots: { index: false, follow: false },
}

interface CapturePageProps {
  params: Promise<{ token: string }>
}

export default async function CapturePage({ params }: CapturePageProps) {
  const { token } = await params
  if (!token || token.length < 16) notFound()

  // Service-role client (server-only): the page is only reachable when a
  // capture_token has been explicitly generated for the org.
  const supabase = createAdminClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('capture_token', token)
    .maybeSingle()

  if (!org) notFound()

  return <CaptureClient token={token} orgName={org.name} />
}
