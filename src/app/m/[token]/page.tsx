import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { MaterialClient, type MaterialFile } from './material-client'

// Joseph-facing material library for one client org: everything the crew has
// uploaded, posted vs available, with one-tap marking. Same token pattern as
// /r and /u; always fetched fresh so a revoked token 404s immediately.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Material',
  robots: { index: false, follow: false },
}

const BUCKET = 'client-assets'

interface MaterialPageProps {
  params: Promise<{ token: string }>
}

export default async function MaterialPage({ params }: MaterialPageProps) {
  const { token } = await params
  if (!token || token.length < 16) notFound()

  const supabase = createAdminClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('material_token', token)
    .maybeSingle()

  if (!org) notFound()

  const { data: uploads } = await supabase
    .from('capture_uploads')
    .select('path, job, location, notes, content_type, size_bytes, uploaded_at, posted_at, post_ref, created_at')
    .eq('org_id', org.id)
    .not('uploaded_at', 'is', null)
    .order('created_at', { ascending: false })

  // Bucket is public (created 2026-08-13); plain public URLs render thumbnails
  // and long-press-save on a phone without any signing round-trip.
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`
  const files: MaterialFile[] = (uploads ?? []).map((u) => ({
    path: u.path,
    url: base + u.path,
    job: u.job,
    location: u.location,
    notes: u.notes,
    contentType: u.content_type,
    sizeBytes: u.size_bytes,
    postedAt: u.posted_at,
    postRef: u.post_ref,
    createdAt: u.created_at,
  }))

  return <MaterialClient token={token} orgName={org.name} files={files} />
}
