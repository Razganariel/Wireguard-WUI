const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)
const log = require('./logger')
const i18next = require('i18next')

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
    log.error('Sudo', `Commande rejetée (pas de mot de passe) : ${command}`)
    throw new Error(i18next.t('error.sudo_password_not_set'))
  }

  if (!isCommandSafe(command)) {
    log.error('Sudo', `Commande rejetée (sécurité) : ${command}`)
    throw new Error(i18next.t('error.sudo_command_not_allowed'))
  }

  const sanitizedCmd = command.replace(/echo '[^']*' \| sudo /g, 'sudo ')
  log.info('Sudo', `Exécution : sudo ${sanitizedCmd}`)

  const escapedPwd = _password.replace(/'/g, "'\\''")
  const fullCommand = `echo '${escapedPwd}' | sudo -S ${command}`
  try {
    const { stdout, stderr } = await execPromise(fullCommand, {
      maxBuffer: 1024 * 1024
    })
    log.debug('Sudo', `stdout: ${stdout.slice(0, 500)}`)
    if (stderr) log.debug('Sudo', `stderr: ${stderr.slice(0, 500)}`)
    return { stdout, stderr }
  } catch (err) {
    if (err.stderr && (err.stderr.includes('Sorry') || err.stderr.includes('incorrect password'))) {
      log.error('Sudo', `Mot de passe incorrect pour : sudo ${sanitizedCmd}`)
      throw new Error(i18next.t('error.sudo_password_incorrect'))
    }
    const sanitize = (s) => s.replace(/echo '[^']*' \| sudo /g, 'sudo ')
    if (err.message) err.message = sanitize(err.message)
    if (err.cmd) err.cmd = sanitize(err.cmd)
    log.error('Sudo', `Échec : sudo ${sanitizedCmd} — ${err.message}`)
    throw err
  }
}

module.exports = {
  setPassword,
  clearPassword,
  hasPassword,
  isCommandSafe,
  exec: execSudo
}
