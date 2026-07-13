const { exec } = require('child_process')
const util = require('util')
const fs = require('fs')
const os = require('os')
const path = require('path')
const execAsync = util.promisify(exec)
const sudo = require('../helpers/sudo')
const log = require('../helpers/logger')
const { sanitizeInt, sanitizePeerName, sanitizeIp, sanitizeAllowedIps, sanitizeDns } = require('../helpers/sanitize')

const peerModel = require('../models/peer')
const interfaceModel = require('../models/interface')
const interfaceController = require('./interface')

async function generateKeys() {
  log.debug('Peers', 'Génération de clés WireGuard pour un pair')
  const { stdout: privkey } = await execAsync('wg genkey')
  const privateKey = privkey.trim()
  const tmpFile = path.join(os.tmpdir(), `wgpriv_${Date.now()}`)
  fs.writeFileSync(tmpFile, privateKey)
  try {
    const { stdout: pubkey } = await execAsync(`wg pubkey < ${tmpFile}`)
    return { privateKey, publicKey: pubkey.trim() }
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile)
    }
  }
}

async function generatePresharedKey() {
  try {
    const { stdout } = await execAsync('wg genpsk')
    return stdout.trim()
  } catch (err) {
    return null
  }
}

async function addPeerToInterface(iface, peer) {
  log.debug('Peers', `Ajout du pair ${peer.public_key.slice(0, 8)}... à l'interface ${iface.nom}`)
  let cmd = `wg set ${iface.nom} peer ${peer.public_key} allowed-ips ${peer.adresse_ip}/32`
  let tmpFile = null
  if (peer.preshared_key) {
    tmpFile = path.join(os.tmpdir(), `wgpsk_${Date.now()}`)
    fs.writeFileSync(tmpFile, peer.preshared_key)
    cmd += ` preshared-key ${tmpFile}`
  }
  try {
    await sudo.exec(cmd)
    await interfaceController.writeConfigFile(iface)
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile)
    }
  }
}

async function createPeer(req, res) {
  const interface_id = sanitizeInt(req.body.interface_id)
  const nom = sanitizePeerName(req.body.nom)
  const adresse_ip = sanitizeIp(req.body.adresse_ip)
  const allowed_ips = req.body.allowed_ips ? sanitizeAllowedIps(req.body.allowed_ips) : '0.0.0.0/0'
  const dns = req.body.dns ? sanitizeDns(req.body.dns) : null
  const persistent_keepalive = sanitizeInt(req.body.persistent_keepalive) || 25

  if (!interface_id || !nom || !adresse_ip) {
    req.session.flash = { error: req.t('error.peer_required_fields') }
    return res.redirect(`/peers?interface=${interface_id || ''}`)
  }

  if (!adresse_ip) {
    req.session.flash = { error: req.t('error.ipv4_format') }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  if (!allowed_ips) {
    req.session.flash = { error: req.t('error.allowed_ips_cidr_format') }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  if (req.body.dns && !dns) {
    req.session.flash = { error: req.t('error.dns_ipv4') }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  const iface = interfaceModel.findById(interface_id)
  if (!iface) {
    req.session.flash = { error: req.t('error.interface_not_found') }
    return res.redirect('/peers')
  }

  const existing = peerModel.findByInterfaceId(iface.id)
  if (existing.some((p) => p.adresse_ip === adresse_ip)) {
    req.session.flash = { error: req.t('error.peer_ip_duplicate', { ip: adresse_ip }) }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  let privateKey = 'KEYGEN_FAILED_PLACEHOLDER'
  let publicKey = 'KEYGEN_FAILED_PLACEHOLDER'
  let presharedKey = null
  let keygenOk = true

  try {
    const keys = await generateKeys()
    privateKey = keys.privateKey
    publicKey = keys.publicKey
    presharedKey = await generatePresharedKey()
  } catch (err) {
    keygenOk = false
  }

  const peerData = {
    interface_id,
    nom,
    adresse_ip,
    public_key: publicKey,
    private_key: privateKey,
    preshared_key: presharedKey,
    allowed_ips,
    dns,
    persistent_keepalive
  }

  const id = peerModel.create(peerData)

  if (!keygenOk) {
    req.session.flash = {
      error: req.t('error.peer_keygen_failed', { nom })
    }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  try {
    await addPeerToInterface(iface, { ...peerData, public_key: publicKey })
  } catch (wgErr) {
    req.session.flash = {
      error: req.t('error.peer_wireguard_failed', { message: wgErr.message })
    }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  log.info('Peers', `Peer "${nom}" créé sur interface ${iface.nom} (ip=${adresse_ip})`)
  req.session.flash = { success: req.t('success.peer_created', { nom }) }
  return res.redirect(`/peers?interface=${interface_id}`)
}

async function editPeer(req, res) {
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

  const nom = sanitizePeerName(req.body.nom)
  const adresse_ip = sanitizeIp(req.body.adresse_ip)
  const allowed_ips = req.body.allowed_ips ? sanitizeAllowedIps(req.body.allowed_ips) : '0.0.0.0/0'
  const dns = req.body.dns ? sanitizeDns(req.body.dns) : null
  const persistent_keepalive = sanitizeInt(req.body.persistent_keepalive) || 25

  if (!nom || !adresse_ip) {
    req.session.flash = { error: req.t('error.name_ip_required') }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (!adresse_ip) {
    req.session.flash = { error: req.t('error.ipv4_format') }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (!allowed_ips) {
    req.session.flash = { error: req.t('error.allowed_ips_cidr_format') }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (req.body.dns && !dns) {
    req.session.flash = { error: req.t('error.dns_ipv4') }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (adresse_ip !== peer.adresse_ip) {
    const ifacePeers = peerModel.findByInterfaceId(peer.interface_id)
    if (ifacePeers.some((p) => p.id !== parseInt(id, 10) && p.adresse_ip === adresse_ip)) {
      req.session.flash = { error: req.t('error.ip_already_used', { ip: adresse_ip }) }
      return res.redirect(`/peers?interface=${peer.interface_id}`)
    }
  }

  const oldPeer = { ...peer }
  const iface = interfaceModel.findById(peer.interface_id)

  try {
    peerModel.update(id, { nom, adresse_ip, allowed_ips, dns, persistent_keepalive })

    if (iface && iface.active) {
      await interfaceController.writeConfigFile(iface)
      try {
        await interfaceController.syncConfig(iface.nom)
      } catch (syncErr) {
        peerModel.update(id, {
          nom: oldPeer.nom,
          adresse_ip: oldPeer.adresse_ip,
          allowed_ips: oldPeer.allowed_ips,
          dns: oldPeer.dns,
          persistent_keepalive: oldPeer.persistent_keepalive
        })
        await interfaceController.writeConfigFile(iface)
        req.session.flash = { error: req.t('error.peer_config_apply_failed', { message: syncErr.message }) }
        return res.redirect(`/peers?interface=${peer.interface_id}`)
      }
    }

    log.info('Peers', `Peer "${nom}" (id=${id}) mis à jour sur interface ${iface.nom}`)
    req.session.flash = { success: req.t('success.peer_updated', { nom }) }
  } catch (err) {
    log.error('Peers', `Édition peer id=${id} : ${err.message}`)
    req.session.flash = { error: req.t('error.generic', { message: err.message }) }
  }

  return res.redirect(`/peers?interface=${peer.interface_id}`)
}

async function deletePeer(req, res) {
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

  peerModel.remove(id)

  try {
    if (iface) {
      if (iface.active) {
        await sudo.exec(`wg set ${iface.nom} peer ${peer.public_key} remove`)
      }
      await interfaceController.writeConfigFile(iface)
    }
  } catch (err) {
    log.error('Peers', `Erreur lors de la suppression du pair "${peer.nom}" de WireGuard: ${err.message}`)
    req.session.flash = { error: req.t('error.generic', { message: err.message }) }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  log.info('Peers', `Peer "${peer.nom}" (id=${id}) supprimé`)
  req.session.flash = { success: req.t('success.peer_deleted', { nom: peer.nom }) }
  return res.redirect(`/peers?interface=${peer.interface_id}`)
}

function buildClientConfig(peer, iface) {
  const lines = [
    '[Interface]',
    `PrivateKey = ${peer.private_key}`,
    `Address = ${peer.adresse_ip}/32`,
    `DNS = ${peer.dns || '1.1.1.1'}`,
    '',
    '[Peer]',
    `PublicKey = ${iface.public_key}`,
      `Endpoint = ${iface.endpoint ? `${iface.endpoint}:${iface.port}` : `${iface.adresse_ip.split('/')[0]}:${iface.port}`}`,
    `AllowedIPs = ${peer.allowed_ips}`,
    `PersistentKeepalive = ${peer.persistent_keepalive}`
  ]
  if (peer.preshared_key) {
    lines.splice(lines.indexOf('[Peer]') + 1, 0, `PresharedKey = ${peer.preshared_key}`)
  }
  return lines.join('\n')
}

async function downloadConfig(req, res) {
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
  if (!iface) {
    req.session.flash = { error: req.t('error.interface_not_found') }
    return res.redirect('/peers')
  }
  const config = buildClientConfig(peer, iface)
  const filename = `${peer.nom}.conf`

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(config)
}

module.exports = {
  createPeer,
  editPeer,
  deletePeer,
  downloadConfig,
  buildClientConfig
}
