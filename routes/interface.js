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

router.post('/:id/delete', requireSudoPassword, interfaceController.deleteInterface)

module.exports = router
