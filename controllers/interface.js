const { exec } = require('child_process')
const util = require('util')
const fs = require('fs')
const os = require('os')
const path = require('path')
const execAsync = util.promisify(exec)
const sudo = require('../helpers/sudo')

const interfaceModel = require('../models/interface')
const peerModel = require('../models/peer')

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
  const tmpFile = path.join(os.tmpdir(), `wgconf_${iface.nom}_${Date.now()}.conf`)
  fs.writeFileSync(tmpFile, configContent)
  try {
    await sudo.exec(`cp ${tmpFile} ${configPath}`)
    await sudo.exec(`chmod 600 ${configPath}`)
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile)
    }
  }
  return configPath
}

async function bringUp(nom) {
  await sudo.exec(`wg-quick up ${nom}`)
}

async function bringDown(nom) {
  await sudo.exec(`wg-quick down ${nom}`)
}

async function getStatus(nom) {
  try {
    const { stdout } = await sudo.exec(`wg show ${nom} dump`)
    return parseDump(stdout)
  } catch (err) {
    return null
  }
}

async function getAllStatus() {
  try {
    const { stdout } = await sudo.exec('wg show all dump')
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

  if (!/^wg[0-9]+$/.test(nom)) {
    req.session.flash = { error: 'Le nom de l\'interface doit respecter le format wg0, wg1, etc.' }
    return res.redirect('/interface')
  }

  if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(adresse_ip)) {
    req.session.flash = { error: 'L\'adresse IP doit être au format CIDR (ex: 10.0.0.1/24).' }
    return res.redirect('/interface')
  }

  const portNum = parseInt(port, 10)
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    req.session.flash = { error: 'Le port doit être un nombre entre 1 et 65535.' }
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
    await sudo.exec(`rm -f /etc/wireguard/${iface.nom}.conf`)
  } catch (err) {
    // best effort — continue with DB cleanup
  }

  interfaceModel.remove(id)
  req.session.flash = { success: `Interface "${iface.nom}" supprimée.` }
  return res.redirect('/interface')
}

async function getSystemInterfaceNames() {
  try {
    if (!sudo.hasPassword()) return []
    const { stdout } = await sudo.exec('find /etc/wireguard -maxdepth 1 -name "*.conf" -exec basename {} .conf \\; 2>/dev/null; exit 0')
    return stdout.trim().split('\n').filter(Boolean)
  } catch (err) {
    return []
  }
}

function parseConfig(configContent) {
  const lines = configContent.split('\n')
  let privateKey = ''
  let adresse_ip = ''
  let port = 51820
  const peerEntries = []
  let currentPeer = null
  let pendingComment = ''
  let currentComment = ''

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (trimmed.startsWith('#')) {
      pendingComment = trimmed.slice(1).trim()
      continue
    }
    if (trimmed.startsWith('[')) {
      const section = trimmed.toLowerCase()
      if (section === '[peer]') {
        if (currentPeer) {
          peerEntries.push({ ...currentPeer, comment: currentComment })
        }
        currentPeer = {}
        currentComment = pendingComment
        pendingComment = ''
      } else if (section === '[interface]') {
        currentPeer = null
      }
      continue
    }
    if (!currentPeer) {
      const [key, ...vals] = trimmed.split('=')
      const val = vals.join('=').trim()
      switch (key.trim().toLowerCase()) {
        case 'privatekey':
          privateKey = val
          break
        case 'address':
          adresse_ip = val.split(',')[0].trim()
          break
        case 'listenport':
          port = parseInt(val, 10) || 51820
          break
      }
    } else {
      const [key, ...vals] = trimmed.split('=')
      const val = vals.join('=').trim()
      switch (key.trim().toLowerCase()) {
        case 'publickey':
          currentPeer.public_key = val
          break
        case 'presharedkey':
          currentPeer.preshared_key = val
          break
        case 'allowedips':
          currentPeer.allowed_ips = val
          break
        case 'persistentkeepalive':
          currentPeer.persistent_keepalive = parseInt(val, 10) || 25
          break
      }
    }
  }
  if (currentPeer && Object.keys(currentPeer).length > 0) {
    peerEntries.push({ ...currentPeer, comment: currentComment })
  }

  return { privateKey, adresse_ip, port, peerEntries }
}

function persistPeers(interfaceId, peerEntries) {
  const existingKeys = peerModel.findByInterfaceId(interfaceId).map((p) => p.public_key)
  let count = 0
  for (const entry of peerEntries) {
    if (!entry.public_key) continue
    if (existingKeys.includes(entry.public_key)) continue
    const ipFromAllowed = (entry.allowed_ips || '').split(',')[0].trim().split('/')[0]
    peerModel.create({
      interface_id: interfaceId,
      nom: entry.comment || `peer-${entry.public_key.slice(0, 8)}`,
      adresse_ip: ipFromAllowed || '0.0.0.0',
      public_key: entry.public_key,
      private_key: 'IMPORTED_FROM_SYSTEM',
      preshared_key: entry.preshared_key || null,
      allowed_ips: entry.allowed_ips || '0.0.0.0/0',
      dns: null,
      persistent_keepalive: entry.persistent_keepalive || 25
    })
    count++
  }
  return count
}

async function importInterface(nom) {
  const { stdout } = await sudo.exec(`cat /etc/wireguard/${nom}.conf`)
  const { privateKey, adresse_ip, port, peerEntries } = parseConfig(stdout)

  if (!privateKey || !adresse_ip) {
    throw new Error(`Impossible de parser la configuration de ${nom} : PrivateKey ou Address manquant.`)
  }

  let publicKey = 'IMPORT_FAILED'
  const tmpFile = path.join(os.tmpdir(), `wgimport_${nom}_${Date.now()}`)
  fs.writeFileSync(tmpFile, privateKey)
  try {
    const { stdout: pubout } = await execAsync(`wg pubkey < ${tmpFile}`)
    publicKey = pubout.trim()
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }

  let iface = interfaceModel.findAll().find((i) => i.nom === nom)
  let isNewInterface = false
  if (!iface) {
    const id = interfaceModel.create({
      nom,
      private_key: privateKey,
      public_key: publicKey,
      adresse_ip,
      port
    })
    iface = interfaceModel.findById(id)
    isNewInterface = true
  }

  const isActive = await getStatus(nom)
  if (isActive) interfaceModel.updateActive(iface.id, true)

  const importedPeerCount = persistPeers(iface.id, peerEntries)
  iface._importedPeerCount = importedPeerCount
  iface._isNewInterface = isNewInterface
  return iface
}

async function detectAndImportAll() {
  const names = await getSystemInterfaceNames()
  let importedIfaces = 0
  let importedPeers = 0
  for (const nom of names) {
    const existing = interfaceModel.findAll().find((i) => i.nom === nom)
    if (existing) continue
    const iface = await importInterface(nom)
    importedIfaces++
    importedPeers += iface._importedPeerCount
  }
  return { importedIfaces, importedPeers }
}

async function importPeersFromInterface(nom) {
  const iface = interfaceModel.findAll().find((i) => i.nom === nom)
  if (!iface) throw new Error(`Interface "${nom}" introuvable dans la base.`)

  const allPeers = []

  try {
    const { stdout } = await sudo.exec(`cat /etc/wireguard/${nom}.conf`)
    const { peerEntries } = parseConfig(stdout)
    allPeers.push(...peerEntries)
  } catch (err) {
    // config file might not exist or have no peers — fallback to runtime dump
  }

  try {
    const dump = await getStatus(nom)
    if (dump && dump.peers) {
      for (const p of dump.peers) {
        const already = allPeers.find((e) => e.public_key === p.publicKey)
        if (!already) {
          allPeers.push({
            public_key: p.publicKey,
            preshared_key: p.presharedKey || null,
            allowed_ips: p.allowedIps || '0.0.0.0/0',
            persistent_keepalive: p.persistentKeepalive || 25,
            comment: ''
          })
        }
      }
    }
  } catch (err) {
    // runtime dump unavailable
  }

  return persistPeers(iface.id, allPeers)
}

module.exports = {
  initInterface,
  toggleInterface,
  deleteInterface,
  getStatus,
  getAllStatus,
  getSystemInterfaceNames,
  importInterface,
  detectAndImportAll,
  importPeersFromInterface,
  writeConfigFile
}
