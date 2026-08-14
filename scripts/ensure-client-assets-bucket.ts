/**
 * Create the client-assets storage bucket if it does not exist.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run ensure-bucket
 *
 * Why this exists: /api/upload and /api/capture/* both write to client-assets,
 * but the bucket was never created in production (verified empty 2026-08-13,
 * because the authed portal side has never been used). Public bucket, matching
 * what /api/upload already assumes with getPublicUrl(); object paths contain
 * the org uuid and a timestamp, so URLs are unguessable in practice.
 */

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'client-assets'

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
    console.log(`✓ Bucket ${BUCKET} already exists`)
    return
  }

  const { error } = await admin.storage.createBucket(BUCKET, { public: true })
  if (error) {
    console.error(`✗ Could not create bucket: ${error.message}`)
    process.exit(1)
  }
  console.log(`✓ Created public bucket ${BUCKET}`)
}

main()
