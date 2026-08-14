import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import {
  buildObjectPath,
  quotaExceeded,
  slugifyJob,
  validateFiles,
} from '@/lib/capture/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-assets'
const MIN_TOKEN_LENGTH = 16

/**
 * POST /api/capture/sign
 *
 * Public, token-scoped. The crew page (/u/[token]) sends file metadata; this
 * returns direct-to-storage signed upload URLs so video never flows through a
 * Vercel function body (4.5MB limit). Every issued URL is recorded in
 * capture_uploads, which is also what the per-org daily quota counts.
 *
 * Body: { token: string, job?: string, files: [{ type, size }] }
 * Response: { job: string, uploads: [{ path, signedUrl }] }
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, job, files } = (body ?? {}) as {
    token?: unknown
    job?: unknown
    files?: unknown
  }

  if (typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('capture_token', token)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const validation = validateFiles(files)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const now = new Date()

  // Daily quota, counted against every URL issued today (UTC), landed or not.
  const midnightUtc = `${now.toISOString().slice(0, 10)}T00:00:00Z`
  const { data: todays, error: quotaError } = await admin
    .from('capture_uploads')
    .select('size_bytes')
    .eq('org_id', org.id)
    .gte('created_at', midnightUtc)

  if (quotaError) {
    portal.error('capture.sign', quotaError.message)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const usage = {
    fileCount: todays?.length ?? 0,
    totalBytes: (todays ?? []).reduce((sum, r) => sum + Number(r.size_bytes ?? 0), 0),
  }
  const quotaMessage = quotaExceeded(usage, validation.files)
  if (quotaMessage) {
    portal.event('capture.sign', 'failed', {
      metadata: { orgId: org.id, reason: 'quota', ...usage },
    })
    return NextResponse.json({ error: quotaMessage }, { status: 429 })
  }

  const jobSlug = slugifyJob(job, now)

  try {
    const uploads: Array<{ path: string; signedUrl: string }> = []
    const rows: Array<Record<string, unknown>> = []

    for (const [index, file] of validation.files.entries()) {
      const path = buildObjectPath(
        org.id,
        jobSlug,
        now,
        index,
        file.ext,
        randomBytes(4).toString('hex')
      )
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUploadUrl(path)

      if (error || !data) {
        portal.error('capture.sign', error?.message ?? 'No signed URL returned')
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
      }

      uploads.push({ path, signedUrl: data.signedUrl })
      rows.push({
        org_id: org.id,
        path,
        job: jobSlug,
        content_type: file.type,
        size_bytes: file.size,
      })
    }

    const { error: insertError } = await admin.from('capture_uploads').insert(rows)
    if (insertError) {
      portal.error('capture.sign', insertError.message)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    portal.event('capture.sign', 'completed', {
      metadata: {
        orgId: org.id,
        job: jobSlug,
        fileCount: uploads.length,
        totalBytes: validation.files.reduce((sum, f) => sum + f.size, 0),
      },
    })

    return NextResponse.json({ job: jobSlug, uploads })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    portal.error('capture.sign', msg)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
