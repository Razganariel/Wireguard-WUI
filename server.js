const express = require('express')
const session = require('express-session')
const path = require('path')
const hbs = require('hbs')
require('dotenv').config()

const db = require('./db')
const userModel = require('./models/user')
const interfaceModel = require('./models/interface')
const authRoutes = require('./routes/auth')
const interfaceRoutes = require('./routes/interface')
const peersRoutes = require('./routes/peers')

const app = express()
const PORT = process.env.PORT || 3000

hbs.registerHelper('eq', (a, b) => a === b)
hbs.registerHelper('currentYear', () => new Date().getFullYear())

app.set('view engine', 'hbs')
app.set('views', path.join(__dirname, 'views'))
app.set('view options', { layout: 'layouts/layout' })
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: false }))
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
  })
)

app.use((req, res, next) => {
  res.locals.currentPath = req.path
  if (req.session) {
    res.locals.flash = req.session.flash || null
    req.session.flash = null
    res.locals.user = req.session.userId || null
    res.locals.userName = req.session.userName || null

    if (req.session.userId) {
      const interfaces = interfaceModel.findAll()
      res.locals.interfaces = interfaces
      res.locals.hasInterfaces = interfaces.length > 0

      let selectedId = req.session.selectedInterfaceId
      let selectedIface = null
      if (selectedId) {
        selectedIface = interfaces.find((i) => i.id === selectedId) || null
      }
      if (!selectedIface && interfaces.length > 0) {
        selectedIface = interfaces[0]
        req.session.selectedInterfaceId = selectedIface.id
      }
      res.locals.selectedInterface = selectedIface ? selectedIface.id : null
      res.locals.selectedInterfaceName = selectedIface ? selectedIface.nom : null
    }
  }
  next()
})

app.use('/auth', authRoutes)
app.use('/interface', interfaceRoutes)
app.use('/peers', peersRoutes)

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login')
  })
})

app.get('/', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/auth/login')
  }
  res.render('dashboard/index', {
    title: 'Tableau de bord'
  })
})

app.use((req, res) => {
  res.status(404).render('errors/404', { title: '404 — Page introuvable' })
})

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).render('errors/500', { title: '500 — Erreur serveur' })
})

const PORT_FINAL = PORT
app.listen(PORT_FINAL, () => {
  console.log(`WireGuard-WUI running on http://localhost:${PORT_FINAL}`)
  seedOnStartup()
})

async function seedOnStartup() {
  try {
    const count = userModel.count()
    if (count === 0) {
      const bcrypt = require('bcrypt')
      const hashedPassword = await bcrypt.hash('admin', 10)
      userModel.create({
        nom: 'Admin',
        prenom: 'Admin',
        email: 'admin@wireguard.local',
        password: hashedPassword
      })
      console.log('Default admin created (admin@wireguard.local / admin)')
    }
  } catch (err) {
    console.error('Seed on startup error:', err)
  }
}

module.exports = app
