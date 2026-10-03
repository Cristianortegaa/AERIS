/* ============================================================
   AERIS — idioma: español, inglés, catalán, gallego y euskera
   ------------------------------------------------------------
   - El idioma lo decide el cargador de index.html (window.AERIS_LANG), que
     solo descarga el diccionario de ese idioma.
   - El texto de origen es el español: t('Hoy') devuelve 'Today', 'Avui'…
     Con variables: t('Lluvia en {min} min', { min: 15 }).
   - Diccionarios: public/i18n/<idioma>.js (window.AERIS_EN, AERIS_CA…).
   - El texto fijo del HTML se traduce al cargar (nodos de texto y los
     atributos aria-label, placeholder, title y alt).
   ============================================================ */
(function () {
    var SUPPORTED = ['es', 'en', 'ca', 'gl', 'eu'];
    var LOCALES = { es: 'es-ES', en: 'en-GB', ca: 'ca-ES', gl: 'gl-ES', eu: 'eu-ES' };
    var HOME = { es: '/', en: '/en/', ca: '/ca/', gl: '/gl/', eu: '/eu/' };
    var CITY_BASE = { es: '/tiempo/', en: '/en/weather/', ca: '/ca/temps/', gl: '/gl/tempo/', eu: '/eu/eguraldia/' };

    // Misma regla que el cargador de index.html (por si se carga sin él)
    function detect() {
        try {
            var q = new URLSearchParams(location.search).get('lang');
            if (SUPPORTED.indexOf(q) !== -1) { localStorage.setItem('aeris_lang', q); return q; }
        } catch (e) {}
        var m = location.pathname.match(/^\/(en|ca|gl|eu)(\/|$)/);
        if (m) return m[1];
        try { var s = localStorage.getItem('aeris_lang'); if (SUPPORTED.indexOf(s) !== -1) return s; } catch (e) {}
        var nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').toLowerCase();
        var base = nav.split('-')[0];
        return SUPPORTED.indexOf(base) !== -1 ? base : 'en';
    }
    var lang = SUPPORTED.indexOf(window.AERIS_LANG) !== -1 ? window.AERIS_LANG : detect();
    var U = lang.toUpperCase();
    var DICT = lang === 'es' ? {} : (window['AERIS_' + U] || {});
    var PATTERNS = lang === 'es' ? [] : (window['AERIS_' + U + '_PATTERNS'] || []);
    var missing = {};

    function fill(str, vars) {
        if (!vars) return str;
        return str.replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m; });
    }

    // Traduce un texto en español. Si no hay traducción, se queda en español
    // (y se apunta, para encontrar lo que falta: window.AERIS_I18N_MISSING).
    function t(es, vars) {
        if (es == null) return '';
        var src = String(es);
        if (lang === 'es') return fill(src, vars);
        if (Object.prototype.hasOwnProperty.call(DICT, src)) return fill(DICT[src], vars);
        for (var i = 0; i < PATTERNS.length; i++) {
            if (PATTERNS[i][0].test(src)) return fill(src.replace(PATTERNS[i][0], PATTERNS[i][1]), vars);
        }
        if (src.trim()) missing[src] = true;
        return fill(src, vars);
    }

    // Texto fijo del HTML: se traduce lo que esté en el diccionario,
    // conservando los espacios de alrededor
    var ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
    function translateDOM(root) {
        if (lang === 'es' || !root) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode && n.parentNode.nodeName;
                return (p === 'SCRIPT' || p === 'STYLE') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        var nodes = [], n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(function (node) {
            var raw = node.nodeValue, key = raw.trim();
            if (!key || !Object.prototype.hasOwnProperty.call(DICT, key)) return;
            node.nodeValue = raw.replace(key, DICT[key]);
        });
        var els = root.querySelectorAll ? root.querySelectorAll('[aria-label],[placeholder],[title],[alt]') : [];
        Array.prototype.forEach.call(els, function (el) {
            ATTRS.forEach(function (a) {
                var v = el.getAttribute(a);
                if (v && Object.prototype.hasOwnProperty.call(DICT, v)) el.setAttribute(a, DICT[v]);
            });
        });
    }

    function setLang(l) {
        if (SUPPORTED.indexOf(l) === -1) return;
        try { localStorage.setItem('aeris_lang', l); } catch (e) {}
        // Las URLs de ciudad cambian de idioma con la app
        var m = location.pathname.match(/^\/(?:tiempo|en\/weather|ca\/temps|gl\/tempo|eu\/eguraldia)\/([^/?#]+)/);
        location.href = m ? CITY_BASE[l] + m[1] : HOME[l];
    }

    window.LANG = lang;
    window.LOCALE = LOCALES[lang];
    window.LANG_HOME = HOME[lang];
    window.t = t;
    window.translateDOM = translateDOM;
    window.setLang = setLang;
    window.cityPath = function (slug) { return CITY_BASE[lang] + slug; };
    window.AERIS_I18N_MISSING = missing;
    document.documentElement.lang = lang;
    translateDOM(document.body);
})();
