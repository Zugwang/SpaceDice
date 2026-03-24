# TODO — SpaceDice Reloaded

Features en attente, bugs connus et pistes d'amélioration.
Chaque item inclut un hint d'implémentation pour les agents IA.

---

## FEATURES EN ATTENTE

### #10 · Endpoint admin `/refresh`
**Priorité :** Basse
**Fichiers concernés :** `app/routes.py`, `app/nasa.py`, `.env.example`

**Description :**
Route HTTP POST protégée par token permettant de forcer un refresh des données NASA sans accès shell (ex. depuis un webhook ou un panneau admin minimal).

**Implémentation suggérée :**
```python
# app/routes.py
import os, secrets

ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', '')

@bp.route('/api/refresh', methods=['POST'])
def refresh():
    token = request.headers.get('X-Admin-Token', '')
    if not ADMIN_TOKEN or not secrets.compare_digest(token, ADMIN_TOKEN):
        abort(403)
    count = update_neo_cache()
    return jsonify({'status': 'ok', 'neo_count': count})
```

**Variables à ajouter dans `.env.example` :**
```
ADMIN_TOKEN=changeme_secret_token
```

**Avertissements :**
- Utiliser `secrets.compare_digest()` pour éviter les timing attacks
- Ne pas logguer le token
- Documenter dans README (curl example)

---

### #11 · Sons pixel art (Web Audio API)
**Priorité :** Basse
**Fichiers concernés :** `static/js/app.js`, `static/audio/` (vide)

**Description :**
Effets sonores rétro générés procéduralement via Web Audio API (aucun fichier audio requis). Sons différents selon le type de dé et le résultat (critical hit, miss, normal).

**Implémentation suggérée :**
```javascript
// Dans app.js, ajouter un module son :
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playRollSound(diceType, result) {
    if (!audioCtx) audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // Son chiptune : fréquence variant selon le résultat
    const freq = 200 + (result / diceType) * 400;  // 200Hz (min) → 600Hz (max)
    osc.type = 'square';   // wave carré = chiptune
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

// Cas spéciaux :
// d20 max (20) → fanfare (arpegio 3 notes montantes)
// d20 min (1) → note descendante
// d2 ON → bip court aigu
// d2 OFF → bip grave
```

**Ajouter dans le header controls :**
```html
<button class="sound-btn" id="sound-toggle" title="Sons on/off">🔇</button>
```

**Avertissements :**
- AudioContext doit être créé après un geste utilisateur (autoplay policy)
- Prévoir toggle mute persisté en localStorage
- Tester sur mobile (contraintes autoplay plus strictes)
- Ne pas déclencher pendant l'animation (jouer seulement au résultat final)

---

## AMÉLIORATIONS SOUHAITÉES

### A1 · Progressive Web App (PWA)
**Priorité :** Moyenne · **Fichiers :** `templates/index.html`, nouveau `static/sw.js`, nouveau `static/manifest.json`

**Description :** Service Worker pour cache offline + manifest pour installation.

**Hint :**
```javascript
// static/sw.js — Cache-first pour assets statiques
const CACHE = 'spacedice-v2';
const ASSETS = ['/static/css/style.css', '/static/js/app.js', ...fonts, ...sprites];

self.addEventListener('install', e => e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
));
self.addEventListener('fetch', e => e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
));
```

```json
// static/manifest.json
{
  "name": "SpaceDice Reloaded",
  "short_name": "SpaceDice",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#00ff41",
  "background_color": "#0a0a12",
  "icons": [...]
}
```

---

### A2 · Export de l'historique
**Priorité :** Basse · **Fichiers :** `static/js/app.js`

**Description :** Bouton pour télécharger l'historique de session en CSV ou JSON.

**Hint :**
```javascript
function exportHistory() {
    const csv = rollHistory.map(e =>
        `${e.time},d${e.diceType},${e.count},${e.results.join(';')},${e.sum},${e.neoName}`
    ).join('\n');
    const blob = new Blob(['time,dice,count,results,sum,neo\n' + csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `spacedice-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
}
```

---

### A3 · Mode dé fixe sur relance
**Priorité :** Basse · **Fichiers :** `static/js/app.js`

**Description :** Option pour relancer automatiquement le même dé avec la touche espace ou un double-clic.

**Hint :**
- Déjà implémenté : `document.addEventListener('keydown')` écoute Space/Enter
- Vérifier que ce listener est bien actif et fonctionne correctement

---

### A4 · Affichage 3D de l'orbite (ASCII isométrique)
**Priorité :** Basse · **Fichiers :** `static/js/app.js` (`renderOrbit2D`)

**Description :** Vue isométrique de l'orbite NEO au lieu de la vue top-down 2D actuelle. Montrer l'inclinaison orbitale (inclination angle disponible depuis l'API NASA si demandé).

**Hint :**
```
Vue isométrique ASCII :
       *
      / \
     /   ☀
    /     \
 [T]-------·
    \     /
     \   /
      \ /
       ·
```
Utiliser la distance_lunar comme rayon et l'inclinaison si disponible.

---

### A5 · Thème personnalisé
**Priorité :** Basse · **Fichiers :** `static/css/style.css`, `static/js/app.js`

**Description :** Permettre à l'utilisateur de choisir ses couleurs via un color picker et sauvegarder le thème personnalisé en localStorage.

**Hint :**
```javascript
// Modifier les variables CSS directement :
document.documentElement.style.setProperty('--accent-primary', '#ff0000');
// Sauvegarder un objet {name: 'custom', colors: {...}} en localStorage
```

---

### A6 · Accessibilité (a11y)
**Priorité :** Moyenne · **Fichiers :** `templates/index.html`, `static/js/app.js`, `static/css/style.css`

**Description :** Rendre le site utilisable au clavier et par lecteurs d'écran.

**Hint :**
- Ajouter `role="button"` + `aria-label` sur les boutons dés/thème/font/prng
- `aria-live="polite"` sur la zone résultat (annonce le lancer aux screen readers)
- Focus visible (outline) sur tous les éléments interactifs — actuellement supprimé par le reset CSS
- `alt` descriptifs sur les sprites (`<img>` dans multi-dice-grid)
- Ordre tabindex logique : sélecteur dé → nombre → LANCER → historique

---

### A7 · Favicon + Open Graph meta
**Priorité :** Moyenne · **Fichiers :** `templates/index.html`, `static/images/`

**Description :** Favicon (sprite d20 redimensionné) + balises `<meta property="og:*">` pour un aperçu correct sur les réseaux sociaux et Discord.

**Hint :**
```html
<link rel="icon" type="image/png" sizes="32x32" href="/static/sprites/dice/d20.png">
<meta property="og:title" content="SpaceDice Reloaded">
<meta property="og:description" content="Dés à entropie d'astéroïdes — NASA NEO CSPRNG">
<meta property="og:image" content="/static/images/og-preview.png">
```
Créer `og-preview.png` (1200×630) avec logo + orbite + dé.

---

### A8 · Partage de lancer (URL encodée)
**Priorité :** Basse · **Fichiers :** `static/js/app.js`

**Description :** Bouton "Partager" qui génère une URL contenant le résultat encodé (dé, résultat, NEO source) — aucun backend requis, tout dans le hash/query string.

**Hint :**
```javascript
function shareRoll(roll) {
    const params = new URLSearchParams({
        d: roll.diceType, r: roll.result, neo: roll.neoName
    });
    const url = `${location.origin}/#roll?${params}`;
    navigator.clipboard.writeText(url);
}
// Au chargement : parser location.hash pour afficher un lancer partagé
```

---

### A9 · Statistiques étendues (streaks, heatmap)
**Priorité :** Basse · **Fichiers :** `static/js/app.js`

**Description :** Au-delà du chi-carré : afficher la plus longue série (streak) de même résultat, une heatmap ASCII des fréquences par face, et la déviation standard.

**Hint :**
```
Heatmap d6 (250 lancers) :
  1 ████████████████░░░░  41  (16.4%)
  2 █████████████████░░░  43  (17.2%)
  3 ███████████████░░░░░  38  (15.2%)
  4 ████████████████████  50  (20.0%)  ← max
  5 ██████████████░░░░░░  36  (14.4%)
  6 ████████████████░░░░  42  (16.8%)
  σ = 4.73 · streak max = 4× face 4
```

---

### A10 · Animations CSS du lancer
**Priorité :** Basse · **Fichiers :** `static/css/style.css`, `static/js/app.js`

**Description :** Ajouter un shake CSS sur le sprite pendant l'animation et un flash/glow au résultat final, pour renforcer le feedback visuel sans ajouter de dépendance.

**Hint :**
```css
@keyframes dice-shake {
    0%, 100% { transform: translate(0); }
    25% { transform: translate(-3px, 2px) rotate(-2deg); }
    75% { transform: translate(3px, -2px) rotate(2deg); }
}
.dice-sprite.rolling { animation: dice-shake 80ms infinite; }
```

---

## BUGS CONNUS

### B1 · Orbite ASCII — largeur variable selon la distance
**Fichier :** `static/js/app.js` → `renderOrbit2D()`
**Symptôme :** La ligne du milieu de l'ellipse est 2 chars plus courte que les autres lignes quand Moon+Earth sont adjacents.
**Impact :** Cosmétique, l'ellipse reste lisible.
**Fix :** Ajuster les espaces dans la template string de la ligne centrale (row index 4).

---

### B2 · Chi-carré sur d2 peu significatif
**Fichier :** `static/js/app.js` → `runChiSquare()`
**Symptôme :** Le test chi-carré sur d2 (1 degré de liberté) est hypersensible : 100 lancers avec 55/45 donne p < 0.05 même si c'est normal.
**Impact :** Faux positifs fréquents sur d2.
**Fix potentiel :** Augmenter `MIN_FOR_ANALYSIS` à 200 pour d2, ou afficher une note spécifique.

---

### B3 · Font VT323 — rendu trop grand sur mobile
**Fichier :** `static/css/style.css`
**Symptôme :** VT323 rend les caractères ~2× plus grands que les autres fonts. Sur petit écran, les éléments `.orbit-bar` et `.terminal-output` débordent.
**Fix potentiel :** Réduire `font-size` conditionnellement via media query quand VT323 est actif, ou utiliser `font-size: 0.55rem` pour `.orbit-bar` quand `--ascii-font-family` contient VT323.

---

## DETTE TECHNIQUE

### DT1 · Tests d'intégration manquants
**Priorité :** Moyenne
Le fichier `tests/test_rng.py` teste uniquement le PRNG côté Python. Aucun test end-to-end (Selenium/Playwright) ni test de l'intégration JS. Aucun test des routes Flask, ni de `nasa.py`, ni de `db.py`.

**Couverture manquante :**
- Routes : `GET /` retourne 200 + JSON inline, `/api/neos?range=today` retourne JSON valide
- `nasa.py` : `generate_seed()` déterministe, `fetch_neo_date_range()` gestion erreurs API
- `db.py` : insert/upsert, contrainte unique `(nasa_id, approach_date)`
- JS (Playwright) : clic LANCER → résultat affiché, changement thème persiste après reload

### DT2 · Gestion d'erreur NASA API insuffisante
**Priorité :** Haute
`nasa.py` → `fetch_neo_date_range()` catch les erreurs par NEO individuellement (`pass` silencieux) mais un timeout réseau ou un 500 API n'est pas rattrapé proprement. Le script `fetch_nasa.py` gère mieux (try/except + continue), mais `nasa.py` importé directement par les routes pourrait crasher le worker Gunicorn.

**Fix :** Wrapper `requests.get()` avec retry (exponential backoff, max 3) + fallback sur les données DB existantes si le fetch échoue.

### DT3 · CSS/JS non minifiés en production
**Priorité :** Basse
`style.css` (~900 lignes) et `app.js` (~1300 lignes) sont servis tels quels. Ajouter une étape de minification dans le Dockerfile (ex. `csso` + `terser`) pour gagner ~40% de taille.

**Hint Dockerfile :**
```dockerfile
RUN npm install -g csso-cli terser && \
    csso static/css/style.css -o static/css/style.css && \
    terser static/js/app.js -o static/js/app.js -c -m
```

### DT4 · Pas de Content Security Policy (CSP)
**Priorité :** Haute (sécurité)
Le header CSP n'est pas configuré dans nginx.conf. Ajouter :
```nginx
add_header Content-Security-Policy "default-src 'self'; font-src 'self'; img-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self';" always;
```
Note : `'unsafe-inline'` nécessaire pour le bloc `<script>` Jinja2 qui injecte `NEO_DATA`. Alternative propre : déplacer les données vers un `<script src>` généré dynamiquement.

### DT5 · Pas de rate limiting sur /api/neos
**Priorité :** Haute (sécurité/prod)
L'endpoint `/api/neos?range=all` retourne potentiellement 29 000+ enregistrements sans pagination ni rate limit. Un bot pourrait saturer le serveur.

**Fix nginx :**
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/m;
location /api/ { limit_req zone=api burst=5 nodelay; }
```
**Fix Flask (pagination) :** Ajouter `?page=1&per_page=100` avec défaut et max 500.

### DT6 · Pas de health check endpoint
**Priorité :** Moyenne
Docker Compose et les orchestrateurs (Traefik, etc.) ont besoin d'un endpoint health check pour détecter les pannes.

**Fix :**
```python
# app/routes.py
@bp.route('/health')
def health():
    return jsonify({'status': 'ok', 'neo_count': get_neo_count()})
```
```yaml
# docker-compose.yml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
```

### DT7 · Pas de schema migration DB
**Priorité :** Basse
La table `neos` est créée par `db.py` avec `CREATE TABLE IF NOT EXISTS`. Si le schéma change (ajout colonne), il n'y a aucun mécanisme de migration. Pour un projet léger, un simple `schema_version` dans une table `meta` + script de migration suffit.

### DT8 · Seeds : perte d'entropie au XOR JS (53-bit → 32-bit)
**Priorité :** Basse (cosmétique)
`generate_seed()` produit des entiers sur 53 bits (`int(h, 16) % 2**53`), mais côté JS le XOR des seeds (`nasaSeed ^= neo.seeds[source]`) puis `>>> 0` tronque à 32 bits. Les 21 bits de poids fort sont perdus avant d'entrer dans le PRNG. Pas un problème de sécurité (crypto.getRandomValues apporte les 32 bits d'entropie), mais incohérent avec la promesse de "full precision seeds".

**Fix :** Soit réduire `generate_seed()` à `% 2**32`, soit utiliser `BigInt` côté JS pour le XOR avant la troncation finale.

### DT9 · Logs structurés absents
**Priorité :** Basse
Gunicorn log en texte brut. En prod avec Docker, des logs JSON (ex. `gunicorn --access-logformat '%(h)s %(t)s %(r)s %(s)s'` ou `python-json-logger`) facilitent le parsing par ELK/Loki.

### DT10 · Documentation des endpoints API incomplète
**Priorité :** Basse
`/api/neos` accepte `range=today|week|thisyear|all|month` mais ce n'est documenté nulle part (ni README, ni SPECS, ni ARCHITECTURE). Le pool date range selector ajouté récemment n'est pas documenté non plus.

---

## DÉPLOIEMENT VPS — CHECKLIST

### P1 · HTTPS (TLS) — 🔴 Bloquant
`docker-compose.yml` expose 8080:80 en HTTP brut. Deux options :
- **Traefik** : reverse proxy avec Let's Encrypt auto (recommandé VPS)
- **Certbot + nginx** : classique, nginx écoute 443 avec certificat

### P2 · .env production — 🔴 Bloquant
Créer `.env` avec :
```
NASA_API_KEY=clé_réelle        # DEMO_KEY = 30 req/h max
FLASK_ENV=production
SECRET_KEY=valeur_aléatoire_64chars
```

### P3 · Cron fetch NASA — 🔴 Bloquant
Le fetch est manuel. Options :
- Cron hôte : `0 6 * * * docker exec spacedice poetry run python scripts/fetch_nasa.py`
- Conteneur scheduler (ofelia) dans le compose

### P4 · nginx server_name — 🟠 Important
Remplacer `server_name localhost` par le domaine réel : `server_name spacedice.mondomaine.com;`

### P5 · Gunicorn workers — 🟠 Important
`workers = 2` OK pour 1 vCPU. Pour 2 vCPU : `workers = 3` (formule : 2 × CPU + 1).

### P6 · Cache-busting sprites — 🟡 Mineur
`expires 7d` pour les statiques. Si les sprites changent (thèmes), le browser garde l'ancien. Passer à `expires 1d` ou ajouter un hash dans le nom de fichier.

### P7 · Logrotate Docker — 🟡 Mineur
Gunicorn sort en stdout/stderr, Docker capture. Configurer `--log-opt max-size=10m --log-opt max-file=3` dans le compose.

### Ordre de déploiement recommandé
1. Cloner le repo sur le VPS
2. Créer `.env` avec `NASA_API_KEY` + `SECRET_KEY`
3. Modifier `nginx.conf` → `server_name` + port 443
4. Ajouter Traefik ou Certbot pour TLS
5. `docker compose up -d`
6. Fetch initial : `docker exec spacedice python scripts/fetch_nasa.py --init --days 6275`
7. Configurer le cron quotidien

---

## STRUCTURE DES FICHIERS CLÉS

Pour naviguer rapidement dans le code :

| Fonctionnalité | Fichier | Ligne approx. |
|----------------|---------|---------------|
| Factory Flask | `app/__init__.py` | entier |
| Route principale | `app/routes.py` | entier |
| Génération seeds | `app/nasa.py` | `generate_seed()` |
| Constantes JS | `static/js/app.js` | 1–35 |
| Traductions FR/EN | `static/js/app.js` | 175–320 |
| PRNG algorithms | `static/js/app.js` | 38–110 |
| Pixel font bitmap | `static/js/app.js` | 112–132 |
| drawPixelResult | `static/js/app.js` | 133–172 |
| Sélecteur police | `static/js/app.js` | 442–475 |
| rollOne() | `static/js/app.js` | ~500–525 |
| animateRoll() | `static/js/app.js` | ~548–575 |
| renderOrbit2D() | `static/js/app.js` | ~587–670 |
| Affichage multi-dés | `static/js/app.js` | ~695–745 |
| Chi-carré | `static/js/app.js` | ~770–830 |
| init() | `static/js/app.js` | ~895–940 |
| Variables CSS thème | `static/css/style.css` | 90–165 |
| body font selector | `static/css/style.css` | ~170 |
| Orbite ASCII styles | `static/css/style.css` | ~580–640 |
| Multi-dés grid CSS | `static/css/style.css` | ~310–380 |
