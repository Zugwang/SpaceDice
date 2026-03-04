# TODO — SpaceDice Reloaded

Features en attente, bugs connus et pistes d'amélioration.
Chaque item inclut un hint d'implémentation pour les agents IA.

---

## FEATURES EN ATTENTE

### #5 · Animation de chargement — Slot Machine
**Priorité :** Moyenne
**Fichiers concernés :** `static/js/app.js` (`animateRoll`), `static/css/style.css`

**Description :**
Remplacer l'animation shake + canvas flicker actuelle par une vraie animation de machine à sous : les chiffres défilent rapidement puis ralentissent et s'arrêtent sur le résultat final.

**État actuel :**
- `animateRoll(finalValue, diceType, cb)` dans `app.js` (ligne ~550)
- 12 steps de 50ms avec `Math.random()` pour les valeurs intermédiaires
- Canvas `drawPixelResult()` appelé à chaque step

**Implémentation suggérée :**
```javascript
// Phase 1 (0–400ms) : défilement rapide, interval 30ms
// Phase 2 (400–800ms) : ralentissement, interval exponentiel (30→200ms)
// Phase 3 : affichage final avec glow flash CSS
// Utiliser requestAnimationFrame() au lieu de setInterval pour fluidité
// CSS : ajouter @keyframes pour le glow au moment du résultat final
```

**Avertissements :**
- Ne pas casser la callback `cb()` qui déclenche `displayNeoData` et `displayMultiRollResults`
- Gérer correctement le multi-dés (chaque dé a son propre timing)
- Désactiver le roll button pendant toute la durée

---

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
**Fichiers :** `templates/index.html`, nouveau `static/sw.js`, nouveau `static/manifest.json`

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
**Fichiers :** `static/js/app.js`

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
**Fichiers :** `static/js/app.js`

**Description :** Option pour relancer automatiquement le même dé avec la touche espace ou un double-clic.

**Hint :**
- Déjà implémenté : `document.addEventListener('keydown')` écoute Space/Enter
- Vérifier que ce listener est bien actif et fonctionne correctement

---

### A4 · Affichage 3D de l'orbite (ASCII isométrique)
**Fichiers :** `static/js/app.js` (`renderOrbit2D`)

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
**Fichiers :** `static/css/style.css`, `static/js/app.js`

**Description :** Permettre à l'utilisateur de choisir ses couleurs via un color picker et sauvegarder le thème personnalisé en localStorage.

**Hint :**
```javascript
// Modifier les variables CSS directement :
document.documentElement.style.setProperty('--accent-primary', '#ff0000');
// Sauvegarder un objet {name: 'custom', colors: {...}} en localStorage
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
Le fichier `tests/test_rng.py` teste uniquement le PRNG côté Python. Aucun test end-to-end (Selenium/Playwright) ni test de l'intégration JS. Priorité basse.

### DT2 · Gestion d'erreur NASA API insuffisante
`nasa.py` → `fetch_neo_data()` lève des exceptions non catchées si l'API retourne une erreur HTTP ou un JSON malformé. Ajouter un `try/except` avec fallback sur les données cachées existantes.

### DT3 · CSS non minifié en production
Le `style.css` (~900 lignes) est servi tel quel. Ajouter une étape de minification dans le build Docker (ex. `csso` ou `cleancss`) pour réduire à ~6KB.

### DT4 · Pas de Content Security Policy (CSP)
Le header CSP n'est pas configuré dans nginx.conf. Ajouter :
```nginx
add_header Content-Security-Policy "default-src 'self'; font-src 'self'; img-src 'self'; script-src 'self'; style-src 'self';" always;
```

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
