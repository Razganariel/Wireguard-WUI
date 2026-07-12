const express = require('express')
const session = require('express-session')
const helmet = require('helmet')
const path = require('path')
const hbs = require('hbs')
require('dotenv').config()

const db = require('./db')
const userModel = require('./models/user')
const interfaceModel = require('./models/interface')
const peerModel = require('./models/peer')
const interfaceController = require('./controllers/interface')
const sudo = require('./helpers/sudo')
const csrfMiddleware = require('./middlewares/csrf')
const { decrypt } = require('./helpers/crypto')
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

if (process.env.TRUST_PROXY) {
  const trust = isNaN(process.env.TRUST_PROXY) ? process.env.TRUST_PROXY : parseInt(process.env.TRUST_PROXY, 10)
  app.set('trust proxy', trust)
}

app.use(helmet({
  strictTransportSecurity: process.env.ENABLE_HSTS ? {} : false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: process.env.ENABLE_UPGRADE_HTTPS ? [] : null
    }
  }
}))
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: false }))
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: process.env.SESSION_SECURE === 'true'
    }
  })
)

app.use(csrfMiddleware)

app.use((req, res, next) => {
  res.locals.currentPath = req.path
  if (req.session) {
    res.locals.flash = req.session.flash || null
    req.session.flash = null
    res.locals.user = req.session.userId || null
    res.locals.userName = req.session.userName || null

    if (req.session.sudoPassword) {
      const decrypted = decrypt(req.session.sudoPassword)
      if (decrypted) {
        sudo.setPassword(decrypted)
      } else {
        delete req.session.sudoPassword
        sudo.clearPassword()
      }
    } else {
      sudo.clearPassword()
    }
    res.locals.hasSudoPassword = sudo.hasPassword()

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

app.use((req, res, next) => {
  if (userModel.count() === 0 && !req.path.startsWith('/auth/setup') && !req.path.startsWith('/css/') && !req.path.startsWith('/js/') && req.path !== '/wireguard-color.svg') {
    return res.redirect('/auth/setup')
  }
  next()
})

app.use('/auth', authRoutes)
app.use('/interface', interfaceRoutes)
app.use('/peers', peersRoutes)

app.get('/profile', (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login')
  const user = userModel.findById(req.session.userId)
  if (!user) return res.redirect('/logout')
  res.render('profile/index', { title: 'Mon profil', user })
})

app.post('/profile', async (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login')
  const bcrypt = require('bcrypt')
  const { sanitize, sanitizeEmail } = require('./helpers/sanitize')
  const user = userModel.findById(req.session.userId)
  if (!user) return res.redirect('/logout')

  const prenom = sanitize(req.body.prenom)
  const nom = sanitize(req.body.nom)
  let email = sanitizeEmail(req.body.email)

  if (!prenom || !nom) {
    req.session.flash = { error: 'Le prénom et le nom sont obligatoires.' }
    return res.redirect('/profile')
  }
  if (!email) {
    req.session.flash = { error: 'Email invalide.' }
    return res.redirect('/profile')
  }

  if (email !== user.email) {
    const existing = userModel.findByEmail(email)
    if (existing && existing.id !== user.id) {
      req.session.flash = { error: 'Cet email est déjà utilisé.' }
      return res.redirect('/profile')
    }
  }

  const updates = { prenom, nom, email }

  if (req.body.current_password && req.body.new_password) {
    if (req.body.new_password.length < 8) {
      req.session.flash = { error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }
      return res.redirect('/profile')
    }
    if (req.body.new_password !== req.body.new_password_confirm) {
      req.session.flash = { error: 'La confirmation du mot de passe ne correspond pas.' }
      return res.redirect('/profile')
    }
    const valid = await bcrypt.compare(req.body.current_password, user.password)
    if (!valid) {
      req.session.flash = { error: 'Le mot de passe actuel est incorrect.' }
      return res.redirect('/profile')
    }
    updates.password = await bcrypt.hash(req.body.new_password, 10)
  }

  userModel.update(user.id, updates)
  req.session.userName = `${prenom} ${nom}`
  req.session.userEmail = email
  req.session.flash = { success: 'Profil mis à jour.' }
  res.redirect('/profile')
})

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login')
  })
})

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatHandshake(ts) {
  if (!ts || ts === 0) return null
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'à l\'instant'
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

app.get('/', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/auth/login')
  }

  const interfaces = interfaceModel.findAll()
  const hasInterfaces = interfaces.length > 0

  let totalConnectedPeers = 0
  let totalPeers = 0
  let totalTransferRx = 0
  let totalTransferTx = 0
  let latestHandshake = 0

  const routingStatus = {}

  const enrichedInterfaces = []
  for (const iface of interfaces) {
    const peers = peerModel.findByInterfaceId(iface.id)
    const peerCount = peers.length
    totalPeers += peerCount

    let ifaceStatus = null
    if (sudo.hasPassword()) {
      try { ifaceStatus = await interfaceController.getStatus(iface.nom) } catch (e) {}
      if (iface.active) {
        try { routingStatus[iface.nom] = await interfaceController.getRoutingInfo(iface.nom, iface.adresse_ip) } catch (e) {}
      }
    }

    let connectedPeers = 0
    let ifaceLatestHs = 0
    let totalRx = 0
    let totalTx = 0

    if (ifaceStatus && ifaceStatus.peers) {
      for (const p of ifaceStatus.peers) {
        totalRx += p.transferRx || 0
        totalTx += p.transferTx || 0
        if (p.latestHandshake > ifaceLatestHs) ifaceLatestHs = p.latestHandshake
        if (p.latestHandshake > 0) connectedPeers++
      }
    }

    totalConnectedPeers += connectedPeers
    totalTransferRx += totalRx
    totalTransferTx += totalTx
    if (ifaceLatestHs > latestHandshake) latestHandshake = ifaceLatestHs

    const routing = routingStatus[iface.nom]
    enrichedInterfaces.push({
      id: iface.id,
      nom: iface.nom,
      active: iface.active,
      port: iface.port,
      endpoint: iface.endpoint,
      peerCount,
      connectedPeers,
      lastHandshake: formatHandshake(ifaceLatestHs),
      totalRx: formatBytes(totalRx),
      totalTx: formatBytes(totalTx),
      routingOk: routing ? routing.allOk : null
    })
  }

  const activeInterfaces = enrichedInterfaces.filter((i) => i.active).length
  const routingOk = enrichedInterfaces.filter((i) => i.routingOk === true).length
  const routingKo = enrichedInterfaces.filter((i) => i.routingOk === false).length
  const routingNa = enrichedInterfaces.filter((i) => i.routingOk === null).length

  res.render('dashboard/index', {
    title: 'Tableau de bord',
    interfaces: enrichedInterfaces,
    hasInterfaces,
    stats: {
      activeInterfaces,
      totalInterfaces: interfaces.length,
      connectedPeers: totalConnectedPeers,
      totalPeers,
      totalTransferRx: formatBytes(totalTransferRx),
      totalTransferTx: formatBytes(totalTransferTx),
      latestHandshake: formatHandshake(latestHandshake)
    },
    routingSummary: {
      ok: routingOk,
      ko: routingKo,
      na: routingNa
    }
  })
})

app.use((req, res) => {
  res.status(404).render('errors/404', { title: '404 — Page introuvable' })
})

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).render('errors/500', { title: '500 — Erreur serveur' })
})

module.exports = app

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`WireGuard-WUI running on http://localhost:${PORT}`)
  })
}
