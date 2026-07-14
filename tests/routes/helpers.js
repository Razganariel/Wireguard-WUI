// SPDX-License-Identifier: AGPL-3.0-only

import http from 'node:http'
import app from '../../server.js'

let server
let base

export function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app)
    server.listen(0, () => {
      base = `http://localhost:${server.address().port}`
      resolve()
    })
  })
}

export function stopServer() {
  if (server) {
    server.close()
    server = null
  }
}

export function getBase() {
  return base
}

export async function fetchUrl(path, options = {}) {
  const url = base + path
  const headers = options.headers || {}

  if (options.formBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  let body
  if (options.formBody) {
    body = new URLSearchParams(options.formBody).toString()
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
    redirect: 'manual'
  })

  return {
    status: res.status,
    headers: res.headers,
    location: res.headers.get('location'),
    cookies: res.headers.getSetCookie(),
    text: await res.text()
  }
}

export function cookieHeader(cookies) {
  return cookies.map(c => c.split(';')[0]).join('; ')
}

export function extractCsrf(html) {
  const m = html.match(/name="_csrf"\s+value="([^"]+)"/)
  return m ? m[1] : null
}
