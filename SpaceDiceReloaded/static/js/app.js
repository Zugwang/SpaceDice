/**
 * SpaceDice Reloaded — Client-side SPA
 * Features: i18n FR/EN · pixel art canvas result · PRNG selector · multi-NEO entropy
 *           roll history · multi-dice · 2D ASCII orbit · chi-square stats
 */
(function () {
    'use strict';

    // ─────────────────────────────────────────
    //  CONSTANTS
    // ─────────────────────────────────────────
    const DICE_WITH_SPRITES = [4, 6, 8, 10, 12, 20, 100];
    const DICE_TYPES        = [2, 3, 4, 6, 8, 10, 12, 20, 100];
    const MAX_DICE_COUNT    = 10;
    const MIN_FOR_ANALYSIS  = 100;
    const MAX_HISTORY       = 10;
    const NEO_POOL_SIZE     = 3;   // asteroids contributing to each roll

    const SK_THEME   = 'spacedice-theme';
    const SK_ENTROPY = 'spacedice-entropy';
    const SK_LANG    = 'spacedice-lang';
    const SK_PRNG    = 'spacedice-prng';
    const SK_FONT    = 'spacedice-font';

    // ─────────────────────────────────────────
    //  ASCII FONT OPTIONS
    // ─────────────────────────────────────────
    const FONT_OPTIONS = {
        ibm:         "'IBM Plex Mono', 'Courier New', monospace",
        vt323:       "'VT323', 'Courier New', monospace",
        share:       "'Share Tech Mono', 'Courier New', monospace",
        inconsolata: "'Inconsolata', 'Courier New', monospace",
    };

    // ─────────────────────────────────────────
    //  PRNG ALGORITHMS
    //  Each fn(nasaSeed, cryptoRand) → 32-bit unsigned int
    // ─────────────────────────────────────────
    const PRNG_ALGOS = {
        xor: {
            name: 'XOR',
            formula: 'nasa ⊕ crypto',
            desc: {
                fr: 'Ou-Exclusif bit-à-bit. Si une source est sûre, le résultat est sûr.',
                en: 'Bitwise XOR. If either source is secure, the result is secure.',
            },
            wiki: {
                fr: 'https://fr.wikipedia.org/wiki/Ou_exclusif',
                en: 'https://en.wikipedia.org/wiki/Exclusive_or',
            },
            fn: (nasa, crypto) => (nasa ^ crypto) >>> 0,
        },
        lcg: {
            name: 'LCG',
            formula: '(1664525 × (nasa ⊕ crypto) + 1013904223) mod 2³²',
            desc: {
                fr: 'Générateur congruentiel linéaire (Knuth). Rapide, structure lattice.',
                en: 'Linear Congruential Generator (Knuth). Fast, lattice structure.',
            },
            wiki: {
                fr: 'https://fr.wikipedia.org/wiki/G%C3%A9n%C3%A9rateur_congruentiel_lin%C3%A9aire',
                en: 'https://en.wikipedia.org/wiki/Linear_congruential_generator',
            },
            fn: (nasa, crypto) => {
                const x = (nasa ^ crypto) >>> 0 || 1;
                return (Math.imul(1664525, x) + 1013904223) >>> 0;
            },
        },
        xorshift: {
            name: 'XORSHIFT',
            formula: 'x^=x<<13; x^=x>>17; x^=x<<5',
            desc: {
                fr: 'Marsaglia (2003). Période 2³²−1, équidistribution garantie.',
                en: 'Marsaglia (2003). Period 2³²−1, guaranteed equidistribution.',
            },
            wiki: {
                fr: 'https://fr.wikipedia.org/wiki/Xorshift',
                en: 'https://en.wikipedia.org/wiki/Xorshift',
            },
            fn: (nasa, crypto) => {
                let x = (nasa ^ crypto) >>> 0 || 1;
                x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
                return x >>> 0;
            },
        },
        murmur: {
            name: 'MURMUR3',
            formula: 'MurmurHash3 finalizer (Austin Appleby)',
            desc: {
                fr: 'Avalanche de bits. Chaque bit d\'entrée affecte tous les bits de sortie.',
                en: 'Bit avalanche. Every input bit affects every output bit.',
            },
            wiki: {
                fr: 'https://fr.wikipedia.org/wiki/MurmurHash',
                en: 'https://en.wikipedia.org/wiki/MurmurHash',
            },
            fn: (nasa, crypto) => {
                let h = (nasa ^ crypto) >>> 0;
                h ^= h >>> 16;
                h  = Math.imul(h, 0x85ebca6b) >>> 0;
                h ^= h >>> 13;
                h  = Math.imul(h, 0xc2b2ae35) >>> 0;
                h ^= h >>> 16;
                return h >>> 0;
            },
        },
    };

    // ─────────────────────────────────────────
    //  PIXEL ART FONT  (5 wide × 7 tall)
    //  Each row: 5 bits, bit4 = leftmost pixel
    // ─────────────────────────────────────────
    const PF = {
        '0': [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
        '1': [0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110],
        '2': [0b01110,0b10001,0b00001,0b00010,0b00100,0b01000,0b11111],
        '3': [0b01110,0b10001,0b00001,0b00110,0b00001,0b10001,0b01110],
        '4': [0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010],
        '5': [0b11111,0b10000,0b10000,0b11110,0b00001,0b10001,0b01110],
        '6': [0b00110,0b01000,0b10000,0b11110,0b10001,0b10001,0b01110],
        '7': [0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000],
        '8': [0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110],
        '9': [0b01110,0b10001,0b10001,0b01111,0b00001,0b10001,0b01110],
        '-': [0b00000,0b00000,0b00000,0b11111,0b00000,0b00000,0b00000],
        ' ': [0b00000,0b00000,0b00000,0b00000,0b00000,0b00000,0b00000],
        'O': [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
        'N': [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
        'F': [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000],
        '?': [0b01110,0b10001,0b00001,0b00010,0b00100,0b00000,0b00100],
    };
    const PF_W = 5, PF_H = 7, PF_GAP = 2;

    function drawPixelResult(text) {
        const canvas = document.getElementById('result-canvas');
        if (!canvas) return;
        const str = String(text).toUpperCase();

        // Adaptive scale: smaller for longer strings
        const n = str.length;
        const scale = n <= 2 ? 9 : n <= 3 ? 7 : 5;

        const charW = (PF_W + PF_GAP) * scale;
        const totalW = n * charW - PF_GAP * scale;
        const totalH = PF_H * scale;

        canvas.width  = Math.max(totalW, 10);
        canvas.height = totalH + 4;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const color = getComputedStyle(document.body)
            .getPropertyValue('--accent-highlight').trim() || '#f4d03f';
        ctx.fillStyle = color;

        let curX = 0;
        for (const ch of str) {
            const bitmap = PF[ch];
            if (bitmap) {
                for (let row = 0; row < PF_H; row++) {
                    const bits = bitmap[row];
                    for (let col = 0; col < PF_W; col++) {
                        if (bits & (1 << (PF_W - 1 - col))) {
                            ctx.fillRect(curX + col * scale, 2 + row * scale, scale, scale);
                        }
                    }
                }
            }
            curX += charW;
        }
    }

    // ─────────────────────────────────────────
    //  TRANSLATIONS
    // ─────────────────────────────────────────
    const TR = {
        fr: {
            title:           'SPACE DICE',
            subtitle:        "Dés à Entropie d'Astéroïdes",
            theme_label:     'THÈME:',
            lang_label:      'LANG:',
            font_label:      'POLICE:',
            entropy_source:  "> SOURCE D'ENTROPIE",
            nasa_api:        '> NASA NEO API',
            awaiting:        '> EN ATTENTE DE LANCER...',
            no_neo:          '> AUCUNE DONNÉE NEO',
            crypto_only:     '> ALÉATOIRE CRYPTO SEULEMENT',
            neos_loaded:     '> {n} NEOs chargés ({p} par lancer)',
            ready:           '> PRÊT',
            select_dice:     '> SÉLECTIONNER LE DÉ',
            dice_count:      'NOMBRE:',
            seed_label:      'SEED:',
            prng_label:      'ALGO:',
            roll:            '[ LANCER ]',
            neo_label:       'NEO:',
            hazard_label:    'DANGER:',
            diam_label:      'DIAM:',
            vel_label:       'VIT:',
            dist_label:      'DIST:',
            date_label:      'DATE:',
            pool_label:      'POOL:',
            hazardous_yes:   'OUI ⚠',
            hazardous_no:    'NON',
            orbit_title:     'ORBITE',
            orbit_safe:      'passage sûr',
            orbit_warn:      '! APPROCHE DANGEREUSE !',
            orbit_sun:       '☀',
            orbit_earth:     '[T]',
            rolls_label:     'LANCERS:',
            sum_label:       'TOTAL:',
            history_title:   '> HISTORIQUE DES LANCERS',
            history_empty:   '> AUCUN LANCER ENCORE',
            analyse_title:   '> ANALYSE STATISTIQUE',
            analyse_btn:     '[ ANALYSER ]',
            analyse_need:    '> Encore {n} lancers avec d{d} pour analyser',
            analyse_enough:  '> {n} lancers enregistrés pour d{d}',
            analyse_chi2:    '> Chi-carré: {v}',
            analyse_df:      '> Degrés de liberté: {v}',
            analyse_pval:    '> p-valeur: {v}',
            analyse_ok:      '> Distribution: UNIFORME ✓',
            analyse_nok:     '> Distribution: BIAISÉE ✗',
            analyse_note:    '> (seuil: p < 0.05 → rejet H₀)',
            analyse_random:  '> Sélectionnez un dé fixe pour analyser',
            powered:         'Propulsé par NASA NEO API | Offline-First',
            status_demo:     '> DEMO KEY · données réelles non chargées',
            status_fresh:    '> Données NASA: fraîches ({n} NEOs)',
            status_stale:    '> Données NASA: à mettre à jour',
            status_nodata:   '> Aucune donnée NASA · exécutez fetch_nasa.py',
            wiki_link:       '> Wikipedia →',
            api_lines: [
                '> NEO: Near-Earth Objects — astéroïdes',
                ">   dont l'orbite croise le voisinage",
                '>   terrestre (< 1.3 UA du Soleil)',
                '> ─────────────────────────────',
                '> DIAM → seed: SHA-256(min_m × max_m)',
                '>   taille physique, faible entropie',
                '> VEL  → seed: SHA-256(km/s × km/h)',
                ">   chaotique selon l'angle orbital",
                '> DIST → seed: SHA-256(km de passage)',
                '>   précision JPL ±1000 km à 90j',
                '> COMB → seed: SHA-256(diam+vel+dist)',
                '>   entropie maximale',
                '> ─────────────────────────────',
                '> {p} NEOs ⊕ XOR → seed combiné',
                '> seed_NASA ⊕ algo(crypto.random())',
                '> Données JPL fraîches chaque jour',
            ],
        },
        en: {
            title:           'SPACE DICE',
            subtitle:        'Asteroid Entropy Randomizer',
            theme_label:     'THEME:',
            lang_label:      'LANG:',
            font_label:      'FONT:',
            entropy_source:  '> ENTROPY SOURCE',
            nasa_api:        '> NASA NEO API',
            awaiting:        '> AWAITING ROLL...',
            no_neo:          '> NO NEO DATA',
            crypto_only:     '> CRYPTO RANDOM ONLY',
            neos_loaded:     '> {n} NEOs loaded ({p} per roll)',
            ready:           '> READY',
            select_dice:     '> SELECT DICE',
            dice_count:      'COUNT:',
            seed_label:      'SEED:',
            prng_label:      'ALGO:',
            roll:            '[ ROLL ]',
            neo_label:       'NEO:',
            hazard_label:    'HAZARD:',
            diam_label:      'DIAM:',
            vel_label:       'VEL:',
            dist_label:      'DIST:',
            date_label:      'DATE:',
            pool_label:      'POOL:',
            hazardous_yes:   'YES ⚠',
            hazardous_no:    'NO',
            orbit_title:     'ORBIT',
            orbit_safe:      'safe passage',
            orbit_warn:      '! HAZARDOUS APPROACH !',
            orbit_sun:       '☀',
            orbit_earth:     '[E]',
            rolls_label:     'ROLLS:',
            sum_label:       'SUM:',
            history_title:   '> ROLL HISTORY',
            history_empty:   '> NO ROLLS YET',
            analyse_title:   '> STATISTICAL ANALYSIS',
            analyse_btn:     '[ ANALYSE ]',
            analyse_need:    '> Need {n} more rolls with d{d} to analyse',
            analyse_enough:  '> {n} rolls recorded for d{d}',
            analyse_chi2:    '> Chi-square: {v}',
            analyse_df:      '> Degrees of freedom: {v}',
            analyse_pval:    '> p-value: {v}',
            analyse_ok:      '> Distribution: UNIFORM ✓',
            analyse_nok:     '> Distribution: BIASED ✗',
            analyse_note:    '> (threshold: p < 0.05 → reject H₀)',
            analyse_random:  '> Select a fixed die to analyse',
            powered:         'Powered by NASA NEO API | Offline-First',
            status_demo:     '> DEMO KEY · real data not loaded',
            status_fresh:    '> NASA data: fresh ({n} NEOs)',
            status_stale:    '> NASA data: needs update',
            status_nodata:   '> No NASA data · run fetch_nasa.py',
            wiki_link:       '> Wikipedia →',
            api_lines: [
                '> NEO: Near-Earth Objects — asteroids',
                ">   crossing Earth's orbital vicinity",
                '>   (< 1.3 AU from the Sun)',
                '> ─────────────────────────────',
                '> DIAM → seed: SHA-256(min_m × max_m)',
                '>   physical size, low entropy',
                '> VEL  → seed: SHA-256(km/s × km/h)',
                '>   chaotic by orbital approach angle',
                '> DIST → seed: SHA-256(miss dist km)',
                '>   JPL precision ±1000 km at 90 days',
                '> COMB → seed: SHA-256(diam+vel+dist)',
                '>   maximum external entropy',
                '> ─────────────────────────────',
                '> {p} NEOs XOR-combined → single seed',
                '> NASA_seed ⊕ algo(crypto.random())',
                '> Fresh JPL data fetched daily',
            ],
        },
    };

    // ─────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────
    let currentDice          = 6;
    let diceCount            = 1;
    let isRandomMode         = false;
    let isRolling            = false;
    let currentEntropySource = 'combined';
    let currentPrngAlgo      = 'xor';
    let currentLang          = 'fr';
    let currentFont          = 'ibm';

    const rollStats   = {};   // { diceType: { face: count, _total: n } }
    const rollHistory = [];   // session history (newest first)

    // ─────────────────────────────────────────
    //  DOM
    // ─────────────────────────────────────────
    const resultCanvas       = document.getElementById('result-canvas');
    const rollBtn            = document.getElementById('roll-btn');
    const neoDataEl          = document.getElementById('neo-data');
    const orbitDisplayEl     = document.getElementById('orbit-display');
    const apiInfoEl          = document.getElementById('api-info-text');
    const prngInfoEl         = document.getElementById('prng-info');
    const dataStatusEl       = document.getElementById('data-status');
    const diceBtns           = document.querySelectorAll('.dice-btn');
    const diceSprite         = document.getElementById('dice-sprite');
    const diceImg            = document.getElementById('dice-img');
    const diceTypeLabel      = document.getElementById('dice-type-label');
    const themeBtns          = document.querySelectorAll('.theme-btn');
    const langBtns           = document.querySelectorAll('.lang-btn');
    const entropyBtns        = document.querySelectorAll('.entropy-btn');
    const prngBtns           = document.querySelectorAll('.prng-btn');
    const fontBtns           = document.querySelectorAll('.font-btn');
    const countMinusBtn      = document.getElementById('count-minus');
    const countPlusBtn       = document.getElementById('count-plus');
    const countDisplay       = document.getElementById('count-display');
    const multiRollResultsEl = document.getElementById('multi-roll-results');
    const historyListEl      = document.getElementById('history-list');
    const analysisStatusEl   = document.getElementById('analysis-status');
    const analyseBtnEl       = document.getElementById('analyse-btn');
    const analysisResultsEl  = document.getElementById('analysis-results');

    // ─────────────────────────────────────────
    //  i18n
    // ─────────────────────────────────────────
    function t(key, vars) {
        let str = (TR[currentLang] || TR.fr)[key] || key;
        if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replace('{' + k + '}', v); });
        return str;
    }

    function applyTranslations() {
        document.documentElement.lang = currentLang;
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });

        // API info block
        if (apiInfoEl) {
            const poolSize = Math.min(NEO_POOL_SIZE, NEO_DATA ? NEO_DATA.length : 0);
            apiInfoEl.innerHTML = (TR[currentLang].api_lines || [])
                .map(l => '<p>' + l.replace('{p}', poolSize) + '</p>').join('');
        }

        // Refresh dynamic areas
        updatePrngInfo();
        updateAnalysisStatus();
        renderHistory();
        renderDataStatus();
    }

    function setLang(lang) {
        currentLang = lang;
        localStorage.setItem(SK_LANG, lang);
        langBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
        applyTranslations();
    }

    function loadLang() { setLang(localStorage.getItem(SK_LANG) || 'fr'); }
    function handleLangSelect(e) { if (e.target.classList.contains('lang-btn')) setLang(e.target.dataset.lang); }

    // ─────────────────────────────────────────
    //  THEME
    // ─────────────────────────────────────────
    function setTheme(name) {
        document.body.setAttribute('data-theme', name);
        localStorage.setItem(SK_THEME, name);
        themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === name));
        // Redraw canvas with new theme color
        if (resultCanvas && resultCanvas._lastText) drawPixelResult(resultCanvas._lastText);
    }

    function loadTheme() { setTheme(localStorage.getItem(SK_THEME) || 'terminal'); }
    function handleThemeSelect(e) { if (e.target.classList.contains('theme-btn')) setTheme(e.target.dataset.theme); }

    // ─────────────────────────────────────────
    //  ENTROPY SOURCE (seed data field)
    // ─────────────────────────────────────────
    function setEntropySource(source) {
        currentEntropySource = source;
        localStorage.setItem(SK_ENTROPY, source);
        entropyBtns.forEach(b => b.classList.toggle('active', b.dataset.source === source));
    }

    function loadEntropySource() { setEntropySource(localStorage.getItem(SK_ENTROPY) || 'combined'); }
    function handleEntropySelect(e) { if (e.target.classList.contains('entropy-btn')) setEntropySource(e.target.dataset.source); }

    // ─────────────────────────────────────────
    //  PRNG ALGORITHM
    // ─────────────────────────────────────────
    function setPrngAlgo(algo) {
        currentPrngAlgo = algo;
        localStorage.setItem(SK_PRNG, algo);
        prngBtns.forEach(b => b.classList.toggle('active', b.dataset.algo === algo));
        updatePrngInfo();
    }

    function loadPrngAlgo() { setPrngAlgo(localStorage.getItem(SK_PRNG) || 'xor'); }
    function handlePrngSelect(e) { if (e.target.classList.contains('prng-btn')) setPrngAlgo(e.target.dataset.algo); }

    // ─────────────────────────────────────────
    //  ASCII FONT SELECTOR
    // ─────────────────────────────────────────
    function setAsciiFont(fontKey) {
        currentFont = fontKey;
        localStorage.setItem(SK_FONT, fontKey);
        const family = FONT_OPTIONS[fontKey] || FONT_OPTIONS.ibm;

        // Extract the primary family name (first token before the comma)
        // and force the browser to load it before swapping the CSS variable.
        const primaryName = family.replace(/'/g, '').split(',')[0].trim();

        function applyFont() {
            document.documentElement.style.setProperty('--ascii-font-family', family);
            fontBtns.forEach(b => b.classList.toggle('active', b.dataset.font === fontKey));
        }

        if (document.fonts && document.fonts.load) {
            document.fonts.load('1em "' + primaryName + '"').then(applyFont, applyFont);
        } else {
            applyFont();
        }
    }

    function loadAsciiFont() { setAsciiFont(localStorage.getItem(SK_FONT) || 'ibm'); }
    function handleFontSelect(e) { if (e.target.classList.contains('font-btn')) setAsciiFont(e.target.dataset.font); }

    function updatePrngInfo() {
        if (!prngInfoEl) return;
        const algo = PRNG_ALGOS[currentPrngAlgo];
        if (!algo) { prngInfoEl.innerHTML = ''; return; }
        const wikiUrl = algo.wiki[currentLang] || algo.wiki.en;
        prngInfoEl.innerHTML =
            '<p>> <strong>' + algo.name + '</strong>: ' + algo.formula + '</p>' +
            '<p>> ' + algo.desc[currentLang] + '</p>' +
            '<p>><a href="' + wikiUrl + '" target="_blank" rel="noopener" class="wiki-link"> Wikipedia ↗</a></p>';
    }

    // ─────────────────────────────────────────
    //  DICE COUNT
    // ─────────────────────────────────────────
    /** Re-show the single-die result zone (used after multi-dice roll or count change). */
    function restoreSingleDisplay() {
        // Sprite visibility depends on current mode/type
        if (isRandomMode) {
            diceSprite.style.display = 'none';
        } else {
            diceSprite.style.display = DICE_WITH_SPRITES.includes(currentDice) ? 'flex' : 'none';
        }
        resultCanvas.style.display  = 'block';
        diceTypeLabel.style.display = 'block';
        multiRollResultsEl.innerHTML = '';
        drawPixelResult('-');
        resultCanvas._lastText = '-';
    }

    function setDiceCount(n) {
        diceCount = Math.max(1, Math.min(MAX_DICE_COUNT, n));
        countDisplay.textContent = diceCount;
        countMinusBtn.disabled = diceCount <= 1;
        countPlusBtn.disabled  = diceCount >= MAX_DICE_COUNT;
        // Reset the result zone when count changes
        restoreSingleDisplay();
    }

    // ─────────────────────────────────────────
    //  CSPRNG + MULTI-NEO ENTROPY
    // ─────────────────────────────────────────
    function getSecureRandom() {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return buf[0];
    }

    /**
     * Select a pool of N unique NEOs.
     * Returns array; first element is the "primary" (displayed), others contribute seed XOR.
     */
    function selectNeoPool() {
        if (!NEO_DATA || NEO_DATA.length === 0) return [];
        const n   = Math.min(NEO_POOL_SIZE, NEO_DATA.length);
        const pool = [];
        const used = new Set();
        while (pool.length < n) {
            const idx = getSecureRandom() % NEO_DATA.length;
            if (!used.has(idx)) { used.add(idx); pool.push(NEO_DATA[idx]); }
        }
        return pool;
    }

    /**
     * Roll one die using the active PRNG and entropy source.
     * Pool of NEOs: XOR all their seeds, then apply PRNG algo with crypto.getRandomValues().
     */
    function rollOne(diceType) {
        const pool = selectNeoPool();

        let nasaSeed = 0;
        for (const neo of pool) {
            if (neo && neo.seeds && neo.seeds[currentEntropySource] != null) {
                nasaSeed ^= neo.seeds[currentEntropySource];
            }
        }
        nasaSeed = nasaSeed >>> 0;

        const cryptoRand = getSecureRandom();
        const algo       = PRNG_ALGOS[currentPrngAlgo] || PRNG_ALGOS.xor;
        const combined   = algo.fn(nasaSeed, cryptoRand);

        return { result: (combined % diceType) + 1, neo: pool[0] || null, pool };
    }

    function rollMany(diceType, count) {
        const out = [];
        for (let i = 0; i < count; i++) out.push(rollOne(diceType));
        return out;
    }

    function randomDiceType() { return DICE_TYPES[getSecureRandom() % DICE_TYPES.length]; }

    // ─────────────────────────────────────────
    //  SPRITES
    // ─────────────────────────────────────────
    function updateSprite(diceType) {
        if (DICE_WITH_SPRITES.includes(diceType)) {
            diceImg.src = '/static/sprites/dice/d' + diceType + '.png';
            diceImg.alt = 'd' + diceType;
            diceSprite.style.display = 'flex';
        } else {
            diceSprite.style.display = 'none';
        }
    }

    function updateDiceLabel(v) { diceTypeLabel.textContent = 'd' + v; }

    // ─────────────────────────────────────────
    //  ANIMATION
    // ─────────────────────────────────────────
    function animateRoll(finalValue, diceType, cb) {
        isRolling = true;
        rollBtn.disabled = true;
        diceSprite.classList.add('rolling');

        const steps = 12, interval = 50;
        let step = 0;

        // Initial flash
        drawPixelResult('?');

        const id = setInterval(() => {
            drawPixelResult(Math.floor(Math.random() * diceType) + 1);
            resultCanvas._lastText = String(Math.floor(Math.random() * diceType) + 1);
            if (++step >= steps) {
                clearInterval(id);
                drawPixelResult(finalValue);
                resultCanvas._lastText = String(finalValue);
                diceSprite.classList.remove('rolling');
                isRolling = false;
                rollBtn.disabled = false;
                if (cb) cb();
            }
        }, interval);
    }

    // ─────────────────────────────────────────
    //  2D ASCII ORBIT
    // ─────────────────────────────────────────
    /**
     * Top-down view of the inner solar system.
     * Sun at center-left, Earth on orbit right edge, NEO outside at distance proportional to LD.
     *
     *        · · · · ·
     *     ·             ·
     *   ·   ☀      [E]  ·  · · ·★  12.5 LD
     *     ·             ·
     *        · · · · ·
     */
    function renderOrbit2D(neo) {
        if (!neo || neo.distance_lunar == null) return '';

        const ld       = parseFloat(neo.distance_lunar);
        const isClose  = neo.hazardous && ld < 10;
        const neoChar  = isClose ? '⚠' : '★';
        const earth    = t('orbit_earth');  // [T] or [E]
        const sunChar  = t('orbit_sun');    // ☀
        const moonChar = '\u263D';          // ☽ crescent moon

        // NEO linear-gap in the orbit row (visual only — not log scale)
        const extra  = Math.min(Math.round(ld / 60 * 13), 13);
        const neoGap = '\u00B7'.repeat(extra);   // ·
        const neoStr = ' ' + neoGap + neoChar + ' ' + ld.toFixed(1) + ' LD';

        // Moon sits just outside Earth (1 LD ≈ adjacent); inserted before earth label
        const earthMoon = moonChar + earth;

        // 9-row ellipse: Sun at center-left, Earth+Moon at right edge, NEO beyond
        const orbitRows = [
            '           · · · · · · · · · ·          ',
            '         ·                     ·        ',
            '       ·                         ·      ',
            '     ·                             ·    ',
            '   · ' + sunChar + '                 ' + earthMoon + '   ·' + neoStr,
            '     ·                             ·    ',
            '       ·                         ·      ',
            '         ·                     ·        ',
            '           · · · · · · · · · ·          ',
        ];

        // ── Log-scale distance ruler ──────────────────────────────────────
        // Shows distances FROM Earth on a log₁₀ scale.
        // Anchor points:  Moon = 1 LD  ·  Sun ≈ 389 LD
        // Mapping: pos = round( log10(dist * 10) / log10(3890) * RULER_W )
        //   dist=1  → log10(10)/log10(3890) * 40 ≈ 11
        //   dist=10 → log10(100)/log10(3890) * 40 ≈ 22
        //   dist=389→ log10(3890)/log10(3890) * 40 = 40
        const RULER_W = 40;
        const LOG_MAX = Math.log10(3890);

        function rPos(distLD) {
            return Math.min(
                Math.round(Math.log10(Math.max(distLD, 0.01) * 10) / LOG_MAX * RULER_W),
                RULER_W
            );
        }

        const moonPos = rPos(1);                                      // ≈ 11
        const neoPos  = Math.max(rPos(ld), moonPos + 1);             // never overlap moon
        const sunPos  = RULER_W;                                      // = 40

        // Ruler line: ◉ (Earth origin) — then symbols at log-positions
        const ruler = Array(RULER_W + 1).fill('\u2500');  // ─
        ruler[0]                         = '\u25CE';      // ◉ Earth origin
        ruler[moonPos]                   = moonChar;      // ☽
        ruler[Math.min(neoPos, sunPos - 1)] = neoChar;   // ★ or ⚠
        ruler[sunPos]                    = sunChar;       // ☀
        const rulerLine = ruler.join('');

        // Label line: distance values placed after each symbol
        const neoLbl      = ld.toFixed(1) + 'LD';
        const lblArr      = Array(RULER_W + 12).fill(' ');
        // "1LD" after moon
        ['1', 'L', 'D'].forEach(function (c, i) { lblArr[moonPos + 1 + i] = c; });
        // NEO label (avoid overlapping moon label at moonPos+1…+3)
        const neoLblStart = Math.max(neoPos + 1, moonPos + 5);
        neoLbl.split('').forEach(function (c, i) { lblArr[neoLblStart + i] = c; });
        // "389LD" after sun
        '389LD'.split('').forEach(function (c, i) { lblArr[sunPos + 1 + i] = c; });
        const lblLine = lblArr.join('').trimEnd();

        // Scale caption
        const caption = currentLang === 'fr'
            ? '\u2514\u2500 \u00E9chelle log\u2081\u2080 (LD depuis la Terre)'
            : '\u2514\u2500 log\u2081\u2080 scale (LD from Earth)';

        return (
            '<p class="orbit-title">' + t('orbit_title') + '</p>' +
            '<pre class="orbit-bar">' + orbitRows.join('\n') + '</pre>' +
            '<pre class="orbit-scale">' + rulerLine + '\n' + lblLine + '\n' + caption + '</pre>'
        );
    }

    // ─────────────────────────────────────────
    //  DISPLAY NEO
    // ─────────────────────────────────────────
    function fmtSeedHex(seed) {
        if (seed == null) return 'N/A';
        return seed.toString(16).padStart(14, '0').slice(0, 8) + '...';
    }

    function displayNeoData(neo, pool) {
        if (!neo) {
            neoDataEl.innerHTML  = '<p>' + t('no_neo') + '</p>';
            orbitDisplayEl.innerHTML = '';
            return;
        }

        const hClass   = neo.hazardous ? 'hazardous-yes' : 'hazardous-no';
        const hText    = neo.hazardous ? t('hazardous_yes') : t('hazardous_no');
        const seedHex  = fmtSeedHex(neo.seeds ? neo.seeds[currentEntropySource] : undefined);
        const locale   = currentLang === 'fr' ? 'fr-FR' : 'en-US';
        const distFmt  = Number(neo.distance_km).toLocaleString(locale);

        // Pool secondary NEOs
        const poolNames = pool && pool.length > 1
            ? pool.slice(1).map(n => n.name).join(', ')
            : '—';

        neoDataEl.innerHTML =
            '<p>>> ' + t('neo_label')    + ' <strong>' + neo.name + '</strong></p>' +
            '<p>>> ' + t('hazard_label') + ' <span class="' + hClass + '">' + hText + '</span></p>' +
            '<p>>> ' + t('diam_label')   + ' ' + neo.diameter_min + 'm–' + neo.diameter_max + 'm</p>' +
            '<p>>> ' + t('vel_label')    + ' ' + neo.velocity_kms + ' km/s</p>' +
            '<p>>> ' + t('dist_label')   + ' ' + distFmt + ' km / ' + neo.distance_lunar + ' LD</p>' +
            '<p>>> ' + t('date_label')   + ' ' + (neo.approach_date || 'N/A') + '</p>' +
            '<p>>> ' + t('pool_label')   + ' ' + poolNames + '</p>' +
            '<p class="seed-line">>> SEED[' + currentEntropySource.toUpperCase() + ']: ' + seedHex + '</p>';

        orbitDisplayEl.innerHTML = renderOrbit2D(neo);
    }

    // ─────────────────────────────────────────
    //  MULTI-DICE DISPLAY
    // ─────────────────────────────────────────
    function displayMultiRollResults(rolls, diceType) {
        if (rolls.length <= 1) {
            // Single die — keep the main sprite + canvas display
            multiRollResultsEl.innerHTML = '';
            return;
        }

        // Multi-dice: hide single display, show sprite grid
        diceSprite.style.display    = 'none';
        resultCanvas.style.display  = 'none';
        diceTypeLabel.style.display = 'none';

        const hasSrc = DICE_WITH_SPRITES.includes(diceType);
        const imgSrc = hasSrc ? '/static/sprites/dice/d' + diceType + '.png' : null;

        // Build grid of sprites + individual results
        let html = '<div class="multi-dice-grid">';
        rolls.forEach(function (roll) {
            const res = diceType === 2 ? (roll.result === 2 ? 'ON' : 'OFF') : roll.result;
            html += '<div class="multi-dice-cell">';
            if (imgSrc) {
                html += '<img class="multi-dice-img" src="' + imgSrc + '" alt="d' + diceType + '">';
            } else {
                html += '<span class="multi-dice-no-img">d' + diceType + '</span>';
            }
            html += '<span class="multi-dice-result">' + res + '</span>';
            html += '</div>';
        });
        html += '</div>';

        // Total / sum line
        if (diceType === 2) {
            const ons = rolls.filter(function (r) { return r.result === 2; }).length;
            html += '<p class="multi-sum">' + ons + '/' + rolls.length + ' ON</p>';
        } else {
            const sum = rolls.reduce(function (s, r) { return s + r.result; }, 0);
            html += '<p class="multi-sum">' + t('sum_label') + ' <strong>' + sum + '</strong></p>';
        }

        multiRollResultsEl.innerHTML = html;
    }

    // ─────────────────────────────────────────
    //  ROLL HISTORY
    // ─────────────────────────────────────────
    function addToHistory(rolls, diceType) {
        const now     = new Date();
        const time    = now.toTimeString().slice(0, 8);
        const results = rolls.map(r => r.result);
        const sum     = results.reduce((a, b) => a + b, 0);
        const neoName = rolls[0].neo ? rolls[0].neo.name : '---';
        rollHistory.unshift({ time, diceType, count: rolls.length, results, sum, neoName });
        if (rollHistory.length > MAX_HISTORY) rollHistory.pop();
        renderHistory();
    }

    function renderHistory() {
        if (rollHistory.length === 0) {
            historyListEl.innerHTML = '<p>' + t('history_empty') + '</p>';
            return;
        }
        historyListEl.innerHTML = rollHistory.map(e => {
            const diceStr = e.count > 1 ? e.count + 'd' + e.diceType : 'd' + e.diceType;
            let resultStr;
            if (e.count === 1 && e.diceType === 2) {
                resultStr = e.results[0] === 2 ? 'ON' : 'OFF';
            } else if (e.count > 1) {
                resultStr = e.results.join(',') + ' (∑' + e.sum + ')';
            } else {
                resultStr = e.results[0];
            }
            return (
                '<p>[' + e.time + '] ' +
                '<span class="hist-dice">' + diceStr + '</span>' +
                ' → <strong>' + resultStr + '</strong>' +
                ' | <span class="hist-neo">' + e.neoName + '</span></p>'
            );
        }).join('');
    }

    // ─────────────────────────────────────────
    //  DATA STATUS (NASA key + freshness)
    // ─────────────────────────────────────────
    function renderDataStatus() {
        if (!dataStatusEl || typeof DATA_META === 'undefined') return;
        const m = DATA_META;
        let html = '';

        if (!m || m.neo_count === 0) {
            html = '<p class="status-warn">' + t('status_nodata') + '</p>';
        } else if (m.is_demo_key) {
            html = '<p class="status-warn">' + t('status_demo') + '</p>';
        } else if (m.is_fresh) {
            html = '<p class="status-ok">' + t('status_fresh', { n: m.neo_count }) + '</p>';
        } else {
            html = '<p class="status-warn">' + t('status_stale') + '</p>';
        }

        dataStatusEl.innerHTML = html;
    }

    // ─────────────────────────────────────────
    //  STATISTICS — CHI-SQUARE
    // ─────────────────────────────────────────
    function recordRolls(rolls, diceType) {
        if (!rollStats[diceType]) {
            rollStats[diceType] = { _total: 0 };
            for (let f = 1; f <= diceType; f++) rollStats[diceType][f] = 0;
        }
        rolls.forEach(({ result }) => {
            rollStats[diceType][result] = (rollStats[diceType][result] || 0) + 1;
            rollStats[diceType]._total++;
        });
        updateAnalysisStatus();
    }

    function updateAnalysisStatus() {
        if (isRandomMode) {
            analysisStatusEl.innerHTML = '<p>' + t('analyse_random') + '</p>';
            analyseBtnEl.style.display = 'none';
            return;
        }
        const stats  = rollStats[currentDice];
        const total  = stats ? stats._total : 0;
        const needed = MIN_FOR_ANALYSIS - total;
        if (needed > 0) {
            analysisStatusEl.innerHTML = '<p>' + t('analyse_need', { n: needed, d: currentDice }) + '</p>';
            analyseBtnEl.style.display  = 'none';
            analysisResultsEl.style.display = 'none';
        } else {
            analysisStatusEl.innerHTML = '<p>' + t('analyse_enough', { n: total, d: currentDice }) + '</p>';
            analyseBtnEl.style.display = 'inline-block';
        }
    }

    function logGamma(x) {
        const c = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,1.208650973866179e-3,-5.395239384953e-6];
        let y = x, tmp = x + 5.5;
        tmp -= (x + 0.5) * Math.log(tmp);
        let ser = 1.000000000190015;
        for (let j = 0; j < 6; j++) ser += c[j] / ++y;
        return -tmp + Math.log(2.5066282746310005 * ser / x);
    }

    function gammaSeries(a, x) {
        let term = 1 / a, sum = term;
        for (let n = 1; n <= 300; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < 1e-12) break; }
        return Math.exp(-x + a * Math.log(x) - logGamma(a)) * sum;
    }

    function gammaCF(a, x) {
        const fp = 1e-30;
        let b = x+1-a, c = 1/fp, d = 1/b, h = d;
        for (let n = 1; n <= 300; n++) {
            const an = -n*(n-a); b += 2;
            d = an*d+b; if (Math.abs(d)<fp) d=fp;
            c = b+an/c; if (Math.abs(c)<fp) c=fp;
            d = 1/d; const del = d*c; h *= del;
            if (Math.abs(del-1)<1e-12) break;
        }
        return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
    }

    function chiSquarePValue(chi2, df) {
        if (chi2 <= 0) return 1;
        const a = df/2, x = chi2/2;
        return x < a+1 ? 1 - gammaSeries(a, x) : gammaCF(a, x);
    }

    function runChiSquare() {
        const stats = rollStats[currentDice];
        if (!stats) return;
        const total = stats._total, expected = total / currentDice;
        let chi2 = 0;
        for (let f = 1; f <= currentDice; f++) {
            const obs = stats[f] || 0;
            chi2 += Math.pow(obs - expected, 2) / expected;
        }
        const df = currentDice - 1, pValue = chiSquarePValue(chi2, df);
        const uniform = pValue >= 0.05;
        analysisResultsEl.style.display = 'block';
        analysisResultsEl.innerHTML =
            '<p>' + t('analyse_chi2', { v: chi2.toFixed(4) }) + '</p>' +
            '<p>' + t('analyse_df',   { v: df })              + '</p>' +
            '<p>' + t('analyse_pval', { v: pValue.toFixed(4) }) + '</p>' +
            '<p class="' + (uniform ? 'hazardous-no' : 'hazardous-yes') + '">' +
                t(uniform ? 'analyse_ok' : 'analyse_nok') + '</p>' +
            '<p class="analysis-note">' + t('analyse_note') + '</p>';
    }

    // ─────────────────────────────────────────
    //  HANDLERS
    // ─────────────────────────────────────────
    function handleRoll() {
        if (isRolling) return;

        let diceToRoll = currentDice;
        if (isRandomMode) {
            diceToRoll = randomDiceType();
            updateSprite(diceToRoll);
            updateDiceLabel(diceToRoll);
        }

        // Always restore the single-display zone before animation starts
        // (multi-dice will hide it again in the animation callback)
        diceSprite.style.display    = DICE_WITH_SPRITES.includes(diceToRoll) ? 'flex' : 'none';
        resultCanvas.style.display  = 'block';
        diceTypeLabel.style.display = 'block';
        multiRollResultsEl.innerHTML = '';

        const rolls   = rollMany(diceToRoll, diceCount);
        const mainNeo = rolls[0].neo;
        const mainPool = rolls[0].pool;

        // Displayed value: sum for multi-dice, raw for single
        let animTarget = diceCount === 1
            ? rolls[0].result
            : rolls.reduce((s, r) => s + r.result, 0);

        animateRoll(animTarget, diceToRoll, () => {
            // Override canvas text for special cases
            if (diceToRoll === 2 && diceCount === 1) {
                const v = rolls[0].result === 2 ? 'ON' : 'OF';
                drawPixelResult(v);
                resultCanvas._lastText = v;
            } else if (diceToRoll === 2 && diceCount > 1) {
                const ons = rolls.filter(r => r.result === 2).length;
                const v = String(ons) + 'ON';
                drawPixelResult(v);
                resultCanvas._lastText = v;
            }
            displayMultiRollResults(rolls, diceToRoll);
            displayNeoData(mainNeo, mainPool);
        });

        recordRolls(rolls, diceToRoll);
        addToHistory(rolls, diceToRoll);
    }

    function handleDiceSelect(e) {
        const btn = e.target;
        if (!btn.classList.contains('dice-btn')) return;
        diceBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.dataset.dice;
        if (val === 'random') {
            isRandomMode = true; currentDice = 6;
            updateDiceLabel('?'); diceSprite.style.display = 'none';
        } else {
            isRandomMode = false; currentDice = parseInt(val, 10);
            updateSprite(currentDice); updateDiceLabel(currentDice);
        }
        // Restore canvas + label visibility (may have been hidden from a prior multi-dice roll)
        resultCanvas.style.display  = 'block';
        diceTypeLabel.style.display = 'block';
        multiRollResultsEl.innerHTML = '';
        drawPixelResult('-');
        resultCanvas._lastText = '-';
        analysisResultsEl.style.display = 'none';
        analysisResultsEl.innerHTML = '';
        updateAnalysisStatus();
    }

    // ─────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────
    function init() {
        loadTheme();
        loadEntropySource();
        loadPrngAlgo();
        loadAsciiFont();
        loadLang();   // triggers applyTranslations()

        rollBtn.addEventListener('click', handleRoll);
        document.querySelector('.dice-grid').addEventListener('click', handleDiceSelect);
        document.querySelector('.theme-selector').addEventListener('click', handleThemeSelect);
        document.querySelector('.lang-selector').addEventListener('click', handleLangSelect);
        document.querySelector('.entropy-selector').addEventListener('click', handleEntropySelect);
        document.querySelector('.prng-selector').addEventListener('click', handlePrngSelect);
        document.querySelector('.font-selector').addEventListener('click', handleFontSelect);
        countMinusBtn.addEventListener('click', () => setDiceCount(diceCount - 1));
        countPlusBtn.addEventListener('click',  () => setDiceCount(diceCount + 1));
        analyseBtnEl.addEventListener('click', runChiSquare);

        document.addEventListener('keydown', e => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleRoll(); }
        });

        setDiceCount(1);
        updateSprite(currentDice);
        updateDiceLabel(currentDice);

        // Initial canvas state
        drawPixelResult('-');
        resultCanvas._lastText = '-';

        // NEO count display
        const poolSize = Math.min(NEO_POOL_SIZE, NEO_DATA ? NEO_DATA.length : 0);
        if (!NEO_DATA || NEO_DATA.length === 0) {
            neoDataEl.innerHTML = '<p>' + t('no_neo') + '</p><p>' + t('crypto_only') + '</p>';
        } else {
            neoDataEl.innerHTML =
                '<p>' + t('neos_loaded', { n: NEO_DATA.length, p: poolSize }) + '</p>' +
                '<p>' + t('ready') + '</p>';
        }

        updateAnalysisStatus();
        renderDataStatus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
