# SpaceDice Reloaded - Spécifications Techniques

> Générateur de dés utilisant l'entropie cosmique (données NASA) pour un aléatoire cryptographiquement sécurisé.

---

## Stack Technique

### Backend

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Framework | **Flask minimal** | Léger, familier, écosystème mature |
| Serveur WSGI | **Gunicorn** | Production-ready, configurable |
| Reverse Proxy | **Nginx** | SSL, compression, cache statique |
| Conteneurisation | **Docker** | Isolation, déploiement reproductible |
| Cron NASA | **Crontab système** | `docker exec` quotidien, simple |

**Dépendances Python (production) :**
- `flask` - Framework web
- `gunicorn` - Serveur WSGI
- `requests` - Appels API NASA (cron uniquement)

**Dépendances Python (dev uniquement) :**
- `numpy`, `scipy`, `statsmodels` - Tests statistiques RNG

---

### Frontend

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Architecture | **SPA (Single Page App)** | Zéro requête après chargement |
| JavaScript | **Vanilla JS** | Pas de framework, léger |
| CSS | **Vanilla CSS** | Pas de préprocesseur, contrôle total |
| Font | **Silkscreen** (~8KB) | Pixel font légère |
| Sprites | **PNG indexed 32x32** | Pixel art optimisé |

---

### Architecture Offline-First

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUX DE DONNÉES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Cron quotidien]                                           │
│        │                                                    │
│        ▼                                                    │
│  ┌──────────┐    JSON    ┌──────────────────┐              │
│  │ NASA API │ ─────────► │ neows_data.json  │              │
│  └──────────┘            └────────┬─────────┘              │
│                                   │                         │
│  ════════════════════════════════════════════════════════  │
│                                   │                         │
│  [Chargement initial]             ▼                         │
│        │               ┌──────────────────┐                │
│        │               │   Flask (/)      │                │
│        │               │   Inject JSON    │                │
│        │               └────────┬─────────┘                │
│        │                        │                           │
│        ▼                        ▼                           │
│  ┌──────────┐    HTML + JS + DATA    ┌──────────┐          │
│  │ Client   │ ◄───────────────────── │ Serveur  │          │
│  └────┬─────┘                        └──────────┘          │
│       │                                                     │
│       │  [Lancers suivants - 100% local]                   │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────────────────────────────────┐                  │
│  │  crypto.getRandomValues() + seed     │                  │
│  │  Calcul côté client                  │                  │
│  │  ZÉRO requête serveur                │                  │
│  └──────────────────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Avantages :**
- 1 seule requête HTTP par session
- Fonctionne offline (avec Service Worker)
- Latence lancer : ~1ms
- Charge serveur minimale

---

## Direction Artistique

### Concept : "Cosmic Terminal"

Fusion de trois ambiances selon l'état de l'interface :

| État | Ambiance | Inspiration |
|------|----------|-------------|
| Repos | Chaleureuse, contemplative | Oneshot |
| Lancer | Dynamique, énergique | Celeste |
| Résultat | Scientifique, données brutes | Terminal/Hacker |

### Palette de Couleurs

```
Background     #0a0a12  (espace profond)
Stars/Accent   #f4d03f  (ambre chaleureux)
Energy         #5bcefa  (cyan dynamique)
Data/Terminal  #00ff41  (vert matrix)
Danger         #ff6b6b  (astéroïde dangereux)
Neutral        #c0c0c0  (texte secondaire)
```

### Typographie

- **Font principale :** Silkscreen (WOFF2, ~8KB)
- **Fallback :** `monospace` système

### Sprites

- **Taille :** 32x32 pixels
- **Format :** PNG indexed (palette limitée)
- **Style :** Pixel art, inspiration SNES
- **Création :** Génération IA + retouches manuelles

---

## Types de Dés

| Dé | Représentation | Notes |
|----|----------------|-------|
| d2 | Interrupteur binaire ON/OFF | Style switch tech |
| d3 | Sprite triangle | - |
| d4 | Sprite tétraèdre | - |
| d6 | Sprite cube | Classique |
| d8 | Sprite octaèdre | - |
| d10 | Sprite décaèdre | - |
| d12 | Sprite dodécaèdre | - |
| d20 | Sprite icosaèdre | JDR classique |
| d100 | Sprite ou 2xd10 | Pourcentage |
| Custom | Input numérique | d1 à d1000+ |

---

## Animation du Tirage

**Technique :** Roulement de chiffres (style slot machine)

```
Idle:     [ 17 ]

Lancer:   [ 03 ] → [ 19 ] → [ 07 ] → [ 12 ] → [ 17 ]
          ─────────── 500-800ms ───────────────

Final:    [ 17 ]  + son "clac"
```

**Implémentation :**
- `setInterval` avec décélération progressive
- Pas d'animation du sprite lui-même
- Affichage des données NASA de l'astéroïde source au résultat

---

## Audio

| Son | Description | Taille estimée |
|-----|-------------|----------------|
| roll.mp3 | Roulement court | ~5KB |
| result.mp3 | "Clac" final | ~3KB |

**Format :** MP3 ou OGG (fallback)
**Total audio :** ~10-15KB

---

## Affichage Données NASA

Au résultat, afficher la source d'entropie :

```
┌─────────────────────────────────────────┐
│  > NEO: (2024 QR1)                      │
│  > DIAM: 89.2m - 199.4m                 │
│  > HAZARDOUS: NO                        │
│  > SEED: 7f3a9c...                      │
└─────────────────────────────────────────┘
```

---

## Structure du Projet

```
SpaceDiceReloaded/
├── app/
│   ├── __init__.py
│   ├── routes.py
│   └── nasa.py              # Logique fetch NASA
├── static/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js           # SPA logic + CSPRNG
│   ├── sprites/
│   │   └── dice/            # Sprites 32x32
│   ├── fonts/
│   │   └── silkscreen.woff2
│   └── audio/
│       ├── roll.mp3
│       └── result.mp3
├── templates/
│   └── index.html           # SPA unique
├── data/
│   └── neows_data.json      # Cache NASA
├── scripts/
│   └── fetch_nasa.py        # Script cron
├── tests/
│   └── test_rng.py          # Tests statistiques (dev only)
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── nginx.conf
├── pyproject.toml
├── gunicorn.conf.py
├── SPECS.md
└── README.md
```

---

## Docker & Déploiement

### Image Production (allégée)

```dockerfile
FROM python:3.12-slim
# PAS de numpy/scipy/statsmodels
# Uniquement flask, gunicorn, requests
```

**Taille estimée :** ~80-120MB

### docker-compose.yml

```yaml
services:
  spacedice:
    build: .
    volumes:
      - ./data:/app/data    # Volume partagé pour neows_data.json
    expose:
      - "8000"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - spacedice
```

### Cron (sur l'hôte)

```bash
# /etc/cron.d/spacedice
0 3 * * * root docker exec spacedice python /app/scripts/fetch_nasa.py
```

---

## API NASA

### Endpoint Utilisé

```
GET https://api.nasa.gov/neo/rest/v1/feed/today?api_key=XXX
```

### Rate Limits

- **1000 requêtes/heure** avec clé API
- 1 requête/jour pour SpaceDice = largement suffisant

### Données Extraites

```json
{
  "neo_name": "(2024 AA1)",
  "estimated_diameter_min": 127.3,
  "estimated_diameter_max": 284.6,
  "is_potentially_hazardous": false,
  "seed": 8273648172648172
}
```

---

## Estimation Poids Total

| Asset | Taille |
|-------|--------|
| HTML | ~3KB |
| CSS | ~5KB |
| JavaScript | ~8KB |
| Font (Silkscreen) | ~8KB |
| Sprites (9 dés) | ~10KB |
| Audio | ~10KB |
| Données NASA (inline) | ~5KB |
| **TOTAL** | **~50KB** |

**Objectif atteint :** Site complet < 100KB, fonctionne offline.

---

## Principes "Slow Web" Respectés

- [x] Simplicité : une seule page, fonctionnalité ciblée
- [x] Minimalisme : palette limitée, assets optimisés
- [x] Offline-first : données embarquées, calcul local
- [x] Pas de tracking : aucun analytics, cookies, scripts tiers
- [x] Durabilité : zéro dépendance CDN externe
- [x] Respect bande passante : <100KB total

---

## Ressources

- [NASA NeoWs API](https://api.nasa.gov/)
- [MDN Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)
- [Silkscreen Font](https://fonts.google.com/specimen/Silkscreen)
