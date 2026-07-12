const db = require('../db')

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}

function set(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

function getUserSetting(userId, key) {
  return get(`user.${userId}.${key}`)
}

function setUserSetting(userId, key, value) {
  set(`user.${userId}.${key}`, value)
}

module.exports = { get, set, getUserSetting, setUserSetting }
