const bcrypt = require('bcrypt')
const userModel = require('../models/user')
const settingsModel = require('../models/settings')
const { sanitize, sanitizeEmail } = require('../helpers/sanitize')
const { verifyToken } = require('../helpers/totp')
const log = require('../helpers/logger')

async function login(req, res) {
  const email = sanitizeEmail(req.body.email)
  const password = sanitize(req.body.password)

  if (!email || !password) {
    req.session.flash = { error: 'Veuillez saisir votre email et votre mot de passe.' }
    return res.redirect('/auth/login')
  }

  const user = userModel.findByEmail(email)

  const dummyHash = '$2b$10$' + 'x'.repeat(53)
  const hash = user ? user.password : dummyHash
  const valid = await bcrypt.compare(password, hash)

  if (!valid) {
    log.info('Auth', `Tentative de connexion échouée pour ${email}`)
    req.session.flash = { error: 'Identifiants incorrects.' }
    return res.redirect('/auth/login')
  }

  const twofaEnabled = settingsModel.getUserSetting(user.id, '2fa_enabled') === '1'
  const totpSecret = settingsModel.getUserSetting(user.id, 'totp_secret')

  if (twofaEnabled && totpSecret) {
    log.debug('Auth', `TOTP requis pour ${email}`)
    req.session.pendingUserId = user.id
    req.session.pendingUserEmail = user.email
    req.session.pendingUserName = `${user.prenom} ${user.nom}`
    return res.redirect('/auth/totp')
  }

  req.session.userId = user.id
  req.session.userEmail = user.email
  req.session.userName = `${user.prenom} ${user.nom}`
  req.session.flash = { success: 'Connexion réussie. Bienvenue !' }
  log.info('Auth', `Connexion réussie : ${user.email} (${user.prenom} ${user.nom})`)

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
  const totpSecret = settingsModel.getUserSetting(req.session.pendingUserId, 'totp_secret')
  if (!user || !totpSecret) {
    log.info('Auth', `TOTP échoué : utilisateur ${req.session.pendingUserId} introuvable ou 2FA non configuré`)
    req.session.flash = { error: 'Configuration 2FA invalide.' }
    return res.redirect('/auth/login')
  }

  if (!verifyToken(totpSecret, token)) {
    log.info('Auth', `TOTP code invalide pour ${user.email}`)
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
  log.info('Auth', `Connexion TOTP réussie : ${user.email}`)

  return res.redirect('/')
}

function logout(req, res) {
  const name = req.session ? req.session.userName : null
  req.session.destroy(() => {
    log.info('Auth', `Déconnexion : ${name || 'inconnu'}`)
    res.redirect('/auth/login')
  })
}

module.exports = {
  login,
  verifyTotp,
  logout
}
