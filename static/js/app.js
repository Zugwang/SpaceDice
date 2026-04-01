/**
 * SpaceDice Reloaded — Client-side SPA
 * Features: i18n FR/EN · pixel art canvas result · PRNG selector · multi-NEO entropy
 *           roll history · multi-dice · 2D ASCII orbit · chi-square stats
 *           PWA · export CSV · custom theme · extended stats
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
    const NEO_POOL_SIZE     = 1;   // single asteroid per roll (crypto.getRandomValues provides security)

    const SK_THEME   = 'spacedice-theme';
    const SK_ENTROPY = 'spacedice-entropy';
    const SK_LANG    = 'spacedice-lang';
    const SK_PRNG    = 'spacedice-prng';
    const SK_FONT    = 'spacedice-font';
    const SK_RANGE   = 'spacedice-range';
    const SK_CUSTOM  = 'spacedice-custom-theme';
    const SK_HASH    = 'spacedice-hash';

    // ─────────────────────────────────────────
    //  ASCII FONT OPTIONS
    // ─────────────────────────────────────────
    const FONT_OPTIONS = {
        dejavu:   "'DejaVu Sans Mono', 'Courier New', monospace",
        craft:    "'Minecraft', 'Courier New', monospace",
        comic:    "'Comic Shanns Mono', 'Courier New', monospace",
        dyslexic: "'OpenDyslexic Mono', 'Courier New', monospace",
        symbols:  "'Symbols Nerd', monospace",
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

        // Adaptive scale: compact to match multi-dice sizing
        const n = str.length;
        const scale = n <= 2 ? 5 : n <= 3 ? 4 : 3;

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
            theme_label:     'Thème:',
            lang_label:      'Langue:',
            font_label:      'Police:',
            entropy_source:  "> SOURCE D'ENTROPIE",
            nasa_api:        'NASA NEO API',
            awaiting:        '> EN ATTENTE DE LANCER...',
            no_neo:          '> AUCUNE DONNÉE NEO',
            crypto_only:     '> ALÉATOIRE CRYPTO SEULEMENT',
            neos_loaded:     '> {n} NEOs chargés ({p} par lancer)',
            ready:           '> PRÊT',
            select_dice:     '> SÉLECTIONNER LE DÉ',
            dice_count:      'NOMBRE:',
            seed_label:      'SEED:',
            prng_label:      'ALGO:',
            hash_label:      'HASH:',
            range_labels:    { today: '24H', week: 'SEMAINE', month: 'MOIS', thisyear: 'ANNÉE', all: 'TOUT' },
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
            orbit_earth:     '🌍',
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
            analyse_streak:  '> Streak max: {n}× face {f}',
            analyse_stddev:  '> Écart-type: {v}',
            analyse_heatmap: '> Heatmap:',
            footer_line1:    'Maintenu par E1000 | Distribué sous WTFPL | Github | Beta | API NEO NASA | Rafraîchissement {f} {r} NEOs < 24h',
            rpg_mode:        '[ MODE JDR ]',
            zero_label:      'ZERO',
            zero_excl:       'EXCLU',
            zero_incl:       'INCLU',
            d2_true:         'VRAI',
            d2_false:        'FAUX',
            rpg_help_keep:   'garde max/min',
            status_fresh:    '> Données datant du : {d} ({n} NEOs)',
            status_demo:     '> DEMO KEY · données réelles non chargées',
            status_stale:    '> Données obsolètes, dernier fetch : {d}',
            status_nodata:   '> Aucune donnée NASA · exécutez fetch_nasa.py',
            wiki_link:       '> Wikipedia →',
            custom_title:    '> THÈME PERSONNALISÉ',
            custom_accent:   'Accent',
            custom_highlight: 'Highlight',
            custom_bg:       'Fond',
            custom_apply:    '[ APPLIQUER ]',
            custom_reset:    '[ RESET ]',
            api_lines: [
                "NEO: Near-Earth Objects — astéroïdes dont l'orbite croise le voisinage terrestre (< 1.3 UA du Soleil)",
                '─────────────────────────────',
                'DIAM → diamètre estimé (min/max en m) — magnitude absolue + albédo géométrique',
                "VEL  → vitesse de passage relative à la Terre (km/s) — dépend de l'angle orbital",
                'DIST → distance de passage minimale (km) — éphémérides JPL HORIZONS ±1000 km à 90j',
                'COMB → diam. + vit. + dist. — entropie astronomique maximale',
            ],
        },
        en: {
            title:           'SPACE DICE',
            subtitle:        'Asteroid Entropy Randomizer',
            theme_label:     'Theme:',
            lang_label:      'Language:',
            font_label:      'Font:',
            entropy_source:  '> ENTROPY SOURCE',
            nasa_api:        'NASA NEO API',
            awaiting:        '> AWAITING ROLL...',
            no_neo:          '> NO NEO DATA',
            crypto_only:     '> CRYPTO RANDOM ONLY',
            neos_loaded:     '> {n} NEOs loaded ({p} per roll)',
            ready:           '> READY',
            select_dice:     '> SELECT DICE',
            dice_count:      'COUNT:',
            seed_label:      'SEED:',
            prng_label:      'ALGO:',
            hash_label:      'HASH:',
            range_labels:    { today: '24H', week: 'WEEK', month: 'MONTH', thisyear: 'YEAR', all: 'ALL' },
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
            orbit_earth:     '🌍',
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
            analyse_streak:  '> Max streak: {n}× face {f}',
            analyse_stddev:  '> Std deviation: {v}',
            analyse_heatmap: '> Heatmap:',
            footer_line1:    'Maintained by E1000 | Licensed under WTFPL | Github | Beta | NASA NEO API | Fetch {f} {r} NEOs < 24h',
            rpg_mode:        '[ RPG MODE ]',
            zero_label:      'ZERO',
            zero_excl:       'EXCL.',
            zero_incl:       'INCL.',
            d2_true:         'TRUE',
            d2_false:        'FALSE',
            rpg_help_keep:   'keeps max/min',
            status_demo:     '> DEMO KEY · real data not loaded',
            status_fresh:    '> Data from: {d} ({n} NEOs)',
            status_stale:    '> Stale data, last fetch: {d}',
            status_nodata:   '> No NASA data · run fetch_nasa.py',
            wiki_link:       '> Wikipedia →',
            custom_title:    '> CUSTOM THEME',
            custom_accent:   'Accent',
            custom_highlight: 'Highlight',
            custom_bg:       'Background',
            custom_apply:    '[ APPLY ]',
            custom_reset:    '[ RESET ]',
            api_lines: [
                "NEO: Near-Earth Objects — asteroids crossing Earth's orbital vicinity (< 1.3 AU from the Sun)",
                '─────────────────────────────',
                'DIAM → estimated diameter (min/max in m) — from absolute magnitude and geometric albedo',
                'VEL  → Earth-relative approach velocity (km/s) — varies with orbital geometry',
                'DIST → minimum miss distance (km) — JPL HORIZONS ephemerides ±1000 km at 90 days',
                'COMB → diam. + vel. + dist. — maximum astronomical entropy',
            ],
        },
    };

    // ─────────────────────────────────────────
    //  RAW SEED EXTRACTION (no hash — direct decimal digits)
    // ─────────────────────────────────────────
    /**
     * Extract `count` decimal digits after the point as an integer.
     * e.g. extractDecimals(10.4285624126, 10) → 4285624126
     * Returns uint32 (>>> 0 truncates values > 2^32).
     */
    function extractDecimals(value, count) {
        var s = Math.abs(value).toFixed(count);
        var parts = s.split('.');
        return parseInt((parts[1] || '0').slice(0, 10), 10) >>> 0;
    }

    /**
     * Extract a raw seed from a NEO without hashing.
     * velocity/diameter: 10 decimal digits
     * distance: full integer XOR decimal digits (maximum entropy)
     * combined: multiplicative mix of all three via murmur3 finalizer
     */
    function getRawSeed(neo, source) {
        var vDec  = extractDecimals(neo.velocity_kms, 10);
        var dDec  = extractDecimals(neo.diameter_min, 10);
        var dist  = Math.abs(neo.distance_km);
        var distInt = Math.floor(dist) >>> 0;
        var distDec = extractDecimals(dist, 10);

        if (source === 'velocity') return vDec;
        if (source === 'diameter') return dDec;
        if (source === 'distance') return (distInt ^ distDec) >>> 0;
        // combined: chain murmur3 finalizer for maximum avalanche
        var h = vDec;
        h = (Math.imul(h ^ dDec, 0x85ebca6b)) >>> 0;
        h = (Math.imul(h ^ distInt, 0xc2b2ae35)) >>> 0;
        h = (Math.imul(h ^ distDec, 0x5bd1e995)) >>> 0;
        h ^= h >>> 16;
        return h >>> 0;
    }

    // ─────────────────────────────────────────
    //  BLAKE3 — minimal pure-JS for single-block inputs (≤ 64 bytes)
    //  Spec: https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf
    // ─────────────────────────────────────────
    var B3_IV = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
                 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
    var B3_SIGMA = [2,6,3,10,7,0,4,13,1,11,12,5,9,14,15,8];

    function b3_rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

    function b3_g(v, a, b, c, d, mx, my) {
        v[a] = (v[a] + v[b] + mx) >>> 0;  v[d] = b3_rotr(v[d] ^ v[a], 16);
        v[c] = (v[c] + v[d])      >>> 0;  v[b] = b3_rotr(v[b] ^ v[c], 12);
        v[a] = (v[a] + v[b] + my) >>> 0;  v[d] = b3_rotr(v[d] ^ v[a],  8);
        v[c] = (v[c] + v[d])      >>> 0;  v[b] = b3_rotr(v[b] ^ v[c],  7);
    }

    function b3_round(v, m) {
        b3_g(v,0,4, 8,12,m[0], m[1]); b3_g(v,1,5, 9,13,m[2], m[3]);
        b3_g(v,2,6,10,14,m[4], m[5]); b3_g(v,3,7,11,15,m[6], m[7]);
        b3_g(v,0,5,10,15,m[8], m[9]); b3_g(v,1,6,11,12,m[10],m[11]);
        b3_g(v,2,7, 8,13,m[12],m[13]);b3_g(v,3,4, 9,14,m[14],m[15]);
    }

    /** BLAKE3 hash of a string → uint32. Single-block path (input ≤ 64 bytes). */
    function blake3_uint32(str) {
        // Encode string to bytes (truncate to 64)
        var len = Math.min(str.length, 64);
        var padded = new Uint8Array(64);
        for (var i = 0; i < len; i++) padded[i] = str.charCodeAt(i) & 0xFF;
        // Parse as 16 little-endian uint32 words
        var m = new Array(16);
        for (var i = 0; i < 16; i++) {
            m[i] = (padded[i*4] | (padded[i*4+1]<<8) | (padded[i*4+2]<<16) | (padded[i*4+3]<<24)) >>> 0;
        }
        // Init compression state: [chaining_value | IV | counter_lo, counter_hi, block_len, flags]
        var v = [
            B3_IV[0],B3_IV[1],B3_IV[2],B3_IV[3],
            B3_IV[4],B3_IV[5],B3_IV[6],B3_IV[7],
            B3_IV[0],B3_IV[1],B3_IV[2],B3_IV[3],
            0, 0, len, 0x0B  // counter=0, flags = CHUNK_START|CHUNK_END|ROOT
        ];
        // 7 rounds with message permutation
        var mp = m.slice();
        for (var r = 0; r < 7; r++) {
            b3_round(v, mp);
            var tmp = new Array(16);
            for (var j = 0; j < 16; j++) tmp[j] = mp[B3_SIGMA[j]];
            mp = tmp;
        }
        // Finalize: XOR state halves
        return (v[0] ^ v[8]) >>> 0;
    }

    /** Compute a BLAKE3-based seed from raw NEO orbital data. */
    function getBlake3Seed(neo, source) {
        var input;
        if (source === 'velocity') input = neo.velocity_kms.toFixed(10);
        else if (source === 'diameter') input = neo.diameter_min.toFixed(10);
        else if (source === 'distance') input = String(neo.distance_km);
        else input = String(neo.diameter_min) + '|' + String(neo.velocity_kms) + '|' + String(neo.distance_km);
        return blake3_uint32(input);
    }

    /** Get seed for a NEO, respecting current hash mode. */
    function getNeoSeed(neo, source) {
        if (currentHashMode === 'raw') return getRawSeed(neo, source);
        if (currentHashMode === 'blake3') return getBlake3Seed(neo, source);
        // sha256: use backend pre-computed seeds
        return (neo.seeds && neo.seeds[source] != null) ? neo.seeds[source] : 0;
    }

    // ─────────────────────────────────────────
    //  DAILY SEEDED PRNG (replaces Math.random in animations)
    //  Seed = f(NEO_DATA, request timecode)
    // ─────────────────────────────────────────
    var _dailySeed = 1;

    /** Build a deterministic seed from all loaded NEOs + current timestamp. */
    function initDailySeed() {
        var seed = 0;
        if (typeof NEO_DATA !== 'undefined' && NEO_DATA && NEO_DATA.length > 0) {
            for (var i = 0; i < NEO_DATA.length; i++) {
                var s = NEO_DATA[i].seeds ? (NEO_DATA[i].seeds.combined || 0) : 0;
                seed = (Math.imul(seed ^ s, 0x5bd1e995) + 0x85ebca6b) >>> 0;
            }
        }
        // Mix with current timestamp (unique per page load / data refresh)
        var now = Date.now();
        seed ^= (now & 0xFFFFFFFF) >>> 0;
        seed = Math.imul(seed, 0xc2b2ae35) >>> 0;
        seed ^= seed >>> 16;
        _dailySeed = seed || 1; // xorshift needs non-zero
    }

    /** Seeded xorshift32 — deterministic per session, replaces Math.random(). */
    function seededRand(max) {
        _dailySeed ^= _dailySeed << 13;
        _dailySeed ^= _dailySeed >>> 17;
        _dailySeed ^= _dailySeed << 5;
        _dailySeed = _dailySeed >>> 0;
        if (_dailySeed === 0) _dailySeed = 1;
        if (max === 2) return _dailySeed % 2;           // d2: always 0 or 1
        return (_dailySeed % max) + (zeroIncluded ? 0 : 1);
    }

    // ─────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────
    let currentDice          = 6;
    let diceCount            = 1;
    let isRandomMode         = false;
    let isRolling            = false;
    let zeroIncluded         = false;
    let currentEntropySource = 'combined';
    let currentPrngAlgo      = 'xor';
    let currentLang          = 'fr';
    let currentFont          = 'ibm';
    let currentNeoRange      = '42days';
    let currentTheme         = 'terminal';
    let currentHashMode      = 'sha256';  // 'raw' | 'sha256' | 'blake3'

    const rollStats   = {};   // { diceType: { face: count, _total: n } }
    const rollHistory = [];   // session history (newest first)
    const streakTracker = {}; // { diceType: { current: n, currentFace: f, max: n, maxFace: f } }

    // ─────────────────────────────────────────
    //  DOM
    // ─────────────────────────────────────────
    const resultCanvas       = document.getElementById('result-canvas');
    const rollBtn            = document.getElementById('roll-btn');
    const neoDataEl          = document.getElementById('neo-data');
    const orbitDisplayEl     = document.getElementById('orbit-display');
    const apiInfoEl          = document.getElementById('api-info-text');
    const prngInfoEl         = document.getElementById('prng-info');
    const rpgModeBtn         = document.getElementById('rpg-mode-btn');
    const diceBtns           = document.querySelectorAll('.dice-btn');
    const diceSprite         = document.getElementById('dice-sprite');
    const diceImg            = document.getElementById('dice-img');
    const diceTypeLabel      = document.getElementById('dice-type-label');
    const themeBtns          = document.querySelectorAll('.theme-btn');
    const langBtns           = document.querySelectorAll('.lang-btn');
    const entropyBtns        = document.querySelectorAll('.entropy-btn');
    const rangeBtns          = document.querySelectorAll('.range-btn');
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
    const exportBtn          = document.getElementById('export-btn');
    const hashBtns           = document.querySelectorAll('.hash-btn');
    const customizerPanel    = document.getElementById('customizer-panel');
    const customAccentInput  = document.getElementById('custom-accent');
    const customHighlightInput = document.getElementById('custom-highlight');
    const customBgInput      = document.getElementById('custom-bg');
    const customApplyBtn     = document.getElementById('custom-apply');
    const customResetBtn     = document.getElementById('custom-reset');

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
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.dataset.i18n;
            if (key === 'footer_line1') {
                var rc = (typeof DATA_META !== 'undefined' && DATA_META.recent_count != null) ? DATA_META.recent_count : '?';
                // Format last fetch time
                var fetchTime = '?';
                if (typeof DATA_META !== 'undefined' && DATA_META.last_fetch) {
                    try {
                        var fd = new Date(DATA_META.last_fetch);
                        fetchTime = fd.toLocaleString(currentLang === 'fr' ? 'fr-FR' : 'en-US', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
                    } catch(_) { fetchTime = DATA_META.last_fetch.slice(0, 16); }
                }
                var ftxt = t('footer_line1', { r: rc, f: fetchTime });
                el.innerHTML = ftxt
                    .replace('E1000', '<a href="https://github.com/Zugwang/" target="_blank" rel="noopener">E1000</a>')
                    .replace('WTFPL', '<a href="http://www.wtfpl.net/" target="_blank" rel="noopener">WTFPL</a>')
                    .replace('Github', '<a href="https://github.com/Zugwang/SpaceDice" target="_blank" rel="noopener">Github</a>')
                    .replace('Beta', '<a href="/beta/">Beta</a>')
                    .replace(/API NEO NASA|NASA NEO API/, '<a href="https://api.nasa.gov/" target="_blank" rel="noopener">$&</a>');
            } else {
                el.textContent = t(key);
            }
        });

        // API info block
        if (apiInfoEl) {
            const poolSize = Math.min(NEO_POOL_SIZE, NEO_DATA ? NEO_DATA.length : 0);
            apiInfoEl.innerHTML = (TR[currentLang].api_lines || [])
                .map(l => '<p>' + l.replace('{p}', poolSize) + '</p>').join('');
        }

        // Range button labels
        const rangeLabels = (TR[currentLang] || TR.fr).range_labels || {};
        rangeBtns.forEach(b => { if (rangeLabels[b.dataset.range]) b.textContent = rangeLabels[b.dataset.range]; });

        // Zero toggle label
        updateZeroToggleBtn();

        // Refresh dynamic areas
        updatePrngInfo();
        updateAnalysisStatus();
        renderHistory();
    }

    function setLang(lang) {
        currentLang = lang;
        localStorage.setItem(SK_LANG, lang);
        langBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
        applyTranslations();
    }

    function loadLang() {
        var saved = localStorage.getItem(SK_LANG);
        if (saved) { setLang(saved); return; }
        // Auto-detect: if browser language starts with 'fr', use French; else English
        var browserLang = (navigator.language || navigator.userLanguage || 'fr').toLowerCase();
        setLang(browserLang.startsWith('fr') ? 'fr' : 'en');
    }
    function handleLangSelect(e) { if (e.target.classList.contains('lang-btn')) setLang(e.target.dataset.lang); }

    // ─────────────────────────────────────────
    //  THEME
    // ─────────────────────────────────────────
    // Theme → d20 favicon path
    var THEME_FAVICON = {
        terminal: 'sprites/dice/terminal/d20.png',
        solarized: 'sprites/dice/solarized/d20.png',
        oneshot:  'sprites/dice/oneshot/d20.png',
        original: 'sprites/dice/original/d20.png',
    };

    function setTheme(name) {
        // V3: smooth transition — add class, apply theme, remove after animation
        document.documentElement.classList.add('theme-transitioning');
        currentTheme = name;
        document.body.setAttribute('data-theme', name);
        localStorage.setItem(SK_THEME, name);
        themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === name));
        setTimeout(function() { document.documentElement.classList.remove('theme-transitioning'); }, 380);

        // V4: update favicon to themed d20
        var faviconEl = document.getElementById('favicon');
        if (faviconEl) {
            var rel = THEME_FAVICON[name] || THEME_FAVICON.terminal;
            faviconEl.href = (window._staticBase || '') + rel;
        }

        // Show/hide customizer panel
        if (customizerPanel) customizerPanel.style.display = name === 'custom' ? 'block' : 'none';
        // Redraw canvas with new theme color
        if (resultCanvas && resultCanvas._lastText) drawPixelResult(resultCanvas._lastText);
        // Update sprite to current theme variant
        updateSprite(currentDice);
    }

    function loadTheme() {
        var saved = localStorage.getItem(SK_THEME) || 'original';
        // Restore custom colors if custom theme was saved
        if (saved === 'custom') {
            try {
                var colors = JSON.parse(localStorage.getItem(SK_CUSTOM));
                if (colors) applyCustomColors(colors);
            } catch (_) { /* ignore */ }
        }
        setTheme(saved);
    }

    function handleThemeSelect(e) { if (e.target.classList.contains('theme-btn')) setTheme(e.target.dataset.theme); }

    // ─────────────────────────────────────────
    //  CUSTOM THEME (A5)
    // ─────────────────────────────────────────
    function applyCustomColors(colors) {
        var root = document.documentElement;
        if (colors.accent) root.style.setProperty('--accent-primary', colors.accent);
        if (colors.highlight) root.style.setProperty('--accent-highlight', colors.highlight);
        if (colors.bg) {
            root.style.setProperty('--bg-deep', colors.bg);
            root.style.setProperty('--glow-color', colors.accent || '#00ff41');
        }
    }

    function resetCustomColors() {
        var root = document.documentElement;
        root.style.removeProperty('--accent-primary');
        root.style.removeProperty('--accent-highlight');
        root.style.removeProperty('--bg-deep');
        root.style.removeProperty('--glow-color');
        localStorage.removeItem(SK_CUSTOM);
        setTheme('terminal');
    }

    function handleCustomApply() {
        var colors = {
            accent: customAccentInput.value,
            highlight: customHighlightInput.value,
            bg: customBgInput.value,
        };
        localStorage.setItem(SK_CUSTOM, JSON.stringify(colors));
        applyCustomColors(colors);
        setTheme('custom');
    }

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
    //  HASH MODE TOGGLE: RAW / SHA-256 / BLAKE3
    // ─────────────────────────────────────────
    function setHashMode(mode) {
        currentHashMode = mode;
        localStorage.setItem(SK_HASH, mode);
        hashBtns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.hash === mode);
        });
    }

    function loadHashMode() {
        var saved = localStorage.getItem(SK_HASH);
        setHashMode(saved === 'raw' || saved === 'blake3' ? saved : 'sha256');
    }

    function handleHashSelect(e) {
        if (e.target.classList.contains('hash-btn')) {
            setHashMode(e.target.dataset.hash);
        }
    }

    // ─────────────────────────────────────────
    //  NEO DATE RANGE
    // ─────────────────────────────────────────
    function updateNeoDisplay() {
        const poolSize = Math.min(NEO_POOL_SIZE, NEO_DATA ? NEO_DATA.length : 0);
        if (!NEO_DATA || NEO_DATA.length === 0) {
            neoDataEl.innerHTML = '<p>' + t('no_neo') + '</p><p>' + t('crypto_only') + '</p>';
        } else {
            neoDataEl.innerHTML =
                '<p>' + t('neos_loaded', { n: NEO_DATA.length, p: poolSize }) + '</p>' +
                '<p>' + t('ready') + '</p>';
        }
        applyTranslations();
    }

    function setNeoRange(range) {
        currentNeoRange = range;
        localStorage.setItem(SK_RANGE, range);
        rangeBtns.forEach(b => b.classList.toggle('active', b.dataset.range === range));
        neoDataEl.innerHTML = '<p>> LOADING...</p>';
        fetch('/api/neos?range=' + range)
            .then(r => r.json())
            .then(data => {
                NEO_DATA = data;
                initDailySeed();
                updateNeoDisplay();
            })
            .catch(() => { neoDataEl.innerHTML = '<p>> FETCH ERROR</p>'; });
    }

    function loadNeoRange() {
        var saved = localStorage.getItem(SK_RANGE) || 'today';
        currentNeoRange = saved;
        rangeBtns.forEach(b => b.classList.toggle('active', b.dataset.range === saved));
        // Skip fetch if Jinja2 already loaded data and range matches default
        if (saved === 'month' && NEO_DATA && NEO_DATA.length > 0) {
            initDailySeed();
            updateNeoDisplay();
            return;
        }
        setNeoRange(saved);
    }
    function handleRangeSelect(e) { if (e.target.classList.contains('range-btn')) setNeoRange(e.target.dataset.range); }

    // ─────────────────────────────────────────
    //  PRNG ALGORITHM
    // ─────────────────────────────────────────
    function setPrngAlgo(algo) {
        currentPrngAlgo = algo;
        localStorage.setItem(SK_PRNG, algo);
        prngBtns.forEach(b => b.classList.toggle('active', b.dataset.algo === algo));
        updatePrngInfo();
    }

    function loadPrngAlgo() { setPrngAlgo(localStorage.getItem(SK_PRNG) || 'murmur'); }
    function handlePrngSelect(e) { if (e.target.classList.contains('prng-btn')) setPrngAlgo(e.target.dataset.algo); }

    // ─────────────────────────────────────────
    //  ASCII FONT SELECTOR
    // ─────────────────────────────────────────
    // ── Symbols easter egg: Nerd Font icon mapping ──
    var _symbolsActive = false;
    var _originalTexts = new Map();
    var NERD_SYMBOLS = '\ue5ff\uf489\uf121\uf1d3\uf188\ue711\uf013\uf0e7\uf0a0\uf233\uf21e\uf0ac\uf135\uf0c3\uf1b2\uf080\uf1c0\uf0e8\uf0eb\uf09b\ue61f\uf292\uf120\uf1de\uf085\ue614\uf0ad\uf187\ue22b\uf49b\uf423\uf8ff\uf417\uf461\uf0f9\uf1e6\ue780\ue7c5\uf46d';

    function symbolize(text) {
        var out = '';
        for (var i = 0; i < text.length; i++) {
            var c = text[i];
            if (/\s/.test(c)) { out += c; }
            else { out += NERD_SYMBOLS[Math.abs(text.charCodeAt(i) * 7 + i * 13) % NERD_SYMBOLS.length]; }
        }
        return out;
    }

    function applySymbolsMode() {
        _originalTexts.clear();
        document.querySelectorAll('.container *:not(script):not(style):not(canvas):not(img):not(input)').forEach(function(el) {
            for (var n = el.childNodes.length - 1; n >= 0; n--) {
                var node = el.childNodes[n];
                if (node.nodeType === 3 && node.textContent.trim()) {
                    _originalTexts.set(node, node.textContent);
                    node.textContent = symbolize(node.textContent);
                }
            }
        });
        _symbolsActive = true;
    }

    function removeSymbolsMode() {
        _originalTexts.forEach(function(orig, node) {
            if (node.parentNode) node.textContent = orig;
        });
        _originalTexts.clear();
        _symbolsActive = false;
    }

    function setAsciiFont(fontKey) {
        // Undo symbols if switching away
        if (_symbolsActive && fontKey !== 'symbols') removeSymbolsMode();

        currentFont = fontKey;
        localStorage.setItem(SK_FONT, fontKey);
        var family = FONT_OPTIONS[fontKey] || FONT_OPTIONS.bigblue;

        // Apply immediately — font-display:swap handles visual loading.
        // Avoids race conditions from document.fonts.load() promises resolving out of order.
        document.documentElement.style.setProperty('--ascii-font-family', family);
        fontBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.font === fontKey); });
        if (fontKey === 'symbols' && !_symbolsActive) applySymbolsMode();
    }

    function loadAsciiFont() { setAsciiFont(localStorage.getItem(SK_FONT) || 'dejavu'); }
    function handleFontSelect(e) { if (e.target.classList.contains('font-btn')) setAsciiFont(e.target.dataset.font); }

    // ─────────────────────────────────────────
    //  ZERO SELECTOR
    // ─────────────────────────────────────────
    function updateZeroToggleBtn() {
        var inclBtn = document.getElementById('zero-incl');
        var exclBtn = document.getElementById('zero-excl');
        var lbl     = document.querySelector('.zero-label');
        if (!inclBtn || !exclBtn) return;
        if (lbl) lbl.textContent = t('zero_label');
        inclBtn.textContent = t('zero_incl');
        exclBtn.textContent = t('zero_excl');
        inclBtn.classList.toggle('active', zeroIncluded);
        exclBtn.classList.toggle('active', !zeroIncluded);
    }
    function handleZeroSelect(e) {
        var btn = e.target.closest('.zero-btn');
        if (!btn) return;
        zeroIncluded = btn.dataset.zero === 'incl';
        updateZeroToggleBtn();
    }

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
        drawPixelResult('-');
        resultCanvas._lastText = '-';
        // Show dice preview grid for multi-dice
        renderDicePreview();
    }

    /** Show a preview grid of dice images (no results) for the current count/type. */
    function renderDicePreview() {
        if (diceCount <= 1 || isRandomMode) {
            multiRollResultsEl.innerHTML = '';
            return;
        }
        var dt = currentDice;
        var hasSrc = DICE_WITH_SPRITES.includes(dt);
        var imgSrc = hasSrc ? '/static/sprites/dice/' + spriteTheme() + '/d' + dt + '.png' : null;
        var html = '<div class="multi-dice-grid">';
        for (var i = 0; i < diceCount; i++) {
            html += '<div class="multi-dice-cell">';
            if (imgSrc) {
                html += '<img class="multi-dice-img" src="' + imgSrc + '" alt="d' + dt + '">';
            } else {
                html += '<span class="multi-dice-no-img">d' + dt + '</span>';
            }
            html += '<span class="multi-dice-result">-</span>';
            html += '</div>';
        }
        html += '</div>';
        multiRollResultsEl.innerHTML = html;
        // Hide single display when showing multi preview
        diceSprite.style.display    = 'none';
        resultCanvas.style.display  = 'none';
        diceTypeLabel.style.display = 'none';
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
     * Select a single NEO randomly using CSPRNG.
     * crypto.getRandomValues() guarantees security;
     * the NEO seed adds astronomical entropy.
     */
    function selectNeo() {
        if (!NEO_DATA || NEO_DATA.length === 0) return null;
        return NEO_DATA[getSecureRandom() % NEO_DATA.length];
    }

    /**
     * Roll one die: single NEO seed + CSPRNG → PRNG algo → result.
     * Raw or hashed seed depending on user toggle.
     */
    function rollOne(diceType) {
        const neo = selectNeo();

        let nasaSeed = 0;
        if (neo) {
            nasaSeed = getNeoSeed(neo, currentEntropySource);
        }

        const cryptoRand = getSecureRandom();
        const algo       = PRNG_ALGOS[currentPrngAlgo] || PRNG_ALGOS.xor;
        const combined   = algo.fn(nasaSeed, cryptoRand);

        var result;
        if (diceType === 2) {
            result = combined % 2;                              // d2: always 0 or 1
        } else if (zeroIncluded) {
            result = combined % diceType;                       // 0 to N-1
        } else {
            result = (combined % diceType) + 1;                 // 1 to N
        }
        return { result: result, neo: neo, pool: neo ? [neo] : [] };
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
    function spriteTheme() {
        // custom theme falls back to terminal sprites
        if (currentTheme === 'custom') return 'terminal';
        return currentTheme;
    }

    function updateSprite(diceType) {
        if (DICE_WITH_SPRITES.includes(diceType)) {
            diceImg.src = '/static/sprites/dice/' + spriteTheme() + '/d' + diceType + '.png';
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
            var rVal = seededRand(diceType);
            drawPixelResult(rVal);
            resultCanvas._lastText = String(rVal);
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
    function renderOrbit2D(neo) {
        if (!neo || neo.distance_km == null) return '';

        var km          = parseFloat(neo.distance_km);
        var ld          = parseFloat(neo.distance_lunar);
        var unit        = currentLang === 'fr' ? 'DL' : 'LD';
        var isFr        = currentLang === 'fr';
        var ldKm        = Math.round(km).toLocaleString(isFr ? 'fr-FR' : 'en-US');
        var isDangerous = neo.hazardous && ld < 10;
        var neoSym      = isDangerous ? '\u26A0\uFE0F' : '\u2604\uFE0F';  // ⚠️ or ☄️ (emoji form)

        // log₁₀ scale : 10² → ☀ (149 600 000 km), W chars wide
        // LMAX = log10(Sun distance) so Sun lands exactly at position W
        // 🌍 prefix adds 2 display cols → all positions offset by +2 visually
        var W = 38, LMIN = 2, LMAX = Math.log10(149600000);  // ≈ 8.175
        function pos(distKm) {
            return Math.min(Math.max(
                Math.round((Math.log10(Math.max(distKm, 101)) - LMIN) / (LMAX - LMIN) * W),
                0), W);
        }

        var pIss  = pos(400);           // ISS ~400 km
        var pGeo  = pos(35786);         // GéoSat ~35 786 km
        var pMoon = pos(384400);        // Lune ~384 400 km
        var pNzS  = pos(500000);        // Zone NEOs début
        var pNzE  = pos(45000000);      // Zone NEOs fin
        var pNeo  = Math.min(Math.max(pos(km), 0), W);
        var pSun  = W;                  // Soleil ☀ — exactly at right edge

        // ─── Ruler char array (indices 0…W) ─────────────────────────
        var ruler = Array(W + 1).fill('\u2500');  // ─

        // NEO zone: ═
        var i;
        for (i = pNzS; i <= Math.min(pNzE, W); i++) ruler[i] = '\u2550';  // ═

        // Decade ticks ┼ or ╪ (10² to 10⁸; 10⁹ would be beyond the Sun)
        var SUPS = ['\u00B2','\u00B3','\u2074','\u2075','\u2076','\u2077','\u2078'];
        var decPos = [];
        for (var d = 2; d <= 8; d++) {
            var tp = pos(Math.pow(10, d));
            decPos.push(tp);
            ruler[tp] = (ruler[tp] === '\u2550') ? '\u256A' : '\u253C';  // ╪ or ┼
        }

        // Object markers (later = higher priority)
        ruler[pIss]  = '\u25B4';        // ▴  ISS
        ruler[pGeo]  = '\u25C6';        // ◆  GéoSat
        ruler[pMoon] = '\u263D';        // ☽  Lune
        ruler[pNeo]  = neoSym;         // ☄️  NEO (emoji form)
        ruler[pSun]  = '\u2600\uFE0F'; // ☀️  Soleil (emoji form)

        // ─── HTML ruler: 🌍 prefix + NEO zone span + sun span ───────
        var rulerHtml = '<span class="orbit-emoji">\uD83C\uDF0D</span>';  // 🌍
        var inZone = false;
        for (i = 0; i <= W; i++) {
            if (i === pNzS && !inZone) { rulerHtml += '<span class="neo-zone-line">'; inZone = true; }
            if (i === pSun) {
                rulerHtml += '<span class="orbit-sun">' + ruler[i] + '</span>';
            } else {
                rulerHtml += ruler[i];
            }
            if (inZone && i === Math.min(pNzE, W)) { rulerHtml += '</span>'; inZone = false; }
        }

        // ─── Label row (above ruler) ─────────────────────────────────
        // rulerPos + 2 = display col (accounting for 🌍 width)
        var LEN = W + 16;
        var lrow = Array(LEN).fill(' ');
        function setLbl(rp, text) {
            var start = rp + 2 - Math.floor(text.length / 2);
            for (var j = 0; j < text.length; j++)
                if (start + j >= 0 && start + j < LEN) lrow[start + j] = text[j];
        }
        setLbl(pIss,                          'ISS');
        setLbl(pGeo,                          'GEO');
        setLbl(pMoon,                         isFr ? 'Lune'   : 'Moon');
        setLbl(Math.round((pNzS + pNzE) / 2), 'NEOs');
        setLbl(pSun,                          isFr ? 'Soleil' : 'Sun');
        var labelLine = lrow.join('').trimEnd();

        // ─── Scale row (below ruler) ─────────────────────────────────
        var srow = Array(LEN).fill(' ');
        for (var k = 0; k < decPos.length; k++) {
            var slbl = '10' + SUPS[k];
            var sc = decPos[k] + 2 - Math.floor(slbl.length / 2);
            for (var m = 0; m < slbl.length; m++)
                if (sc + m >= 0 && sc + m < LEN) srow[sc + m] = slbl[m];
        }
        var scaleLine = srow.join('').trimEnd() + '\u00A0km';

        // ─── Caption ────────────────────────────────────────────────
        var caption = isFr
            ? '\u2514\u2500 log\u2081\u2080 \u00B7 1\u00A0DL\u00A0=\u00A0384\u202F400\u00A0km \u00B7 ' + ldKm + '\u00A0km'
            : '\u2514\u2500 log\u2081\u2080 \u00B7 1\u00A0LD\u00A0=\u00A0384\u202F400\u00A0km \u00B7 ' + ldKm + '\u00A0km';

        return (
            '<p class="orbit-title">'   + t('orbit_title') + ' \u00B7 ' + ld.toFixed(1) + '\u00A0' + unit + (isDangerous ? ' \u26A0' : '') + '</p>' +
            '<pre class="orbit-bar">'   + labelLine + '\n' + rulerHtml + '\n' + scaleLine  + '</pre>' +
            '<pre class="orbit-scale">' + caption + '</pre>'
        );
    }

    // ─────────────────────────────────────────
    //  DISPLAY NEO
    // ─────────────────────────────────────────
    function fmtSeedHex(seed) {
        if (seed == null) return 'N/A';
        var n = seed >>> 0;
        return '0x' + n.toString(16).toUpperCase().padStart(8, '0');
    }

    /**
     * Colorise les chiffres utilisés comme source d'entropie.
     * highlightAll=true → nombre entier colorisé (source distance).
     */
    function highlightDecimals(value, highlightAll) {
        var str = String(value);
        if (highlightAll) return '<span class="seed-highlight">' + str + '</span>';
        var dot = str.indexOf('.');
        if (dot < 0) return str;
        return str.slice(0, dot + 1) + '<span class="seed-highlight">' + str.slice(dot + 1) + '</span>';
    }

    function displayNeoData(neo, pool) {
        if (!neo) {
            neoDataEl.innerHTML  = '<p>' + t('no_neo') + '</p>';
            orbitDisplayEl.innerHTML = '';
            return;
        }

        var src = currentEntropySource;
        var hClass   = neo.hazardous ? 'hazardous-yes' : 'hazardous-no';
        var hText    = neo.hazardous ? t('hazardous_yes') : t('hazardous_no');
        var activeSeed = getNeoSeed(neo, src);
        var seedHex  = fmtSeedHex(activeSeed);
        var seedMode = currentHashMode.toUpperCase();
        var locale   = currentLang === 'fr' ? 'fr-FR' : 'en-US';

        // Highlight decimals used as entropy source
        var useDiam = (src === 'diameter' || src === 'combined');
        var useVel  = (src === 'velocity' || src === 'combined');
        var useDist = (src === 'distance' || src === 'combined');

        var diamStr = (useDiam ? highlightDecimals(neo.diameter_min, false) : String(neo.diameter_min))
                    + 'm\u2013' + neo.diameter_max + 'm';
        var velStr  = (useVel ? highlightDecimals(neo.velocity_kms, false) : String(neo.velocity_kms))
                    + ' km/s';
        var distKm  = useDist
                    ? highlightDecimals(neo.distance_km, false)
                    : Number(neo.distance_km).toLocaleString(locale);
        var distStr = distKm + ' km';

        neoDataEl.innerHTML =
            '<p>>> ' + t('neo_label')    + ' <span class="seed-highlight">' + neo.name + '</span></p>' +
            '<p>>> ' + t('hazard_label') + ' <span class="' + hClass + '">' + hText + '</span></p>' +
            '<p>>> ' + t('diam_label')   + ' ' + diamStr + '</p>' +
            '<p>>> ' + t('vel_label')    + ' ' + velStr + '</p>' +
            '<p>>> ' + t('dist_label')   + ' ' + distStr + '</p>' +
            '<p>>> ' + t('date_label')   + ' ' + (neo.approach_date || 'N/A') + '</p>' +
            '<p class="seed-line">>> SEED[' + src.toUpperCase() + '/' + seedMode + ']: ' + seedHex + '</p>';

        orbitDisplayEl.innerHTML = renderOrbit2D(neo);
    }

    // ─────────────────────────────────────────
    //  MULTI-DICE DISPLAY
    // ─────────────────────────────────────────
    // displayMultiRollResults is now handled by animateMultiRoll directly

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
            if (exportBtn) exportBtn.style.display = 'none';
            return;
        }
        if (exportBtn) exportBtn.style.display = 'inline-block';
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
    //  EXPORT CSV (A2)
    // ─────────────────────────────────────────
    function exportHistoryCSV() {
        if (rollHistory.length === 0) return;
        var header = 'time,dice,count,results,sum,neo';
        var lines = rollHistory.map(function (e) {
            return e.time + ',d' + e.diceType + ',' + e.count + ',' +
                   e.results.join(';') + ',' + e.sum + ',' + e.neoName;
        });
        var csv = header + '\n' + lines.join('\n');
        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'spacedice-' + Date.now() + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    }


    // ─────────────────────────────────────────
    //  STATISTICS — CHI-SQUARE + EXTENDED (A9)
    // ─────────────────────────────────────────
    function trackStreak(rolls, diceType) {
        if (!streakTracker[diceType]) {
            streakTracker[diceType] = { current: 0, currentFace: 0, max: 0, maxFace: 0 };
        }
        var s = streakTracker[diceType];
        rolls.forEach(function (r) {
            if (r.result === s.currentFace) {
                s.current++;
            } else {
                s.currentFace = r.result;
                s.current = 1;
            }
            if (s.current > s.max) {
                s.max = s.current;
                s.maxFace = s.currentFace;
            }
        });
    }

    function recordRolls(rolls, diceType) {
        if (!rollStats[diceType]) {
            rollStats[diceType] = { _total: 0 };
            for (let f = 1; f <= diceType; f++) rollStats[diceType][f] = 0;
        }
        rolls.forEach(({ result }) => {
            rollStats[diceType][result] = (rollStats[diceType][result] || 0) + 1;
            rollStats[diceType]._total++;
        });
        trackStreak(rolls, diceType);
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

    function buildHeatmap(stats, diceType) {
        var total = stats._total;
        var maxCount = 0;
        for (var f = 1; f <= diceType; f++) {
            if ((stats[f] || 0) > maxCount) maxCount = stats[f] || 0;
        }
        var barWidth = 20;
        var lines = [];
        for (var f = 1; f <= diceType; f++) {
            var count = stats[f] || 0;
            var pct = total > 0 ? (count / total * 100) : 0;
            var filled = maxCount > 0 ? Math.round(count / maxCount * barWidth) : 0;
            var bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
            var label = String(f).padStart(3, ' ');
            var tag = count === maxCount && count > 0 ? ' \u2190 max' : '';
            lines.push('  ' + label + ' ' + bar + ' ' + String(count).padStart(4, ' ') + '  (' + pct.toFixed(1) + '%)' + tag);
        }
        return lines.join('\n');
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

        // Standard deviation of observed counts
        var counts = [];
        for (var f = 1; f <= currentDice; f++) counts.push(stats[f] || 0);
        var mean = total / currentDice;
        var variance = counts.reduce(function (s, c) { return s + Math.pow(c - mean, 2); }, 0) / currentDice;
        var stddev = Math.sqrt(variance);

        // Streak info
        var sk = streakTracker[currentDice];
        var streakHtml = sk && sk.max > 1
            ? '<p>' + t('analyse_streak', { n: sk.max, f: sk.maxFace }) + '</p>'
            : '';

        // Heatmap
        var heatmap = buildHeatmap(stats, currentDice);

        analysisResultsEl.style.display = 'block';
        analysisResultsEl.innerHTML =
            '<p>' + t('analyse_chi2', { v: chi2.toFixed(4) }) + '</p>' +
            '<p>' + t('analyse_df',   { v: df })              + '</p>' +
            '<p>' + t('analyse_pval', { v: pValue.toFixed(4) }) + '</p>' +
            '<p class="' + (uniform ? 'hazardous-no' : 'hazardous-yes') + '">' +
                t(uniform ? 'analyse_ok' : 'analyse_nok') + '</p>' +
            '<p>' + t('analyse_stddev', { v: stddev.toFixed(2) }) + '</p>' +
            streakHtml +
            '<p>' + t('analyse_heatmap') + '</p>' +
            '<pre class="heatmap-pre">' + heatmap + '</pre>' +
            '<p class="analysis-note">' + t('analyse_note') + '</p>';
    }

    // ─────────────────────────────────────────
    //  HANDLERS
    // ─────────────────────────────────────────
    // Lock sections above roll zone to prevent scroll jumps
    var infoPanel = document.querySelector('.info-panel');
    var rollZone  = document.querySelector('.roll-zone');

    function freezeLayout() {
        if (infoPanel) infoPanel.style.minHeight = infoPanel.offsetHeight + 'px';
        if (rollZone)  rollZone.style.minHeight  = rollZone.offsetHeight + 'px';
    }
    function unfreezeLayout() {
        if (infoPanel) infoPanel.style.minHeight = '';
        // Keep roll-zone min-height from CSS (12rem)
        if (rollZone)  rollZone.style.minHeight  = '';
    }

    function handleRoll() {
        if (isRolling) return;

        var scrollY = window.scrollY;
        freezeLayout();

        let diceToRoll = currentDice;
        if (isRandomMode) {
            diceToRoll = randomDiceType();
            updateSprite(diceToRoll);
            updateDiceLabel(diceToRoll);
        }

        const rolls   = rollMany(diceToRoll, diceCount);
        const mainNeo = rolls[0].neo;
        const mainPool = rolls[0].pool;

        if (diceCount > 1) {
            animateMultiRoll(rolls, diceToRoll, () => {
                displayNeoData(mainNeo, mainPool);
                unfreezeLayout();
                window.scrollTo(0, scrollY);
            });
        } else {
            diceSprite.style.display    = DICE_WITH_SPRITES.includes(diceToRoll) ? 'flex' : 'none';
            resultCanvas.style.display  = 'block';
            diceTypeLabel.style.display = 'block';
            multiRollResultsEl.innerHTML = '';

            // d2: canvas already shows 0 or 1 (from animateRoll); show boolean label below
            // other dice: hide type label (don't show "d6", "d20" etc.)
            animateRoll(rolls[0].result, diceToRoll, () => {
                if (diceToRoll === 2) {
                    const boolLabel = rolls[0].result === 1 ? t('d2_true') : t('d2_false');
                    diceTypeLabel.textContent = boolLabel;
                    diceTypeLabel.style.display = 'block';
                } else {
                    diceTypeLabel.style.display = 'none';
                }
                displayNeoData(mainNeo, mainPool);
                unfreezeLayout();
                window.scrollTo(0, scrollY);
            });
        }

        recordRolls(rolls, diceToRoll);
        addToHistory(rolls, diceToRoll);
    }

    /**
     * Animate multi-dice roll: show grid with rolling sprites, then reveal results one by one.
     */
    function animateMultiRoll(rolls, diceType, cb) {
        isRolling = true;
        rollBtn.disabled = true;

        // Hide single display
        diceSprite.style.display    = 'none';
        resultCanvas.style.display  = 'none';
        diceTypeLabel.style.display = 'none';

        const hasSrc = DICE_WITH_SPRITES.includes(diceType);
        const imgSrc = hasSrc ? '/static/sprites/dice/' + spriteTheme() + '/d' + diceType + '.png' : null;

        // Build grid with rolling state
        var html = '<div class="multi-dice-grid">';
        rolls.forEach(function (roll, i) {
            html += '<div class="multi-dice-cell" id="multi-cell-' + i + '">';
            if (imgSrc) {
                html += '<img class="multi-dice-img rolling" src="' + imgSrc + '" alt="d' + diceType + '">';
            } else {
                html += '<span class="multi-dice-no-img">d' + diceType + '</span>';
            }
            html += '<span class="multi-dice-result">?</span>';
            html += '</div>';
        });
        html += '</div>';
        multiRollResultsEl.innerHTML = html;

        // Animate random numbers in all cells
        const steps = 10, interval = 50;
        let step = 0;
        const resultSpans = multiRollResultsEl.querySelectorAll('.multi-dice-result');

        const anim = setInterval(function () {
            resultSpans.forEach(function (span) {
                span.textContent = seededRand(diceType);
            });
            if (++step >= steps) {
                clearInterval(anim);
                // Reveal final results
                var imgs = multiRollResultsEl.querySelectorAll('.multi-dice-img');
                imgs.forEach(function (img) { img.classList.remove('rolling'); });
                rolls.forEach(function (roll, i) {
                    resultSpans[i].textContent = roll.result;
                });
                isRolling = false;
                rollBtn.disabled = false;
                if (cb) cb();
            }
        }, interval);
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
    //  RPG MODE — formula parser + advantage/disadvantage
    // ─────────────────────────────────────────
    let rpgModeActive = false;
    let rpgAdvantage  = 'none'; // 'none' | 'adv' | 'dis'

    const rpgPanel     = document.getElementById('rpg-panel');
    const rpgFormulaEl = document.getElementById('rpg-formula');
    const rpgRollBtn   = document.getElementById('rpg-roll-btn');
    const rpgResultEl  = document.getElementById('rpg-result');
    const rpgAdvBtn    = document.getElementById('rpg-adv');
    const rpgDisBtn    = document.getElementById('rpg-dis');

    /**
     * Parse a dice formula string like "2d6+4", "4d6k3", "1d20-2".
     * Returns { count, sides, keep, modifier } or null if invalid.
     * Supports: NdS, NdSkK, NdS+M, NdSkK+M (modifier can be negative).
     */
    function parseFormula(str) {
        str = str.replace(/\s+/g, '').toLowerCase();
        // Pattern: (count)d(sides)[k(keep)][+/-modifier]
        var m = str.match(/^(\d+)d(\d+)(?:k(\d+))?([+-]\d+)?$/);
        if (!m) return null;
        var count = parseInt(m[1], 10);
        var sides = parseInt(m[2], 10);
        var keep  = m[3] ? parseInt(m[3], 10) : count;
        var mod   = m[4] ? parseInt(m[4], 10) : 0;
        if (count < 1 || count > 100 || sides < 2 || sides > 1000 || keep < 1 || keep > count) return null;
        return { count: count, sides: sides, keep: keep, modifier: mod };
    }

    /**
     * Roll a parsed formula using the NEO entropy engine.
     * Returns { rolls[], kept[], dropped[], subtotal, modifier, total, formula }.
     */
    function rollFormula(parsed) {
        var rolls = [];
        for (var i = 0; i < parsed.count; i++) {
            rolls.push(rollOne(parsed.sides).result);
        }
        // Sort descending to pick keeps
        var sorted = rolls.slice().sort(function (a, b) { return b - a; });
        var kept = sorted.slice(0, parsed.keep);
        var dropped = sorted.slice(parsed.keep);
        var subtotal = kept.reduce(function (s, v) { return s + v; }, 0);
        return {
            rolls: rolls,
            kept: kept,
            dropped: dropped,
            subtotal: subtotal,
            modifier: parsed.modifier,
            total: subtotal + parsed.modifier,
            formula: parsed.count + 'd' + parsed.sides +
                     (parsed.keep < parsed.count ? 'k' + parsed.keep : '') +
                     (parsed.modifier > 0 ? '+' + parsed.modifier : parsed.modifier < 0 ? String(parsed.modifier) : ''),
        };
    }

    /**
     * Roll with advantage or disadvantage (2×formula, keep best/worst total).
     */
    function rollWithAdvantage(parsed, mode) {
        var r1 = rollFormula(parsed);
        var r2 = rollFormula(parsed);
        var chosen, other;
        if (mode === 'adv') {
            chosen = r1.total >= r2.total ? r1 : r2;
            other  = r1.total >= r2.total ? r2 : r1;
        } else {
            chosen = r1.total <= r2.total ? r1 : r2;
            other  = r1.total <= r2.total ? r2 : r1;
        }
        return { chosen: chosen, other: other, mode: mode };
    }

    function renderRpgResult(result, advResult, sides) {
        var html = '';
        // Dice sprite row
        var hasSrc = DICE_WITH_SPRITES.includes(sides);
        var imgSrc = hasSrc ? '/static/sprites/dice/' + spriteTheme() + '/d' + sides + '.png' : null;

        if (advResult) {
            var label = advResult.mode === 'adv'
                ? (currentLang === 'fr' ? 'AVANTAGE' : 'ADVANTAGE')
                : (currentLang === 'fr' ? 'DÉSAVANTAGE' : 'DISADVANTAGE');
            html += '<p class="rpg-adv-label">' + label + '</p>';
            html += renderOneRoll(advResult.chosen, true, imgSrc, sides);
            html += renderOneRoll(advResult.other, false, imgSrc, sides);
        } else {
            html += renderOneRoll(result, true, imgSrc, sides);
        }
        rpgResultEl.innerHTML = html;
    }

    function renderOneRoll(r, isChosen, imgSrc, sides) {
        var cls = isChosen ? '' : ' style="opacity:0.4"';
        var html = '<div class="rpg-roll-row"' + cls + '>';
        // Sprite grid
        if (imgSrc && r.rolls.length <= 10) {
            html += '<div class="multi-dice-grid" style="margin:0.3rem 0">';
            r.rolls.forEach(function (val, i) {
                var dropped = r.dropped.length > 0 && i >= r.kept.length;
                // Check if this specific value is in the dropped set
                html += '<div class="multi-dice-cell">';
                html += '<img class="multi-dice-img" src="' + imgSrc + '" alt="d' + sides + '"' +
                    ((!isChosen || r.dropped.indexOf(val) !== -1 && r.kept.indexOf(val) === -1) ? ' style="opacity:0.3"' : '') + '>';
                html += '<span class="multi-dice-result">' + val + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }
        // Detail line
        var detailCls = isChosen ? '' : ' style="text-decoration:line-through"';
        html += '<div' + detailCls + '>';
        html += '<span class="rpg-detail">[' + r.rolls.join(', ') + ']</span>';
        if (r.dropped.length > 0) {
            html += ' → <span class="rpg-kept">[' + r.kept.join(', ') + ']</span>';
            html += ' <span class="rpg-dropped">[' + r.dropped.join(', ') + ']</span>';
        }
        html += ' = ';
        if (r.modifier !== 0) {
            html += r.subtotal + (r.modifier > 0 ? '+' : '') + r.modifier + ' = ';
        }
        html += '<span class="rpg-total">' + r.total + '</span>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    function handleRpgRoll() {
        var formula = rpgFormulaEl.value.trim();
        if (!formula) return;
        var parsed = parseFormula(formula);
        if (!parsed) {
            rpgResultEl.innerHTML = '<span style="color:var(--accent-danger)">' +
                (currentLang === 'fr' ? '> Formule invalide' : '> Invalid formula') + '</span>';
            return;
        }
        if (rpgAdvantage !== 'none') {
            var advResult = rollWithAdvantage(parsed, rpgAdvantage);
            renderRpgResult(null, advResult, parsed.sides);
        } else {
            var result = rollFormula(parsed);
            renderRpgResult(result, null, parsed.sides);
        }
    }

    function toggleRpgMode() {
        rpgModeActive = !rpgModeActive;
        rpgPanel.style.display = rpgModeActive ? 'block' : 'none';
        rpgModeBtn.classList.toggle('active', rpgModeActive);
        if (rpgModeActive) rpgFormulaEl.focus();
    }

    function setRpgAdvantage(mode) {
        rpgAdvantage = rpgAdvantage === mode ? 'none' : mode;
        rpgAdvBtn.classList.toggle('active', rpgAdvantage === 'adv');
        rpgDisBtn.classList.toggle('active', rpgAdvantage === 'dis');
    }

    // ─────────────────────────────────────────
    //  PWA SERVICE WORKER (A1)
    // ─────────────────────────────────────────
    function registerSW() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/static/sw.js').catch(function () {
                // SW registration failed — app works fine without it
            });
        }
    }

    // ─────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────
    function init() {
        loadTheme();
        loadEntropySource();
        loadHashMode();
        loadNeoRange();       // also calls initDailySeed()
        loadPrngAlgo();
        loadAsciiFont();
        loadLang();           // triggers applyTranslations()

        rollBtn.addEventListener('click', handleRoll);
        document.querySelector('.dice-grid').addEventListener('click', handleDiceSelect);
        document.querySelector('.theme-selector').addEventListener('click', handleThemeSelect);
        document.querySelector('.lang-selector').addEventListener('click', handleLangSelect);
        document.querySelector('.entropy-selector').addEventListener('click', handleEntropySelect);
        var hashSel = document.querySelector('.hash-selector');
        if (hashSel) hashSel.addEventListener('click', handleHashSelect);
        document.querySelector('.range-selector').addEventListener('click', handleRangeSelect);
        document.querySelector('.prng-selector').addEventListener('click', handlePrngSelect);
        document.querySelector('.font-selector').addEventListener('click', handleFontSelect);
        countMinusBtn.addEventListener('click', () => setDiceCount(diceCount - 1));
        countPlusBtn.addEventListener('click',  () => setDiceCount(diceCount + 1));
        analyseBtnEl.addEventListener('click', runChiSquare);

        // A2: Export CSV
        if (exportBtn) exportBtn.addEventListener('click', exportHistoryCSV);

        // A5: Custom theme
        if (customApplyBtn) customApplyBtn.addEventListener('click', handleCustomApply);
        if (customResetBtn) customResetBtn.addEventListener('click', resetCustomColors);

        // RPG mode
        var zeroSelector = document.querySelector('.zero-selector');
        if (zeroSelector) zeroSelector.addEventListener('click', handleZeroSelect);
        rpgModeBtn.addEventListener('click', toggleRpgMode);
        rpgRollBtn.addEventListener('click', handleRpgRoll);
        rpgAdvBtn.addEventListener('click', function () { setRpgAdvantage('adv'); });
        rpgDisBtn.addEventListener('click', function () { setRpgAdvantage('dis'); });
        rpgFormulaEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); handleRpgRoll(); }
        });

        // A3: Space/Enter to re-roll same dice (only when RPG input not focused)
        document.addEventListener('keydown', e => {
            if (document.activeElement === rpgFormulaEl) return;
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleRoll(); }
        });

        // Force RPG panel hidden on init (button stays visible)
        rpgPanel.style.display = 'none';
        rpgModeActive = false;

        setDiceCount(1);
        updateSprite(currentDice);
        updateDiceLabel(currentDice);

        // Initial canvas state
        drawPixelResult('-');
        resultCanvas._lastText = '-';

        // NEO count display — handled by loadNeoRange() → updateNeoDisplay()

        updateAnalysisStatus();

        // Register Service Worker for offline support
        registerSW();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
