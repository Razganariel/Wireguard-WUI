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
  const { nom, prenom, email, password, groupe = 'admin' } = user
  const info = db.prepare(
    'INSERT INTO users (nom, prenom, email, password, groupe) VALUES (?, ?, ?, ?, ?)'
  ).run(nom, prenom, email, password, groupe)
  return info.lastInsertRowid
}

function update(id, data) {
  const fields = []
  const values = []
  for (const key of ['prenom', 'nom', 'email', 'password']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
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
