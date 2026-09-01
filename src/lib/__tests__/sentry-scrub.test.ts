import { describe, expect, it } from 'vitest'
import { isSecretBearingRequest, scrubData, scrubUrl } from '../sentry-scrub'

const PAGE_TOKEN = 'EAAlong-lived-page-token-0123456789'

describe('sentry scrubbers', () => {
  it('masks input_token, access_token and appsecret_proof in a URL, keeping the rest', () => {
    const url = `https://graph.facebook.com/v26.0/debug_token?input_token=${PAGE_TOKEN}&access_token=app%7Csecret&appsecret_proof=abc&fields=id`
    const out = scrubUrl(url) as string
    expect(out).not.toContain(PAGE_TOKEN)
    expect(out).not.toContain('app%7Csecret')
    expect(out).not.toContain('=abc')
    expect(out).toBe('https://graph.facebook.com/v26.0/debug_token?input_token=***&access_token=***&appsecret_proof=***&fields=id')
    expect(scrubUrl(42)).toBe(42)
  })

  it('scrubs the OpenTelemetry url.full / url.query keys on a span, not only http.url', () => {
    const data: Record<string, unknown> = {
      'url.full': `https://graph.facebook.com/v26.0/debug_token?input_token=${PAGE_TOKEN}`,
      'url.query': `input_token=${PAGE_TOKEN}`,
      'http.url': `https://x/?access_token=${PAGE_TOKEN}`,
      'http.target': `/debug_token?input_token=${PAGE_TOKEN}`,
      'http.method': 'GET',
    }
    scrubData(data)
    expect(JSON.stringify(data)).not.toContain(PAGE_TOKEN)
    expect(data['url.query']).toBe('input_token=***')
    expect(data['http.method']).toBe('GET')
    expect(() => scrubData(undefined)).not.toThrow()
  })

  it('drops the span for /debug_token entirely', () => {
    expect(isSecretBearingRequest('https://graph.facebook.com/v26.0/debug_token?input_token=x')).toBe(true)
    expect(isSecretBearingRequest('https://graph.facebook.com/v26.0/123_456')).toBe(false)
  })
})
