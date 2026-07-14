// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import userModel from '../../models/user.js'
import { startServer, stopServer, getBase, fetchUrl, cookieHeader, extractCsrf } from './helpers.js'

beforeAll(async () => {
  const hash = await bcrypt.hash('test-password', 4)
  userModel.create({ prenom: 'Route', nom: 'Auth', email: 'route-auth@test.com', password: hash })
  await startServer()
})

afterAll(() => { stopServer() })

describe('GET /auth/login', () => {
  it('renders login page', async () => {
    const res = await fetchUrl('/auth/login')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Log in')
  })
})

describe('POST /auth/login', () => {
  it('rejects empty fields', async () => {
    const loginPage = await fetchUrl('/auth/login')
    const token = extractCsrf(loginPage.text)
    const jar = loginPage.cookies

    const res = await fetchUrl('/auth/login', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { email: '', password: '', _csrf: token }
    })
    expect(res.status).toBe(302)
  })

  it('rejects wrong password', async () => {
    const loginPage = await fetchUrl('/auth/login')
    const token = extractCsrf(loginPage.text)
    const jar = loginPage.cookies

    const res = await fetchUrl('/auth/login', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { email: 'route-auth@test.com', password: 'wrong', _csrf: token }
    })
    expect(res.status).toBe(302)
  })

  it('accepts valid credentials and shows dashboard', async () => {
    const loginPage = await fetchUrl('/auth/login')
    const token = extractCsrf(loginPage.text)
    let jar = loginPage.cookies

    const loginRes = await fetchUrl('/auth/login', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { email: 'route-auth@test.com', password: 'test-password', _csrf: token }
    })
    expect(loginRes.status).toBe(302)
    jar = loginRes.cookies.length ? loginRes.cookies : jar

    const dashRes = await fetchUrl('/', {
      headers: { Cookie: cookieHeader(jar) }
    })
    expect(dashRes.status).toBe(200)
    expect(dashRes.text).toContain('Dashboard')
  })
})

describe('GET /auth/logout', () => {
  it('logs out', async () => {
    const loginPage = await fetchUrl('/auth/login')
    const token = extractCsrf(loginPage.text)
    let jar = loginPage.cookies

    await fetchUrl('/auth/login', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { email: 'route-auth@test.com', password: 'test-password', _csrf: token }
    })

    const res = await fetchUrl('/auth/logout', {
      headers: { Cookie: cookieHeader(jar) }
    })
    expect(res.status).toBe(302)
    expect(res.location).toBe('/auth/login')
  })
})
