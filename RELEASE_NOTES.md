# Initial release

This is the first release of **WireGuard-WUI**, a web interface to manage your WireGuard VPN server directly from your browser.

> **Warning:** this is an early release. Test it on a staging/non-critical machine before relying on it in production.

## Features

- **Full interface management** — create, start, stop, edit and delete WireGuard interfaces, with automatic key generation and configuration written to `/etc/wireguard/`
- **Peer management** — create, edit and delete peers with automatic key generation (including pre-shared keys), IP suggestion and duplicate detection
- **Live statistics** — dashboard with interface counters, connected peers, RX/TX data volume and latest handshake
- **Client configuration** — download ready-to-use `.conf` files and QR codes for each peer
- **Routing and firewall** — automatic `iptables` (MASQUERADE, FORWARD) or `firewalld` configuration, with system firewall auto-detection
- **System import** — detect and import existing interfaces and peers from `/etc/wireguard/`
- **Authentication** — email + password (bcrypt), TOTP 2FA, rate-limited attempts
- **Security** — CSRF protection, Helmet (CSP, optional HSTS), secure sudo entries (AES-256-GCM encrypted in session, whitelisted commands, shell injection prevention)
- **Internationalization** — 7 languages (German, English, Spanish, French, Irish, Italian, Portuguese) with automatic browser language detection
- **User profile** — edit profile, change password with strength meter (entropy), enable/disable TOTP 2FA, toggle debug mode
- **Logging** — application logs with 3 levels (DEBUG, INFO, ERROR), configurable from the interface
- **Automated installation** — complete `install.sh` script (system user creation, systemd service, sudoers configuration, hardened permissions)

## Installation

```bash
git clone https://github.com/Razganariel/Wireguard-WUI.git
cd Wireguard-WUI
cp .env.example .env
# Edit .env with your values (especially SESSION_SECRET)
npm install
npm start
```

For production:

```bash
sudo ./install.sh
systemctl enable --now wireguard-wui
```

Browse to `http://localhost:3000` — the first visitor is redirected to admin account creation.

## Configuration

See the [README](https://github.com/Razganariel/Wireguard-WUI#readme) for the full `.env` options and sudo configuration.

## License

Distributed under the [GNU Affero General Public License v3.0](https://github.com/Razganariel/Wireguard-WUI/blob/main/LICENSE) (AGPL-3.0).