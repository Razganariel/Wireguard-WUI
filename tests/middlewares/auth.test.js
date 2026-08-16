// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from 'vitest'
import { isAuthenticated, requireSudoPassword } from '../../middlewares/auth.js'

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
