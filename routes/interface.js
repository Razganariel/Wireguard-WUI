const express = require('express')
const router = express.Router()
const interfaceController = require('../controllers/interface')
const interfaceModel = require('../models/interface')
const { isAuthenticated, requireSudoPassword } = require('../middlewares/auth')

router.use(isAuthenticated)

router.get('/', async (req, res) => {
  const interfaces = interfaceModel.findAll()

  let statuses = {}
  if (interfaces.length > 0) {
    try {
      statuses = await interfaceController.getAllStatus()
    } catch (err) {
      statuses = {}
    }
  }

  const enrichedInterfaces = interfaces.map((iface) => {
    const status = statuses[iface.nom]
    return {
      ...iface,
      status: status || null,
      peerCount: status ? status.peers.length : 0,
      connectedPeers: status
        ? status.peers.filter((p) => p.latestHandshake > 0).length
        : 0
    }
  })

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
    title: 'Interface WireGuard',
    interfaces: enrichedInterfaces2,
    hasInterfaces: interfaces.length > 0,
    systemInterfaces,
    sudoNotSet
  })
})

router.post('/', requireSudoPassword, interfaceController.initInterface)

router.post('/select', (req, res) => {
  const id = parseInt(req.body.interface_id, 10)
  const iface = interfaceModel.findById(id)
  if (iface) {
    req.session.selectedInterfaceId = id
  }
  const redirectUrl = req.body.redirect || '/peers'
  res.redirect(redirectUrl)
})

router.post('/:id/toggle', requireSudoPassword, interfaceController.toggleInterface)

router.post('/:id/edit', requireSudoPassword, interfaceController.editInterface)

router.post('/:id/delete', requireSudoPassword, interfaceController.deleteInterface)

router.post('/import/:name', requireSudoPassword, async (req, res) => {
  try {
    const iface = await interfaceController.importInterface(req.params.name)
    const peerMsg = iface._importedPeerCount > 0
      ? ` (${iface._importedPeerCount} pair${iface._importedPeerCount > 1 ? 's' : ''} importé${iface._importedPeerCount > 1 ? 's' : ''})`
      : ''
    const msg = iface._isNewInterface
      ? `Interface "${req.params.name}" importée avec succès${peerMsg}.`
      : `${iface._importedPeerCount} pair${iface._importedPeerCount > 1 ? 's' : ''} importé${iface._importedPeerCount > 1 ? 's' : ''} depuis "${req.params.name}".`
    req.session.flash = { success: msg }
  } catch (err) {
    req.session.flash = { error: `Import impossible : ${err.message}` }
  }
  res.redirect('/interface')
})

router.post('/detect', requireSudoPassword, async (req, res) => {
  try {
    const { importedIfaces, importedPeers } = await interfaceController.detectAndImportAll()
    if (importedIfaces === 0 && importedPeers === 0) {
      req.session.flash = { success: 'Aucune nouvelle interface ou pair détecté.' }
    } else {
      const parts = []
      if (importedIfaces > 0) parts.push(`${importedIfaces} interface${importedIfaces > 1 ? 's' : ''}`)
      if (importedPeers > 0) parts.push(`${importedPeers} pair${importedPeers > 1 ? 's' : ''}`)
      req.session.flash = { success: `Détection terminée : ${parts.join(' et ')} importé${parts.length > 1 ? 's' : ''}.` }
    }
  } catch (err) {
    req.session.flash = { error: `Erreur lors de la détection : ${err.message}` }
  }
  res.redirect('/interface')
})

module.exports = router
