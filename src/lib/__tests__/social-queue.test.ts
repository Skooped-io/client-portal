import { describe, expect, it } from 'vitest'
import {
  allowedActions,
  buildDraftPosts,
  CAPTION_LIMITS,
  CAROUSEL_MAX,
  countHashtags,
  countMentions,
  CTA_URL_MAX,
  defaultScheduleAt,
  FB_NATIVE_MAX_MS,
  FB_NATIVE_MIN_MS,
  GOOGLE_NO_VIDEO_MESSAGE,
  GOOGLE_OUT_OF_WINDOW_MESSAGE,
  mediaKind,
  OUT_OF_WINDOW_MESSAGE,
  outOfWindowMessage,
  parseScheduledAt,
  PUBLISH_PLATFORMS,
  scheduleMode,
  transition,
  validateCaption,
  validateCta,
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
  it('google: any image selection is a single-photo image post', () => {
    expect(mediaKind([jpg(1)], 'google')).toEqual({ ok: true, value: 'image' })
    expect(mediaKind([jpg(1), heic(2), jpg(3)], 'google')).toEqual({ ok: true, value: 'image' })
    // Even more than a carousel's worth: only the first image is ever sent.
    expect(mediaKind(Array.from({ length: CAROUSEL_MAX + 1 }, (_, i) => jpg(i)), 'google')).toEqual({ ok: true, value: 'image' })
  })
  it('google: video (alone or mixed) is refused with the one-photo message', () => {
    const alone = mediaKind([mov(1)], 'google')
    expect(alone.ok).toBe(false)
    if (!alone.ok) expect(alone.error).toBe(GOOGLE_NO_VIDEO_MESSAGE)
    expect(mediaKind([jpg(1), mov(2)], 'google').ok).toBe(false)
    expect(mediaKind([{ path: 'x', content_type: 'application/pdf' }], 'google').ok).toBe(false)
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
  it('the publisher takes Facebook and Google', () => {
    expect(PUBLISH_PLATFORMS).toEqual(['facebook', 'google'])
  })
  it('creates one Facebook draft defaulting to tomorrow 9am', () => {
    const r = buildDraftPosts([jpg(1), jpg(2)], ['facebook'], NOW, 'g1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(1)
    const d = r.value[0]
    expect(d.platform).toBe('facebook')
    expect(d.status).toBe('draft')
    expect(d.post_type).toBe('carousel')
    expect(d.group_id).toBe('g1')
    expect(d.caption).toBeNull()
    expect(d.scheduled_at).toBe('2026-09-01T14:00:00.000Z')
    expect(d.media).toEqual([jpg(1), jpg(2)])
    expect(d.cta_type).toBeNull()
    expect(d.cta_url).toBeNull()
  })
  it('facebook + google share the group id; google keeps only the first image and seeds Learn more', () => {
    const r = buildDraftPosts([jpg(1), jpg(2), jpg(3)], ['facebook', 'google'], NOW, 'g2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(2)
    const [fb, goog] = r.value
    expect(fb.platform).toBe('facebook')
    expect(fb.post_type).toBe('carousel')
    expect(fb.media).toHaveLength(3)
    expect(goog.platform).toBe('google')
    expect(goog.post_type).toBe('image')
    expect(goog.media).toEqual([jpg(1)])
    expect(goog.cta_type).toBe('LEARN_MORE')
    expect(goog.cta_url).toBeNull()
    expect(goog.group_id).toBe('g2')
    expect(goog.scheduled_at).toBe(fb.scheduled_at)
  })
  it('google alone works too', () => {
    const r = buildDraftPosts([jpg(1)], ['google'], NOW, 'g3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(1)
    expect(r.value[0].platform).toBe('google')
  })
  it('a video queued for google (alone or with facebook) is refused with the one-photo message', () => {
    const alone = buildDraftPosts([mov(1)], ['google'], NOW, 'g')
    expect(alone.ok).toBe(false)
    if (!alone.ok) expect(alone.error).toBe(GOOGLE_NO_VIDEO_MESSAGE)
    const both = buildDraftPosts([mov(1)], ['facebook', 'google'], NOW, 'g')
    expect(both.ok).toBe(false)
    if (!both.ok) expect(both.error).toBe(GOOGLE_NO_VIDEO_MESSAGE)
    // Facebook alone still takes the video.
    expect(buildDraftPosts([mov(1)], ['facebook'], NOW, 'g').ok).toBe(true)
  })
  it('dedupes platforms, refuses instagram (alone or with facebook), unknown, none', () => {
    const r = buildDraftPosts([jpg(1)], ['facebook', 'facebook'], NOW, 'g')
    expect(r.ok && r.value.length).toBe(1)
    const ig = buildDraftPosts([jpg(1)], ['instagram'], NOW, 'g')
    expect(ig.ok).toBe(false)
    if (!ig.ok) expect(ig.error).toMatch(/Only Facebook and Google Business/)
    expect(buildDraftPosts([jpg(1)], ['facebook', 'instagram'], NOW, 'g').ok).toBe(false)
    expect(buildDraftPosts([jpg(1)], ['tiktok'], NOW, 'g').ok).toBe(false)
    expect(buildDraftPosts([jpg(1)], [], NOW, 'g').ok).toBe(false)
    expect(buildDraftPosts([jpg(1)], 'facebook', NOW, 'g').ok).toBe(false)
  })
  it('propagates media errors', () => {
    const r = buildDraftPosts([jpg(1), mov(2)], ['facebook'], NOW, 'g')
    expect(r.ok).toBe(false)
  })
})

describe('validateCta (google button rules)', () => {
  it('no button is fine; CALL keeps no URL', () => {
    expect(validateCta(null, null)).toEqual({ ok: true, value: { cta_type: null, cta_url: null } })
    expect(validateCta('', 'https://x.com')).toEqual({ ok: true, value: { cta_type: null, cta_url: null } })
    expect(validateCta('CALL', 'https://x.com')).toEqual({ ok: true, value: { cta_type: 'CALL', cta_url: null } })
  })
  it('every other button needs an https URL at approve time', () => {
    expect(validateCta('LEARN_MORE', 'https://gunnsfencing.com/')).toEqual({
      ok: true,
      value: { cta_type: 'LEARN_MORE', cta_url: 'https://gunnsfencing.com/' },
    })
    for (const t of ['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP']) {
      const missing = validateCta(t, null)
      expect(missing.ok).toBe(false)
      if (!missing.ok) expect(missing.error).toMatch(/needs a link/)
    }
    expect(validateCta('BOOK', 'http://insecure.com').ok).toBe(false)
    expect(validateCta('BOOK', 'not a url').ok).toBe(false)
    expect(validateCta('BOOK', `https://x.com/${'a'.repeat(CTA_URL_MAX)}`).ok).toBe(false)
  })
  it('a draft save may leave the URL empty, but never a malformed one', () => {
    expect(validateCta('LEARN_MORE', null, { required: false })).toEqual({
      ok: true,
      value: { cta_type: 'LEARN_MORE', cta_url: null },
    })
    expect(validateCta('LEARN_MORE', 'ftp://x', { required: false }).ok).toBe(false)
  })
  it('rejects unknown button types', () => {
    expect(validateCta('BUY_NOW', 'https://x.com').ok).toBe(false)
    expect(validateCta(42, 'https://x.com').ok).toBe(false)
  })
})

describe('validateCaption', () => {
  it('requires a caption at approve time but not for a draft save', () => {
    expect(validateCaption('', 'facebook').ok).toBe(false)
    expect(validateCaption(null, 'facebook').ok).toBe(false)
    expect(validateCaption('   ', 'instagram', { required: false })).toEqual({ ok: true, value: '' })
  })
  it('trims and strips control characters but keeps newlines', () => {
    const r = validateCaption('  Line one\r\nLine two ', 'facebook')
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
  it('caps Instagram at 20 @mentions, Facebook does not care', () => {
    const tags = Array.from({ length: 21 }, (_, i) => `@crew${i}`).join(' ')
    expect(validateCaption(tags, 'instagram').ok).toBe(false)
    expect(validateCaption(tags, 'facebook').ok).toBe(true)
    const twenty = Array.from({ length: 20 }, (_, i) => `@crew${i}`).join(' ')
    expect(validateCaption(twenty, 'instagram').ok).toBe(true)
  })
  it('rejects non-strings', () => {
    expect(validateCaption(42, 'facebook').ok).toBe(false)
  })
})

describe('countMentions', () => {
  it('counts word-start mentions only', () => {
    expect(countMentions('@gunns_fencing_co and @franklin.tn')).toBe(2)
    expect(countMentions('mail me@example.com')).toBe(0)
    expect(countMentions('none')).toBe(0)
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
  it('accepts ISO with an offset, null, empty; rejects junk', () => {
    expect(parseScheduledAt('2026-09-01T14:00:00.000Z')).toEqual({ ok: true, value: new Date('2026-09-01T14:00:00Z') })
    expect(parseScheduledAt('2026-09-01T09:00:00-05:00')).toEqual({ ok: true, value: new Date('2026-09-01T14:00:00Z') })
    expect(parseScheduledAt(null)).toEqual({ ok: true, value: null })
    expect(parseScheduledAt('')).toEqual({ ok: true, value: null })
    expect(parseScheduledAt('tomorrow-ish').ok).toBe(false)
    expect(parseScheduledAt(12345).ok).toBe(false)
  })
  it('refuses an offset-less datetime (would silently shift by the server zone)', () => {
    const r = parseScheduledAt('2026-09-02T09:00')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/timezone offset/)
    expect(parseScheduledAt('2026-09-02T09:00:00').ok).toBe(false)
  })
})

describe('scheduleMode (schedule-only rule)', () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms)
  it('no time, past, or under 20 minutes out is out of window — never publish-now', () => {
    expect(scheduleMode(null, NOW)).toBe('out-of-window')
    expect(scheduleMode(at(-1000), NOW)).toBe('out-of-window')
    expect(scheduleMode(at(0), NOW)).toBe('out-of-window')
    expect(scheduleMode(at(5 * 60 * 1000), NOW)).toBe('out-of-window')
    expect(scheduleMode(at(FB_NATIVE_MIN_MS - 1), NOW)).toBe('out-of-window')
  })
  it('20 minutes – 29 days out is handed to Meta as a scheduled post', () => {
    expect(scheduleMode(at(FB_NATIVE_MIN_MS), NOW)).toBe('fb-native')
    expect(scheduleMode(at(2 * 3600 * 1000), NOW)).toBe('fb-native')
    expect(scheduleMode(at(FB_NATIVE_MAX_MS), NOW)).toBe('fb-native')
    expect(FB_NATIVE_MAX_MS).toBeLessThan(30 * 24 * 60 * 60 * 1000)
  })
  it('beyond 29 days is out of window — there is no cron fallback', () => {
    expect(scheduleMode(at(FB_NATIVE_MAX_MS + 1), NOW)).toBe('out-of-window')
    expect(scheduleMode(at(60 * 24 * 3600 * 1000), NOW)).toBe('out-of-window')
  })
  it('the user-facing refusal names the window and the reason', () => {
    expect(OUT_OF_WINDOW_MESSAGE).toBe(
      'Pick a time between 20 minutes and 29 days from now — posts are always scheduled for your review in Business Suite, never posted immediately'
    )
  })
  it('google shares the window; its refusal names Business Profile Manager', () => {
    expect(outOfWindowMessage('facebook')).toBe(OUT_OF_WINDOW_MESSAGE)
    expect(outOfWindowMessage('google')).toBe(GOOGLE_OUT_OF_WINDOW_MESSAGE)
    expect(GOOGLE_OUT_OF_WINDOW_MESSAGE).toMatch(/20 minutes and 29 days/)
    expect(GOOGLE_OUT_OF_WINDOW_MESSAGE).toMatch(/Business Profile Manager/)
  })
})

describe('transition (state machine)', () => {
  const from = (status: PostStatus) => ({ status })
  it('draft → (claim) publishing → scheduled → published', () => {
    expect(transition(from('draft'), 'approve').ok).toBe(true)
    // The approve route claims into 'publishing' before the Meta scheduling call.
    expect(transition(from('publishing'), 'fb_scheduled')).toEqual({ ok: true, value: 'scheduled' })
    expect(transition(from('scheduled'), 'published')).toEqual({ ok: true, value: 'published' })
  })
  it('the review gate: nothing is scheduled or published without approve', () => {
    expect(transition(from('draft'), 'fb_scheduled').ok).toBe(false)
    expect(transition(from('draft'), 'published').ok).toBe(false)
    // Only a Meta-held post can become published; nothing publishes from 'publishing'.
    expect(transition(from('publishing'), 'published').ok).toBe(false)
    expect(transition(from('approved'), 'published').ok).toBe(false)
  })
  it('unapprove works while Meta holds it (and on a legacy approved row), not after', () => {
    expect(transition(from('scheduled'), 'unapprove')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('approved'), 'unapprove')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('publishing'), 'unapprove').ok).toBe(false)
    expect(transition(from('published'), 'unapprove').ok).toBe(false)
  })
  it('edits only on drafts and failed rows', () => {
    expect(transition(from('draft'), 'update')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('failed'), 'update')).toEqual({ ok: true, value: 'draft' })
    expect(transition(from('approved'), 'update').ok).toBe(false)
    expect(transition(from('scheduled'), 'update').ok).toBe(false)
    expect(transition(from('published'), 'update').ok).toBe(false)
  })
  it('publishing is a dead end for user events; published/cancelled are terminal', () => {
    for (const ev of ['update', 'approve', 'unapprove', 'delete'] as const) {
      expect(transition(from('publishing'), ev).ok).toBe(false)
    }
    for (const ev of ['update', 'approve', 'unapprove', 'delete', 'fb_scheduled'] as const) {
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

describe('allowedActions', () => {
  it('matches the buttons the page shows for Facebook rows', () => {
    const fb = (status: PostStatus) => ({ status, platform: 'facebook' as const })
    expect(allowedActions(fb('draft'))).toEqual({ edit: true, approve: true, unapprove: false, delete: true })
    expect(allowedActions(fb('approved'))).toEqual({ edit: false, approve: false, unapprove: true, delete: true })
    expect(allowedActions(fb('scheduled'))).toEqual({ edit: false, approve: false, unapprove: true, delete: true })
    expect(allowedActions(fb('failed'))).toEqual({ edit: true, approve: true, unapprove: false, delete: true })
    expect(allowedActions(fb('publishing'))).toEqual({ edit: false, approve: false, unapprove: false, delete: false })
    expect(allowedActions(fb('published'))).toEqual({ edit: false, approve: false, unapprove: false, delete: false })
  })
  it('google rows get the same buttons as Facebook rows', () => {
    const goog = (status: PostStatus) => ({ status, platform: 'google' as const })
    expect(allowedActions(goog('draft'))).toEqual({ edit: true, approve: true, unapprove: false, delete: true })
    expect(allowedActions(goog('scheduled'))).toEqual({ edit: false, approve: false, unapprove: true, delete: true })
    expect(allowedActions(goog('failed'))).toEqual({ edit: true, approve: true, unapprove: false, delete: true })
    expect(allowedActions(goog('published'))).toEqual({ edit: false, approve: false, unapprove: false, delete: false })
  })
  it('legacy Instagram rows are read-only apart from Delete', () => {
    const ig = (status: PostStatus) => ({ status, platform: 'instagram' as const })
    expect(allowedActions(ig('draft'))).toEqual({ edit: false, approve: false, unapprove: false, delete: true })
    expect(allowedActions(ig('approved'))).toEqual({ edit: false, approve: false, unapprove: false, delete: true })
    expect(allowedActions(ig('failed'))).toEqual({ edit: false, approve: false, unapprove: false, delete: true })
    expect(allowedActions(ig('published'))).toEqual({ edit: false, approve: false, unapprove: false, delete: false })
  })
})
