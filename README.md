# WireGuard-WUI

WireGuard-WUI est une interface web (Web User Interface) permettant de gérer son serveur VPN WireGuard simplement depuis un navigateur.

## Fonctionnalités

- **Configuration du serveur** — initialisation et gestion des interfaces WireGuard
- **Gestion des pairs** — créer, lister, supprimer des peers avec génération automatique des clés
- **Configuration client** — téléchargement du fichier `.conf` prêt à l'emploi pour chaque peer
- **Multi-interfaces** — support de plusieurs interfaces WireGuard (wg0, wg1, etc.) avec sélecteur global
- **Authentification** — session-based avec bcrypt
- **Déploiement en service** — installation bare-metal uniquement
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
┌─────────────┐     ┌──────────┐      ┌──────────┐
│  Browser    │────▶│ Express  │────▶│ SQLite   │
│  (Handlebars│     │ Routes   │      │ (users,  │
│   + Boot5)  │     │ + Auth   │      │  peers)  │
└─────────────┘     └────┬─────┘      └──────────┘
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
git clone https://github.com/Razganariel/Wireguard-WUI.git
cd Wireguard-WUI
cp .env.example .env
# Éditer .env avec vos valeurs (notamment SESSION_SECRET)
npm install
npm start
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
2. Se connecter avec les identifiants par défaut
3. Aller sur la page **Interfaces** pour initialiser une interface WireGuard (nom, adresse IP, port)
4. Aller sur la page **Pairs** pour ajouter des peers et télécharger leurs configurations clients `.conf`
5. Utiliser le sélecteur d'interface dans la navbar pour basculer entre plusieurs interfaces


## Licence & Utilisation

Ce projet est distribué sous la licence **GNU Affero General Public License v3.0 (AGPL-3.0)**. 

**Pourquoi l'AGPL ?** 
Nous avons choisi cette licence pour garantir que ce projet reste un bien commun. L'AGPL assure que si quelqu'un modifie ce code ou l'utilise pour offrir un service en ligne, il a l'obligation de partager les modifications et le code source avec la communauté. Cela empêche toute tentative d'appropriation commerciale fermée du projet.

Pour consulter le texte intégral des termes de la licence, veuillez consulter le fichier [LICENSE](./LICENSE).
