async function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next()
  }
  return res.redirect('/auth/login')
}

async function verifyPassword(plainPassword, hashedPassword) {
  const bcrypt = require('bcrypt')
  return bcrypt.compare(plainPassword, hashedPassword)
}

module.exports = {
  isAuthenticated,
  verifyPassword
}
