# WireGuard-WUI

WireGuard-WUI est une interface web (Web User Interface) permettant de gérer son serveur VPN WireGuard simplement depuis un navigateur.

## Fonctionnalités

- **Configuration du serveur** — initialisation et gestion des interfaces WireGuard
- **Gestion des pairs** — créer, lister, supprimer des peers avec génération automatique des clés
- **Configuration client** — téléchargement du fichier `.conf` prêt à l'emploi pour chaque peer
- **Multi-interfaces** — support de plusieurs interfaces WireGuard (wg0, wg1, etc.)
- **Authentification** — session-based avec bcrypt
- **Déploiement flexible** — installation bare-metal ou via Docker
- **Interface responsive** — construite avec Express + Handlebars + Bootstrap 5

## Stack technique

| Couche | Technologie |
|---|---|
| **Backend** | Node.js + Express |
| **Template** | Handlebars (hbs) + Bootstrap 5 |
| **Base de données** | SQLite (better-sqlite3) |
| **Session** | express-session |
| **Authentification** | bcrypt |

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────┐
│  Browser    │────▶│ Express  │────▶│ SQLite   │
│  (Handlebars│     │ Routes   │     │ (users,  │
│   + Boot5)  │     │ + Auth   │     │  peers)  │
└─────────────┘     └────┬─────┘     └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │  sudo wg │
                   │  commands│
                   └──────────┘
```

## Prérequis

- **Node.js** 16+ et npm
- **WireGuard** installé sur le système (`wg`, `wg-quick`)
- **sudo** configuré pour exécuter `wg` et `wg-quick` sans mot de passe

### Configuration sudo (obligatoire)

```bash
sudo visudo -f /etc/sudoers.d/wireguard-wui
```

```
www-data ALL=(root) NOPASSWD: /usr/bin/wg, /usr/bin/wg-quick
```

## Démarrage rapide

### Bare-metal

```bash
git clone http://192.168.1.222:3333/dvergar/Wireguard-WUI.git
cd Wireguard-WUI
cp .env.example .env
# Éditer .env avec vos valeurs
npm install
npm start
```

### Docker

```bash
docker compose up -d
```

## Configuration

Variables d'environnement (fichier `.env`) :

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port de l'application |
| `SESSION_SECRET` | — | Clé secrète pour les sessions (obligatoire) |
| `DB_PATH` | `./db/wireguard-wui.db` | Chemin vers le fichier SQLite |

## Utilisation

1. Accéder à l'interface sur `http://<ip>:<port>`
2. Se connecter avec les identifiants par défaut :
   - Email : `admin@wireguard.local`
   - Mot de passe : `admin`
3. **Changer le mot de passe immédiatement** après la première connexion
4. Accéder à la page de configuration pour initialiser une interface WireGuard
5. Ajouter des pairs et télécharger leurs configurations clients

## Structure du projet

```
wireguard-wui/
├── server.js              # Point d'entrée Express
├── package.json
├── .env.example
├── db/
│   ├── index.js           # Connexion SQLite + initialisation
│   └── schema.sql         # Schéma de la base
├── routes/                # Routes Express
├── middlewares/            # Middlewares (auth, validation)
├── models/                # Accès aux données
├── controllers/           # Logique métier
├── views/
│   ├── layouts/           # Layouts Handlebars
│   ├── auth/              # Pages de connexion
│   ├── dashboard/         # Dashboard
│   └── peers/             # Gestion des pairs
├── public/
│   ├── css/               # Styles (Bootstrap + personnalisation)
│   └── js/                # JavaScript client
├── scripts/               # Scripts utilitaires
└── tests/                 # Tests
```

## Licence

GNU General Public License v3.0 — voir [LICENSE](LICENSE).
