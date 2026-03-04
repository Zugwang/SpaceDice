# Frontend Reference — SpaceDice Reloaded

Guide technique pour modifier le frontend (SPA vanilla JS + CSS).
À lire en parallèle avec `ARCHITECTURE.md`.

---

## Structure de app.js

Fichier unique `static/js/app.js`. Tout est encapsulé dans un IIFE :

```javascript
(function () {
    'use strict';
    // ... tout le code ...
})();
```

Les seules globales accessibles de l'extérieur sont `NEO_DATA` et `DATA_META` (injectées par Jinja2 avant le chargement du script).

---

## Constantes et état

### Constantes (en haut du fichier)
```javascript
const DICE_WITH_SPRITES = [4, 6, 8, 10, 12, 20, 100];  // ont un PNG
const DICE_TYPES        = [2, 3, 4, 6, 8, 10, 12, 20, 100];
const MAX_DICE_COUNT    = 10;
const MIN_FOR_ANALYSIS  = 100;  // rolls nécessaires avant chi-carré
const MAX_HISTORY       = 10;   // entrées gardées en historique
const NEO_POOL_SIZE     = 3;    // astéroïdes combinés par roll

// Clés localStorage
const SK_THEME   = 'spacedice-theme';
const SK_ENTROPY = 'spacedice-entropy';
const SK_LANG    = 'spacedice-lang';
const SK_PRNG    = 'spacedice-prng';
const SK_FONT    = 'spacedice-font';
```

### État mutable (variables `let`)
```javascript
let currentDice          = 6;         // type de dé actif
let diceCount            = 1;         // nombre de dés
let isRandomMode         = false;      // mode dé aléatoire
let isRolling            = false;      // animation en cours
let currentEntropySource = 'combined'; // source seed active
let currentPrngAlgo      = 'xor';     // algo PRNG actif
let currentLang          = 'fr';       // langue active
let currentFont          = 'ibm';     // police active

const rollStats   = {};   // { diceType: { face: count, _total: n } }
const rollHistory = [];   // session history (newest first)
```

---

## Système i18n

### Structure des traductions
```javascript
const TR = {
    fr: {
        title: 'SPACE DICE',
        subtitle: "Dés à Entropie d'Astéroïdes",
        // ... toutes les clés
        api_lines: [  // tableau de lignes pour le bloc doc NASA
            '> ligne 1',
            '> ligne 2 avec {p} placeholder',
        ],
    },
    en: { /* mêmes clés */ },
};
```

### Utilisation
```javascript
t('key')                     // → string traduite en langue courante
t('key', {n: 5, d: 6})      // → avec remplacement de variables
t('neos_loaded', {n: 14, p: 3})  // → "> 14 NEOs chargés (3 par lancer)"
```

**Placeholders supportés :** `{n}`, `{d}`, `{v}`, `{p}`

### Application aux éléments HTML
```javascript
// Appliqué automatiquement lors de setLang() :
document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
});
```

Tout élément avec `data-i18n="key"` est mis à jour à chaque changement de langue.

---

## Système de thèmes CSS

### Switching
```javascript
function setTheme(name) {
    document.body.setAttribute('data-theme', name);  // active les variables CSS
    localStorage.setItem(SK_THEME, name);
    // Si un canvas est affiché, le redessiner avec la nouvelle couleur
    if (resultCanvas._lastText) drawPixelResult(resultCanvas._lastText);
}
```

### Variables CSS par thème
Chaque thème définit ces variables dans `style.css` :
```css
[data-theme="terminal"] {
    --bg-deep: #0a0a12;
    --bg-surface: #12121a;
    --bg-image: none;
    --accent-primary: #00ff41;
    --accent-secondary: #5bcefa;
    --accent-highlight: #f4d03f;
    --accent-danger: #ff6b6b;
    --text-primary: #e0e0e0;
    --text-secondary: #808080;
    --border: #2a2a3a;
    --glow-color: #00ff41;
}
```

**Couleur canvas (pixel art result) :**
```javascript
const color = getComputedStyle(document.body)
    .getPropertyValue('--accent-highlight').trim() || '#f4d03f';
```
Le canvas lit la variable CSS → il faut redessiner après un changement de thème.

---

## Sélecteur de police

### Fonts disponibles
```javascript
const FONT_OPTIONS = {
    ibm:         "'IBM Plex Mono', 'Courier New', monospace",
    vt323:       "'VT323', 'Courier New', monospace",
    share:       "'Share Tech Mono', 'Courier New', monospace",
    inconsolata: "'Inconsolata', 'Courier New', monospace",
};
```

### Mécanisme de changement
```javascript
function setAsciiFont(fontKey) {
    const family = FONT_OPTIONS[fontKey] || FONT_OPTIONS.ibm;
    const primaryName = family.replace(/'/g, '').split(',')[0].trim();

    // Attendre que la font soit chargée avant de swapper (évite FOUT)
    document.fonts.load('1em "' + primaryName + '"').then(() => {
        document.documentElement.style.setProperty('--ascii-font-family', family);
    });
}
```

**Pourquoi `document.fonts.load()` ?**
Sans ça, le navigateur charge la font en arrière-plan (avec `font-display: swap`) et le changement visuel est retardé ou invisible pendant le chargement.

### Éléments PINNED (non affectés par le sélecteur)
Ces éléments ont une `font-family` CSS explicite qui overrides l'héritage du `body` :
- `.title` → Silkscreen
- `.subtitle` → Courier New
- `.dice-type-label` → Silkscreen
- `.footer p` → Courier New

**Tout autre élément** hérite `var(--ascii-font-family)` via `body`.

---

## Canvas pixel art

### Bitmap de la police (5×7 pixels)
```javascript
const PF = {
    '0': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    // ... chaque caractère = 7 entiers de 5 bits
    // bit 4 = colonne gauche, bit 0 = colonne droite
};
const PF_W = 5, PF_H = 7, PF_GAP = 2;  // gap entre caractères
```

### Rendu adaptatif
```javascript
function drawPixelResult(text) {
    const n = String(text).length;
    const scale = n <= 2 ? 9 : n <= 3 ? 7 : 5;  // pixels par bit
    // canvas.width = n * (PF_W + PF_GAP) * scale - PF_GAP * scale
    // canvas.height = PF_H * scale + 4
    // ctx.fillRect() pour chaque bit à 1
}
```

**Caractères supportés :** `0-9`, `-`, ` `, `O`, `N`, `F`, `?`

**Usage :**
- Résultat normal : `drawPixelResult(42)` → "42"
- d2 ON/OFF : `drawPixelResult('ON')` ou `drawPixelResult('OF')`
- Attente : `drawPixelResult('-')`
- Animation : `drawPixelResult('?')`

**Redessiner après changement de thème :**
```javascript
if (resultCanvas._lastText) drawPixelResult(resultCanvas._lastText);
// resultCanvas._lastText est mis à jour à chaque drawPixelResult()
```

---

## Multi-NEO entropy

### Sélection du pool
```javascript
function selectNeoPool() {
    const n = Math.min(NEO_POOL_SIZE, NEO_DATA.length);  // max 3
    const pool = [];
    const used = new Set();
    while (pool.length < n) {
        const idx = getSecureRandom() % NEO_DATA.length;  // sécurisé
        if (!used.has(idx)) { used.add(idx); pool.push(NEO_DATA[idx]); }
    }
    return pool;  // [primaryNeo, secondaryNeo, tertiaryNeo]
}
```

### Combinaison des seeds
```javascript
function rollOne(diceType) {
    const pool = selectNeoPool();
    let nasaSeed = 0;
    for (const neo of pool) {
        nasaSeed ^= neo.seeds[currentEntropySource];  // XOR combinaison
    }
    nasaSeed = nasaSeed >>> 0;  // force uint32

    const cryptoRand = getSecureRandom();
    const algo = PRNG_ALGOS[currentPrngAlgo] || PRNG_ALGOS.xor;
    const combined = algo.fn(nasaSeed, cryptoRand);

    return {
        result: (combined % diceType) + 1,
        neo: pool[0] || null,  // NEO principal affiché
        pool                   // tous les NEOs (pour affichage pool)
    };
}
```

---

## Affichage multi-dés

### Comportement selon le count
- **1 dé** : affichage normal (sprite grand + canvas résultat)
- **N dés** : grille horizontale de N sprites avec résultats individuels

### Séquence pour N > 1 dés
1. **Avant animation :** Restaure le sprite unique (pour l'animation shake)
   ```javascript
   diceSprite.style.display = '...';  // dans handleRoll()
   resultCanvas.style.display = 'block';
   multiRollResultsEl.innerHTML = '';
   ```
2. **Pendant animation :** `animateRoll()` montre canvas + sprite unique
3. **Après animation :** `displayMultiRollResults()` appelé dans le callback
   - Cache `.dice-sprite` et `#result-canvas`
   - Rend `<div class="multi-dice-grid">` avec N `.multi-dice-cell`

### Restauration du mode single
Appelée quand l'utilisateur change de type de dé ou de count :
```javascript
function restoreSingleDisplay() {
    const hasSpr = !isRandomMode && DICE_WITH_SPRITES.includes(currentDice);
    diceSprite.style.display    = hasSpr ? 'flex' : 'none';
    resultCanvas.style.display  = 'block';
    diceTypeLabel.style.display = 'block';
    multiRollResultsEl.innerHTML = '';
    drawPixelResult('-');
}
```

---

## Orbite ASCII 2D

### Structure du rendu
`renderOrbit2D(neo)` retourne une string HTML :
```html
<p class="orbit-title">ORBITE</p>
<pre class="orbit-bar">           · · · · · · · · · ·
         ·                     ·
       ·                         ·
     ·                             ·
   · ☀                 ☽[T]   · · ·★ 5.2 LD
     ·                             ·
       ·                         ·
         ·                     ·
           · · · · · · · · · ·</pre>
<pre class="orbit-scale">◉─────────☽─────────★───────────────────────☀
           1LD         5.2LD                      389LD
           └─ échelle log₁₀ (LD depuis la Terre)</pre>
```

### Ellipse (9 lignes)
- **Sun (☀)** : dans la ligne centrale, position fixe côté gauche
- **Moon (☽)** : juste avant la Terre dans la ligne centrale
- **Earth ([T]/[E])** : côté droit de l'ellipse
- **NEO (★/⚠)** : au-delà de l'ellipse, distance proportionnelle (linéaire)
  - 0 LD → adjacent
  - 60 LD → 13 `·` de gap
  - ⚠ si `hazardous && ld < 10`

### Règle logarithmique
```javascript
const RULER_W = 40;
const LOG_MAX = Math.log10(3890);  // log10(389 × 10)

function rPos(distLD) {
    return Math.min(
        Math.round(Math.log10(Math.max(distLD, 0.01) * 10) / LOG_MAX * RULER_W),
        RULER_W
    );
}
// Moon  (1 LD)   → position ~11
// NEO   (X LD)   → position variable
// Sun   (389 LD) → position 40 (bord droit)
```

---

## Statistiques (Chi-carré)

### Accumulation des lancers
```javascript
const rollStats = {};
// { 6: { 1: 17, 2: 19, 3: 16, 4: 18, 5: 15, 6: 15, _total: 100 } }

function recordRolls(rolls, diceType) {
    if (!rollStats[diceType]) { /* initialise */ }
    rolls.forEach(({result}) => {
        rollStats[diceType][result]++;
        rollStats[diceType]._total++;
    });
}
```

### Calcul du chi-carré
```javascript
// χ² = Σ (observé - attendu)² / attendu
// attendu = total / faces
// degrés de liberté = faces - 1
// p-valeur via gammaCF / gammaSeries (Lanczos approx.)
// Si p < 0.05 → rejet H₀ (distribution non uniforme)
```

---

## CSS — Composants clés

### Grille multi-dés
```css
.multi-dice-grid { display: flex; flex-wrap: wrap; gap: 0.6rem 0.8rem; }
.multi-dice-cell { display: flex; flex-direction: column; align-items: center; }
.multi-dice-img  { width: 40px; height: 40px; image-rendering: pixelated; }
.multi-dice-result { font-size: 0.85rem; color: var(--accent-highlight); }
```

### Canvas résultat
```css
.result-canvas {
    image-rendering: pixelated;  /* crucial pour pixels nets */
    filter: drop-shadow(0 0 12px var(--glow-color));
}
```

### Orbite
```css
.orbit-bar   { font-size: 0.72rem; white-space: pre; overflow-x: auto; }
.orbit-scale { font-size: 0.62rem; white-space: pre; opacity: 0.85; }
.orbit-title { font-size: 0.58rem !important; }
.orbit-status { display: none; }  /* ligne statut cachée */
```

### Système de police via variable CSS
```css
/* body hérite à tous les descendants par défaut */
body { font-family: var(--ascii-font-family); }

/* Exceptions pinned (ne suivent pas le sélecteur) */
.title         { font-family: 'Silkscreen', monospace; }
.subtitle      { font-family: 'Courier New', monospace; }
.dice-type-label { font-family: 'Silkscreen', monospace; }
.footer p      { font-family: 'Courier New', monospace; }
```

---

## Flow d'initialisation complet

```javascript
init()
  ├─ loadTheme()         → [localStorage] → setTheme(name)
  │                           → body[data-theme=name]
  │                           → themeBtn.active toggle
  ├─ loadEntropySource() → [localStorage] → setEntropySource(source)
  │                           → entropyBtn.active toggle
  ├─ loadPrngAlgo()      → [localStorage] → setPrngAlgo(algo)
  │                           → prngBtn.active toggle
  │                           → updatePrngInfo() → affiche desc + wiki link
  ├─ loadAsciiFont()     → [localStorage] → setAsciiFont(fontKey)
  │                           → document.fonts.load() → setProperty(--ascii-font-family)
  │                           → fontBtn.active toggle
  ├─ loadLang()          → [localStorage] → setLang(lang)
  │                           → document.lang = lang
  │                           → applyTranslations()
  │                               → data-i18n elements update
  │                               → api_lines update
  │                               → updatePrngInfo()
  │                               → updateAnalysisStatus()
  │                               → renderHistory()
  │                               → renderDataStatus()
  ├─ [addEventListener] roll, dice-grid, theme, lang, entropy, prng, font, count, analyse
  ├─ setDiceCount(1)     → init le compteur UI
  ├─ updateSprite(6)     → affiche sprite d6
  ├─ drawPixelResult('-') → canvas à tiret
  ├─ [NEO count display] → affiche nb NEOs chargés
  ├─ updateAnalysisStatus() → affiche besoin de lancers
  └─ renderDataStatus()  → affiche statut clé NASA
```

---

## Ajout d'une nouvelle fonctionnalité : checklist

1. **HTML** : ajouter l'élément avec `data-i18n` si texte traduit, `id` si référencé en JS
2. **CSS** : ajouter les styles dans la section appropriée (éviter les `font-family` explicites sauf exclusion intentionnelle)
3. **JS** :
   - Ajouter la ref DOM dans la section `DOM` (en haut de l'IIFE)
   - Si état persisté : ajouter constante `SK_*` et `load*()/set*()` functions
   - Si traduit : ajouter clé dans `TR.fr` et `TR.en`
   - Wirer l'event listener dans `init()`
4. **Pas de dépendances externes** : tout doit fonctionner sans CDN
5. **Tester offline** : couper le réseau et vérifier le comportement
