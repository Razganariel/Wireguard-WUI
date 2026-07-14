# WireGuard-WUI

WireGuard-WUI is a web interface to manage your WireGuard VPN server from your browser.

## Features

- **Full interface management** — create, start, stop, edit, delete WireGuard interfaces with automatic key generation and configuration file written to `/etc/wireguard/`
- **Peer management** — create, edit, delete peers with automatic key generation (including pre-shared keys), IP suggestion, duplicate detection
- **Live statistics** — dashboard with active interface counters, connected peers, data volume (RX/TX), latest handshake
- **Client configuration** — download ready-to-use `.conf` files and QR codes for each peer
- **Routing and firewall** — automatic iptables (MASQUERADE, FORWARD) or firewalld configuration with system firewall auto-detection
- **System import** — detect and import existing interfaces and peers from `/etc/wireguard/`
- **Full authentication** — email + password (bcrypt), TOTP 2FA, rate-limited attempts
- **CSRF protection** — per-session token validated on every POST/PUT/DELETE request
- **Application firewall (Helmet)** — CSP, optional HSTS, security HTTP headers
- **Secure sudo entries** — sudo password encrypted in session (AES-256-GCM), whitelisted commands, shell injection prevention
- **Internationalization** — 7 languages (German, English, Spanish, French, Irish, Italian, Portuguese) with automatic browser language detection
- **User profile** — edit profile, change password with strength meter (entropy), enable/disable TOTP 2FA, toggle debug mode
- **Logging** — application logs in `logs/app.log` with 3 levels (DEBUG, INFO, ERROR), level configurable from the interface
- **Automated installation** — complete `install.sh` script (system user creation, systemd service, sudoers configuration, hardened permissions)

## Tech stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 20+ / Express 4 |
| **Template** | Handlebars (hbs) + Bootstrap 5 (CDN) |
| **Database** | SQLite (better-sqlite3, no ORM) |
| **Authentication** | bcrypt (passwords) + otplib (TOTP 2FA) |
| **Security** | Helmet (CSP/HSTS), csrf (tokens), express-rate-limit |
| **VPN** | WireGuard (`wg`, `wg-quick`) via sudo |
| **I18n** | i18next with file backend |

## Prerequisites

- **Node.js** 20+ and npm
- **WireGuard** installed on the system (`wg`, `wg-quick`)
- **sudo** to execute WireGuard commands

## Quick start

```bash
git clone https://github.com/Razganariel/Wireguard-WUI.git
cd Wireguard-WUI
cp .env.example .env
# Edit .env with your values (especially SESSION_SECRET)
npm install
npm start
```

Browse to `http://localhost:3000` — the first visitor is redirected to admin account creation.

## Automated installation (production)

```bash
sudo ./install.sh
```

The script:
1. Creates the `wireguard-wui` system user and group
2. Copies sources to `/opt/wireguard-wui`
3. Installs production dependencies
4. Creates the `.env` file with the entered values (PORT, SESSION_SECRET, DB_PATH)
5. Installs the `wireguard-wui.service` systemd unit
6. Creates the sudoers configuration with allowed commands

```bash
systemctl enable --now wireguard-wui
```

## Configuration

### Environment variables (`.env` file)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listening port |
| `SESSION_SECRET` | — | Session encryption secret (required, use a long random string) |
| `DB_PATH` | `./db/wireguard-wui.db` | Path to the SQLite database file |
| `TRUST_PROXY` | — | Trust proxy setting (e.g. `1`, `'loopback'`) when behind a reverse proxy |
| `ENABLE_HSTS` | — | Enable Strict-Transport-Security header (requires HTTPS) |
| `ENABLE_UPGRADE_HTTPS` | — | Enable HTTPS upgrade in CSP (`upgrade-insecure-requests`) |
| `SESSION_SECURE` | — | Secure session cookies (HTTPS only) |
| `LOG_LEVEL` | `INFO` | Initial log level (INFO or DEBUG) |

### sudo configuration

If you are not using the automated install script, configure sudo manually:

```bash
visudo -f /etc/sudoers.d/wireguard-wui
```

```
wireguard-wui ALL=(root) NOPASSWD: /usr/bin/wg-quick *, /usr/bin/wg show *, /usr/bin/wg syncconf *, /usr/bin/wg set *, /usr/bin/wg pubkey, /usr/bin/iptables *, /usr/bin/ip link *, /usr/bin/firewall-cmd *, /usr/bin/cp, /usr/bin/chmod, /usr/bin/rm, /usr/bin/cat, /usr/bin/find
```

> Adjust the user (`wireguard-wui`) to match your setup.

## Tests

```bash
npm test
```

Vitest test suite covering helpers, middlewares, models and routes.

## Support the project

If you find this project useful, you can support me on Ko-fi:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/razganariel)

## License

This project is distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

Why AGPL? We chose this license to ensure this project remains a common good. AGPL guarantees that if someone modifies this code or uses it to provide an online service, they are required to share the modifications and source code with the community. This prevents any attempt at closed-source commercial appropriation of the project.

For the full license text, see the [LICENSE](./LICENSE) file.
