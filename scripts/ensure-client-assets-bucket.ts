/**
 * Create or align the client-assets storage bucket.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run ensure-bucket
 *
 * Why this exists: /api/upload and /api/capture/* both write to client-assets,
 * but the bucket was never created in production (verified empty 2026-08-13,
 * because the authed portal side has never been used). Public bucket, matching
 * what /api/upload already assumes with getPublicUrl(); object paths contain
 * the org uuid and a timestamp, so URLs are unguessable in practice.
 *
 * The bucket carries its own MIME allowlist and size limit (review finding
 * 2026-08-13): a signed upload URL binds only the path, and the uploader sets
 * Content-Type at PUT time, so without bucket-level enforcement a leaked
 * signed URL could park arbitrary content (HTML/PDF/executables) in a public
 * bucket. With it, storage itself rejects anything but media, no matter what
 * the route layer was told.
 */

import { createClient } from '@supabase/supabase-js'
import { ALLOWED_TYPES, MAX_VIDEO_BYTES } from '../src/lib/capture/validate'

const BUCKET = 'client-assets'

const CONFIG = {
  public: true,
  // Union of the capture flow and /api/upload (SVG deliberately excluded)
  allowedMimeTypes: Object.keys(ALLOWED_TYPES),
  // Matches the plan's measured global cap; harmless if the plan cap is lower
  fileSizeLimit: MAX_VIDEO_BYTES,
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    process.exit(1)
  }

  const admin = createClient(url, key)
  const { data: buckets, error: listError } = await admin.storage.listBuckets()
  if (listError) {
    console.error(`✗ Could not list buckets: ${listError.message}`)
    process.exit(1)
  }

  if (buckets?.some((b) => b.id === BUCKET)) {
    const { error } = await admin.storage.updateBucket(BUCKET, CONFIG)
    if (error) {
      console.error(`✗ Could not update bucket: ${error.message}`)
      process.exit(1)
    }
    console.log(`✓ Bucket ${BUCKET} updated (public, ${CONFIG.allowedMimeTypes.length} MIME types, ${CONFIG.fileSizeLimit / 1024 / 1024}MB cap)`)
    return
  }

  const { error } = await admin.storage.createBucket(BUCKET, CONFIG)
  if (error) {
    console.error(`✗ Could not create bucket: ${error.message}`)
    process.exit(1)
  }
  console.log(`✓ Created public bucket ${BUCKET} (${CONFIG.allowedMimeTypes.length} MIME types, ${CONFIG.fileSizeLimit / 1024 / 1024}MB cap)`)
}

main()
