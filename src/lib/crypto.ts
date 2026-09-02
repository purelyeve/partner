import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.TAX_ID_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('TAX_ID_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).')
  }
  return Buffer.from(hex, 'hex')
}

/** Encrypt sensitive string for storage. Returns iv:authTag:ciphertext (hex). */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/** Decrypt stored secret — never render full value in Partner UI. */
export function decryptSecret(ciphertext: string): string {
  const key = getKey()
  const [ivHex, authTagHex, dataHex] = ciphertext.split(':')
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Invalid ciphertext format.')
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function encryptTaxId(plaintext: string): string {
  return encryptSecret(plaintext)
}

export function decryptTaxId(ciphertext: string): string {
  return decryptSecret(ciphertext)
}

export function taxIdLast4(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.slice(-4)
}

/** Last 4 of an API key for display (e.g. EasyPost). */
export function secretLast4(value: string): string {
  const trimmed = value.trim()
  return trimmed.slice(-4)
}
