// SPDX-License-Identifier: AGPL-3.0-only

const db = require('../db')

function findByInterfaceId(interfaceId) {
  return db.prepare('SELECT * FROM peers WHERE interface_id = ? ORDER BY id ASC').all(interfaceId)
}

function findById(id) {
  return db.prepare('SELECT * FROM peers WHERE id = ?').get(id)
}

function findAll() {
  return db.prepare('SELECT * FROM peers ORDER BY id ASC').all()
}

function count() {
  return db.prepare('SELECT COUNT(*) as count FROM peers').get().count
}

function create(data) {
  const {
    interface_id,
    nom,
    adresse_ip,
    public_key,
    private_key,
    preshared_key = null,
    allowed_ips = '0.0.0.0/0',
    dns = null,
    persistent_keepalive = 25
  } = data
  const info = db.prepare(
    `INSERT INTO peers
      (interface_id, nom, adresse_ip, public_key, private_key, preshared_key, allowed_ips, dns, persistent_keepalive, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(interface_id, nom, adresse_ip, public_key, private_key, preshared_key, allowed_ips, dns, persistent_keepalive, 1)
  return info.lastInsertRowid
}

function update(id, data) {
  const fields = []
  const values = []
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`)
    values.push(value)
  }
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  db.prepare(`UPDATE peers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

function remove(id) {
  db.prepare('DELETE FROM peers WHERE id = ?').run(id)
}

module.exports = {
  findByInterfaceId,
  findById,
  findAll,
  count,
  create,
  update,
  remove
}
