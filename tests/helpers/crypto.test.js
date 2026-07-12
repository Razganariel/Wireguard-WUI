import { describe, it, expect } from 'vitest'
import crypto from '../../helpers/crypto.js'

describe('encrypt / decrypt', () => {
  it('encrypts and decrypts a string', () => {
    const plain = 'hello-world'
    const encrypted = crypto.encrypt(plain)
    expect(typeof encrypted).toBe('string')
    expect(encrypted).not.toBe(plain)
    const decrypted = crypto.decrypt(encrypted)
    expect(decrypted).toBe(plain)
  })

  it('returns null for decrypting garbage', () => {
    expect(crypto.decrypt('not-valid')).toBeNull()
  })

  it('returns null for decrypting null/undefined', () => {
    expect(crypto.decrypt(null)).toBeNull()
    expect(crypto.decrypt(undefined)).toBeNull()
  })

  it('produces different ciphertexts each time', () => {
    const plain = 'same-text'
    const a = crypto.encrypt(plain)
    const b = crypto.encrypt(plain)
    expect(a).not.toBe(b)
  })

  it('round-trips special characters', () => {
    const plain = "p@ssw0rd with $pecial \tchars\n"
    const encrypted = crypto.encrypt(plain)
    expect(crypto.decrypt(encrypted)).toBe(plain)
  })

  it('returns null for empty string', () => {
    expect(crypto.encrypt('')).toBeNull()
  })
})
