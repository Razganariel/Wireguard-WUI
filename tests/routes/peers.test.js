import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import userModel from '../../models/user.js'
import interfaceModel from '../../models/interface.js'
import { startServer, stopServer, fetchUrl, cookieHeader, extractCsrf } from './helpers.js'

let ifaceId

beforeAll(async () => {
  const hash = await bcrypt.hash('test-password', 4)
  userModel.create({ prenom: 'Route', nom: 'Peer', email: 'route-peer@test.com', password: hash })
  await startServer()

  ifaceId = interfaceModel.create({
    nom: 'wg_route_peer_test',
    private_key: 'pk',
    public_key: 'PK',
    adresse_ip: '10.70.0.1/24'
  })
})

afterAll(() => { stopServer() })

describe('Peers routes', () => {
  it('shows peers page for authenticated user', async () => {
    const loginPage = await fetchUrl('/auth/login')
    const token = extractCsrf(loginPage.text)
    let jar = loginPage.cookies

    const loginRes = await fetchUrl('/auth/login', {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
      formBody: { email: 'route-peer@test.com', password: 'test-password', _csrf: token }
    })
    jar = loginRes.cookies.length ? loginRes.cookies : jar

    const res = await fetchUrl(`/peers?interface=${ifaceId}`, {
      headers: { Cookie: cookieHeader(jar) }
    })
    expect(res.status).toBe(200)
    expect(res.text).toContain('Pairs')
  })
})
