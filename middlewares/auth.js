const sudo = require('../helpers/sudo')

async function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next()
  }
  return res.redirect('/auth/login')
}

async function requireSudoPassword(req, res, next) {
  if (req.session && req.session.sudoPassword) {
    sudo.setPassword(req.session.sudoPassword)
    return next()
  }
  req.session.flash = { error: 'Veuillez d\'abord définir le mot de passe sudo.' }
  return res.redirect('/auth/sudo-password')
}

async function verifyPassword(plainPassword, hashedPassword) {
  const bcrypt = require('bcrypt')
  return bcrypt.compare(plainPassword, hashedPassword)
}

module.exports = {
  isAuthenticated,
  requireSudoPassword,
  verifyPassword
}
