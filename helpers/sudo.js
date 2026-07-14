const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)

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

async function execSudo(command) {
  if (!_password) {
    throw new Error('Mot de passe sudo non défini')
  }
  const escapedPwd = _password.replace(/'/g, "'\\''")
  const fullCommand = `echo '${escapedPwd}' | sudo -S ${command}`
  const { stdout, stderr } = await execPromise(fullCommand, {
    maxBuffer: 1024 * 1024
  })
  return { stdout, stderr }
}

module.exports = {
  setPassword,
  clearPassword,
  hasPassword,
  exec: execSudo
}
