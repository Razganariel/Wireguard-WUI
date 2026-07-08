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

async function getFirewallType() {
  try {
    const { stdout } = await execAsync('which ufw 2>/dev/null')
    if (stdout.trim()) return 'ufw'
  } catch (e) {}
  try {
    const { stdout } = await execAsync('which firewall-cmd 2>/dev/null')
    if (stdout.trim()) return 'firewalld'
  } catch (e) {}
  return 'iptables'
}

async function checkRuleExists(args) {
  try {
    await sudo.exec(`iptables ${args} 2>/dev/null`)
    return true
  } catch (e) {
    return false
  }
}

async function getRoutingInfo(nom, adresse_ip) {
  const phy = await getPhyInterface()
  const subnet = netmaskFromCIDR(adresse_ip)
  const fwType = await getFirewallType()

  let masqOk = false
  let fwdOk = false
  let fwdOutOk = false

  if (fwType === 'firewalld') {
    try {
      const { stdout } = await sudo.exec(`firewall-cmd --query-rich-rule='rule family="ipv4" source address="${subnet}" masquerade'`)
      masqOk = stdout.trim() === 'yes'
    } catch (e) { masqOk = false }
    try {
      const { stdout } = await sudo.exec(`firewall-cmd --direct --query-rule ipv4 filter FORWARD -i ${nom} -o ${phy} -j ACCEPT`)
      fwdOk = stdout.trim() === 'yes'
    } catch (e) { fwdOk = false }
    try {
      const { stdout } = await sudo.exec(`firewall-cmd --direct --query-rule ipv4 filter FORWARD -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`)
      fwdOutOk = stdout.trim() === 'yes'
    } catch (e) { fwdOutOk = false }
  } else {
    masqOk = await checkRuleExists(`-t nat -C POSTROUTING -s ${subnet} -o ${phy} -j MASQUERADE`)
    fwdOk = await checkRuleExists(`-C FORWARD -i ${nom} -o ${phy} -j ACCEPT`)
    fwdOutOk = await checkRuleExists(`-C FORWARD -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`)
  }

  let firewallCmds = []
  if (fwType === 'firewalld') {
    firewallCmds = [
      `sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="${subnet}" masquerade'`,
      `sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -i ${nom} -o ${phy} -j ACCEPT`,
      `sudo firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`,
      `sudo firewall-cmd --reload`
    ]
  }

  return {
    nom,
    subnet,
    phy,
    masquerade: masqOk,
    forwardIn: fwdOk,
    forwardOut: fwdOutOk,
    allOk: masqOk && fwdOk && fwdOutOk,
    firewallType: fwType,
    firewallCmds,
    iptablesCmds: [
      `sudo iptables -t nat -A POSTROUTING -s ${subnet} -o ${phy} -j MASQUERADE`,
      `sudo iptables -A FORWARD -i ${nom} -o ${phy} -j ACCEPT`,
      `sudo iptables -A FORWARD -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`
    ]
  }
}

async function getPhyInterface() {
  const { stdout } = await execAsync('ip -4 route show default')
  const parts = stdout.trim().split(/\s+/)
  return parts[4] || 'eth0'
}

function netmaskFromCIDR(cidr) {
  const m = parseInt(cidr.split('/')[1], 10)
  let mask = 0xffffffff << (32 - m)
  const ip = cidr.split('/')[0].split('.').map(Number)
  const net = [(ip[0] << 24 | ip[1] << 16 | ip[2] << 8 | ip[3]) & mask]
  const a = (net[0] >>> 24) & 0xff
  const b = (net[0] >>> 16) & 0xff
  const c = (net[0] >>> 8) & 0xff
  const d = net[0] & 0xff
  return `${a}.${b}.${c}.${d}/${m}`
}

async function addRoutingRules(nom, adresse_ip) {
  const phy = await getPhyInterface()
  const subnet = netmaskFromCIDR(adresse_ip)
  const fwType = await getFirewallType()

  if (fwType === 'firewalld') {
    try { await sudo.exec(`firewall-cmd --permanent --remove-rich-rule='rule family="ipv4" source address="${subnet}" masquerade'`) } catch (e) {}
    try { await sudo.exec(`firewall-cmd --permanent --direct --remove-rule ipv4 filter FORWARD 0 -i ${nom} -o ${phy} -j ACCEPT`) } catch (e) {}
    try { await sudo.exec(`firewall-cmd --permanent --direct --remove-rule ipv4 filter FORWARD 0 -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`) } catch (e) {}
    await sudo.exec(`firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="${subnet}" masquerade'`)
    await sudo.exec(`firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -i ${nom} -o ${phy} -j ACCEPT`)
    await sudo.exec(`firewall-cmd --permanent --direct --add-rule ipv4 filter FORWARD 0 -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`)
    await sudo.exec('firewall-cmd --reload')
  } else {
    try { await sudo.exec(`iptables -t nat -D POSTROUTING -s ${subnet} -o ${phy} -j MASQUERADE 2>/dev/null`) } catch (e) {}
    try { await sudo.exec(`iptables -D FORWARD -i ${nom} -o ${phy} -j ACCEPT 2>/dev/null`) } catch (e) {}
    try { await sudo.exec(`iptables -D FORWARD -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null`) } catch (e) {}
    await sudo.exec(`iptables -t nat -A POSTROUTING -s ${subnet} -o ${phy} -j MASQUERADE`)
    await sudo.exec(`iptables -A FORWARD -i ${nom} -o ${phy} -j ACCEPT`)
    await sudo.exec(`iptables -A FORWARD -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`)
  }
}

async function removeRoutingRules(nom, adresse_ip) {
  const phy = await getPhyInterface()
  const subnet = netmaskFromCIDR(adresse_ip)
  const fwType = await getFirewallType()

  if (fwType === 'firewalld') {
    try { await sudo.exec(`firewall-cmd --permanent --remove-rich-rule='rule family="ipv4" source address="${subnet}" masquerade'`) } catch (e) {}
    try { await sudo.exec(`firewall-cmd --permanent --direct --remove-rule ipv4 filter FORWARD 0 -i ${nom} -o ${phy} -j ACCEPT`) } catch (e) {}
    try { await sudo.exec(`firewall-cmd --permanent --direct --remove-rule ipv4 filter FORWARD 0 -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`) } catch (e) {}
    await sudo.exec('firewall-cmd --reload')
  } else {
    try { await sudo.exec(`iptables -t nat -D POSTROUTING -s ${subnet} -o ${phy} -j MASQUERADE`) } catch (e) {}
    try { await sudo.exec(`iptables -D FORWARD -i ${nom} -o ${phy} -j ACCEPT`) } catch (e) {}
    try { await sudo.exec(`iptables -D FORWARD -i ${phy} -o ${nom} -m state --state RELATED,ESTABLISHED -j ACCEPT`) } catch (e) {}
  }
}

async function bringUp(nom) {
  const iface = interfaceModel.findAll().find((i) => i.nom === nom)
  if (!iface) throw new Error(`Interface "${nom}" introuvable dans la base.`)
  await writeConfigFile(iface)
  await sudo.exec(`wg-quick up ${nom}`)
  try { await addRoutingRules(nom, iface.adresse_ip) } catch (e) {}
}

async function bringDown(nom) {
  const iface = interfaceModel.findAll().find((i) => i.nom === nom)
  if (iface) {
    try { await removeRoutingRules(nom, iface.adresse_ip) } catch (e) {}
  }
  try {
    await sudo.exec(`wg-quick down ${nom}`)
  } catch (e) {
    try { await sudo.exec(`wg show ${nom} >/dev/null 2>&1 && ip link delete ${nom}`) } catch (e2) {}
  }
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

function buildWireGuardConfig(iface) {
  const lines = [
    '[Interface]',
    `PrivateKey = ${iface.private_key}`,
    `ListenPort = ${iface.port}`,
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
    if (peer.persistent_keepalive) {
      lines.push(`PersistentKeepalive = ${peer.persistent_keepalive}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function syncConfig(nom) {
  const iface = interfaceModel.findAll().find((i) => i.nom === nom)
  if (!iface) throw new Error(`Interface "${nom}" introuvable.`)
  const wgConfig = buildWireGuardConfig(iface)
  const tmpFile = path.join(os.tmpdir(), `wgsync_${nom}_${Date.now()}.conf`)
  fs.writeFileSync(tmpFile, wgConfig)
  try {
    await sudo.exec(`wg syncconf ${nom} ${tmpFile}`)
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }
}

async function editInterface(req, res) {
  const id = req.params.id
  const iface = interfaceModel.findById(id)

  if (!iface) {
    req.session.flash = { error: 'Interface introuvable.' }
    return res.redirect('/interface')
  }

  const { adresse_ip, port } = req.body

  if (!adresse_ip || !/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(adresse_ip)) {
    req.session.flash = { error: 'L\'adresse IP doit être au format CIDR (ex: 10.0.0.1/24).' }
    return res.redirect('/interface')
  }

  const portNum = parseInt(port, 10)
  if (!port || isNaN(portNum) || portNum < 1 || portNum > 65535) {
    req.session.flash = { error: 'Le port doit être un nombre entre 1 et 65535.' }
    return res.redirect('/interface')
  }

  const oldConfig = { adresse_ip: iface.adresse_ip, port: iface.port }

  try {
    iface.adresse_ip = adresse_ip
    iface.port = portNum
    await writeConfigFile(iface)

    if (iface.active) {
      const subnetChanged = adresse_ip !== oldConfig.adresse_ip
      if (subnetChanged) {
        try { await removeRoutingRules(iface.nom, oldConfig.adresse_ip) } catch (e) {}
      }
      try {
        await syncConfig(iface.nom)
        if (subnetChanged) {
          try { await addRoutingRules(iface.nom, adresse_ip) } catch (e) {}
        }
      } catch (syncErr) {
        iface.adresse_ip = oldConfig.adresse_ip
        iface.port = oldConfig.port
        await writeConfigFile(iface)
        if (subnetChanged) {
          try { await addRoutingRules(iface.nom, oldConfig.adresse_ip) } catch (e) {}
        }
        req.session.flash = { error: `Erreur lors de l'application de la configuration : ${syncErr.message}. Les modifications ont été annulées.` }
        return res.redirect('/interface')
      }
    }

    const db = require('../db')
    db.prepare('UPDATE interfaces SET adresse_ip = ?, port = ? WHERE id = ?').run(adresse_ip, portNum, id)

    req.session.flash = { success: `Interface "${iface.nom}" mise à jour.` }
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

  const peers = peerModel.findByInterfaceId(id)
  if (peers.length > 0) {
    req.session.flash = { error: `Impossible de supprimer l'interface "${iface.nom}" : des pairs lui sont encore associés. Supprimez d'abord tous les pairs de cette interface.` }
    return res.redirect('/interface')
  }

  try {
    interfaceModel.remove(id)
  } catch (err) {
    req.session.flash = { error: `Erreur lors de la suppression : ${err.message}` }
    return res.redirect('/interface')
  }

  try {
    if (iface.active) {
      await bringDown(iface.nom)
    }
    await sudo.exec(`rm -f /etc/wireguard/${iface.nom}.conf`)
  } catch (err) {
    // best effort — cleanup done
  }

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
  if (isActive) {
    interfaceModel.updateActive(iface.id, true)
    try { await addRoutingRules(nom, adresse_ip) } catch (e) {}
  }

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
  editInterface,
  deleteInterface,
  getStatus,
  getAllStatus,
  getSystemInterfaceNames,
  importInterface,
  detectAndImportAll,
  importPeersFromInterface,
  writeConfigFile,
  getRoutingInfo,
  syncConfig
}
