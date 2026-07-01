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

module.exports = {
  findByEmail,
  findById,
  count,
  create
}
