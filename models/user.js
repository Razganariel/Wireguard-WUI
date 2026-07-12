const db = require('../db')

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email)
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

function count() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count
}

function create(user) {
  const { nom, prenom, email, password, groupe = 'admin', password_complexity = 0 } = user
  const info = db.prepare(
    'INSERT INTO users (nom, prenom, email, password, groupe, password_complexity) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(nom, prenom, email, password, groupe, password_complexity)
  return info.lastInsertRowid
}

function update(id, data) {
  const fields = []
  const values = []
  const cols = { prenom: 'prenom', nom: 'nom', email: 'email', password: 'password', password_complexity: 'password_complexity', '2fa_enabled': '"2fa_enabled"', totp_secret: 'totp_secret' }
  for (const [key, col] of Object.entries(cols)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = ?`)
      values.push(data[key])
    }
  }
  if (fields.length === 0) return false
  values.push(id)
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return true
}

module.exports = {
  findByEmail,
  findById,
  count,
  create,
  update
}
