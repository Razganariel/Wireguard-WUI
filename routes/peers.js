const express = require('express')
const router = express.Router()
const peerController = require('../controllers/peers')
const interfaceController = require('../controllers/interface')
const peerModel = require('../models/peer')
const interfaceModel = require('../models/interface')
const { isAuthenticated, requireSudoPassword } = require('../middlewares/auth')
const sudo = require('../helpers/sudo')
const qrcode = require('../helpers/qrcode')
const { sanitizeInt } = require('../helpers/sanitize')
const { formatHandshake, formatBytes } = require('../helpers/format')

router.use(isAuthenticated)

async function getPeerStatuses(nom) {
  try {
    const { stdout } = await sudo.exec(`wg show ${nom} dump`)
    const lines = stdout.trim().split('\n')
    const statuses = {}
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t')
      if (parts.length >= 8) {
        statuses[parts[0]] = {
          endpoint: parts[2],
          latestHandshake: parseInt(parts[4], 10),
          transferRx: parseInt(parts[5], 10),
          transferTx: parseInt(parts[6], 10)
        }
      }
    }
    return statuses
  } catch (err) {
    return {}
  }
}

router.get('/', async (req, res) => {
  const interfaceId = sanitizeInt(req.query.interface)
  let interfaces = interfaceModel.findAll()

  if (interfaces.length === 0) {
    return res.render('peers/index', {
      title: req.t('peers.title'),
      peers: [],
      interfaces: [],
      selectedInterface: null,
      hasInterfaces: false,
      qrcodeAvailable: qrcode.isAvailable()
    })
  }

  let selectedIface = null
  if (interfaceId) {
    selectedIface = interfaceModel.findById(interfaceId)
    if (selectedIface) {
      req.session.selectedInterfaceId = selectedIface.id
    }
  }
  if (!selectedIface && req.session.selectedInterfaceId) {
    selectedIface = interfaceModel.findById(req.session.selectedInterfaceId)
  }
  if (!selectedIface) {
    selectedIface = interfaces[0]
  }

  let peers = peerModel.findByInterfaceId(selectedIface.id)

  const statuses = await getPeerStatuses(selectedIface.nom)

  peers = peers.map((peer) => {
    const status = statuses[peer.public_key]
    return {
      ...peer,
      endpoint: status ? status.endpoint : '—',
      handshake: status ? formatHandshake(status.latestHandshake, req.t) : null,
      handshakeRaw: status ? status.latestHandshake : 0,
      transferRx: status ? formatBytes(status.transferRx, req.t) : '—',
      transferTx: status ? formatBytes(status.transferTx, req.t) : '—',
      isConnected: status ? status.latestHandshake > 0 : false
    }
  })

  const interfaceList = interfaces.map((iface) => ({
    id: iface.id,
    nom: iface.nom,
    active: iface.active,
    peerCount: peerModel.findByInterfaceId(iface.id).length
  }))

  const ifaceIp = selectedIface.adresse_ip || ''
  const ifaceMatch = ifaceIp.match(/^(\d+)\.(\d+)\.(\d+)\.\d+\/(\d+)$/)
  let suggestedPeerIp = ''
  if (ifaceMatch) {
    const base = `${ifaceMatch[1]}.${ifaceMatch[2]}.${ifaceMatch[3]}`
    const usedIps = new Set(peers.map((p) => p.adresse_ip))
    for (let i = 2; i < 255; i++) {
      const candidate = `${base}.${i}`
      if (!usedIps.has(candidate)) {
        suggestedPeerIp = candidate
        break
      }
    }
  }

  res.render('peers/index', {
    title: req.t('peers.title'),
    peers,
    interfaces,
    interfaceList,
    selectedInterface: selectedIface.id,
    selectedInterfaceName: selectedIface.nom,
    hasInterfaces: true,
    qrcodeAvailable: qrcode.isAvailable(),
    suggestedPeerIp
  })
})

router.post('/detect', requireSudoPassword, async (req, res) => {
  const ifaceId = req.session.selectedInterfaceId
  if (!ifaceId) {
    req.session.flash = { error: req.t('error.no_interface_selected') }
    return res.redirect('/peers')
  }
  const iface = interfaceModel.findById(ifaceId)
  if (!iface) {
    req.session.flash = { error: req.t('error.interface_not_found') }
    return res.redirect('/peers')
  }
  try {
    const count = await interfaceController.importPeersFromInterface(iface.nom)
    if (count > 0) {
      req.session.flash = { success: req.t('success.peers_detected', { count, nom: iface.nom }) }
    } else {
      req.session.flash = { success: req.t('success.no_new_peers') }
    }
  } catch (err) {
    req.session.flash = { error: req.t('error.generic', { message: err.message }) }
  }
  res.redirect('/peers')
})

router.post('/', requireSudoPassword, peerController.createPeer)

router.post('/:id/edit', requireSudoPassword, peerController.editPeer)

router.post('/:id/delete', requireSudoPassword, peerController.deletePeer)

router.get('/:id/config', peerController.downloadConfig)

router.get('/:id/qrcode', isAuthenticated, async (req, res) => {
  if (!qrcode.isAvailable()) {
    req.session.flash = { error: req.t('error.qrcode_not_available') }
    return res.redirect('/peers')
  }
  const id = sanitizeInt(req.params.id)
  if (!id) {
    req.session.flash = { error: req.t('error.invalid_peer_id') }
    return res.redirect('/peers')
  }
  const peer = peerModel.findById(id)
  if (!peer) {
    req.session.flash = { error: req.t('error.peer_not_found') }
    return res.redirect('/peers')
  }
  const iface = interfaceModel.findById(peer.interface_id)
  const config = peerController.buildClientConfig(peer, iface)
  try {
    const dataUrl = await qrcode.toDataURL(config)
    res.render('peers/qrcode', {
      title: req.t('qrcode.title', { nom: peer.nom }),
      qrDataUrl: dataUrl,
      peerName: peer.nom
    })
  } catch (err) {
    req.session.flash = { error: req.t('error.qrcode_generation_failed') }
    res.redirect('/peers')
  }
})

module.exports = router
