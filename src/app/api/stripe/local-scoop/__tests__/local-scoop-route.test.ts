import { describe, it, expect } from 'vitest'
import type Stripe from 'stripe'

process.env.STRIPE_WEBHOOK_SECRET_LOCAL_SCOOP = 'whsec_test'

import {
  csvEnv,
  parseCustomFields,
  firstName,
  isHostedByUs,
  buildWelcomeEmail,
  buildInternalAlert,
} from '../route'

describe('csvEnv', () => {
  it('splits, trims, and lowercases', () => {
    expect(csvEnv(' A.com , B.COM ')).toEqual(['a.com', 'b.com'])
  })
  it('falls back when unset or blank', () => {
    expect(csvEnv(undefined, ['x'])).toEqual(['x'])
    expect(csvEnv('  ,  ', ['x'])).toEqual(['x'])
  })
})

describe('parseCustomFields', () => {
  it('flattens the Payment Link answers to a lookup', () => {
    const fields = [
      { key: 'gbp_business_name', type: 'text', text: { value: "Mike's Roofing" } },
      { key: 'business_website', type: 'text', text: { value: 'mikesroofing.com' } },
    ] as unknown as Stripe.Checkout.Session.CustomField[]
    expect(parseCustomFields(fields)).toEqual({
      gbp_business_name: "Mike's Roofing",
      business_website: 'mikesroofing.com',
    })
  })
  it('survives a session with no custom fields', () => {
    expect(parseCustomFields(null)).toEqual({})
  })
})

describe('firstName', () => {
  it('takes the first token', () => {
    expect(firstName('Mike Ruiz')).toBe('Mike')
  })
  it('never produces an empty greeting', () => {
    expect(firstName(null)).toBe('there')
    expect(firstName('   ')).toBe('there')
  })
})

describe('isHostedByUs', () => {
  const hosted = ['gunnsfencing.com', 'rioslandscaping.com']
  it('matches bare, www, and full URLs', () => {
    expect(isHostedByUs('gunnsfencing.com', hosted)).toBe(true)
    expect(isHostedByUs('https://www.gunnsfencing.com/contact', hosted)).toBe(true)
    expect(isHostedByUs('WWW.GunnsFencing.com', hosted)).toBe(true)
  })
  it('matches a subdomain but not a lookalike domain', () => {
    expect(isHostedByUs('shop.gunnsfencing.com', hosted)).toBe(true)
    expect(isHostedByUs('notgunnsfencing.com', hosted)).toBe(false)
  })
  it('is inert with no list or no website', () => {
    expect(isHostedByUs('gunnsfencing.com', [])).toBe(false)
    expect(isHostedByUs('', hosted)).toBe(false)
    expect(isHostedByUs(undefined, hosted)).toBe(false)
  })
})

describe('buildWelcomeEmail', () => {
  const mail = buildWelcomeEmail({ firstName: 'Mike', businessName: "Mike's Roofing" })
  it('asks for manager access with the real address', () => {
    expect(mail.html).toContain('joseph@skooped.io')
    expect(mail.html).toContain('People and access')
  })
  it('escapes the business name', () => {
    expect(buildWelcomeEmail({ firstName: 'A', businessName: '<script>x</script>' }).html).not.toContain('<script>')
  })
  it('carries the real signature and no em dash', () => {
    expect(mail.html).toContain('615-315-1541')
    expect(mail.html).not.toMatch(/[—–]/)
    expect(mail.subject).not.toMatch(/[—–]/)
  })
})

describe('buildInternalAlert', () => {
  const base = {
    businessName: "Mike's Roofing",
    email: 'mike@example.com',
    phone: '+16155550123',
    website: 'mikesroofing.com',
    cadence: 'monthly',
    amount: '$100.00',
    adSource: 'src-facebook_d-20260812',
    hostingFenceHit: false,
  }
  it('stays quiet when the fence is clear', () => {
    const alert = buildInternalAlert(base)
    expect(alert.subject).toBe("New Local Scoop sale: Mike's Roofing")
    expect(alert.html).not.toContain('HOSTING FENCE HIT')
  })
  it('shouts when we already host the domain', () => {
    const alert = buildInternalAlert({ ...base, hostingFenceHit: true })
    expect(alert.subject).toContain('URGENT hosting fence')
    expect(alert.html).toContain('Double Scoop')
  })
  it('carries the held email body when autosend is off', () => {
    const alert = buildInternalAlert({ ...base, heldEmailHtml: '<p>held body</p>' })
    expect(alert.html).toContain('AUTOSEND IS OFF')
    expect(alert.html).toContain('held body')
  })
})
