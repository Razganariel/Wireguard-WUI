const bcrypt = require('bcrypt')
const userModel = require('../models/user')
const { sanitize, sanitizeEmail } = require('../helpers/sanitize')

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

  req.session.userId = user.id
  req.session.userEmail = user.email
  req.session.userName = `${user.prenom} ${user.nom}`
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
  logout
}
