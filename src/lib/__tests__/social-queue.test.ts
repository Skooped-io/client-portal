import { describe, expect, it } from 'vitest'
import {
  allowedActions,
  buildDraftPosts,
  CAPTION_LIMITS,
  CAROUSEL_MAX,
  countHashtags,
  defaultScheduleAt,
  failureOutcome,
  FB_NATIVE_MAX_MS,
  isDue,
  MAX_ATTEMPTS,
  mediaKind,
  parseScheduledAt,
  PUBLISH_NOW_WINDOW_MS,
  scheduleMode,
  transition,
  validateCaption,
  type MediaItem,
  type PostStatus,
} from '../social/queue'

// 17:00 CDT on Aug 31 2026
const NOW = new Date('2026-08-31T22:00:00Z')
const jpg = (n: number): MediaItem => ({ path: `org/captures/job/${n}.jpg`, content_type: 'image/jpeg' })
const heic = (n: number): MediaItem => ({ path: `org/captures/job/${n}.heic`, content_type: 'image/heic' })
const mov = (n: number): MediaItem => ({ path: `org/captures/job/${n}.mov`, content_type: 'video/quicktime' })

describe('mediaKind', () => {
  it('one image → image, 2–10 images → carousel', () => {
    expect(mediaKind([jpg(1)])).toEqual({ ok: true, value: 'image' })
    expect(mediaKind([jpg(1), heic(2)])).toEqual({ ok: true, value: 'carousel' })
    expect(mediaKind(Array.from({ length: CAROUSEL_MAX }, (_, i) => jpg(i)))).toEqual({ ok: true, value: 'carousel' })
  })
  it('one video → video', () => {
    expect(mediaKind([mov(1)])).toEqual({ ok: true, value: 'video' })
  })
  it('rejects empty, mixed, multi-video, oversize, unknown types', () => {
    expect(mediaKind([]).ok).toBe(false)
    expect(mediaKind([jpg(1), mov(2)]).ok).toBe(false)
    expect(mediaKind([mov(1), mov(2)]).ok).toBe(false)
    expect(mediaKind(Array.from({ length: CAROUSEL_MAX + 1 }, (_, i) => jpg(i))).ok).toBe(false)
    expect(mediaKind([{ path: 'x', content_type: 'application/pdf' }]).ok).toBe(false)
  })
})

describe('defaultScheduleAt', () => {
  it('is 09:00 tomorrow in America/Chicago (CDT = UTC-5)', () => {
    expect(defaultScheduleAt(NOW).toISOString()).toBe('2026-09-01T14:00:00.000Z')
  })
  it('handles the day rolling over in the zone but not UTC', () => {
    // 23:30 CDT Aug 31 = 04:30Z Sep 1 → "tomorrow" in Chicago is Sep 1
    expect(defaultScheduleAt(new Date('2026-09-01T04:30:00Z')).toISOString()).toBe('2026-09-01T14:00:00.000Z')
  })
  it('uses standard time in winter (CST = UTC-6)', () => {
    expect(defaultScheduleAt(new Date('2026-12-10T12:00:00Z')).toISOString()).toBe('2026-12-11T15:00:00.000Z')
  })
})

describe('buildDraftPosts', () => {
  it('creates one draft per platform sharing group_id, defaulting to tomorrow 9am', () => {
    const r = buildDraftPosts([jpg(1), jpg(2)], ['facebook', 'instagram'], NOW, 'g1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(2)
    expect(r.value.map((d) => d.platform)).toEqual(['facebook', 'instagram'])
    for (const d of r.value) {
      expect(d.status).toBe('draft')
      expect(d.post_type).toBe('carousel')
      expect(d.group_id).toBe('g1')
      expect(d.caption).toBeNull()
      expect(d.scheduled_at).toBe('2026-09-01T14:00:00.000Z')
      expect(d.media).toEqual([jpg(1), jpg(2)])
    }
  })
  it('dedupes platforms and rejects unknown ones or none', () => {
    const r = buildDraftPosts([jpg(1)], ['facebook', 'facebook'], NOW, 'g')
    expect(r.ok && r.value.length).toBe(1)
    expect(buildDraftPosts([jpg(1)], ['tiktok'], NOW, 'g').ok).toBe(false)
    expect(buildDraftPosts([jpg(1)], [], NOW, 'g').ok).toBe(false)
    expect(buildDraftPosts([jpg(1)], 'facebook', NOW, 'g').ok).toBe(false)
  })
  it('propagates media errors', () => {
    const r = buildDraftPosts([jpg(1), mov(2)], ['facebook'], NOW, 'g')
    expect(r.ok).toBe(false)
  })
})

describe('validateCaption', () => {
  it('requires a caption at approve time but not for a draft save', () => {
    expect(validateCaption('', 'facebook').ok).toBe(false)
    expect(validateCaption(null, 'facebook').ok).toBe(false)
    expect(validateCaption('   ', 'instagram', { required: false })).toEqual({ ok: true, value: '' })
  })
  it('trims and strips control characters but keeps newlines', () => {
    const r = validateCaption('  Line one\r\nLine two ', 'facebook')
    expect(r).toEqual({ ok: true, value: 'Line one\nLine two' })
  })
  it('enforces per-platform length limits', () => {
    expect(validateCaption('x'.repeat(CAPTION_LIMITS.instagram), 'instagram').ok).toBe(true)
    expect(validateCaption('x'.repeat(CAPTION_LIMITS.instagram + 1), 'instagram').ok).toBe(false)
    expect(validateCaption('x'.repeat(CAPTION_LIMITS.instagram + 1), 'facebook').ok).toBe(true)
    expect(validateCaption('x'.repeat(CAPTION_LIMITS.facebook + 1), 'facebook').ok).toBe(false)
  })
  it('caps Instagram at 30 hashtags, Facebook does not care', () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ')
    expect(validateCaption(tags, 'instagram').ok).toBe(false)
    expect(validateCaption(tags, 'facebook').ok).toBe(true)
    const thirty = Array.from({ length: 30 }, (_, i) => `#tag${i}`).join(' ')
    expect(validateCaption(thirty, 'instagram').ok).toBe(true)
  })
  it('rejects non-strings', () => {
    expect(validateCaption(42, 'facebook').ok).toBe(false)
  })
})

describe('countHashtags', () => {
  it('counts word-start hashtags only', () => {
    expect(countHashtags('#one #two\n#three')).toBe(3)
    expect(countHashtags('email#notatag and #4real')).toBe(1)
    expect(countHashtags('no tags')).toBe(0)
  })
})

describe('parseScheduledAt', () => {
  it('accepts ISO, null, empty; rejects junk', () => {
    expect(parseScheduledAt('2026-09-01T14:00:00.000Z')).toEqual({ ok: true, value: new Date('2026-09-01T14:00:00Z') })
    expect(parseScheduledAt(null)).toEqual({ ok: true, value: null })
    expect(parseScheduledAt('')).toEqual({ ok: true, value: null })
    expect(parseScheduledAt('tomorrow-ish').ok).toBe(false)
    expect(parseScheduledAt(12345).ok).toBe(false)
  })
})

describe('scheduleMode', () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms)
  it('publishes now when unset, in the past, or under 10 minutes out', () => {
    expect(scheduleMode(null, NOW, 'facebook')).toBe('publish-now')
    expect(scheduleMode(at(-1000), NOW, 'instagram')).toBe('publish-now')
    expect(scheduleMode(at(PUBLISH_NOW_WINDOW_MS - 1), NOW, 'facebook')).toBe('publish-now')
    expect(scheduleMode(at(PUBLISH_NOW_WINDOW_MS - 1), NOW, 'instagram')).toBe('publish-now')
  })
  it('uses Meta scheduling for Facebook inside 10 min – 30 days', () => {
    expect(scheduleMode(at(PUBLISH_NOW_WINDOW_MS), NOW, 'facebook')).toBe('fb-native')
    expect(scheduleMode(at(FB_NATIVE_MAX_MS), NOW, 'facebook')).toBe('fb-native')
    expect(scheduleMode(at(FB_NATIVE_MAX_MS + 1), NOW, 'facebook')).toBe('cron')
  })
  it('always uses the cron for a future Instagram post', () => {
    expect(scheduleMode(at(PUBLISH_NOW_WINDOW_MS), NOW, 'instagram')).toBe('cron')
    expect(scheduleMode(at(FB_NATIVE_MAX_MS * 2), NOW, 'instagram')).toBe('cron')
  })
})

describe('isDue', () => {
  it('only approved rows whose time has passed (or was never set)', () => {
    expect(isDue({ status: 'approved', scheduled_at: '2026-08-31T21:59:00Z' }, NOW)).toBe(true)
    expect(isDue({ status: 'approved', scheduled_at: NOW.toISOString() }, NOW)).toBe(true)
    expect(isDue({ status: 'approved', scheduled_at: null }, NOW)).toBe(true)
    expect(isDue({ status: 'approved', scheduled_at: '2026-08-31T22:01:00Z' }, NOW)).toBe(false)
    expect(isDue({ status: 'draft', scheduled_at: '2026-08-31T21:59:00Z' }, NOW)).toBe(false)
    expect(isDue({ status: 'scheduled', scheduled_at: '2026-08-31T21:59:00Z' }, NOW)).toBe(false)
    expect(isDue({ status: 'approved', scheduled_at: 'garbage' }, NOW)).toBe(false)
  })
})

describe('transition (state machine)', () => {
  const from = (status: PostStatus) => ({ status })
  it('draft → approved → scheduled/publishing → published', () => {
    expect(transition(from('draft'), 'approve')).toEqual({ ok: true, value: 'approved' })
    expect(transition(from('approved'), 'fb_scheduled')).toEqual({ ok: true, value: 'scheduled' })
    expect(transition(from('approved'), 'claim')).toEqual({ ok: true, value: 'publishing' })
    expect(transition(from('publishing'), 'published')).toEqual({ ok: true, value: 'published' })
    expect(transition(from('scheduled'), 'published')).toEqual({ ok: true, value: 'published' })
  })
  it('the review gate: nothing reaches publishing without approve', () => {
    expect(transition(from('draft'), 'claim').ok).toBe(false)
    expect(transition(from('draft'), 'published').ok).toBe(false)
    expect(transition(from('draft'), 'fb_scheduled').ok).toBe(false)
  })
  it('unapprove works before it goes live, not after', () => {
    expect(transition(from('approved'), 'unapprove')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('scheduled'), 'unapprove')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('publishing'), 'unapprove').ok).toBe(false)
    expect(transition(from('published'), 'unapprove').ok).toBe(false)
  })
  it('edits only on drafts and failed rows', () => {
    expect(transition(from('draft'), 'update')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('failed'), 'update')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('approved'), 'update').ok).toBe(false)
    expect(transition(from('published'), 'update').ok).toBe(false)
  })
  it('publishing is a dead end for user events; published/cancelled are terminal', () => {
    for (const ev of ['update', 'approve', 'unapprove', 'delete'] as const) {
      expect(transition(from('publishing'), ev).ok).toBe(false)
    }
    for (const ev of ['update', 'approve', 'unapprove', 'delete', 'claim'] as const) {
      expect(transition(from('published'), ev).ok).toBe(false)
      expect(transition(from('cancelled'), ev).ok).toBe(false)
    }
  })
  it('delete cancels anything not yet live', () => {
    for (const s of ['draft', 'failed', 'approved', 'scheduled'] as const) {
      expect(transition(from(s), 'delete')).toEqual({ ok: true, value: 'cancelled' })
    }
  })
  it('explains refusals in plain words', () => {
    const r = transition(from('published'), 'delete')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Cannot delete a post that is published')
  })
})

describe('failureOutcome', () => {
  it('retries transient failures until MAX_ATTEMPTS, then parks in failed', () => {
    expect(failureOutcome({ status: 'publishing', attempts: 1 }, true)).toEqual({ ok: true, value: 'approved' })
    expect(failureOutcome({ status: 'publishing', attempts: MAX_ATTEMPTS - 1 }, true)).toEqual({ ok: true, value: 'approved' })
    expect(failureOutcome({ status: 'publishing', attempts: MAX_ATTEMPTS }, true)).toEqual({ ok: true, value: 'failed' })
  })
  it('never retries a permanent failure', () => {
    expect(failureOutcome({ status: 'publishing', attempts: 0 }, false)).toEqual({ ok: true, value: 'failed' })
  })
})

describe('allowedActions', () => {
  it('matches the buttons the page shows', () => {
    expect(allowedActions({ status: 'draft' })).toEqual({ edit: true, approve: true, unapprove: false, delete: true })
    expect(allowedActions({ status: 'approved' })).toEqual({ edit: false, approve: false, unapprove: true, delete: true })
    expect(allowedActions({ status: 'scheduled' })).toEqual({ edit: false, approve: false, unapprove: true, delete: true })
    expect(allowedActions({ status: 'failed' })).toEqual({ edit: true, approve: true, unapprove: false, delete: true })
    expect(allowedActions({ status: 'published' })).toEqual({ edit: false, approve: false, unapprove: false, delete: false })
  })
})
