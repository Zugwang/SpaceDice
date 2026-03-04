# SpaceDice Reloaded v2.0

**Dés à Entropie d'Astéroïdes · Asteroid Entropy Randomizer**

Lanceur de dés générant l'aléatoire en combinant `crypto.getRandomValues` (CSPRNG navigateur) avec des seeds dérivées des données orbitales d'astéroïdes réels (NASA NEO API). Application web SPA, offline-first, sans framework.

---

## Démarrage rapide

### Prérequis
- Python 3.11+ et [Poetry](https://python-poetry.org/)
- Clé NASA API (gratuite sur https://api.nasa.gov) — `DEMO_KEY` fonctionne avec limites
- Docker + docker-compose (optionnel, production)

### Développement local

```bash
# 1. Installer les dépendances
poetry install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env : NASA_API_KEY=votre_cle

# 3. Récupérer les données NASA
poetry run python scripts/fetch_nasa.py

# 4. Lancer le serveur de développement
poetry run flask --app app run --debug
# Ouvrir http://127.0.0.1:5000
```

### Production (Docker)

```bash
cd docker
docker compose up --build -d
# Ouvrir http://localhost:8080

# Refresh quotidien des données NASA (ajouter au cron hôte) :
# 0 3 * * * docker exec spacedice python /app/scripts/fetch_nasa.py
```

---

## Fonctionnalités

| Feature | Description |
|---------|-------------|
| **9 types de dés** | d2, d3, d4, d6, d8, d10, d12, d20, d100 + aléatoire |
| **Multi-dés** | 1 à 10 dés simultanés |
| **Entropie NASA** | 3 astéroïdes réels combinés par XOR par lancer |
| **4 algos PRNG** | XOR, LCG (Knuth), Xorshift32, MurmurHash3 |
| **4 sources seed** | Diamètre, Vitesse, Distance, Combiné (SHA-256) |
| **Canvas pixel art** | Résultat rendu en bitmap 5×7 pixels |
| **Sprites pixel art** | Sprites PNG des dés (d4–d100) |
| **Orbite ASCII 2D** | Ellipse orbitale + règle logarithmique Moon–Earth–NEO–Sun |
| **Historique** | 10 derniers lancers avec source NEO |
| **Test chi-carré** | Test d'uniformité statistique (≥100 lancers) |
| **4 thèmes** | Terminal, Oneshot, Celeste, V1 Original |
| **4 polices** | IBM Plex Mono, VT323 (CRT), Share Tech Mono, Inconsolata |
| **Bilingue** | FR / EN avec changement en direct |
| **Offline-first** | Tous les assets locaux, fonctionne sans internet |

---

## Structure du projet

```
SpaceDiceReloaded/
├── app/                    # Backend Flask
│   ├── __init__.py         # Factory (create_app)
│   ├── routes.py           # GET / → index.html + JSON embarqué
│   └── nasa.py             # Client NASA API + génération des seeds
├── static/
│   ├── css/style.css       # Système multi-thème (variables CSS)
│   ├── js/app.js           # SPA complète (~1300 lignes, sans framework)
│   ├── fonts/              # 10 fichiers woff2 (tous locaux)
│   ├── sprites/dice/       # Sprites PNG pixel art (d4–d100)
│   └── images/backgrounds/ # v1-space.jpg (thème V1)
├── templates/index.html    # Template Jinja2 unique (entrée SPA)
├── data/neows_data.json    # Cache NASA NEO (refreshé quotidiennement)
├── scripts/fetch_nasa.py   # Script cron : fetch + sauvegarde NEO
├── tests/test_rng.py       # Validation statistique RNG (dev)
├── docker/                 # Dockerfile + compose + nginx
├── SPECS.md                # Spécification technique complète (FR)
├── ARCHITECTURE.md         # Architecture système (référence agents)
├── FRONTEND.md             # Internals SPA (référence agents)
└── TODO.md                 # Features en attente + hints d'implémentation
```

---

## Documentation pour agents

| Fichier | Contenu |
|---------|---------|
| `README.md` | Setup, features, démarrage rapide |
| `SPECS.md` | Spécification technique originale (FR) |
| `ARCHITECTURE.md` | Architecture complète, flux de données, carte des fichiers |
| `FRONTEND.md` | Internals JS/CSS, modules, système de thèmes |
| `TODO.md` | Features en attente avec hints d'implémentation |

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `NASA_API_KEY` | `DEMO_KEY` | Clé NASA Open APIs (gratuit : 30 req/h) |
| `FLASK_ENV` | `production` | `development` active le debug Flask |

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | Python 3.11, Flask 3.x |
| WSGI | Gunicorn (2 workers × 2 threads) |
| Proxy | Nginx (cache statique, gzip) |
| Container | Docker + docker-compose |
| Frontend | Vanilla JS (IIFE, sans framework) |
| CSS | Vanilla CSS (custom properties) |
| Données | Cache JSON (NASA NEO API) |
| Polices | 5 familles, 10 fichiers woff2, tous locaux |
| Tests | pytest + numpy + scipy (dev seulement) |

---

## Crédits sprites

Sprites de dés : **Fantasy Dices Pack** par Aeynit
Licence : CC-BY 4.0 · Source : OpenGameArt.org
Modifications : redimensionnés, recolorés, d100 mergé depuis deux sprites d10.

---

## Philosophie de conception

**Slow Web** — Offline-first, respectueux de la bande passante, sans dépendances externes :
- Zéro tracking, cookies ou scripts tiers
- Toutes les polices et assets auto-hébergés
- Poids total < 300 KB (sans l'image de fond V1)
- Fonctionne sans internet après le premier chargement
