// SPDX-License-Identifier: AGPL-3.0-only

const i18next = require('i18next')
const FsBackend = require('i18next-fs-backend')
const path = require('path')

let initialized = false

async function init() {
  if (initialized) return i18next
  await i18next.use(FsBackend).init({
    backend: {
      loadPath: path.join(__dirname, '..', 'locales', '{{lng}}', 'translation.json')
    },
    fallbackLng: 'fr',
    preload: ['fr', 'en'],
    interpolation: {
      escapeValue: false
    }
  })
  initialized = true
  return i18next
}

module.exports = { init }
