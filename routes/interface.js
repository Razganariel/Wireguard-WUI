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
  try {
    const names = await interfaceController.getSystemInterfaceNames()
    const dbNames = interfaces.map((i) => i.nom)
    systemInterfaces = names.filter((n) => !dbNames.includes(n))
  } catch (err) {
    systemInterfaces = []
  }

  res.render('interface/index', {
    title: 'Interface WireGuard',
    interfaces: enrichedInterfaces,
    hasInterfaces: interfaces.length > 0,
    systemInterfaces
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

router.post('/import/:name', requireSudoPassword, async (req, res) => {
  try {
    await interfaceController.importInterface(req.params.name)
    req.session.flash = { success: `Interface "${req.params.name}" importée avec succès.` }
  } catch (err) {
    req.session.flash = { error: `Import impossible : ${err.message}` }
  }
  res.redirect('/interface')
})

module.exports = router
