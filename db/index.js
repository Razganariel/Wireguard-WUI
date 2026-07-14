const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const dbPath = process.env.DB_PATH || './db/wireguard-wui.db'
const absolutePath = path.resolve(dbPath)

const dbDir = path.dirname(absolutePath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new Database(absolutePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  db.exec(schema)

  try { db.exec('ALTER TABLE interfaces ADD COLUMN endpoint TEXT') } catch (e) {}
  try { db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)') } catch (e) {}
}

initSchema()

module.exports = db
