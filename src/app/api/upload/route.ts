import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { portal } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

/**
 * POST /api/upload
 *
 * Uploads an image to Supabase Storage for the current org.
 * Used by the website management page for logo, gallery, team photos.
 *
 * Form data: file (image), slot (string: 'logo' | 'hero' | 'gallery_1' | 'team_1' etc)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getCurrentOrgId(supabase)
  if (!orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const slot = formData.get('slot') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!slot) {
    return NextResponse.json({ error: 'No slot specified' }, { status: 400 })
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Build file path: org_id/slot.ext
  const ext = file.name.split('.').pop() ?? 'jpg'
  const filePath = `${orgId}/${slot}.${ext}`

  try {
    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await admin.storage
      .from('client-assets')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true, // overwrite existing
      })

    if (uploadError) {
      console.error('[upload] Storage error:', uploadError.message)
      portal.error('upload.file', uploadError.message)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = admin.storage
      .from('client-assets')
      .getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl

    portal.event('upload.file', 'completed', {
      user_id: user.id,
      metadata: { orgId, slot, fileType: file.type, fileSize: file.size },
    })

    return NextResponse.json({
      success: true,
      url: publicUrl,
      slot,
      path: filePath,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[upload] Error:', msg)
    portal.error('upload.file', msg)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
