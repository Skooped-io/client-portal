import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { encrypt, decrypt } from '../crypto'

// Set up a valid test encryption key (64 hex chars = 32 bytes)
const TEST_KEY = 'a'.repeat(64)

describe('crypto', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY
  })

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY
  })

  describe('encrypt', () => {
    it('returns a string with three colon-separated parts', () => {
      const result = encrypt('hello')
      const parts = result.split(':')
      expect(parts).toHaveLength(3)
    })

    it('produces different output for the same input (random IV)', () => {
      const result1 = encrypt('same text')
      const result2 = encrypt('same text')
      expect(result1).not.toBe(result2)
    })

    it('throws when TOKEN_ENCRYPTION_KEY is not set', () => {
      delete process.env.TOKEN_ENCRYPTION_KEY
      expect(() => encrypt('hello')).toThrow('TOKEN_ENCRYPTION_KEY is not set')
    })

    it('throws when TOKEN_ENCRYPTION_KEY is wrong length', () => {
      process.env.TOKEN_ENCRYPTION_KEY = 'tooshort'
      expect(() => encrypt('hello')).toThrow('TOKEN_ENCRYPTION_KEY must be a 64-char hex string')
    })
  })

  describe('decrypt', () => {
    it('roundtrips short strings', () => {
      const original = 'hello world'
      expect(decrypt(encrypt(original))).toBe(original)
    })

    it('roundtrips long strings (OAuth tokens)', () => {
      const token = 'ya29.' + 'x'.repeat(200)
      expect(decrypt(encrypt(token))).toBe(token)
    })

    it('roundtrips strings with special characters', () => {
      const token = 'eyJhbGci=.eyJ/special+chars&more=='
      expect(decrypt(encrypt(token))).toBe(token)
    })

    it('throws on malformed input (wrong number of parts)', () => {
      expect(() => decrypt('invalidformat')).toThrow('Invalid encrypted text format')
    })

    it('throws when TOKEN_ENCRYPTION_KEY is not set', () => {
      const encrypted = encrypt('data')
      delete process.env.TOKEN_ENCRYPTION_KEY
      expect(() => decrypt(encrypted)).toThrow('TOKEN_ENCRYPTION_KEY is not set')
    })

    it('throws when ciphertext is tampered with', () => {
      const encrypted = encrypt('original')
      const parts = encrypted.split(':')
      // Corrupt the ciphertext part
      parts[2] = 'deadbeef'
      expect(() => decrypt(parts.join(':'))).toThrow()
    })
  })

  describe('encrypt/decrypt roundtrip', () => {
    it('handles empty string', () => {
      expect(decrypt(encrypt(''))).toBe('')
    })

    it('handles unicode characters', () => {
      const text = 'hello 🔒 world'
      expect(decrypt(encrypt(text))).toBe(text)
    })

    it('handles a realistic Google access token', () => {
      const token = 'ya29.a0AfH6SMBxxxxxxxx-realistically-long-token-string'
      expect(decrypt(encrypt(token))).toBe(token)
    })

    it('handles a realistic Meta long-lived token', () => {
      const token = 'EAABwzLixnjYBAMeta-style-long-token-that-is-much-longer-than-google-tokens-and-can-be-very-lengthy-indeed'
      expect(decrypt(encrypt(token))).toBe(token)
    })
  })
})
