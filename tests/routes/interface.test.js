import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import userModel from '../../models/user.js'
import { startServer, stopServer, fetchUrl, cookieHeader, extractCsrf } from './helpers.js'

beforeAll(async () => {
  const hash = await bcrypt.hash('test-password', 4)
  userModel.create({ prenom: 'Route', nom: 'Iface', email: 'route-iface@test.com', password: hash })
  await startServer()
})

afterAll(() => { stopServer() })

describe('Interface routes', () => {
  it('redirects to login when not authenticated', async () => {
    const res = await fetchUrl('/interface')
    expect(res.status).toBe(302)
    expect(res.location).toBe('/auth/login')
  })

  it('shows interface page for authenticated user', async () => {
    const loginPage = await fetchUrl('/auth/login')
    const token = extractCsrf(loginPage.text)
    let jar = loginPage.cookies

    const loginRes = await fetchUrl('/auth/login', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { email: 'route-iface@test.com', password: 'test-password', _csrf: token }
    })
    jar = loginRes.cookies.length ? loginRes.cookies : jar

    const res = await fetchUrl('/interface', {
      headers: { Cookie: cookieHeader(jar) }
    })
    expect(res.status).toBe(200)
    expect(res.text).toContain('Interface')
  })
})
