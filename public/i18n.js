/* ============================================================
   AERIS — idioma (español por defecto, inglés para el resto)
   ------------------------------------------------------------
   - El texto de origen es el español: t('Hoy') devuelve 'Today' en inglés.
     Con variables: t('Lluvia en {min} min', { min: 15 }).
   - Los diccionarios (i18n/en.js) son objetos español → idioma. Para otro
     idioma (catalán, gallego, euskera) basta con otro diccionario igual.
   - El texto fijo del HTML se traduce al cargar (nodos de texto y los
     atributos aria-label, placeholder, title y alt).
   ============================================================ */
(function () {
    var SUPPORTED = ['es', 'en'];
    var lang = null;

    // 1. ?lang=en en la URL (y se recuerda)
    try {
        var q = new URLSearchParams(location.search).get('lang');
        if (SUPPORTED.indexOf(q) !== -1) { lang = q; localStorage.setItem('aeris_lang', q); }
    } catch (e) {}
    // 2. Las páginas /en/... son en inglés
    if (!lang && /^\/en(\/|$)/.test(location.pathname)) lang = 'en';
    // 3. Lo que eligió el usuario
    if (!lang) { try { var s = localStorage.getItem('aeris_lang'); if (SUPPORTED.indexOf(s) !== -1) lang = s; } catch (e) {} }
    // 4. El idioma del móvil: español (y lenguas de España) → español; el resto, inglés
    if (!lang) {
        var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'es';
        lang = /^(es|ca|gl|eu)\b/i.test(nav) ? 'es' : 'en';
    }

    var DICT = lang === 'en' ? (window.AERIS_EN || {}) : {};
    var PATTERNS = lang === 'en' ? (window.AERIS_EN_PATTERNS || []) : [];
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
        var m = location.pathname.match(/^\/(?:tiempo|en\/weather)\/([^/?#]+)/);
        var path = m ? (l === 'en' ? '/en/weather/' : '/tiempo/') + m[1] : (l === 'en' ? '/en/' : '/');
        location.href = path;
    }

    // URL de una ciudad en el idioma actual
    function cityPath(slug) { return (lang === 'en' ? '/en/weather/' : '/tiempo/') + slug; }

    window.LANG = lang;
    window.LOCALE = lang === 'en' ? 'en-GB' : 'es-ES';
    window.t = t;
    window.translateDOM = translateDOM;
    window.setLang = setLang;
    window.cityPath = cityPath;
    window.AERIS_I18N_MISSING = missing;
    document.documentElement.lang = lang;
    translateDOM(document.body);
})();
