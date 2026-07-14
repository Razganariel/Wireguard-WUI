const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

const peerModel = require('../models/peer')
const interfaceModel = require('../models/interface')

async function generateKeys() {
  const { stdout: privkey } = await execAsync('wg genkey')
  const privateKey = privkey.trim()
  const { stdout: pubkey } = await execAsync(`echo "${privateKey}" | wg pubkey`)
  const publicKey = pubkey.trim()
  return { privateKey, publicKey }
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
  let cmd = `sudo wg set ${iface.nom} peer ${peer.public_key} allowed-ips ${peer.adresse_ip}/32`
  if (peer.preshared_key) {
    cmd += ` preshared-key <(echo "${peer.preshared_key}")`
  }
  await execAsync(cmd)
  await execAsync(`sudo wg-quick save ${iface.nom}`)
}

async function removePeerFromInterface(iface, publicKey) {
  await execAsync(`sudo wg set ${iface.nom} peer ${publicKey} remove`)
  await execAsync(`sudo wg-quick save ${iface.nom}`)
}

async function createPeer(req, res) {
  const { interface_id, nom, adresse_ip, allowed_ips, dns, persistent_keepalive } = req.body

  if (!interface_id || !nom || !adresse_ip) {
    req.session.flash = { error: 'Interface, nom et adresse IP sont obligatoires.' }
    return res.redirect(`/peers?interface=${interface_id || ''}`)
  }

  const iface = interfaceModel.findById(interface_id)
  if (!iface) {
    req.session.flash = { error: 'Interface introuvable.' }
    return res.redirect('/peers')
  }

  const existing = peerModel.findByInterfaceId(iface.id)
  if (existing.some((p) => p.adresse_ip === adresse_ip)) {
    req.session.flash = { error: `Un peer avec l'adresse IP ${adresse_ip} existe déjà sur cette interface.` }
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
    interface_id: parseInt(interface_id, 10),
    nom,
    adresse_ip,
    public_key: publicKey,
    private_key: privateKey,
    preshared_key: presharedKey,
    allowed_ips: allowed_ips || '0.0.0.0/0',
    dns: dns || null,
    persistent_keepalive: parseInt(persistent_keepalive, 10) || 25
  }

  const id = peerModel.create(peerData)

  if (!keygenOk) {
    req.session.flash = {
      error: `Peer "${nom}" créé en DB mais impossible de générer les clés (wg genkey). Vérifiez que WireGuard est installé.`
    }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  try {
    await addPeerToInterface(iface, { ...peerData, public_key: publicKey })
  } catch (wgErr) {
    req.session.flash = {
      error: `Peer créé en DB mais erreur WireGuard : ${wgErr.message}. Vérifiez que l'interface est active et sudo configuré.`
    }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  req.session.flash = { success: `Peer "${nom}" ajouté avec succès.` }
  return res.redirect(`/peers?interface=${interface_id}`)
}

async function deletePeer(req, res) {
  const id = req.params.id
  const peer = peerModel.findById(id)

  if (!peer) {
    req.session.flash = { error: 'Peer introuvable.' }
    return res.redirect('/peers')
  }

  const iface = interfaceModel.findById(peer.interface_id)

  try {
    if (iface && iface.active) {
      await removePeerFromInterface(iface, peer.public_key)
    }
  } catch (err) {
    // best effort — still remove from DB
  }

  peerModel.remove(id)
  req.session.flash = { success: `Peer "${peer.nom}" supprimé.` }
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
    `Endpoint = ${iface.adresse_ip.split('/')[0]}:${iface.port}`,
    `AllowedIPs = ${peer.allowed_ips}`,
    `PersistentKeepalive = ${peer.persistent_keepalive}`
  ]
  if (peer.preshared_key) {
    lines.splice(lines.indexOf('[Peer]') + 1, 0, `PresharedKey = ${peer.preshared_key}`)
  }
  return lines.join('\n')
}

async function downloadConfig(req, res) {
  const id = req.params.id
  const peer = peerModel.findById(id)

  if (!peer) {
    req.session.flash = { error: 'Peer introuvable.' }
    return res.redirect('/peers')
  }

  const iface = interfaceModel.findById(peer.interface_id)
  const config = buildClientConfig(peer, iface)
  const filename = `${peer.nom}.conf`

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(config)
}

module.exports = {
  createPeer,
  deletePeer,
  downloadConfig,
  buildClientConfig
}
