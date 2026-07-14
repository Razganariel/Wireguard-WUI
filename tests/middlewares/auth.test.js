// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from 'vitest'
import { isAuthenticated, requireSudoPassword, verifyPassword } from '../../middlewares/auth.js'

describe('isAuthenticated', () => {
  it('calls next() when session has userId', () => {
    const req = { session: { userId: 1 }, t: () => '' }
    const res = {}
    const next = vi.fn()
    isAuthenticated(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('redirects when session has no userId', () => {
    const req = { session: {} }
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    isAuthenticated(req, res, next)
    expect(res.redirect).toHaveBeenCalledWith('/auth/login')
    expect(next).not.toHaveBeenCalled()
  })

  it('redirects when session is missing', () => {
    const req = {}
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    isAuthenticated(req, res, next)
    expect(res.redirect).toHaveBeenCalledWith('/auth/login')
  })
})

describe('requireSudoPassword', () => {
  it('calls next() when sudoPassword is set', () => {
    const req = { session: { sudoPassword: 'some-encrypted-value' }, t: () => '' }
    const res = {}
    const next = vi.fn()
    requireSudoPassword(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('redirects when sudoPassword is missing', () => {
    const req = { session: { flash: null }, t: () => '' }
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    requireSudoPassword(req, res, next)
    expect(res.redirect).toHaveBeenCalledWith('/auth/sudo-password')
    expect(next).not.toHaveBeenCalled()
  })
})

describe('verifyPassword', () => {
  it('returns true for matching password', async () => {
    const bcrypt = await import('bcrypt')
    const hash = await bcrypt.hash('correct-password', 4)
    const result = await verifyPassword('correct-password', hash)
    expect(result).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const bcrypt = await import('bcrypt')
    const hash = await bcrypt.hash('correct-password', 4)
    const result = await verifyPassword('wrong-password', hash)
    expect(result).toBe(false)
  })
})
