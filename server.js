const express = require('express')
const session = require('express-session')
const helmet = require('helmet')
const path = require('path')
const hbs = require('hbs')
const bcrypt = require('bcrypt')
require('dotenv').config()

const i18next = require('i18next')
const FsBackend = require('i18next-fs-backend')
const i18nextMiddleware = require('i18next-http-middleware')

i18next.use(FsBackend).use(i18nextMiddleware.LanguageDetector).init({
  backend: { loadPath: path.join(__dirname, 'locales', '{{lng}}', 'translation.json') },
  fallbackLng: 'fr',
  preload: ['fr', 'en'],
  detection: { order: ['querystring', 'cookie', 'header'], caches: ['cookie'] }
})

const userModel = require('./models/user')
const interfaceModel = require('./models/interface')
const peerModel = require('./models/peer')
const interfaceController = require('./controllers/interface')
const sudo = require('./helpers/sudo')
const csrfMiddleware = require('./middlewares/csrf')
const { decrypt } = require('./helpers/crypto')
const { sanitize, sanitizeEmail } = require('./helpers/sanitize')
const { getStrength } = require('./helpers/entropy')
const { generateSecret, getOtpauthUrl, verifyToken } = require('./helpers/totp')
const { toDataURL } = require('./helpers/qrcode')
const { formatBytes, formatHandshake } = require('./helpers/format')
const log = require('./helpers/logger')
const logger = require('./helpers/logger')
const settingsModel = require('./models/settings')
const authRoutes = require('./routes/auth')
const interfaceRoutes = require('./routes/interface')
const peersRoutes = require('./routes/peers')

const app = express()
const PORT = process.env.PORT || 3000

hbs.registerHelper('eq', (a, b) => a === b)
hbs.registerHelper('currentYear', () => new Date().getFullYear())
hbs.registerHelper('__', function (...args) {
  const options = args.pop()
  const root = options.data && options.data.root
  const t = (root && root.t) || (this && this.t) || i18next.t
  return t(args[0], options.hash)
})

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

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
app.use(i18nextMiddleware.handle(i18next, { attachLocals: true }))
app.use(csrfMiddleware)

app.use((req, res, next) => {
  if (req.session && req.session.userId) {
    const savedLang = settingsModel.getUserSetting(req.session.userId, 'language')
    if (savedLang && req.i18n) {
      if (savedLang !== req.language) {
        req.i18n.changeLanguage(savedLang)
        res.cookie('i18next', savedLang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false })
      }
      res.locals.lang = savedLang
    } else {
      res.locals.lang = req.language || 'fr'
    }
  } else {
    res.locals.lang = req.language || 'fr'
  }
  next()
})

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    log.debug('HTTP', `${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`)
  })
  next()
})

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
  const logLevel = logger.getLevel()
  const passwordComplexity = settingsModel.getUserSetting(user.id, 'password_complexity') === '1'
  const totpEnabled = settingsModel.getUserSetting(user.id, '2fa_enabled') === '1'
  res.render('profile/index', {
    title: req.t('profile.title'),
    user,
    passwordComplexity,
    totpEnabled,
    debugMode: logLevel === 'DEBUG'
  })
})

app.post('/profile', async (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login')
  const user = userModel.findById(req.session.userId)
  if (!user) return res.redirect('/logout')

  const prenom = sanitize(req.body.prenom)
  const nom = sanitize(req.body.nom)
  let email = sanitizeEmail(req.body.email)

  if (!prenom || !nom) {
    req.session.flash = { error: req.t('error.first_name_last_name_required') }
    return res.redirect('/profile')
  }
  if (!email) {
    req.session.flash = { error: req.t('error.invalid_email') }
    return res.redirect('/profile')
  }

  if (email !== user.email) {
    const existing = userModel.findByEmail(email)
    if (existing && existing.id !== user.id) {
      req.session.flash = { error: req.t('error.email_already_used') }
      return res.redirect('/profile')
    }
  }

  const passwordComplexity = req.body.password_complexity === '1'
  settingsModel.setUserSetting(user.id, 'password_complexity', passwordComplexity ? '1' : '0')
  const updates = { prenom, nom, email }

  if (req.body.current_password && req.body.new_password) {
    if (req.body.new_password.length < 8) {
      req.session.flash = { error: req.t('error.new_password_min_length') }
      return res.redirect('/profile')
    }
    if (req.body.new_password !== req.body.new_password_confirm) {
      req.session.flash = { error: req.t('error.password_confirmation_mismatch') }
      return res.redirect('/profile')
    }
    if (passwordComplexity) {
      const { isValid } = getStrength(req.body.new_password)
      if (!isValid) {
        req.session.flash = { error: req.t('error.password_too_weak') }
        return res.redirect('/profile')
      }
    }
    const valid = await bcrypt.compare(req.body.current_password, user.password)
    if (!valid) {
      req.session.flash = { error: req.t('error.current_password_incorrect') }
      return res.redirect('/profile')
    }
    updates.password = await bcrypt.hash(req.body.new_password, 10)
  }

  userModel.update(user.id, updates)
  req.session.userName = `${prenom} ${nom}`
  req.session.userEmail = email
  log.info('Profile', `Profil mis à jour : ${email} (nom=${nom}, prenom=${prenom}, complexity=${passwordComplexity})`)
  if (req.body.new_password) {
    log.info('Profile', `Mot de passe changé pour ${email}`)
  }
  req.session.flash = { success: req.t('success.profile_updated') }
  res.redirect('/profile')
})

app.post('/profile/settings', (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login')
  const user = userModel.findById(req.session.userId)
  if (!user) return res.redirect('/logout')

  const debugMode = req.body.debug_mode === '1'
  settingsModel.set('log_level', debugMode ? 'DEBUG' : 'INFO')
  logger.invalidateCache()
  log.info('Settings', `Mode debug ${debugMode ? 'activé' : 'désactivé'} par ${user.email}`)
  req.session.flash = { success: debugMode ? req.t('success.debug_mode_enabled') : req.t('success.debug_mode_disabled') }
  res.redirect('/profile')
})

app.post('/profile/totp-generate', async (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login')
  const user = userModel.findById(req.session.userId)
  if (!user) return res.redirect('/logout')
  const secret = generateSecret()
  req.session.pendingTotpSecret = secret
  const otpauth = getOtpauthUrl(secret, user.email)
  const qrDataUrl = await toDataURL(otpauth)
  res.render('profile/totp-setup', {
    title: req.t('totp_setup.title'),
    secret,
    otpauth,
    qrDataUrl,
    email: user.email
  })
})

app.post('/profile/totp-enable', async (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login')
  if (!req.session.pendingTotpSecret) {
    req.session.flash = { error: req.t('error.no_pending_key') }
    return res.redirect('/profile')
  }
  const token = sanitize(req.body.totp_token)
  if (!token || !verifyToken(req.session.pendingTotpSecret, token)) {
    req.session.flash = { error: req.t('error.invalid_code') }
    return res.redirect('/profile')
  }
  const user = userModel.findById(req.session.userId)
  if (!user) return res.redirect('/logout')
  settingsModel.setUserSetting(user.id, '2fa_enabled', '1')
  settingsModel.setUserSetting(user.id, 'totp_secret', req.session.pendingTotpSecret)
  delete req.session.pendingTotpSecret
  log.info('Profile', `2FA activée pour ${user.email}`)
  req.session.flash = { success: req.t('success.2fa_enabled') }
  res.redirect('/profile')
})

app.post('/profile/totp-disable', async (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/auth/login')
  const user = userModel.findById(req.session.userId)
  if (!user) return res.redirect('/logout')
  const password = sanitize(req.body.current_password)
  if (!password) {
    req.session.flash = { error: req.t('error.enter_current_password') }
    return res.redirect('/profile')
  }
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    req.session.flash = { error: req.t('error.incorrect_password') }
    return res.redirect('/profile')
  }
  settingsModel.setUserSetting(user.id, '2fa_enabled', '0')
  settingsModel.setUserSetting(user.id, 'totp_secret', null)
  log.info('Profile', `2FA désactivée pour ${user.email}`)
  req.session.flash = { success: req.t('success.2fa_disabled') }
  res.redirect('/profile')
})

const AVAILABLE_LANGS = ['fr', 'en']

app.get('/profile/language', (req, res) => {
  const lang = req.query.lang
  if (!AVAILABLE_LANGS.includes(lang)) return res.redirect(req.get('Referer') || '/')
  if (req.i18n) req.i18n.changeLanguage(lang)
  res.cookie('i18next', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false })
  if (req.session && req.session.userId) {
    settingsModel.setUserSetting(req.session.userId, 'language', lang)
  }
  res.redirect(req.get('Referer') || '/')
})

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login')
  })
})

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
      lastHandshake: formatHandshake(ifaceLatestHs, req.t),
      totalRx: formatBytes(totalRx, req.t),
      totalTx: formatBytes(totalTx, req.t),
      routingOk: routing ? routing.allOk : null
    })
  }

  const activeInterfaces = enrichedInterfaces.filter((i) => i.active).length
  const routingOk = enrichedInterfaces.filter((i) => i.routingOk === true).length
  const routingKo = enrichedInterfaces.filter((i) => i.routingOk === false).length
  const routingNa = enrichedInterfaces.filter((i) => i.routingOk === null).length

  res.render('dashboard/index', {
    title: req.t('dashboard.title'),
    interfaces: enrichedInterfaces,
    hasInterfaces,
    stats: {
      activeInterfaces,
      totalInterfaces: interfaces.length,
      connectedPeers: totalConnectedPeers,
      totalPeers,
      totalTransferRx: formatBytes(totalTransferRx, req.t),
      totalTransferTx: formatBytes(totalTransferTx, req.t),
      latestHandshake: formatHandshake(latestHandshake, req.t)
    },
    routingSummary: {
      ok: routingOk,
      ko: routingKo,
      na: routingNa
    }
  })
})

app.use((req, res) => {
  res.status(404).render('errors/404', { title: req.t('error.404.title') })
})

app.use((err, req, res, next) => {
  log.error('Serveur', `Erreur non gérée : ${err.message} — ${req.method} ${req.path}`)
  console.error('Unhandled error:', err)
  res.status(500).render('errors/500', { title: req.t('error.500.title') })
})

module.exports = app

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`WireGuard-WUI running on http://localhost:${PORT}`)
    log.info('Serveur', `WireGuard-WUI démarré sur le port ${PORT}`)
    log.info('Serveur', `Niveau de log : ${logger.getLevel()}`)
  })
}
