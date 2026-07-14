// SPDX-License-Identifier: AGPL-3.0-only

const otplib = require('otplib')

function generateSecret() {
  return otplib.generateSecret()
}

function generateToken(secret) {
  return otplib.generateSync({ secret })
}

function verifyToken(secret, token) {
  if (!secret || !token) return false
  try {
    const result = otplib.verifySync({ token, secret })
    return result && result.valid === true
  } catch {
    return false
  }
}

function getOtpauthUrl(secret, email) {
  return otplib.generateURI({ issuer: 'WireGuard-WUI', label: email, secret, type: 'totp' })
}

module.exports = { generateSecret, generateToken, verifyToken, getOtpauthUrl }