import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyAdminSecret, verifyCronSecret } from '../cron-secret'

function req(auth?: string) {
  return new NextRequest('http://localhost/x', { headers: auth ? { authorization: auth } : {} })
}

const VARS = ['CRON_SECRET', 'SOCIAL_CRON_SECRET', 'ADMIN_API_SECRET'] as const
const saved: Record<string, string | undefined> = {}

describe('shared-secret auth', () => {
  beforeEach(() => {
    for (const v of VARS) {
      saved[v] = process.env[v]
      delete process.env[v]
    }
  })
  afterEach(() => {
    for (const v of VARS) {
      if (saved[v] === undefined) delete process.env[v]
      else process.env[v] = saved[v]
    }
  })

  it('cron: accepts CRON_SECRET or SOCIAL_CRON_SECRET, refuses anything else', () => {
    process.env.CRON_SECRET = 'daily'
    process.env.SOCIAL_CRON_SECRET = 'tick'
    expect(verifyCronSecret(req('Bearer daily'))).toBe(true)
    expect(verifyCronSecret(req('bearer tick'))).toBe(true)
    expect(verifyCronSecret(req('Bearer dail'))).toBe(false)
    expect(verifyCronSecret(req('Bearer daily2'))).toBe(false)
    expect(verifyCronSecret(req('Bearer '))).toBe(false)
    expect(verifyCronSecret(req())).toBe(false)
  })

  it('admin: accepts ONLY ADMIN_API_SECRET — the cron secrets (one is a GitHub Actions secret) cannot write tokens', () => {
    process.env.CRON_SECRET = 'daily'
    process.env.SOCIAL_CRON_SECRET = 'tick'
    process.env.ADMIN_API_SECRET = 'admin'
    expect(verifyAdminSecret(req('Bearer admin'))).toBe(true)
    expect(verifyAdminSecret(req('Bearer daily'))).toBe(false)
    expect(verifyAdminSecret(req('Bearer tick'))).toBe(false)
    // and the admin secret does not open the cron
    expect(verifyCronSecret(req('Bearer admin'))).toBe(false)
  })

  it('with no secret configured a route is open only in development', () => {
    const env = process.env.NODE_ENV
    try {
      Object.assign(process.env, { NODE_ENV: 'production' })
      expect(verifyCronSecret(req('Bearer anything'))).toBe(false)
      expect(verifyAdminSecret(req('Bearer anything'))).toBe(false)
      Object.assign(process.env, { NODE_ENV: 'development' })
      expect(verifyCronSecret(req())).toBe(true)
      expect(verifyAdminSecret(req())).toBe(true)
    } finally {
      Object.assign(process.env, { NODE_ENV: env })
    }
  })

  it('an unset admin secret does not fall back to the cron secret in production', () => {
    const env = process.env.NODE_ENV
    try {
      Object.assign(process.env, { NODE_ENV: 'production' })
      process.env.SOCIAL_CRON_SECRET = 'tick'
      expect(verifyAdminSecret(req('Bearer tick'))).toBe(false)
    } finally {
      Object.assign(process.env, { NODE_ENV: env })
    }
  })
})
