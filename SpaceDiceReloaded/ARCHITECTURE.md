# Architecture — SpaceDice Reloaded

Guide de référence pour agents IA et développeurs. Décrit l'architecture complète du système, les flux de données, et les conventions du projet.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                     │
│                                                          │
│  index.html ──── app.js (IIFE SPA) ──── style.css        │
│       │              │                                   │
│       │     crypto.getRandomValues()                     │
│       │     NEO_DATA (embedded JSON)                     │
│       │     localStorage (theme/font/lang/prng)          │
└───────┼──────────────────────────────────────────────────┘
        │  Single HTTP GET /
        │  (tout le HTML + JSON embarqué en une requête)
┌───────┼──────────────────────────────────────────────────┐
│       │          BACKEND (Flask + Gunicorn)               │
│                                                          │
│  routes.py ──── nasa.py ──── data/neows_data.json        │
│      │                                                   │
│  templates/index.html (Jinja2)                           │
│  static/ (CSS, JS, fonts, sprites)                       │
└─────────────────────────────────────────────────────────┘
        │  (production seulement)
┌───────┼──────────────────────────────────────────────────┐
│       │          NGINX (reverse proxy)                    │
│                                                          │
│  /static/* → cache 7 jours                              │
│  /         → proxy vers Gunicorn:8000                    │
└─────────────────────────────────────────────────────────┘
        │  Cron quotidien
┌───────┼──────────────────────────────────────────────────┐
│       │          scripts/fetch_nasa.py                   │
│                                                          │
│  NASA NEO API → generate_seed() → neows_data.json        │
└─────────────────────────────────────────────────────────┘
```

---

## Flux de données : lancer de dé

```
[Utilisateur clique LANCER]
         │
         ▼
selectNeoPool()
  ├─ Tire 3 NEOs aléatoires depuis NEO_DATA[]
  ├─ Chaque NEO a des seeds pré-calculées (diameter/velocity/distance/combined)
  └─ XOR les 3 seeds du type sélectionné → nasaSeed (uint32)
         │
         ▼
getSecureRandom()
  └─ crypto.getRandomValues(Uint32Array(1)) → cryptoRand (uint32)
         │
         ▼
PRNG_ALGOS[currentPrngAlgo].fn(nasaSeed, cryptoRand)
  ├─ XOR : (nasa ^ crypto) >>> 0
  ├─ LCG : (1664525 * (nasa ^ crypto) + 1013904223) % 2^32
  ├─ XORSHIFT : série de XOR shifts (Marsaglia 2003)
  └─ MURMUR3 : avalanche mixing (Austin Appleby)
         │
         ▼
combined (uint32)
  └─ result = (combined % diceType) + 1   → [1, diceType]
         │
         ▼
animateRoll() → drawPixelResult() → displayNeoData() → renderOrbit2D()
```

---

## Flux de données : chargement de la page

```
Browser GET /
         │
         ▼
routes.py : index()
  ├─ load_neo_data() → lit data/neows_data.json
  │     ├─ Format legacy (array) : convertit automatiquement
  │     └─ Format moderne (dict) : extrait _meta + neos
  ├─ data_meta = {is_demo_key, is_fresh, fetched_at, neo_count}
  └─ render_template('index.html', neo_data=neos, data_meta=meta)
         │
         ▼
index.html (Jinja2)
  └─ <script>
       const NEO_DATA = {{ neo_data | tojson }};  // tableau JS inline
       const DATA_META = {{ data_meta | tojson }}; // objet JS inline
     </script>
         │
         ▼
app.js : init()
  ├─ loadTheme()         → lit localStorage → setTheme()
  ├─ loadEntropySource() → lit localStorage → setEntropySource()
  ├─ loadPrngAlgo()      → lit localStorage → setPrngAlgo()
  ├─ loadAsciiFont()     → lit localStorage → setAsciiFont() → document.fonts.load()
  ├─ loadLang()          → lit localStorage → setLang() → applyTranslations()
  ├─ Wire tous les event listeners
  ├─ setDiceCount(1)     → initialise compteur de dés
  ├─ updateSprite(6)     → affiche le sprite d6
  ├─ drawPixelResult('-') → affiche tiret en canvas
  ├─ Affiche comptage NEO chargés
  ├─ updateAnalysisStatus() → affiche progrès chi-carré
  └─ renderDataStatus()  → affiche statut clé NASA en footer
```

---

## Structure des fichiers détaillée

### Backend

#### `app/__init__.py`
```python
def create_app():
    app = Flask(__name__,
        template_folder='../templates',
        static_folder='../static')
    app.register_blueprint(bp)
    return app
```

**Pattern :** Application factory. `create_app()` est appelée par Gunicorn.
**Attention :** Les chemins `template_folder` et `static_folder` sont relatifs au fichier `__init__.py` (dans `app/`), d'où `../`.

---

#### `app/routes.py`

**Route unique :** `GET /`

```python
def load_neo_data() -> tuple[list, dict]:
    # Retourne (neos: list[dict], meta: dict)
    # Gère deux formats JSON :
    #   Legacy : [...] → liste directe
    #   Moderne : {"_meta": {...}, "neos": [...]}
    # Calcule is_fresh : fetched_at < 48h
    # Calcule is_demo_key : NASA_API_KEY == 'DEMO_KEY'
```

**Variables template exposées :**
- `neo_data` : `list[dict]` — tableau de NEOs (injecté comme `NEO_DATA` JS)
- `data_meta` : `dict` — métadonnées (injecté comme `DATA_META` JS)

---

#### `app/nasa.py`

**Fonction principale :** `fetch_neo_data() → list[dict]`

**Endpoint NASA appelé :**
```
GET https://api.nasa.gov/neo/rest/v1/feed/today
    ?api_key={NASA_API_KEY}
    &start_date={today}
    &end_date={today}
```

**Génération des seeds :**
```python
def generate_seed(value: str) -> int:
    h = hashlib.sha256(value.encode()).hexdigest()
    return int(h, 16) % (2 ** 53)  # Safe integer pour JavaScript
```

Seeds calculées pour chaque NEO :
- `diameter` : SHA256(f"{diam_min_m:.4f}_{diam_max_m:.4f}")
- `velocity` : SHA256(f"{vel_kms:.4f}_{vel_kmh:.4f}")
- `distance` : SHA256(f"{dist_km:.4f}")
- `combined` : SHA256(f"{diam}_{vel}_{dist}")

**Format JSON sauvegardé (`data/neows_data.json`) :**
```json
{
  "_meta": {
    "fetched_at": "2024-01-15T03:00:00.000000+00:00",
    "api_key_demo": false,
    "count": 14
  },
  "neos": [
    {
      "name": "(2024 AA1)",
      "id": "3842761",
      "hazardous": false,
      "diameter_min": 127.32,
      "diameter_max": 284.63,
      "velocity_kms": 14.73,
      "velocity_kmh": 53028.0,
      "distance_km": 3812400.0,
      "distance_lunar": 9.92,
      "approach_date": "2024-01-15",
      "seeds": {
        "diameter": 4729184736281947,
        "velocity": 2918473629184736,
        "distance": 7361829473618294,
        "combined": 1847362918473629
      }
    }
  ]
}
```

---

### Frontend

#### `templates/index.html`

Template Jinja2 unique. Structure principale :

```html
<head>
  <!-- 6 <link rel="preload"> pour les fonts woff2 -->
  <!-- <link> stylesheet -->
</head>
<body>
  <div class="container">
    <header class="header">
      <!-- Titre + sélecteurs : thème / lang / police -->
    </header>
    <div class="info-panel">   <!-- 2 colonnes -->
      <div class="entropy-source">
        <!-- Sélecteur source seed, info NEO, orbite ASCII, PRNG selector -->
      </div>
      <div class="api-info">
        <!-- Documentation NASA API -->
      </div>
    </div>
    <main class="main">
      <div class="dice-selector">
        <!-- Grille de boutons d2–d100 + dé aléatoire -->
        <!-- Sélecteur nombre de dés (1–10) -->
      </div>
      <div class="roll-zone">
        <!-- Sprite PNG + canvas résultat + label "dX" -->
        <!-- Zone résultats multi-dés -->
        <!-- Bouton LANCER -->
      </div>
    </main>
    <div class="history-panel"> ... </div>
    <div class="analysis-panel"> ... </div>
    <footer class="footer">
      <!-- Crédits + statut données NASA -->
    </footer>
  </div>
  <!-- JSON injecté par Jinja2 -->
  <script>
    const NEO_DATA = {{ neo_data | tojson }};
    const DATA_META = {{ data_meta | tojson }};
  </script>
  <script src="{{ url_for('static', filename='js/app.js') }}"></script>
</body>
```

**Attributs i18n :** Tout texte traduit utilise `data-i18n="key"` — l'attribut est lu par `applyTranslations()` dans JS.

**Attributs data- sur les boutons :**
- `.theme-btn` → `data-theme="terminal|oneshot|celeste|v1"`
- `.lang-btn` → `data-lang="fr|en"`
- `.font-btn` → `data-font="ibm|vt323|share|inconsolata"`
- `.dice-btn` → `data-dice="2|3|4|6|8|10|12|20|100|random"`
- `.entropy-btn` → `data-source="diameter|velocity|distance|combined"`
- `.prng-btn` → `data-algo="xor|lcg|xorshift|murmur"`

---

#### `static/js/app.js`

**Architecture :** IIFE (`(function() { 'use strict'; ... })()`) — tout est encapsulé, aucune variable globale sauf `NEO_DATA` et `DATA_META` (injectées par Jinja2).

**Modules fonctionnels dans l'IIFE :**

```
CONSTANTS        → DICE_TYPES, MAX_DICE_COUNT, NEO_POOL_SIZE, SK_* (localStorage keys)
FONT_OPTIONS     → map fontKey → CSS font-family value
PRNG_ALGOS       → map algoKey → {name, formula, desc, wiki, fn}
PIXEL FONT (PF)  → bitmap 5×7 par caractère (0-9, -, O, N, F, ?, space)
TRANSLATIONS (TR)→ {fr: {...}, en: {...}} — toutes les chaînes UI
STATE            → currentDice, diceCount, currentLang, currentFont, etc.
DOM refs         → tous les getElementById/querySelector en haut de l'IIFE
i18n             → t(), applyTranslations(), setLang(), loadLang()
THEME            → setTheme(), loadTheme()
ENTROPY          → setEntropySource(), loadEntropySource()
PRNG             → setPrngAlgo(), loadPrngAlgo(), updatePrngInfo()
FONT             → setAsciiFont(), loadAsciiFont() [Font Loading API]
DICE COUNT       → setDiceCount(), restoreSingleDisplay()
CSPRNG           → getSecureRandom(), selectNeoPool(), rollOne(), rollMany()
SPRITES          → updateSprite(), updateDiceLabel()
ANIMATION        → animateRoll()
ORBIT 2D         → renderOrbit2D() [ellipse ASCII + règle log]
DISPLAY NEO      → displayNeoData(), fmtSeedHex()
MULTI-DICE       → displayMultiRollResults()
HISTORY          → addToHistory(), renderHistory()
DATA STATUS      → renderDataStatus()
STATISTICS       → logGamma(), gammaSeries(), gammaCF(), chiSquarePValue(), runChiSquare()
HANDLERS         → handleRoll(), handleDiceSelect()
INIT             → init() [wires tout]
```

---

#### `static/css/style.css`

**Ordre des sections (important pour la spécificité CSS) :**

1. `@font-face` — Silkscreen (3 fichiers), IBM Plex Mono (3), VT323 (1), Share Tech Mono (1), Inconsolata (2)
2. `:root` — Variable `--ascii-font-family` (modifiée par JS)
3. `:root, [data-theme="terminal"]` — Variables de thème par défaut
4. `[data-theme="oneshot|celeste|v1"]` — Variantes de thème
5. Reset (`*, *::before, *::after`)
6. Base (`html`, `body` avec `font-family: var(--ascii-font-family)`)
7. `.ascii-font` — utility class (héritage du body, redondant mais explicite)
8. Layout (`.container`, `.header`, `.header-controls`)
9. **Éléments PINNED** (police fixe, non affectée par le sélecteur) :
   - `.title` → `font-family: 'Silkscreen', monospace`
   - `.subtitle` → `font-family: 'Courier New', monospace`
   - `.dice-type-label` → `font-family: 'Silkscreen', monospace`
   - `.footer p` → `font-family: 'Courier New', monospace`
10. Composants (boutons, panneaux, canvas, grille multi-dés, historique, analyse, orbite)
11. `@media (max-width: 580px)` — responsive

**Convention importante :** Pour qu'un élément suive le sélecteur de police, il ne doit PAS avoir de `font-family` explicite — il hérite de `body`. Les 4 éléments pinned listés ci-dessus sont les seules exceptions.

---

## Conventions du projet

### Nommage

| Type | Convention | Exemple |
|------|-----------|---------|
| Variables JS | camelCase | `currentDice`, `rollHistory` |
| Constantes JS | SCREAMING_SNAKE | `DICE_TYPES`, `SK_THEME` |
| Fonctions JS | camelCase verbe | `handleRoll()`, `setTheme()` |
| Classes CSS | kebab-case | `.dice-btn`, `.orbit-bar` |
| Variables CSS | `--kebab-case` | `--accent-primary` |
| Clés localStorage | `spacedice-name` | `spacedice-theme` |
| Clés i18n | `snake_case` | `orbit_title`, `analyse_chi2` |

### i18n

Ajouter une nouvelle clé traduite :
1. Ajouter dans `TR.fr.{key}` et `TR.en.{key}` dans `app.js`
2. Ajouter `data-i18n="{key}"` sur l'élément HTML
3. Le texte HTML par défaut = valeur FR (fallback Jinja2 non-JS)

Variables dans les traductions : `{n}`, `{d}`, `{v}`, `{p}` — remplacées par `t(key, {n: val, ...})`

### Thèmes

Ajouter un nouveau thème :
1. Ajouter bloc `[data-theme="newtheme"]` dans `style.css` avec les 10 variables CSS
2. Ajouter un bouton `.theme-btn[data-theme="newtheme"]` dans `index.html`
3. Ajouter entrée dans `TR.fr/en` si un label traduit est nécessaire

### PRNG

Ajouter un nouvel algorithme PRNG :
1. Ajouter entrée dans `PRNG_ALGOS` dans `app.js` :
   ```javascript
   myalgo: {
       name: 'MYALGO',
       formula: 'description courte',
       desc: { fr: '...', en: '...' },
       wiki: { fr: 'url_fr', en: 'url_en' },
       fn: (nasa, crypto) => { /* retourne uint32 */ },
   }
   ```
2. Ajouter bouton `.prng-btn[data-algo="myalgo"]` dans `index.html`

---

## Dépendances et versions

### Production (dans le container)
```
python     3.12
flask      3.x
gunicorn   21.x
requests   2.31.x
python-dotenv 1.x
nginx      alpine (latest)
```

### Développement uniquement
```
numpy      2.x    (tests statistiques)
scipy      1.14.x (tests statistiques)
statsmodels 0.14.x (tests statistiques)
pytest     8.x
```

### Fonts (woff2 locaux)
```
Silkscreen        v6   (Google Fonts)
IBM Plex Mono     v20  (Google Fonts)
VT323             v18  (Google Fonts)
Share Tech Mono   v16  (Google Fonts)
Inconsolata       v37  (Google Fonts)
```

---

## Décisions d'architecture

### Pourquoi pas de base de données ?
Le seul état persistant est `neows_data.json` (quelques KB, mis à jour 1×/jour). Une DB serait surdimensionnée. SQLite possible si on veut persister l'historique des lancers entre sessions.

### Pourquoi pas de framework JS ?
La SPA est simple (< 1300 lignes). Pas de routing complexe, pas de composants imbriqués, pas de gestion d'état partagé. Vanilla JS suffit et évite les dépendances.

### Pourquoi le JSON est injecté dans le HTML ?
Offline-first : une seule requête HTTP suffit pour charger l'app complète avec ses données. Les rolls suivants sont 100% client-side. Pas de fetch API nécessaire.

### Pourquoi SHA-256 pour les seeds ?
Les valeurs orbitales (diamètre, vitesse, distance) ont des plages très différentes et des distributions non-uniformes. SHA-256 les mappe en entiers uniformes sur [0, 2^53).

### Pourquoi XOR des 3 NEOs ?
`seed_A ⊕ seed_B ⊕ seed_C` : si l'un des seeds est de haute entropie, le résultat l'est aussi. Le XOR ne dégrade jamais l'entropie, contrairement à une addition ou multiplication.
