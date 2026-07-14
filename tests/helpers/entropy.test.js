// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest'
import entropy from '../../helpers/entropy.js'

describe('getStrength', () => {
  it('rejects empty password', () => {
    const result = entropy.getStrength('')
    expect(result.isValid).toBe(false)
    expect(result.entropy).toBe(0)
  })

  it('rejects very weak password', () => {
    const result = entropy.getStrength('abc')
    expect(result.isValid).toBe(false)
    expect(result.entropy).toBeLessThan(60)
  })

  it('accepts strong password', () => {
    const result = entropy.getStrength('MyC0mplex!P@ssw0rd#2024')
    expect(result.isValid).toBe(true)
    expect(result.entropy).toBeGreaterThanOrEqual(60)
  })

  it('calculates higher entropy for longer passwords', () => {
    const short = entropy.getStrength('Abc123!')
    const long = entropy.getStrength('Abc123!Abc123!Abc123!')
    expect(long.entropy).toBeGreaterThan(short.entropy)
  })

  it('returns entropy as a number', () => {
    const result = entropy.getStrength('HelloWorld1!')
    expect(typeof result.entropy).toBe('number')
  })
})
