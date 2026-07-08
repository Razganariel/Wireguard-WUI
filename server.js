const express = require('express')
const session = require('express-session')
const path = require('path')
const hbs = require('hbs')
require('dotenv').config()

const db = require('./db')
const userModel = require('./models/user')
const interfaceModel = require('./models/interface')
const peerModel = require('./models/peer')
const interfaceController = require('./controllers/interface')
const sudo = require('./helpers/sudo')
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

    if (req.session.sudoPassword) {
      sudo.setPassword(req.session.sudoPassword)
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

app.use('/auth', authRoutes)
app.use('/interface', interfaceRoutes)
app.use('/peers', peersRoutes)

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

  let allStatus = {}
  if (sudo.hasPassword()) {
    try {
      allStatus = await interfaceController.getAllStatus()
    } catch (e) {}
  }

  let totalConnectedPeers = 0
  let totalPeers = 0
  let totalTransferRx = 0
  let totalTransferTx = 0
  let latestHandshake = 0

  const routingStatus = {}
  if (sudo.hasPassword()) {
    for (const iface of interfaces) {
      if (iface.active) {
        try {
          routingStatus[iface.nom] = await interfaceController.getRoutingInfo(iface.nom, iface.adresse_ip)
        } catch (e) {}
      }
    }
  }

  const enrichedInterfaces = interfaces.map((iface) => {
    const peers = peerModel.findByInterfaceId(iface.id)
    const peerCount = peers.length
    totalPeers += peerCount

    const ifaceStatus = allStatus[iface.nom]
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
    return {
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
    }
  })

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
