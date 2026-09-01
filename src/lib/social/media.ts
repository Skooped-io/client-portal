/**
 * Media preparation for Meta.
 *
 * The crew uploads whatever the phone produces (HEIC, PNG, WebP, JPEG, MOV,
 * MP4) straight into the public client-assets bucket. Meta pulls media from
 * a URL, and Instagram in particular only accepts JPEG at a 4:5 – 1.91:1
 * ratio, so every image is turned into a derived JPEG first:
 *
 *   - HEIC/HEIF decoded with heic-decode (libheif WASM; sharp's prebuilt
 *     binaries never ship HEVC, see docs/social-publisher.md)
 *   - EXIF orientation baked in (sharp .rotate() with no args = autoOrient)
 *   - transparency flattened onto white, padded (never cropped) to the
 *     nearest legal ratio with a white background, width capped at 1440
 *   - carousels: every item padded to the FIRST item's ratio, because
 *     Instagram crops all carousel children to the first image's ratio
 *   - quality 85, written to client-assets/<orgId>/derived/<sha1(path[+ratio])>.jpg
 *
 * Idempotent: the derived path is a hash of the source path (plus the target
 * ratio when one is forced), and an existing object is reused. Videos pass
 * through untouched in v1 (Meta transcodes).
 */

import { createHash } from 'crypto'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { isImageType, type DerivedMediaItem, type MediaItem } from './queue'

export const BUCKET = 'client-assets'
export const MAX_WIDTH = 1440
export const JPEG_QUALITY = 85
// Instagram feed limits: portrait 4:5 (0.8) to landscape 1.91:1.
export const MIN_RATIO = 4 / 5
export const MAX_RATIO = 1.91
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

export function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

/**
 * Derived object path. A forced target ratio is part of the hash so a
 * carousel-padded render never collides with the free-ratio render of the
 * same source.
 */
export function derivedPath(sourcePath: string, targetRatio?: number): string {
  const orgId = sourcePath.split('/')[0]
  const key = targetRatio == null ? sourcePath : `${sourcePath}@${targetRatio.toFixed(4)}`
  const hash = createHash('sha1').update(key).digest('hex')
  return `${orgId}/derived/${hash}.jpg`
}

export interface Padding {
  width: number
  height: number
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Canvas that brings width×height to a legal ratio by adding equal white
 * margins. With no target: the nearest edge of [MIN_RATIO, MAX_RATIO] (zero
 * padding when already legal). With a target ratio: pad out to exactly that
 * ratio (used so every carousel item matches the first). Pure; unit-tested.
 */
export function paddingFor(width: number, height: number, targetRatio?: number): Padding {
  const ratio = width / height
  let targetW = width
  let targetH = height
  if (targetRatio != null) {
    if (ratio < targetRatio - 1e-6) targetW = Math.ceil(height * targetRatio)
    else if (ratio > targetRatio + 1e-6) targetH = Math.ceil(width / targetRatio)
  } else if (ratio < MIN_RATIO) {
    targetW = Math.ceil(height * MIN_RATIO)
  } else if (ratio > MAX_RATIO) {
    targetH = Math.ceil(width / MAX_RATIO)
  }
  const dx = targetW - width
  const dy = targetH - height
  const left = Math.floor(dx / 2)
  const top = Math.floor(dy / 2)
  return { width: targetW, height: targetH, left, top, right: dx - left, bottom: dy - top }
}

export function isHeic(contentType: string, bytes?: Uint8Array): boolean {
  if (contentType === 'image/heic' || contentType === 'image/heif') return true
  if (!bytes || bytes.length < 12) return false
  const brand = String.fromCharCode(...bytes.subarray(8, 12)).trim()
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)
}

async function decodeToSharp(bytes: Buffer, contentType: string): Promise<sharp.Sharp> {
  if (isHeic(contentType, bytes)) {
    const { default: decode } = await import('heic-decode')
    const img = await decode({ buffer: bytes })
    // libheif applies the file's rotation/mirror properties on display, so
    // the RGBA buffer is already upright.
    return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
      raw: { width: img.width, height: img.height, channels: 4 },
    })
  }
  return sharp(bytes).rotate()
}

export interface Rendered {
  buffer: Buffer
  width: number
  height: number
}

/**
 * Render an already-decoded sharp pipeline to a Meta-ready JPEG. Two stages:
 * resize + flatten to RAW pixels (lossless, and the only output a raw-input
 * pipeline such as the HEIC path can be re-fed to sharp), then pad + encode.
 * The intermediate is re-wrapped WITH its raw descriptor; a bare
 * `sharp(data)` on raw pixels throws "Input buffer contains unsupported
 * image format".
 */
export async function renderSharpForMeta(base: sharp.Sharp, targetRatio?: number): Promise<Rendered> {
  const { data, info } = await base
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .flatten({ background: WHITE })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pad = paddingFor(info.width, info.height, targetRatio)
  let out = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
  if (pad.left || pad.top || pad.right || pad.bottom) {
    out = out.extend({
      top: pad.top,
      bottom: pad.bottom,
      left: pad.left,
      right: pad.right,
      background: WHITE,
    })
  }
  const buffer = await out.jpeg({ quality: JPEG_QUALITY }).toBuffer()
  return { buffer, width: pad.width, height: pad.height }
}

/**
 * Convert a source image (bytes + content type) to a Meta-ready JPEG buffer.
 * Exported so the pipeline can be tested on a generated image without storage.
 */
export async function renderForMeta(bytes: Buffer, contentType: string, targetRatio?: number): Promise<Rendered> {
  return renderSharpForMeta(await decodeToSharp(bytes, contentType), targetRatio)
}

export interface PreparedImage {
  derivedPath: string
  publicUrl: string
  width: number
  height: number
}

async function derivedExists(path: string): Promise<boolean> {
  const admin = createAdminClient()
  const slash = path.lastIndexOf('/')
  const dir = path.slice(0, slash)
  const name = path.slice(slash + 1)
  const { data } = await admin.storage.from(BUCKET).list(dir, { search: name, limit: 1 })
  return Boolean(data?.some((o) => o.name === name))
}

/**
 * Download the original from the public bucket, render it, upload the
 * derived JPEG (skipped when it already exists), return its public URL.
 */
export async function prepareImageForMeta(
  path: string,
  contentType: string,
  targetRatio?: number
): Promise<PreparedImage> {
  const target = derivedPath(path, targetRatio)
  const url = publicUrl(target)

  if (await derivedExists(target)) {
    const meta = await sharp(await download(url)).metadata()
    return { derivedPath: target, publicUrl: url, width: meta.width ?? 0, height: meta.height ?? 0 }
  }

  const source = await download(publicUrl(path))
  const rendered = await renderForMeta(source, contentType, targetRatio)

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(target, rendered.buffer, { contentType: 'image/jpeg', upsert: false })
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Derived upload failed: ${error.message}`)
  }
  return { derivedPath: target, publicUrl: url, width: rendered.width, height: rendered.height }
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch media (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Everything Meta needs to fetch for a post: derived JPEGs for images, the
 * original public URL for a video. Order preserved (carousel order).
 *
 * `uniformRatio` (carousels): the first image is rendered to its own legal
 * ratio, and every following image is padded to exactly that ratio, so
 * Instagram's "crop every child to the first item" never cuts real content.
 */
export async function prepareMediaForMeta(
  media: MediaItem[],
  options: { uniformRatio?: boolean } = {}
): Promise<DerivedMediaItem[]> {
  const out: DerivedMediaItem[] = []
  let targetRatio: number | undefined
  for (const item of media) {
    if (isImageType(item.content_type)) {
      const prepared = await prepareImageForMeta(item.path, item.content_type, targetRatio)
      out.push({ path: prepared.derivedPath, public_url: prepared.publicUrl })
      if (options.uniformRatio && targetRatio == null && prepared.width > 0 && prepared.height > 0) {
        targetRatio = prepared.width / prepared.height
      }
    } else {
      out.push({ path: item.path, public_url: publicUrl(item.path) })
    }
  }
  return out
}
