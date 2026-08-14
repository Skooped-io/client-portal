import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'
import {
  DAILY_BYTES_LIMIT,
  DAILY_FILE_LIMIT,
  buildObjectPath,
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
  const jobSlug = slugifyJob(job, now)

  try {
    const files = validation.files.map((file, index) => ({
      ...file,
      path: buildObjectPath(
        org.id,
        jobSlug,
        now,
        index,
        file.ext,
        randomBytes(4).toString('hex')
      ),
    }))

    // Atomic daily-quota reservation: capture_reserve serializes per org and
    // does check + ledger insert in one transaction, so concurrent requests
    // can't all pass the same pre-insert snapshot. Every reserved row counts
    // against today's quota whether or not the upload lands.
    const { data: reservation, error: reserveError } = await admin.rpc('capture_reserve', {
      p_org_id: org.id,
      p_job: jobSlug,
      p_files: files.map((f) => ({
        path: f.path,
        content_type: f.type,
        size_bytes: f.size,
      })),
      p_max_files: DAILY_FILE_LIMIT,
      p_max_bytes: DAILY_BYTES_LIMIT,
    })

    if (reserveError) {
      portal.error('capture.sign', reserveError.message)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }
    if (reservation !== 'ok') {
      portal.event('capture.sign', 'failed', {
        metadata: { orgId: org.id, reason: reservation },
      })
      return NextResponse.json(
        { error: 'Daily upload limit reached for today. Try again tomorrow' },
        { status: 429 }
      )
    }

    const uploads: Array<{ path: string; signedUrl: string }> = []
    for (const file of files) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUploadUrl(file.path)

      if (error || !data) {
        portal.error('capture.sign', error?.message ?? 'No signed URL returned')
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
      }
      uploads.push({ path: file.path, signedUrl: data.signedUrl })
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
