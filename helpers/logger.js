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

const LOG_LINE_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\] \[(DEBUG|INFO|ERROR)\] \[([^\]]+)\] (.*)$/

function readLogs({ level = '', module = '', search = '', limit = 200 } = {}) {
  if (!fs.existsSync(LOG_FILE)) {
    return { entries: [], modules: [] }
  }
  const stat = fs.statSync(LOG_FILE)
  if (stat.size === 0) {
    return { entries: [], modules: [] }
  }

  const MAX_BYTES = 1024 * 1024
  const start = Math.max(0, stat.size - MAX_BYTES)
  const fd = fs.openSync(LOG_FILE, 'r')
  const buf = Buffer.alloc(stat.size - start)
  fs.readSync(fd, buf, 0, buf.length, start)
  fs.closeSync(fd)

  const needle = search ? search.toLowerCase() : ''
  const moduleSet = new Set()
  const entries = []

  for (const line of buf.toString('utf8').split('\n')) {
    const m = LOG_LINE_RE.exec(line)
    if (!m) continue
    const [, timestamp, lvl, mod, message] = m
    moduleSet.add(mod)
    if (level && lvl !== level) continue
    if (module && mod !== module) continue
    if (needle && !message.toLowerCase().includes(needle)) continue
    entries.push({ timestamp, level: lvl, module: mod, message })
  }

  return {
    entries: entries.slice(-limit),
    modules: Array.from(moduleSet).sort()
  }
}

module.exports = { info, debug, error, getLevel, invalidateCache, readLogs }
