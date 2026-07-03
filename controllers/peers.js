const { exec } = require('child_process')
const util = require('util')
const fs = require('fs')
const os = require('os')
const path = require('path')
const execAsync = util.promisify(exec)
const sudo = require('../helpers/sudo')

const peerModel = require('../models/peer')
const interfaceModel = require('../models/interface')
const interfaceController = require('./interface')

async function generateKeys() {
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

async function removePeerFromInterface(iface, publicKey) {
  await sudo.exec(`wg set ${iface.nom} peer ${publicKey} remove`)
  await interfaceController.writeConfigFile(iface)
}

async function createPeer(req, res) {
  const { interface_id, nom, adresse_ip, allowed_ips, dns, persistent_keepalive } = req.body

  if (!interface_id || !nom || !adresse_ip) {
    req.session.flash = { error: 'Interface, nom et adresse IP sont obligatoires.' }
    return res.redirect(`/peers?interface=${interface_id || ''}`)
  }

  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(adresse_ip)) {
    req.session.flash = { error: 'L\'adresse IP doit être au format IPv4 (ex: 10.0.0.2).' }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  if (allowed_ips && !/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}(,\s*(\d{1,3}\.){3}\d{1,3}\/\d{1,2})*$/.test(allowed_ips)) {
    req.session.flash = { error: 'Allowed IPs doit être au format CIDR (ex: 0.0.0.0/0).' }
    return res.redirect(`/peers?interface=${interface_id}`)
  }

  if (dns && !/^(\d{1,3}\.){3}\d{1,3}$/.test(dns)) {
    req.session.flash = { error: 'Le DNS doit être une adresse IPv4 valide.' }
    return res.redirect(`/peers?interface=${interface_id}`)
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

async function editPeer(req, res) {
  const id = req.params.id
  const peer = peerModel.findById(id)
  if (!peer) {
    req.session.flash = { error: 'Pair introuvable.' }
    return res.redirect('/peers')
  }

  const { nom, adresse_ip, allowed_ips, dns, persistent_keepalive } = req.body

  if (!nom || !adresse_ip) {
    req.session.flash = { error: 'Nom et adresse IP sont obligatoires.' }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(adresse_ip)) {
    req.session.flash = { error: 'L\'adresse IP doit être au format IPv4 (ex: 10.0.0.2).' }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (allowed_ips && !/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}(,\s*(\d{1,3}\.){3}\d{1,3}\/\d{1,2})*$/.test(allowed_ips)) {
    req.session.flash = { error: 'Allowed IPs doit être au format CIDR (ex: 0.0.0.0/0).' }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (dns && !/^(\d{1,3}\.){3}\d{1,3}$/.test(dns)) {
    req.session.flash = { error: 'Le DNS doit être une adresse IPv4 valide.' }
    return res.redirect(`/peers?interface=${peer.interface_id}`)
  }

  if (adresse_ip !== peer.adresse_ip) {
    const ifacePeers = peerModel.findByInterfaceId(peer.interface_id)
    if (ifacePeers.some((p) => p.id !== parseInt(id, 10) && p.adresse_ip === adresse_ip)) {
      req.session.flash = { error: `L'adresse IP ${adresse_ip} est déjà utilisée sur cette interface.` }
      return res.redirect(`/peers?interface=${peer.interface_id}`)
    }
  }

  const oldPeer = { ...peer }
  const iface = interfaceModel.findById(peer.interface_id)

  try {
    peerModel.update(id, {
      nom,
      adresse_ip,
      allowed_ips: allowed_ips || '0.0.0.0/0',
      dns: dns || null,
      persistent_keepalive: parseInt(persistent_keepalive, 10) || 25
    })

    if (iface && iface.active) {
      await interfaceController.writeConfigFile(iface)
      try {
        await sudo.exec(`wg syncconf ${iface.nom} /etc/wireguard/${iface.nom}.conf`)
      } catch (syncErr) {
        peerModel.update(id, {
          nom: oldPeer.nom,
          adresse_ip: oldPeer.adresse_ip,
          allowed_ips: oldPeer.allowed_ips,
          dns: oldPeer.dns,
          persistent_keepalive: oldPeer.persistent_keepalive
        })
        await interfaceController.writeConfigFile(iface)
        req.session.flash = { error: `Erreur lors de l'application : ${syncErr.message}. Modifications annulées.` }
        return res.redirect(`/peers?interface=${peer.interface_id}`)
      }
    }

    req.session.flash = { success: `Pair "${nom}" mis à jour.` }
  } catch (err) {
    req.session.flash = { error: `Erreur : ${err.message}` }
  }

  return res.redirect(`/peers?interface=${peer.interface_id}`)
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
  editPeer,
  deletePeer,
  downloadConfig,
  buildClientConfig
}
