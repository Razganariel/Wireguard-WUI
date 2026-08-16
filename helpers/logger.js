// SPDX-License-Identifier: AGPL-3.0-only

const fs = require('fs')
const path = require('path')
const settingsModel = require('../models/settings')

const LOG_DIR = path.resolve('./logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

const LEVELS = { DEBUG: 0, INFO: 1, ERROR: 2 }
const LEVEL_NAMES = ['DEBUG', 'INFO', 'ERROR']

let _cachedLevel = null
let _cachedRotateSize = null
let _cachedRotateBackups = null

function getLogFile() {
  return process.env.LOG_FILE || path.join(LOG_DIR, 'app.log')
}

function ensureLogDir() {
  const dir = path.dirname(getLogFile())
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
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
  _cachedRotateSize = null
  _cachedRotateBackups = null
}

function getRotateSizeKb() {
  if (_cachedRotateSize === null) {
    const stored = settingsModel.get('log_rotate_size')
    const n = stored === null ? 1024 : parseInt(stored, 10)
    _cachedRotateSize = isNaN(n) || n < 0 ? 1024 : n
  }
  return _cachedRotateSize
}

function getRotateBackups() {
  if (_cachedRotateBackups === null) {
    const stored = settingsModel.get('log_rotate_backups')
    const n = stored === null ? 3 : parseInt(stored, 10)
    _cachedRotateBackups = isNaN(n) || n < 0 ? 3 : n
  }
  return _cachedRotateBackups
}

function getRotationConfig() {
  return { maxSizeKb: getRotateSizeKb(), backups: getRotateBackups() }
}

function rotateLogs() {
  const logFile = getLogFile()
  if (!fs.existsSync(logFile)) return
  const maxBytes = getRotateSizeKb() * 1024
  if (maxBytes <= 0) return
  const stat = fs.statSync(logFile)
  if (stat.size < maxBytes) return

  const backups = getRotateBackups()
  const base = logFile.replace(/\.log$/, '')
  if (backups > 0) {
    const oldest = `${base}.${backups}.log`
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest)
    for (let i = backups - 1; i >= 1; i -= 1) {
      const from = `${base}.${i}.log`
      const to = `${base}.${i + 1}.log`
      if (fs.existsSync(from)) fs.renameSync(from, to)
    }
    fs.renameSync(logFile, `${base}.1.log`)
  }
  fs.writeFileSync(logFile, '', 'utf8')
}

function write(level, module, message) {
  const currentLevel = getLevel()
  if (LEVELS[level] < LEVELS[currentLevel]) return

  ensureLogDir()
  rotateLogs()
  const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '')
  const line = `[${timestamp}] [${level}] [${module}] ${message}\n`
  try {
    fs.appendFileSync(getLogFile(), line, 'utf8')
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
  const logFile = getLogFile()
  if (!fs.existsSync(logFile)) {
    return { entries: [], modules: [], total: 0 }
  }

  const needle = search ? search.toLowerCase() : ''
  const moduleSet = new Set()
  const entries = []

  for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
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
    modules: Array.from(moduleSet).sort(),
    total: entries.length
  }
}

function clearLogs() {
  ensureLogDir()
  fs.writeFileSync(getLogFile(), '', 'utf8')
}

module.exports = { info, debug, error, getLevel, getRotationConfig, invalidateCache, readLogs, clearLogs, rotateLogs }
