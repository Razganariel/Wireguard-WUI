// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import userModel from '../../models/user.js'
import { startServer, stopServer, fetchUrl, cookieHeader, extractCsrf } from './helpers.js'

beforeAll(async () => {
  const hash = await bcrypt.hash('test-password', 4)
  userModel.create({ prenom: 'Route', nom: 'Logs', email: 'route-logs@test.com', password: hash })
  await startServer()
})

afterAll(() => { stopServer() })

async function login() {
  const loginPage = await fetchUrl('/auth/login')
  const token = extractCsrf(loginPage.text)
  const jar = loginPage.cookies
  const loginRes = await fetchUrl('/auth/login', {
    method: 'POST',
    headers: { Cookie: cookieHeader(jar) },
    formBody: { email: 'route-logs@test.com', password: 'test-password', _csrf: token }
  })
  return loginRes.cookies.length ? loginRes.cookies : jar
}

describe('Logs routes', () => {
  it('redirects to login when not authenticated', async () => {
    const res = await fetchUrl('/logs')
    expect(res.status).toBe(302)
    expect(res.location).toBe('/auth/login')
  })

  it('shows logs page with filter form for authenticated user', async () => {
    const jar = await login()
    const res = await fetchUrl('/logs', { headers: { Cookie: cookieHeader(jar) } })
    expect(res.status).toBe(200)
    expect(res.text).toContain('Logs')
    expect(res.text).toContain('name="level"')
    expect(res.text).toContain('name="module"')
    expect(res.text).toContain('name="search"')
    expect(res.text).toContain('name="limit"')
    expect(res.text).toContain('action="/logs"')
  })

  it('persists the level filter in the select', async () => {
    const jar = await login()
    const res = await fetchUrl('/logs?level=ERROR', { headers: { Cookie: cookieHeader(jar) } })
    expect(res.status).toBe(200)
    expect(res.text).toMatch(/value="ERROR" selected/)
  })
})