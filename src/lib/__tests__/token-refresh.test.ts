import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildRefreshErrorUpdate, MAX_REFRESH_ERRORS } from '../oauth/token-refresh'
import type { OauthConnection } from '../types'

// Minimal mock connection factory
function makeConnection(overrides: Partial<OauthConnection> = {}): OauthConnection {
  return {
    id: 'test-id',
    org_id: 'org-1',
    provider: 'google',
    provider_account_id: null,
    provider_email: 'test@example.com',
    access_token: 'encrypted-token',
    refresh_token: 'encrypted-refresh',
    token_type: 'Bearer',
    scope: null,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    last_refreshed_at: null,
    refresh_error: null,
    refresh_error_count: 0,
    status: 'active',
    connected_services: [],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildRefreshErrorUpdate', () => {
  it('increments error count on first failure', () => {
    const connection = makeConnection({ refresh_error_count: 0 })
    const result = buildRefreshErrorUpdate(connection, 'token expired')

    expect(result.refresh_error_count).toBe(1)
    expect(result.refresh_error).toBe('token expired')
    expect(result.status).toBe('error')
  })

  it('increments error count on subsequent failures', () => {
    const connection = makeConnection({ refresh_error_count: 2 })
    const result = buildRefreshErrorUpdate(connection, 'network error')

    expect(result.refresh_error_count).toBe(3)
    expect(result.status).toBe('error')
  })

  it('marks as revoked when reaching MAX_REFRESH_ERRORS', () => {
    const connection = makeConnection({ refresh_error_count: MAX_REFRESH_ERRORS - 1 })
    const result = buildRefreshErrorUpdate(connection, 'persistent error')

    expect(result.refresh_error_count).toBe(MAX_REFRESH_ERRORS)
    expect(result.status).toBe('revoked')
  })

  it('keeps status as revoked beyond MAX_REFRESH_ERRORS', () => {
    const connection = makeConnection({ refresh_error_count: MAX_REFRESH_ERRORS })
    const result = buildRefreshErrorUpdate(connection, 'another error')

    expect(result.refresh_error_count).toBe(MAX_REFRESH_ERRORS + 1)
    expect(result.status).toBe('revoked')
  })

  it('stores the error message', () => {
    const connection = makeConnection()
    const errorMsg = 'invalid_grant: Token has been expired or revoked.'
    const result = buildRefreshErrorUpdate(connection, errorMsg)

    expect(result.refresh_error).toBe(errorMsg)
  })
})

describe('MAX_REFRESH_ERRORS', () => {
  it('is 5', () => {
    expect(MAX_REFRESH_ERRORS).toBe(5)
  })
})
