// SPDX-License-Identifier: AGPL-3.0-only

const bcrypt = require('bcrypt')
const sudo = require('../helpers/sudo')
const { decrypt } = require('../helpers/crypto')
const log = require('../helpers/logger')

async function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    log.debug('Auth', `Authentifié : ${req.session.userEmail} — ${req.method} ${req.path}`)
    return next()
  }
  log.debug('Auth', `Non authentifié — ${req.method} ${req.path}`)
  return res.redirect('/auth/login')
}

async function requireSudoPassword(req, res, next) {
  if (req.session && req.session.sudoPassword) {
    const decrypted = decrypt(req.session.sudoPassword)
    if (decrypted) sudo.setPassword(decrypted)
    return next()
  }
  log.debug('Auth', `Mot de passe sudo requis — ${req.method} ${req.path}`)
  req.session.flash = { error: req.t('error.define_sudo_password_first') }
  return res.redirect('/auth/sudo-password')
}

async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword)
}

module.exports = {
  isAuthenticated,
  requireSudoPassword,
  verifyPassword
}
