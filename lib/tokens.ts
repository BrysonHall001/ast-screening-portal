import crypto from 'crypto'

export function newConsentToken(): string {
  return crypto.randomBytes(32).toString('hex')
}
