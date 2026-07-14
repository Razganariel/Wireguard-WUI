const { exec } = require('child_process')
const util = require('util')
const fs = require('fs')
const path = require('path')
const execAsync = util.promisify(exec)

const interfaceModel = require('../models/interface')
const peerModel = require('../models/peer')

async function generateKeys() {
  const { stdout: privkey } = await execAsync('wg genkey')
  const privateKey = privkey.trim()
  const { stdout: pubkey } = await execAsync(`echo "${privateKey}" | wg pubkey`)
  const publicKey = pubkey.trim()
  return { privateKey, publicKey }
}

function buildConfig(iface) {
  const lines = [
    '[Interface]',
    `Address = ${iface.adresse_ip}`,
    `ListenPort = ${iface.port}`,
    `PrivateKey = ${iface.private_key}`,
    ''
  ]
  const peers = peerModel.findByInterfaceId(iface.id)
  for (const peer of peers) {
    lines.push(`# ${peer.nom}`)
    lines.push('[Peer]')
    lines.push(`PublicKey = ${peer.public_key}`)
    lines.push(`AllowedIPs = ${peer.allowed_ips}`)
    if (peer.preshared_key) {
      lines.push(`PresharedKey = ${peer.preshared_key}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function writeConfigFile(iface) {
  const configPath = `/etc/wireguard/${iface.nom}.conf`
  const configContent = buildConfig(iface)
  await execAsync(`echo '${configContent.replace(/'/g, "'\\''")}' | sudo tee ${configPath}`)
  return configPath
}

async function bringUp(nom) {
  await execAsync(`sudo wg-quick up ${nom}`)
}

async function bringDown(nom) {
  await execAsync(`sudo wg-quick down ${nom}`)
}

async function getStatus(nom) {
  try {
    const { stdout } = await execAsync(`sudo wg show ${nom} dump`)
    return parseDump(stdout)
  } catch (err) {
    return null
  }
}

async function getAllStatus() {
  try {
    const { stdout } = await execAsync('sudo wg show all dump')
    return parseAllDump(stdout)
  } catch (err) {
    return {}
  }
}

function parseDump(stdout) {
  const lines = stdout.trim().split('\n')
  if (lines.length === 0 || !lines[0]) return null

  const ifaceParts = lines[0].split('\t')
  const result = {
    interface: {
      publicKey: ifaceParts[0],
      listenPort: parseInt(ifaceParts[1], 10),
      privateKey: ifaceParts[2] ? ifaceParts[2] : ifaceParts[0],
      fwmark: ifaceParts[3]
    },
    peers: []
  }

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t')
    if (parts.length >= 8) {
      result.peers.push({
        publicKey: parts[0],
        presharedKey: parts[1],
        endpoint: parts[2],
        allowedIps: parts[3],
        latestHandshake: parseInt(parts[4], 10),
        transferRx: parseInt(parts[5], 10),
        transferTx: parseInt(parts[6], 10),
        persistentKeepalive: parseInt(parts[7], 10)
      })
    }
  }

  return result
}

function parseAllDump(stdout) {
  const lines = stdout.trim().split('\n')
  const result = {}
  let currentIface = null

  for (const line of lines) {
    const parts = line.split('\t')
    if (parts.length === 4 && !parts[0].includes(':')) {
      currentIface = parts[2] || `iface_${Object.keys(result).length}`
      result[currentIface] = { interface: { publicKey: parts[0], listenPort: parseInt(parts[1], 10) }, peers: [] }
    } else if (parts.length >= 8 && currentIface) {
      result[currentIface].peers.push({
        publicKey: parts[0],
        endpoint: parts[2],
        allowedIps: parts[3],
        latestHandshake: parseInt(parts[4], 10),
        transferRx: parseInt(parts[5], 10),
        transferTx: parseInt(parts[6], 10)
      })
    }
  }

  return result
}

async function initInterface(req, res) {
  const { nom, adresse_ip, port } = req.body

  if (!nom || !adresse_ip || !port) {
    req.session.flash = { error: 'Tous les champs sont obligatoires.' }
    return res.redirect('/interface')
  }

  if (interfaceModel.findAll().some((i) => i.nom === nom)) {
    req.session.flash = { error: `L'interface "${nom}" existe déjà.` }
    return res.redirect('/interface')
  }

  let privateKey = 'KEYGEN_FAILED_PLACEHOLDER'
  let publicKey = 'KEYGEN_FAILED_PLACEHOLDER'
  let keygenOk = true

  try {
    const keys = await generateKeys()
    privateKey = keys.privateKey
    publicKey = keys.publicKey
  } catch (err) {
    keygenOk = false
  }

  const id = interfaceModel.create({
    nom,
    private_key: privateKey,
    public_key: publicKey,
    adresse_ip,
    port: parseInt(port, 10)
  })

  if (!keygenOk) {
    req.session.flash = {
      error: `Interface "${nom}" créée en DB mais impossible de générer les clés (wg genkey). Vérifiez que WireGuard est installé.`
    }
    return res.redirect('/interface')
  }

  try {
    const iface = interfaceModel.findById(id)
    await writeConfigFile(iface)
    await bringUp(nom)
    interfaceModel.updateActive(id, true)
    req.session.flash = { success: `Interface "${nom}" initialisée et démarrée avec succès.` }
  } catch (wgErr) {
    req.session.flash = {
      error: `Interface créée en DB mais erreur WireGuard : ${wgErr.message}. Vérifiez que wg/wg-quick sont installés et sudo est configuré.`
    }
  }

  return res.redirect('/interface')
}

async function toggleInterface(req, res) {
  const id = req.params.id
  const iface = interfaceModel.findById(id)

  if (!iface) {
    req.session.flash = { error: 'Interface introuvable.' }
    return res.redirect('/interface')
  }

  try {
    if (iface.active) {
      await bringDown(iface.nom)
      interfaceModel.updateActive(id, false)
      req.session.flash = { success: `Interface "${iface.nom}" arrêtée.` }
    } else {
      await bringUp(iface.nom)
      interfaceModel.updateActive(id, true)
      req.session.flash = { success: `Interface "${iface.nom}" démarrée.` }
    }
  } catch (err) {
    req.session.flash = { error: `Erreur : ${err.message}` }
  }

  return res.redirect('/interface')
}

async function deleteInterface(req, res) {
  const id = req.params.id
  const iface = interfaceModel.findById(id)

  if (!iface) {
    req.session.flash = { error: 'Interface introuvable.' }
    return res.redirect('/interface')
  }

  try {
    if (iface.active) {
      await bringDown(iface.nom)
    }
    await execAsync(`sudo rm -f /etc/wireguard/${iface.nom}.conf`)
  } catch (err) {
    // best effort — continue with DB cleanup
  }

  interfaceModel.remove(id)
  req.session.flash = { success: `Interface "${iface.nom}" supprimée.` }
  return res.redirect('/interface')
}

module.exports = {
  initInterface,
  toggleInterface,
  deleteInterface,
  getStatus,
  getAllStatus
}
