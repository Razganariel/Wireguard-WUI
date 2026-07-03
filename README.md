# WireGuard-WUI

WireGuard-WUI est une interface web (Web User Interface) permettant de gérer son serveur VPN WireGuard simplement depuis un navigateur.

## Fonctionnalités

- **Configuration du serveur** — initialisation et gestion des interfaces WireGuard
- **Gestion des pairs** — créer, lister, supprimer des peers avec génération automatique des clés
- **Configuration client** — téléchargement du fichier `.conf` prêt à l'emploi pour chaque peer
- **Multi-interfaces** — support de plusieurs interfaces WireGuard (wg0, wg1, etc.) avec sélecteur global
- **Authentification** — session-based avec bcrypt
- **Interface responsive** — construite avec Express + Handlebars + Bootstrap 5

## Stack technique

| Couche | Technologie |
|---|---|
| **Backend** | Node.js 18+ / Express 4 |
| **Template** | Handlebars (hbs) + Bootstrap 5 (CDN) |
| **Base de données** | SQLite (better-sqlite3, sans ORM) |
| **Session** | express-session |
| **Authentification** | bcrypt |
| **VPN** | WireGuard (`wg`, `wg-quick`) via `child_process.exec` + `sudo` |

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

- **Pas d'ORM** — SQL brut avec better-sqlite3
- **Pas d'API REST** — rendu serveur Handlebars (MVC)
- **WireGuard** — exécution de commandes shell via `child_process.exec()` avec `sudo`

## Prérequis

- **Node.js** 18+ et npm
- **WireGuard** installé sur le système (`wg`, `wg-quick`)
- **sudo** configuré pour exécuter `wg` et `wg-quick` sans mot de passe

### Configuration sudo (obligatoire)

```bash
sudo visudo -f /etc/sudoers.d/wireguard-wui
```

```
www-data ALL=(root) NOPASSWD: /usr/bin/wg, /usr/bin/wg-quick
```

> Adapter l'utilisateur (`www-data`) selon l'utilisateur qui fait tourner l'app.

## Démarrage rapide

```bash
git clone http://192.168.1.222:3333/dvergar/Wireguard-WUI.git
cd Wireguard-WUI
cp .env.example .env
# Éditer .env avec vos valeurs (notamment SESSION_SECRET)
npm install
npm start
```

L'application est accessible sur `http://<ip>:<port>` (défaut : `3000`).

### Identifiants par défaut

- Email : `admin@wireguard.local`
- Mot de passe : `admin`

**Changer le mot de passe immédiatement après la première connexion.**

## Configuration

Variables d'environnement (fichier `.env`) :

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port de l'application |
| `SESSION_SECRET` | — | Clé secrète pour les sessions (obligatoire) |
| `DB_PATH` | `./db/wireguard-wui.db` | Chemin vers le fichier SQLite |

## Utilisation

1. Accéder à l'interface sur `http://<ip>:<port>`
2. Se connecter avec les identifiants par défaut
3. Aller sur la page **Interfaces** pour initialiser une interface WireGuard (nom, adresse IP, port)
4. Aller sur la page **Pairs** pour ajouter des peers et télécharger leurs configurations clients `.conf`
5. Utiliser le sélecteur d'interface dans la navbar pour basculer entre plusieurs interfaces

## Structure du projet

```
wireguard-wui/
├── server.js              # Point d'entrée Express
├── package.json
├── .env.example
├── db/
│   ├── index.js           # Connexion SQLite + initialisation
│   └── schema.sql         # Schéma de la base
├── routes/                # Routes Express (auth, interface, peers)
├── middlewares/           # Middlewares (auth)
├── models/                # Accès aux données (user, peer, interface)
├── controllers/           # Logique métier (auth, interface, peers)
├── views/
│   ├── layouts/           # Layout Handlebars (Bootstrap 5)
│   ├── auth/              # Page de connexion
│   ├── dashboard/         # Tableau de bord
│   ├── interface/         # Gestion des interfaces
│   ├── peers/             # Gestion des pairs
│   └── errors/            # Pages 404 / 500
├── public/
│   ├── css/               # Styles
│   └── js/                # JavaScript client
└── scripts/               # Scripts utilitaires (seed)
```

## Développement

```bash
npm install -g nodemon
npm run dev
```

## Licence

GNU General Public License v3.0 — voir [LICENSE](LICENSE).
