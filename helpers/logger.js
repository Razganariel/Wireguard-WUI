// SPDX-License-Identifier: AGPL-3.0-only

const fs = require('fs')
const path = require('path')
const settingsModel = require('../models/settings')

const LOG_DIR = path.resolve('./logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

const LEVELS = { DEBUG: 0, INFO: 1, ERROR: 2 }
const LEVEL_NAMES = ['DEBUG', 'INFO', 'ERROR']

let _cachedLevel = null

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function getLevel() {
  if (_cachedLevel !== null) return _cachedLevel
  try {
    const stored = settingsModel.get('log_level')
    if (stored === 'DEBUG' || stored === 'INFO') {
      _cachedLevel = stored
    } else {
      _cachedLevel = process.env.LOG_LEVEL === 'DEBUG' ? 'DEBUG' : 'INFO'
    }
  } catch {
    _cachedLevel = process.env.LOG_LEVEL === 'DEBUG' ? 'DEBUG' : 'INFO'
  }
  return _cachedLevel
}

function invalidateCache() {
  _cachedLevel = null
}

function write(level, module, message) {
  const currentLevel = getLevel()
  if (LEVELS[level] < LEVELS[currentLevel]) return

  ensureLogDir()
  const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '')
  const line = `[${timestamp}] [${level}] [${module}] ${message}\n`
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8')
  } catch (err) {
    console.error('Logger write failed:', err.message)
  }
}

function info(module, message) {
  write('INFO', module, message)
}

function debug(module, message) {
  write('DEBUG', module, message)
}

function error(module, message) {
  write('ERROR', module, message)
}

function getLogPath() {
  return LOG_FILE
}

module.exports = { info, debug, error, getLogPath, getLevel, invalidateCache }
