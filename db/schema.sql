-- WireGuard-WUI database schema

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nom           TEXT NOT NULL,
  prenom        TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password      TEXT NOT NULL,
  groupe        TEXT NOT NULL DEFAULT 'admin',
  "2fa_enabled"  BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret   BLOB
);

CREATE TABLE IF NOT EXISTS interfaces (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nom             TEXT NOT NULL UNIQUE,
  private_key     TEXT NOT NULL,
  public_key      TEXT NOT NULL,
  adresse_ip      TEXT NOT NULL,
  port            INTEGER NOT NULL DEFAULT 51820,
  active          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS peers (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  interface_id         INTEGER NOT NULL REFERENCES interfaces(id),
  nom                  TEXT NOT NULL,
  adresse_ip           TEXT NOT NULL,
  public_key           TEXT NOT NULL,
  private_key          TEXT NOT NULL,
  preshared_key        TEXT,
  allowed_ips          TEXT NOT NULL DEFAULT '0.0.0.0/0',
  dns                  TEXT,
  persistent_keepalive INTEGER DEFAULT 25,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
