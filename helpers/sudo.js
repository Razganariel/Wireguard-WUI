const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)

const ALLOWED_PREFIXES = [
  'wg-quick ', 'wg show ', 'wg syncconf ', 'wg set ', 'wg pubkey ',
  'iptables ', 'ip link ',
  'firewall-cmd ',
  'cp ', 'chmod ', 'rm ', 'cat ', 'find '
]

let _password = null

function setPassword(password) {
  _password = password
}

function clearPassword() {
  _password = null
}

function hasPassword() {
  return _password !== null
}

function isCommandSafe(command) {
  const allowed = ALLOWED_PREFIXES.some((p) => command.startsWith(p))
  if (!allowed) return false

  if (/[$()`\`|]/.test(command)) return false

  const clean = command.replace(/\\;/g, '')
  const semicolons = (clean.match(/;/g) || []).length
  if (semicolons > 1) return false
  if (semicolons === 1 && !clean.includes('exit 0')) return false

  return true
}

async function execSudo(command) {
  if (!_password) {
    throw new Error('Mot de passe sudo non défini')
  }

  if (!isCommandSafe(command)) {
    console.error('Commande sudo rejetée (sécurité) :', command)
    throw new Error('Commande sudo non autorisée.')
  }

  const escapedPwd = _password.replace(/'/g, "'\\''")
  const fullCommand = `echo '${escapedPwd}' | sudo -S ${command}`
  try {
    const { stdout, stderr } = await execPromise(fullCommand, {
      maxBuffer: 1024 * 1024
    })
    return { stdout, stderr }
  } catch (err) {
    if (err.stderr && (err.stderr.includes('Sorry') || err.stderr.includes('incorrect password'))) {
      throw new Error('Mot de passe sudo incorrect. Rendez-vous sur /auth/sudo-password pour le corriger.')
    }
    const sanitize = (s) => s.replace(/echo '[^']*' \| sudo /g, 'sudo ')
    if (err.message) err.message = sanitize(err.message)
    if (err.cmd) err.cmd = sanitize(err.cmd)
    throw err
  }
}

module.exports = {
  setPassword,
  clearPassword,
  hasPassword,
  exec: execSudo
}
