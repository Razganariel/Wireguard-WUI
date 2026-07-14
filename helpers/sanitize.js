const validator = require('validator')

const MAX_STR_LEN = 255
const MAX_LONG_STR_LEN = 1024

function sanitize(str, maxLen = MAX_STR_LEN) {
  if (typeof str !== 'string') return ''
  let s = validator.stripLow(str.trim())
  s = validator.escape(s)
  if (s.length > maxLen) s = s.substring(0, maxLen)
  return s
}

function sanitizeRaw(str, maxLen = MAX_STR_LEN) {
  if (typeof str !== 'string') return ''
  let s = str.trim()
  if (s.length > maxLen) s = s.substring(0, maxLen)
  return s
}

function sanitizeInt(str) {
  const n = parseInt(str, 10)
  return isNaN(n) ? null : n
}

function sanitizePeerName(str) {
  if (typeof str !== 'string') return ''
  let s = str.trim()
  s = s.replace(/[^a-zA-Z0-9À-ÿ \-_.@]/g, '')
  if (s.length > MAX_STR_LEN) s = s.substring(0, MAX_STR_LEN)
  return s
}

function sanitizeInterfaceName(str) {
  if (typeof str !== 'string') return ''
  const s = str.trim().toLowerCase()
  if (!/^wg[0-9]+$/.test(s)) return ''
  return s
}

function sanitizeIp(str) {
  if (typeof str !== 'string') return ''
  const s = str.trim()
  if (!validator.isIP(s, 4)) return ''
  return s
}

function sanitizeCidr(str) {
  if (typeof str !== 'string') return ''
  const s = str.trim()
  if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(s)) return ''
  const [ip, bits] = s.split('/')
  if (!validator.isIP(ip, 4)) return ''
  const b = parseInt(bits, 10)
  if (b < 0 || b > 32) return ''
  return s
}

function sanitizePort(str) {
  const n = parseInt(str, 10)
  if (isNaN(n) || n < 1 || n > 65535) return null
  return n
}

function sanitizeEndpoint(str) {
  if (typeof str !== 'string') return ''
  let s = str.trim().toLowerCase()
  s = s.replace(/[^a-zA-Z0-9.\-_:]/g, '')
  if (s.length > 255) s = s.substring(0, 255)
  return s || null
}

function sanitizeEmail(str) {
  if (typeof str !== 'string') return ''
  const s = validator.normalizeEmail(str.trim())
  if (!s) return ''
  return s
}

function sanitizeAllowedIps(str) {
  if (typeof str !== 'string') return ''
  const s = str.trim()
  if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}(,\s*(\d{1,3}\.){3}\d{1,3}\/\d{1,2})*$/.test(s)) return ''
  return s
}

function sanitizeDns(str) {
  if (typeof str !== 'string') return ''
  const s = str.trim()
  if (!validator.isIP(s, 4)) return ''
  return s
}

module.exports = {
  sanitize,
  sanitizeRaw,
  sanitizeInt,
  sanitizePeerName,
  sanitizeInterfaceName,
  sanitizeIp,
  sanitizeCidr,
  sanitizePort,
  sanitizeEndpoint,
  sanitizeEmail,
  sanitizeAllowedIps,
  sanitizeDns
}