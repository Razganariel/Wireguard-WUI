const express = require('express')
const router = express.Router()
const peerController = require('../controllers/peers')
const interfaceController = require('../controllers/interface')
const peerModel = require('../models/peer')
const interfaceModel = require('../models/interface')
const { isAuthenticated, requireSudoPassword } = require('../middlewares/auth')
const sudo = require('../helpers/sudo')
const qrcode = require('../helpers/qrcode')

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
  if (diff < 60) return 'il y a quelques secondes'
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

router.get('/', async (req, res) => {
  const interfaceId = req.query.interface
  let interfaces = interfaceModel.findAll()

  if (interfaces.length === 0) {
    return res.render('peers/index', {
      title: 'Pairs',
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
      handshake: status ? formatHandshake(status.latestHandshake) : null,
      handshakeRaw: status ? status.latestHandshake : 0,
      transferRx: status ? formatBytes(status.transferRx) : '—',
      transferTx: status ? formatBytes(status.transferTx) : '—',
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
    title: 'Pairs',
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
    req.session.flash = { error: 'Aucune interface sélectionnée.' }
    return res.redirect('/peers')
  }
  const iface = interfaceModel.findById(ifaceId)
  if (!iface) {
    req.session.flash = { error: 'Interface introuvable.' }
    return res.redirect('/peers')
  }
  try {
    const count = await interfaceController.importPeersFromInterface(iface.nom)
    if (count > 0) {
      req.session.flash = { success: `${count} pair${count > 1 ? 's' : ''} importé${count > 1 ? 's' : ''} depuis "${iface.nom}".` }
    } else {
      req.session.flash = { success: 'Aucun nouveau pair détecté.' }
    }
  } catch (err) {
    req.session.flash = { error: `Erreur : ${err.message}` }
  }
  res.redirect('/peers')
})

router.post('/', requireSudoPassword, peerController.createPeer)

router.post('/:id/edit', requireSudoPassword, peerController.editPeer)

router.post('/:id/delete', requireSudoPassword, peerController.deletePeer)

router.get('/:id/config', peerController.downloadConfig)

router.get('/:id/qrcode', isAuthenticated, async (req, res) => {
  if (!qrcode.isAvailable()) {
    req.session.flash = { error: 'qrcode non disponible. Installez-le avec : npm install qrcode' }
    return res.redirect('/peers')
  }
  const peer = peerModel.findById(req.params.id)
  if (!peer) {
    req.session.flash = { error: 'Pair introuvable.' }
    return res.redirect('/peers')
  }
  const iface = interfaceModel.findById(peer.interface_id)
  const config = peerController.buildClientConfig(peer, iface)
  try {
    const dataUrl = await qrcode.toDataURL(config)
    res.render('peers/qrcode', {
      title: `QR Code — ${peer.nom}`,
      qrDataUrl: dataUrl,
      peerName: peer.nom
    })
  } catch (err) {
    req.session.flash = { error: 'Erreur lors de la génération du QR code.' }
    res.redirect('/peers')
  }
})

module.exports = router
