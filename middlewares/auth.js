const bcrypt = require('bcrypt')
const sudo = require('../helpers/sudo')
const { decrypt } = require('../helpers/crypto')

async function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next()
  }
  return res.redirect('/auth/login')
}

async function requireSudoPassword(req, res, next) {
  if (req.session && req.session.sudoPassword) {
    const decrypted = decrypt(req.session.sudoPassword)
    if (decrypted) sudo.setPassword(decrypted)
    return next()
  }
  req.session.flash = { error: 'Veuillez d\'abord définir le mot de passe sudo.' }
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
