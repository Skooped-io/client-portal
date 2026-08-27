/**
 * Validation for the crew capture upload flow (/u/[token] → /api/capture/*).
 *
 * Pure functions so the limits are unit-testable without mocking Supabase.
 * Extensions come from the MIME type, never from the client's filename, so a
 * crafted name can't smuggle a different extension into storage.
 */

// MIME type → stored extension. HEIC/HEIF included because iPhone camera
// rolls default to them; quicktime because iPhone video is .mov.
export const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
}

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024 // 25MB: covers 48MP phone photos
// Supabase global per-file cap on the current plan, measured 2026-08-13:
// 50MiB PUT succeeds, 51MiB returns 413 EntityTooLarge. A 10s 1080p phone
// clip is ~10-15MB, so this fits the ask; raise it if the project moves to
// a plan with a higher storage cap.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const MAX_FILES_PER_REQUEST = 12
export const MAX_JOB_LENGTH = 40
export const MAX_LOCATION_LENGTH = 60
export const MAX_NOTES_LENGTH = 240

// Per-org, per-UTC-day. Generous for a crew, a wall for a leaked token.
export const DAILY_FILE_LIMIT = 200
export const DAILY_BYTES_LIMIT = 4 * 1024 * 1024 * 1024 // 4GB

export interface CaptureFileMeta {
  type: string
  size: number
}

export interface ValidatedFile {
  type: string
  size: number
  ext: string
}

export type ValidationResult =
  | { ok: true; files: ValidatedFile[] }
  | { ok: false; error: string }

export function isVideo(type: string): boolean {
  return type.startsWith('video/')
}

export function maxBytesFor(type: string): number {
  return isVideo(type) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
}

export function validateFiles(input: unknown): ValidationResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'No files provided' }
  }
  if (input.length > MAX_FILES_PER_REQUEST) {
    return { ok: false, error: `Too many files. Maximum ${MAX_FILES_PER_REQUEST} per send` }
  }

  const files: ValidatedFile[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'Invalid file entry' }
    }
    const { type, size } = item as Partial<CaptureFileMeta>
    if (typeof type !== 'string' || !(type in ALLOWED_TYPES)) {
      return {
        ok: false,
        error: 'That file type is not supported. Photos (JPG, PNG, HEIC) and videos (MP4, MOV) only',
      }
    }
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      return { ok: false, error: 'Invalid file size' }
    }
    const cap = maxBytesFor(type)
    if (size > cap) {
      const mb = Math.round(cap / 1024 / 1024)
      return {
        ok: false,
        error: `A ${isVideo(type) ? 'video' : 'photo'} is over the ${mb}MB limit`,
      }
    }
    files.push({ type, size, ext: ALLOWED_TYPES[type] })
  }
  return { ok: true, files }
}

/**
 * Turn a free-text job label into a safe storage folder segment.
 * Falls back to job-YYYY-MM-DD (UTC) when the crew leaves it blank.
 */
export function slugifyJob(raw: unknown, now: Date): string {
  const fallback = `job-${now.toISOString().slice(0, 10)}`
  if (typeof raw !== 'string') return fallback
  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_JOB_LENGTH)
    .replace(/-+$/g, '')
  return slug.length >= 2 ? slug : fallback
}

/**
 * Free-text intake fields (location, notes) stored verbatim on the ledger.
 * Control characters stripped, whitespace collapsed, hard length cap; null
 * when nothing usable remains so blank stays blank in the table.
 */
export function cleanFreeText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null
  const text = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim()
  return text.length > 0 ? text : null
}

/**
 * Storage object path. randomSuffix keeps two crew phones signing in the same
 * millisecond from colliding.
 */
export function buildObjectPath(
  orgId: string,
  jobSlug: string,
  now: Date,
  index: number,
  ext: string,
  randomSuffix: string
): string {
  return `${orgId}/captures/${jobSlug}/${now.getTime()}-${index}-${randomSuffix}.${ext}`
}

export interface QuotaUsage {
  fileCount: number
  totalBytes: number
}

export function quotaExceeded(usage: QuotaUsage, incoming: ValidatedFile[]): string | null {
  if (usage.fileCount + incoming.length > DAILY_FILE_LIMIT) {
    return 'Daily upload limit reached for today. Try again tomorrow'
  }
  const incomingBytes = incoming.reduce((sum, f) => sum + f.size, 0)
  if (usage.totalBytes + incomingBytes > DAILY_BYTES_LIMIT) {
    return 'Daily upload size limit reached for today. Try again tomorrow'
  }
  return null
}
