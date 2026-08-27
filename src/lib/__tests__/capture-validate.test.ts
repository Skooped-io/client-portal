import { describe, expect, it } from 'vitest'
import {
  ALLOWED_TYPES,
  DAILY_BYTES_LIMIT,
  DAILY_FILE_LIMIT,
  MAX_FILES_PER_REQUEST,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_LOCATION_LENGTH,
  MAX_NOTES_LENGTH,
  buildObjectPath,
  cleanFreeText,
  quotaExceeded,
  slugifyJob,
  validateFiles,
} from '../capture/validate'

const NOW = new Date('2026-08-14T15:30:00Z')

describe('validateFiles', () => {
  it('accepts every allowed type at its size cap', () => {
    const files = Object.keys(ALLOWED_TYPES).map((type) => ({
      type,
      size: type.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES,
    }))
    const result = validateFiles(files)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.files.map((f) => f.ext)).toEqual(Object.values(ALLOWED_TYPES))
    }
  })

  it('rejects empty, non-array, and oversized batches', () => {
    expect(validateFiles([]).ok).toBe(false)
    expect(validateFiles(undefined).ok).toBe(false)
    expect(validateFiles('nope').ok).toBe(false)
    expect(
      validateFiles(
        Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, () => ({
          type: 'image/jpeg',
          size: 100,
        }))
      ).ok
    ).toBe(false)
  })

  it('rejects disallowed MIME types including lookalikes', () => {
    for (const type of ['image/svg+xml', 'image/gif', 'video/webm', 'application/pdf', 'text/html', '']) {
      expect(validateFiles([{ type, size: 100 }]).ok).toBe(false)
    }
  })

  it('rejects bad sizes: zero, negative, NaN, Infinity, over-cap', () => {
    for (const size of [0, -5, NaN, Infinity]) {
      expect(validateFiles([{ type: 'image/jpeg', size }]).ok).toBe(false)
    }
    expect(validateFiles([{ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }]).ok).toBe(false)
    expect(validateFiles([{ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }]).ok).toBe(false)
  })

  it('videos get the video cap, images the image cap', () => {
    expect(validateFiles([{ type: 'video/quicktime', size: MAX_IMAGE_BYTES + 1 }]).ok).toBe(true)
    expect(validateFiles([{ type: 'image/heic', size: MAX_IMAGE_BYTES + 1 }]).ok).toBe(false)
  })

  it('extension comes from MIME type, never a filename', () => {
    const result = validateFiles([{ type: 'video/quicktime', size: 100, name: 'evil.html' }])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.files[0].ext).toBe('mov')
  })
})

describe('slugifyJob', () => {
  it('slugifies free text', () => {
    expect(slugifyJob('Maple St. Fence, Rear', NOW)).toBe('maple-st-fence-rear')
  })

  it('strips path traversal and separators entirely', () => {
    expect(slugifyJob('../../etc/passwd', NOW)).toBe('etc-passwd')
    expect(slugifyJob('a/b\\c', NOW)).toBe('a-b-c')
  })

  it('falls back to the date for blank, junk, or non-string input', () => {
    expect(slugifyJob('', NOW)).toBe('job-2026-08-14')
    expect(slugifyJob('!!', NOW)).toBe('job-2026-08-14')
    expect(slugifyJob(undefined, NOW)).toBe('job-2026-08-14')
    expect(slugifyJob(42, NOW)).toBe('job-2026-08-14')
  })

  it('caps length at 40 without a trailing hyphen', () => {
    const slug = slugifyJob('a'.repeat(39) + ' bcd', NOW)
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('buildObjectPath', () => {
  it('builds org-scoped capture paths', () => {
    const path = buildObjectPath('org-1', 'maple-st', NOW, 2, 'mov', 'abcd1234')
    expect(path).toBe(`org-1/captures/maple-st/${NOW.getTime()}-2-abcd1234.mov`)
  })
})

describe('quotaExceeded', () => {
  const file = { type: 'image/jpeg', size: 1000, ext: 'jpg' }

  it('allows normal usage', () => {
    expect(quotaExceeded({ fileCount: 0, totalBytes: 0 }, [file])).toBeNull()
  })

  it('blocks past the daily file count', () => {
    expect(quotaExceeded({ fileCount: DAILY_FILE_LIMIT, totalBytes: 0 }, [file])).toBeTruthy()
    expect(quotaExceeded({ fileCount: DAILY_FILE_LIMIT - 1, totalBytes: 0 }, [file])).toBeNull()
  })

  it('blocks past the daily byte total', () => {
    expect(quotaExceeded({ fileCount: 0, totalBytes: DAILY_BYTES_LIMIT }, [file])).toBeTruthy()
    expect(
      quotaExceeded({ fileCount: 0, totalBytes: DAILY_BYTES_LIMIT - file.size }, [file])
    ).toBeNull()
  })
})

describe('cleanFreeText', () => {
  it('trims, collapses whitespace, strips control characters', () => {
    expect(cleanFreeText('  Franklin,\n\tTN  \u0000', MAX_LOCATION_LENGTH)).toBe('Franklin, TN')
  })

  it('keeps hyphens and punctuation intact', () => {
    expect(cleanFreeText('6-ft cedar privacy fence - Spring Hill', MAX_NOTES_LENGTH)).toBe(
      '6-ft cedar privacy fence - Spring Hill'
    )
  })

  it('returns null for non-strings and effectively empty input', () => {
    expect(cleanFreeText(undefined, MAX_NOTES_LENGTH)).toBeNull()
    expect(cleanFreeText(42, MAX_NOTES_LENGTH)).toBeNull()
    expect(cleanFreeText('   \u0001\u0002  ', MAX_NOTES_LENGTH)).toBeNull()
  })

  it('caps length and never ends on a dangling space', () => {
    const long = 'a'.repeat(10) + ' ' + 'b'.repeat(MAX_NOTES_LENGTH)
    const out = cleanFreeText(long, MAX_NOTES_LENGTH)
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH)
    expect(out!.endsWith(' ')).toBe(false)
  })
})
