const db = require('../db')

function findAll() {
  return db.prepare('SELECT * FROM interfaces ORDER BY id ASC').all()
}

function findById(id) {
  return db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id)
}

function findFirst() {
  return db.prepare('SELECT * FROM interfaces ORDER BY id ASC LIMIT 1').get()
}

function count() {
  return db.prepare('SELECT COUNT(*) as count FROM interfaces').get().count
}

function create(data) {
  const { nom, private_key, public_key, adresse_ip, port = 51820, endpoint = null } = data
  const info = db.prepare(
    'INSERT INTO interfaces (nom, private_key, public_key, adresse_ip, port, active, endpoint) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(nom, private_key, public_key, adresse_ip, port, 0, endpoint)
  return info.lastInsertRowid
}

function updateActive(id, active) {
  db.prepare('UPDATE interfaces SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
}

function remove(id) {
  db.prepare('DELETE FROM interfaces WHERE id = ?').run(id)
}

module.exports = {
  findAll,
  findById,
  findFirst,
  count,
  create,
  updateActive,
  remove
}
