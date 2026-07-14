const express = require('express')
const router = express.Router()
const authController = require('../controllers/auth')
const { isAuthenticated } = require('../middlewares/auth')
const { sanitizeRaw } = require('../helpers/sanitize')
const { encrypt } = require('../helpers/crypto')

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/')
  }
  res.render('auth/login', { title: 'Connexion' })
})

router.post('/login', authController.login)

router.get('/logout', authController.logout)

router.get('/sudo-password', isAuthenticated, (req, res) => {
  res.render('auth/sudo-password', {
    title: 'Mot de passe sudo',
    hasSudoPassword: !!(req.session.sudoPassword)
  })
})

router.post('/sudo-password', isAuthenticated, (req, res) => {
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
