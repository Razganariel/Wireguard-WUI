// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest'
import totp from '../../helpers/totp.js'

describe('generateSecret', () => {
  it('returns a base32 string', () => {
    const secret = totp.generateSecret()
    expect(typeof secret).toBe('string')
    expect(secret.length).toBeGreaterThan(10)
    expect(/^[A-Z2-7]+=*$/.test(secret)).toBe(true)
  })
})

describe('getOtpauthUrl', () => {
  it('generates valid otpauth URL', () => {
    const url = totp.getOtpauthUrl('JBSWY3DPEHPK3PXP', 'user@example.com')
    expect(url).toContain('otpauth://totp/')
    expect(url).toContain('user%40example.com')
    expect(url).toContain('JBSWY3DPEHPK3PXP')
    expect(url).toContain('issuer=WireGuard-WUI')
  })
})

describe('verifyToken', () => {
  it('returns false for wrong token', () => {
    const secret = totp.generateSecret()
    expect(totp.verifyToken(secret, '000000')).toBe(false)
  })

  it('returns false for empty token', () => {
    const secret = totp.generateSecret()
    expect(totp.verifyToken(secret, '')).toBe(false)
  })

  it('returns false for null token', () => {
    const secret = totp.generateSecret()
    expect(totp.verifyToken(secret, null)).toBe(false)
  })
})
