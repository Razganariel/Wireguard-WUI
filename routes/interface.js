const express = require('express')
const router = express.Router()
const interfaceController = require('../controllers/interface')
const interfaceModel = require('../models/interface')
const { isAuthenticated, requireSudoPassword } = require('../middlewares/auth')
const { sanitizeInt, sanitizeInterfaceName } = require('../helpers/sanitize')

router.use(isAuthenticated)

router.get('/', async (req, res) => {
  const interfaces = interfaceModel.findAll()

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  const enrichedInterfaces = []
  for (const iface of interfaces) {
    let status = null
    if (req.session.sudoPassword) {
      try { status = await interfaceController.getStatus(iface.nom) } catch (e) {}
    }
    let totalRx = 0, totalTx = 0
    if (status && status.peers) {
      for (const p of status.peers) {
        totalRx += p.transferRx || 0
        totalTx += p.transferTx || 0
      }
    }
    enrichedInterfaces.push({
      ...iface,
      status: status || null,
      peerCount: status ? status.peers.length : 0,
      connectedPeers: status
        ? status.peers.filter((p) => p.latestHandshake > 0).length
        : 0,
      totalRx: formatBytes(totalRx),
      totalTx: formatBytes(totalTx)
    })
  }

  let systemInterfaces = []
  let sudoNotSet = false
  if (req.session.sudoPassword) {
    try {
      const names = await interfaceController.getSystemInterfaceNames()
      const dbNames = interfaces.map((i) => i.nom)
      systemInterfaces = names.filter((n) => !dbNames.includes(n))
    } catch (err) {
      systemInterfaces = []
    }
  } else {
    sudoNotSet = true
  }

  const enrichedInterfaces2 = []
  for (const iface of enrichedInterfaces) {
    let routing = null
    if (req.session.sudoPassword && iface.active) {
      try {
        routing = await interfaceController.getRoutingInfo(iface.nom, iface.adresse_ip)
      } catch (err) {
        routing = null
      }
    }
    enrichedInterfaces2.push({ ...iface, routing })
  }

  res.render('interface/index', {
    title: req.t('interface.title'),
    interfaces: enrichedInterfaces2,
    hasInterfaces: interfaces.length > 0,
    systemInterfaces,
    sudoNotSet
  })
})

router.post('/', requireSudoPassword, interfaceController.initInterface)

router.post('/select', (req, res) => {
  const id = sanitizeInt(req.body.interface_id)
  const iface = interfaceModel.findById(id)
  if (iface) {
    req.session.selectedInterfaceId = id
  }
  const allowedRedirects = ['/peers', '/interface']
  const redirectUrl = allowedRedirects.includes(req.body.redirect) ? req.body.redirect : '/peers'
  res.redirect(redirectUrl)
})

router.post('/:id/toggle', requireSudoPassword, interfaceController.toggleInterface)

router.post('/:id/edit', requireSudoPassword, interfaceController.editInterface)

router.post('/:id/delete', requireSudoPassword, interfaceController.deleteInterface)

router.post('/import/:name', requireSudoPassword, async (req, res) => {
  const name = sanitizeInterfaceName(req.params.name)
  if (!name) {
    req.session.flash = { error: req.t('error.invalid_interface_name') }
    return res.redirect('/interface')
  }
  try {
    const iface = await interfaceController.importInterface(name)
    if (iface._isNewInterface) {
      req.session.flash = { success: req.t('success.interface_imported', { nom: name }) }
    }
    if (iface._importedPeerCount > 0) {
      req.session.flash = { success: req.t('success.peers_imported_from', { count: iface._importedPeerCount, nom: name }) }
    }
  } catch (err) {
    req.session.flash = { error: req.t('error.import_failed', { message: err.message }) }
  }
  res.redirect('/interface')
})

router.post('/detect', requireSudoPassword, async (req, res) => {
  try {
    const { importedIfaces, importedPeers } = await interfaceController.detectAndImportAll()
    if (importedIfaces === 0 && importedPeers === 0) {
      req.session.flash = { success: req.t('success.no_new_interfaces') }
    } else {
      const parts = []
      if (importedIfaces > 0) parts.push(req.t('interface.unit_iface', { count: importedIfaces }))
      if (importedPeers > 0) parts.push(req.t('interface.unit_peer', { count: importedPeers }))
      req.session.flash = { success: req.t('success.detection_complete', { details: parts.join(', ') }) }
    }
  } catch (err) {
    req.session.flash = { error: req.t('error.detection_failed', { message: err.message }) }
  }
  res.redirect('/interface')
})

module.exports = router
