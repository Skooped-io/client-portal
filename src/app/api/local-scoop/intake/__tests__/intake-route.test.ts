import { describe, it, expect, afterEach } from 'vitest'

import { sanitize, corsHeaders, allowedOrigins, buildIntakeEmail } from '../route'

afterEach(() => {
  delete process.env.INTAKE_ALLOWED_ORIGINS
})

describe('sanitize', () => {
  it('trims and drops empty or non-string values', () => {
    expect(sanitize({ a: '  hi  ', b: '   ', c: 42, d: null })).toEqual({ a: 'hi' })
  })
  it('caps a paste bomb instead of forwarding it', () => {
    const out = sanitize({ notes: 'x'.repeat(5000) })
    expect(out.notes.length).toBe(2000)
  })
  it('never throws on hostile input', () => {
    expect(sanitize(null)).toEqual({})
    expect(sanitize('a string')).toEqual({})
    expect(sanitize([1, 2, 3])).toEqual({})
  })
})

describe('allowedOrigins / corsHeaders', () => {
  it('defaults to the marketing site', () => {
    expect(allowedOrigins()).toContain('https://skooped.io')
  })
  it('echoes an allowed origin back', () => {
    expect(corsHeaders('https://skooped.io')['Access-Control-Allow-Origin']).toBe('https://skooped.io')
  })
  it('never echoes an origin that is not on the list', () => {
    expect(corsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBe('https://skooped.io')
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBe('https://skooped.io')
  })
  it('honours an env override', () => {
    process.env.INTAKE_ALLOWED_ORIGINS = 'https://staging.skooped.io'
    expect(corsHeaders('https://staging.skooped.io')['Access-Control-Allow-Origin']).toBe(
      'https://staging.skooped.io'
    )
  })
  it('varies on Origin so a CDN cannot cache one client a wrong header', () => {
    expect(corsHeaders('https://skooped.io').Vary).toBe('Origin')
  })
})

describe('buildIntakeEmail', () => {
  it('titles on the business, falling back to the contact name', () => {
    expect(buildIntakeEmail({ contact_name: 'Mike' }).subject).toBe('Local Scoop intake: Mike')
    expect(buildIntakeEmail({ business_name: "Mike's Roofing", contact_name: 'Mike' }).subject).toBe(
      "Local Scoop intake: Mike's Roofing"
    )
  })
  it('renders only the fields that were answered', () => {
    const html = buildIntakeEmail({ contact_name: 'Mike', towns: 'Franklin' }).html
    expect(html).toContain('Franklin')
    expect(html).not.toContain('Never say')
  })
  it('escapes hostile answers', () => {
    const html = buildIntakeEmail({ notes: '<img src=x onerror=alert(1)>' }).html
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
  it('carries the call-only warning so the number never gets texted', () => {
    expect(buildIntakeEmail({ phone: '6155550123' }).html).toContain('CALL ONLY')
  })
})
