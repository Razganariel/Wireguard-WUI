const express = require('express')
const router = express.Router()
const authController = require('../controllers/auth')

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/')
  }
  res.render('auth/login', { title: 'Connexion' })
})

router.post('/login', authController.login)

router.get('/logout', authController.logout)

module.exports = router
