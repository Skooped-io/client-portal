import { describe, it, expect } from 'vitest'
import {
  DEVICE_PREFIX,
  LEAD_PREFIX,
  aggregateLeads,
  aggregateReviewActivity,
  isReservedSource,
  splitTrafficEntries,
  type ReviewRow,
} from '../aggregate'

describe('splitTrafficEntries', () => {
  it('separates real sources, devices and lead counts', () => {
    const { sources, devices, leads } = splitTrafficEntries([
      { source: 'google.com', sessions: 8 },
      { source: `${DEVICE_PREFIX}mobile`, sessions: 12 },
      { source: `${DEVICE_PREFIX}desktop`, sessions: 5 },
      { source: `${LEAD_PREFIX}form`, sessions: 8 },
      { source: `${LEAD_PREFIX}call`, sessions: 10 },
    ])

    expect(sources).toEqual([{ source: 'google.com', sessions: 8 }])
    expect(devices.get('mobile')).toBe(12)
    expect(devices.get('desktop')).toBe(5)
    expect(leads.get('form')).toBe(8)
    expect(leads.get('call')).toBe(10)
  })

  it('sums repeated keys rather than overwriting them', () => {
    const { devices, leads } = splitTrafficEntries([
      { source: `${DEVICE_PREFIX}mobile`, sessions: 3 },
      { source: `${DEVICE_PREFIX}mobile`, sessions: 4 },
      { source: `${LEAD_PREFIX}form`, sessions: 1 },
      { source: `${LEAD_PREFIX}form`, sessions: 2 },
    ])
    expect(devices.get('mobile')).toBe(7)
    expect(leads.get('form')).toBe(3)
  })

  it('drops malformed entries instead of throwing', () => {
    const { sources, devices, leads } = splitTrafficEntries([
      null,
      'nope',
      { source: 'google.com' },
      { sessions: 4 },
      { source: 'bing.com', sessions: Number.NaN },
      { source: DEVICE_PREFIX, sessions: 2 },
      { source: LEAD_PREFIX, sessions: 2 },
      { source: 'yelp.com', sessions: 2 },
    ])
    expect(sources).toEqual([{ source: 'yelp.com', sessions: 2 }])
    expect(devices.size).toBe(0)
    expect(leads.size).toBe(0)
  })

  it('returns empty results for non-array input', () => {
    const { sources, devices, leads } = splitTrafficEntries(undefined)
    expect(sources).toEqual([])
    expect(devices.size).toBe(0)
    expect(leads.size).toBe(0)
  })
})

describe('isReservedSource', () => {
  it('flags device and lead rows, not real referrers', () => {
    expect(isReservedSource(`${DEVICE_PREFIX}mobile`)).toBe(true)
    expect(isReservedSource(`${LEAD_PREFIX}form`)).toBe(true)
    expect(isReservedSource('google.com')).toBe(false)
  })
})

describe('aggregateReviewActivity', () => {
  const rows: ReviewRow[] = [
    // Lifetime reviews, two of them created inside the period.
    { star_rating: 5, review_create_time: '2026-07-30T12:00:00Z', posted_at: '2026-08-03T23:35:00Z', state: 'posted' },
    { star_rating: 5, review_create_time: '2026-08-01T09:00:00Z', posted_at: '2026-08-04T00:00:00Z', state: 'posted' },
    { star_rating: 4, review_create_time: '2026-06-10T09:00:00Z', posted_at: null, state: 'locked' },
    { star_rating: null, review_create_time: '2026-05-01T09:00:00Z', posted_at: null, state: 'retro_queued' },
  ]

  it('counts new reviews and replies inside the period only', () => {
    const out = aggregateReviewActivity(rows, '2026-08-01', '2026-08-31')
    expect(out.metrics.new_reviews).toBe(1)
    expect(out.metrics.review_replies).toBe(2)
    expect(out.metrics.reviews_total).toBe(4)
  })

  it('averages only real star ratings and rounds to one decimal', () => {
    const out = aggregateReviewActivity(rows, '2026-08-01', '2026-08-31')
    // (5 + 5 + 4) / 3 = 4.666...
    expect(out.metrics.reviews_avg_rating).toBe(4.7)
  })

  it('never counts a drafted or held reply as posted', () => {
    const out = aggregateReviewActivity(
      [{ star_rating: 5, review_create_time: '2026-08-02T00:00:00Z', posted_at: '2026-08-05T00:00:00Z', state: 'drafted' }],
      '2026-08-01',
      '2026-08-31'
    )
    expect(out.metrics.review_replies).toBeUndefined()
    expect(out.metrics.new_reviews).toBe(1)
  })

  it('writes plain-English highlights with correct pluralisation', () => {
    const out = aggregateReviewActivity(rows, '2026-08-01', '2026-08-31')
    expect(out.highlights).toContain('1 new Google review')
    expect(out.highlights).toContain('Replied to 2 Google reviews on your profile')
    expect(out.summaryLines[0]).toContain('4.7 stars across 4 reviews')
  })

  it('returns nothing for a location with no rows', () => {
    const out = aggregateReviewActivity([], '2026-08-01', '2026-08-31')
    expect(out.metrics).toEqual({})
    expect(out.highlights).toEqual([])
    expect(out.summaryLines).toEqual([])
  })

  it('ignores unusable timestamps', () => {
    const out = aggregateReviewActivity(
      [{ star_rating: 5, review_create_time: 'not-a-date', posted_at: '', state: 'posted' }],
      '2026-08-01',
      '2026-08-31'
    )
    expect(out.metrics.new_reviews).toBeUndefined()
    expect(out.metrics.review_replies).toBeUndefined()
    expect(out.metrics.reviews_total).toBe(1)
  })
})

describe('aggregateLeads', () => {
  it('totals the kinds and keeps the breakdown', () => {
    const out = aggregateLeads(new Map([['form', 8], ['call', 10], ['ad', 2]]))
    expect(out.metrics.leads).toBe(20)
    expect(out.metrics.leads_form).toBe(8)
    expect(out.metrics.leads_call).toBe(10)
    expect(out.metrics.leads_ad).toBe(2)
    expect(out.highlights).toEqual(['20 new leads this month'])
    expect(out.summaryLines[0]).toBe(
      '20 new leads (8 through your website form, 10 by phone or message from Google, 2 from ads)'
    )
  })

  it('omits zero kinds from the breakdown', () => {
    const out = aggregateLeads(new Map([['form', 1]]))
    expect(out.metrics).toEqual({ leads: 1, leads_form: 1 })
    expect(out.highlights).toEqual(['1 new lead this month'])
  })

  it('produces nothing when there are no leads', () => {
    const out = aggregateLeads(new Map([['form', 0]]))
    expect(out.metrics).toEqual({})
    expect(out.highlights).toEqual([])
    expect(out.summaryLines).toEqual([])
  })
})
