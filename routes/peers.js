const express = require('express')
const router = express.Router()
const peerController = require('../controllers/peers')
const peerModel = require('../models/peer')
const interfaceModel = require('../models/interface')
const { isAuthenticated } = require('../middlewares/auth')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

router.use(isAuthenticated)

async function getPeerStatuses(nom) {
  try {
    const { stdout } = await execAsync(`sudo wg show ${nom} dump`)
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
      hasInterfaces: false
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

  res.render('peers/index', {
    title: 'Pairs',
    peers,
    interfaces,
    selectedInterface: selectedIface.id,
    selectedInterfaceName: selectedIface.nom,
    hasInterfaces: true
  })
})

router.post('/', peerController.createPeer)

router.post('/:id/delete', peerController.deletePeer)

router.get('/:id/config', peerController.downloadConfig)

module.exports = router
