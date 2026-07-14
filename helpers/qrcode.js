// SPDX-License-Identifier: AGPL-3.0-only

let qrInstance = null
try {
  qrInstance = require('qrcode')
} catch (err) {
  qrInstance = null
}

function isAvailable() {
  return qrInstance !== null
}

async function toDataURL(text) {
  if (!qrInstance) throw new Error('qrcode non installé')
  return qrInstance.toDataURL(text, { width: 400, margin: 2 })
}

module.exports = {
  isAvailable,
  toDataURL
}
