import { describe, it, expect, vi } from 'vitest'
import csrf from '../../middlewares/csrf.js'

describe('CSRF middleware', () => {
  it('skips validation for GET requests', () => {
    const req = { method: 'GET', session: {} }
    const res = { locals: {} }
    const next = vi.fn()
    csrf(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.locals.csrfToken).toBeDefined()
  })

  it('rejects POST with invalid CSRF token', () => {
    const req = { method: 'POST', body: { _csrf: 'invalid-token' }, get: () => null, session: {} }
    const res = { locals: {}, redirect: vi.fn() }
    const next = vi.fn()
    csrf(req, res, next)
    expect(res.redirect).toHaveBeenCalledWith('/')
    expect(next).not.toHaveBeenCalled()
  })
})
