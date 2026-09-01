import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits — standard for GCM
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is not set')
  // Preferred: 64 hex chars = 32 raw bytes. Any other non-empty value (the
  // production key predates this format) is stretched to 32 bytes with
  // SHA-256, deterministically, so ciphertexts stay decryptable as long as
  // the env value itself does not change. Nothing was encrypted under the
  // old strict rule before 2026-09-01, so no migration is needed.
  if (/^[0-9a-f]{64}$/i.test(key)) return Buffer.from(key, 'hex')
  if (key.length < 16) throw new Error('TOKEN_ENCRYPTION_KEY is too short (16+ chars, ideally 64 hex)')
  return createHash('sha256').update(key, 'utf8').digest()
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a hex string: iv:authTag:ciphertext
 */
export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * Decrypts a string produced by encrypt().
 * Expects format: iv:authTag:ciphertext (all hex)
 */
export function decrypt(encryptedText: string): string {
  const key = getKey()
  const parts = encryptedText.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted text format')

  const [ivHex, authTagHex, ciphertextHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  if (iv.length !== IV_LENGTH) throw new Error('Invalid IV length')
  if (authTag.length !== AUTH_TAG_LENGTH) throw new Error('Invalid auth tag length')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
