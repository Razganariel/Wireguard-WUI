// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import fs from 'node:fs'
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
    expect(res.text).toContain('action="/logs/clear"')
    expect(res.text).toContain('data-confirm')
  })

  it('always lists all known modules in the filter', async () => {
    const jar = await login()
    const res = await fetchUrl('/logs', { headers: { Cookie: cookieHeader(jar) } })
    expect(res.status).toBe(200)
    for (const module of ['Auth', 'CSRF', 'HTTP', 'Interface', 'Peers', 'Profile', 'Serveur', 'Settings', 'Sudo']) {
      expect(res.text).toContain(`value="${module}"`)
    }
  })

  it('persists the level filter in the select', async () => {
    const jar = await login()
    const res = await fetchUrl('/logs?level=ERROR', { headers: { Cookie: cookieHeader(jar) } })
    expect(res.status).toBe(200)
    expect(res.text).toMatch(/value="ERROR" selected/)
  })

  it('escapes HTML in the reflected search filter', async () => {
    const jar = await login()
    const res = await fetchUrl('/logs?search=<script>alert(1)</script>', { headers: { Cookie: cookieHeader(jar) } })
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('<script>alert(1)</script>')
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('escapes HTML in log message content', async () => {
    fs.appendFileSync(process.env.LOG_FILE, '[2026-08-16 12:00:00.000] [INFO] [Peers] <img src=x onerror=alert(1)>\n', 'utf8')
    const jar = await login()
    const res = await fetchUrl('/logs', { headers: { Cookie: cookieHeader(jar) } })
    expect(res.text).not.toContain('<img src=x onerror=alert(1)>')
    expect(res.text).toContain('&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;')
  })

  it('escapes HTML in log module names', async () => {
    fs.appendFileSync(process.env.LOG_FILE, '[2026-08-16 12:00:01.000] [INFO] [""><script>alert(2)</script>] payload\n', 'utf8')
    const jar = await login()
    const res = await fetchUrl('/logs', { headers: { Cookie: cookieHeader(jar) } })
    expect(res.text).not.toContain('<script>alert(2)</script>')
    expect(res.text).toContain('&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;')
  })

  it('rejects non-whitelisted levels and does not reflect shell/SQL metacharacters', async () => {
    const jar = await login()
    const res = await fetchUrl('/logs?level=ERROR%3B%20DROP%20TABLE%20users&module=%3B%20rm%20-rf%20%2F&search=%27%20OR%20%271%27%3D%271', {
      headers: { Cookie: cookieHeader(jar) }
    })
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('DROP TABLE')
    expect(res.text).not.toContain('rm -rf')
  })

  it('rejects POST /logs/clear without a valid CSRF token', async () => {
    const jar = await login()
    const res = await fetchUrl('/logs/clear', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { _csrf: 'invalid-token' }
    })
    expect(res.status).toBe(302)
    expect(res.location).toBe('/')
  })

  it('clears the logs via POST /logs/clear', async () => {
    fs.appendFileSync(process.env.LOG_FILE, '[2026-08-16 12:00:00.000] [INFO] [Peers] ligne a supprimer\n', 'utf8')
    const jar = await login()
    const page = await fetchUrl('/logs', { headers: { Cookie: cookieHeader(jar) } })
    const token = extractCsrf(page.text)

    const res = await fetchUrl('/logs/clear', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { _csrf: token }
    })
    expect(res.status).toBe(302)
    expect(res.location).toBe('/logs')

    const after = await fetchUrl('/logs', { headers: { Cookie: cookieHeader(jar) } })
    expect(after.status).toBe(200)
    expect(after.text).not.toContain('ligne a supprimer')
  })

  it('saves log rotation settings via POST /profile/rotation', async () => {
    const jar = await login()
    const page = await fetchUrl('/profile', { headers: { Cookie: cookieHeader(jar) } })
    const token = extractCsrf(page.text)

    const res = await fetchUrl('/profile/rotation', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { log_rotate_size: '512', log_rotate_backups: '5', _csrf: token }
    })
    expect(res.status).toBe(302)
    expect(res.location).toBe('/profile')

    const profile = await fetchUrl('/profile', { headers: { Cookie: cookieHeader(jar) } })
    expect(profile.text).toContain('name="log_rotate_size"')
    expect(profile.text).toContain('name="log_rotate_backups"')
    expect(profile.text).toContain('value="512"')
    expect(profile.text).toContain('value="5"')
  })
})