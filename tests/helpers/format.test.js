// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest'
import { formatBytes, formatHandshake } from '../../helpers/format.js'

describe('formatBytes', () => {
  it('returns "0 B" for zero/null/undefined', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(undefined)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B')
  })

  it('formats KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('formats MB', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })

  it('formats GB', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB')
  })

  it('formats TB', () => {
    expect(formatBytes(1099511627776)).toBe('1.0 TB')
  })
})

describe('formatHandshake', () => {
  it('returns null for zero/null', () => {
    expect(formatHandshake(0)).toBeNull()
    expect(formatHandshake(null)).toBeNull()
    expect(formatHandshake(undefined)).toBeNull()
  })

  it('returns "à l\'instant" for < 60s', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 30)).toBe("à l'instant")
  })

  it('returns minutes for < 3600s', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 120)).toBe('il y a 2 min')
  })

  it('returns hours for < 86400s', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 7200)).toBe('il y a 2 h')
  })

  it('returns days for >= 86400s', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 172800)).toBe('il y a 2 j')
  })
})
