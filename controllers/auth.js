const bcrypt = require('bcrypt')
const userModel = require('../models/user')
const { sanitize, sanitizeEmail } = require('../helpers/sanitize')
const { verifyToken } = require('../helpers/totp')

async function login(req, res) {
  const email = sanitizeEmail(req.body.email)
  const password = sanitize(req.body.password)

  if (!email || !password) {
    req.session.flash = { error: 'Veuillez saisir votre email et votre mot de passe.' }
    return res.redirect('/auth/login')
  }

  const user = userModel.findByEmail(email)

  if (!user) {
    req.session.flash = { error: 'Identifiants incorrects.' }
    return res.redirect('/auth/login')
  }

  const valid = await bcrypt.compare(password, user.password)

  if (!valid) {
    req.session.flash = { error: 'Identifiants incorrects.' }
    return res.redirect('/auth/login')
  }

  if (user['2fa_enabled'] && user.totp_secret) {
    req.session.pendingUserId = user.id
    req.session.pendingUserEmail = user.email
    req.session.pendingUserName = `${user.prenom} ${user.nom}`
    return res.redirect('/auth/totp')
  }

  req.session.userId = user.id
  req.session.userEmail = user.email
  req.session.userName = `${user.prenom} ${user.nom}`
  req.session.flash = { success: 'Connexion réussie. Bienvenue !' }

  return res.redirect('/')
}

async function verifyTotp(req, res) {
  if (!req.session.pendingUserId) {
    return res.redirect('/auth/login')
  }

  const token = sanitize(req.body.totp_token)
  if (!token) {
    req.session.flash = { error: 'Veuillez saisir le code d\'authentification.' }
    return res.redirect('/auth/totp')
  }

  const user = userModel.findById(req.session.pendingUserId)
  if (!user || !user.totp_secret) {
    req.session.flash = { error: 'Configuration 2FA invalide.' }
    return res.redirect('/auth/login')
  }

  if (!verifyToken(user.totp_secret, token)) {
    req.session.flash = { error: 'Code invalide. Veuillez réessayer.' }
    return res.redirect('/auth/totp')
  }

  req.session.userId = user.id
  req.session.userEmail = user.email
  req.session.userName = `${user.prenom} ${user.nom}`
  delete req.session.pendingUserId
  delete req.session.pendingUserEmail
  delete req.session.pendingUserName
  req.session.flash = { success: 'Connexion réussie. Bienvenue !' }

  return res.redirect('/')
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/auth/login')
  })
}

module.exports = {
  login,
  verifyTotp,
  logout
}
