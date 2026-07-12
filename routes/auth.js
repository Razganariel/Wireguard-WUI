const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const authController = require('../controllers/auth')
const { isAuthenticated } = require('../middlewares/auth')
const { sanitizeRaw } = require('../helpers/sanitize')
const { encrypt } = require('../helpers/crypto')
const userModel = require('../models/user')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.session.flash = { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
    res.redirect('/auth/login')
  }
})

const sudoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.session.flash = { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
    res.redirect('/auth/sudo-password')
  }
})

router.get('/setup', (req, res) => {
  if (userModel.count() > 0) {
    return res.redirect('/auth/login')
  }
  res.render('auth/setup', { title: 'Installation', layout: 'layouts/minimal' })
})

router.post('/setup', async (req, res) => {
  if (userModel.count() > 0) {
    return res.redirect('/auth/login')
  }
  const { prenom, nom, email, password } = req.body
  if (!prenom || !nom || !email || !password || password.length < 8) {
    req.session.flash = { error: 'Tous les champs sont obligatoires (mot de passe 8 caractères min).' }
    return res.redirect('/auth/setup')
  }
  try {
    const bcrypt = require('bcrypt')
    const hashedPassword = await bcrypt.hash(password, 10)
    userModel.create({ prenom, nom, email, password: hashedPassword })
    req.session.userId = userModel.findByEmail(email).id
    req.session.userEmail = email
    req.session.userName = `${prenom} ${nom}`
    req.session.flash = { success: 'Compte administrateur créé. Bienvenue !' }
    return res.redirect('/')
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      req.session.flash = { error: 'Cet email est déjà utilisé.' }
    } else {
      req.session.flash = { error: 'Erreur lors de la création du compte.' }
    }
    return res.redirect('/auth/setup')
  }
})

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/')
  }
  res.render('auth/login', { title: 'Connexion' })
})

router.post('/login', loginLimiter, authController.login)

router.get('/totp', (req, res) => {
  if (!req.session.pendingUserId) return res.redirect('/auth/login')
  if (req.session.userId) return res.redirect('/')
  res.render('auth/totp', { title: 'Authentification' })
})

router.post('/totp', authController.verifyTotp)

router.get('/logout', authController.logout)

router.get('/sudo-password', isAuthenticated, (req, res) => {
  res.render('auth/sudo-password', {
    title: 'Mot de passe sudo',
    hasSudoPassword: !!(req.session.sudoPassword)
  })
})

router.post('/sudo-password', isAuthenticated, sudoLimiter, (req, res) => {
  const password = sanitizeRaw(req.body.password, 256)
  if (!password) {
    req.session.flash = { error: 'Le mot de passe est obligatoire.' }
    return res.redirect('/auth/sudo-password')
  }
  req.session.sudoPassword = encrypt(password)
  req.session.flash = { success: 'Mot de passe sudo enregistré.' }
  res.redirect('/')
})

router.get('/sudo-clear', isAuthenticated, (req, res) => {
  delete req.session.sudoPassword
  req.session.flash = { success: 'Mot de passe sudo effacé.' }
  res.redirect('/')
})

module.exports = router
