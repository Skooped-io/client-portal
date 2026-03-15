import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits — standard for GCM
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is not set')
  if (key.length !== 64) throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  return Buffer.from(key, 'hex')
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
