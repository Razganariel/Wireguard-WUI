const express = require('express')
const router = express.Router()
const interfaceController = require('../controllers/interface')
const interfaceModel = require('../models/interface')
const { isAuthenticated } = require('../middlewares/auth')

router.use(isAuthenticated)

router.get('/', async (req, res) => {
  const interfaces = interfaceModel.findAll()

  let statuses = {}
  if (interfaces.length > 0) {
    try {
      const { getAllStatus } = require('../controllers/interface')
      statuses = await getAllStatus()
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

  res.render('interface/index', {
    title: 'Interface WireGuard',
    interfaces: enrichedInterfaces,
    hasInterfaces: interfaces.length > 0
  })
})

router.post('/', interfaceController.initInterface)

router.post('/:id/toggle', interfaceController.toggleInterface)

router.post('/:id/delete', interfaceController.deleteInterface)

module.exports = router
