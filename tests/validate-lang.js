// Comprueba los archivos de un idioma: node tests/validate-lang.js ca
// - public/i18n/<l>.js: mismas claves que el inglés, mismos {huecos} y etiquetas HTML
// - public/i18n/personas-<l>.js: 15 personalidades, mismas listas y longitudes
// - lib/i18n-server/<l>.json: mismas claves que el español y mismos {huecos}
// - lib/privacy-<l>.html: existe y conserva {{CONTACTO}}
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lang = process.argv[2];
if (!lang) { console.error('Uso: node tests/validate-lang.js <ca|gl|eu>'); process.exit(2); }
const L = lang.toUpperCase();
const root = path.join(__dirname, '..');
const load = (file) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf-8'), ctx); return ctx.window; };
const holes = (s) => (String(s).match(/\{\w+\}/g) || []).map(x => x.toLowerCase()).sort().join();
const tags = (s) => (String(s).match(/<\/?[a-z]+>/g) || []).sort().join();
const errors = [];

// 1) Diccionario de la app
const en = load('public/i18n/en.js');
let w;
try { w = load(`public/i18n/${lang}.js`); } catch (e) { errors.push(`public/i18n/${lang}.js: ${e.message}`); }
if (w) {
    const D = w[`AERIS_${L}`], P = w[`AERIS_${L}_PATTERNS`];
    if (!D) errors.push(`falta window.AERIS_${L}`);
    else {
        const E = en.AERIS_EN;
        for (const k of Object.keys(E)) {
            if (!(k in D)) { errors.push(`falta la clave ${JSON.stringify(k)}`); continue; }
            if (typeof D[k] !== 'string' || !D[k].trim()) errors.push(`vacía: ${JSON.stringify(k)}`);
            else {
                if (holes(k) !== holes(D[k])) errors.push(`huecos distintos en ${JSON.stringify(k)} → ${JSON.stringify(D[k])}`);
                if (tags(k) !== tags(D[k])) errors.push(`etiquetas HTML distintas en ${JSON.stringify(k)} → ${JSON.stringify(D[k])}`);
            }
        }
        for (const k of Object.keys(D)) if (!(k in E)) errors.push(`clave que no existe en en.js: ${JSON.stringify(k)}`);
    }
    if (!Array.isArray(P) || P.length !== en.AERIS_EN_PATTERNS.length) errors.push(`AERIS_${L}_PATTERNS debe tener ${en.AERIS_EN_PATTERNS.length} patrones`);
    else P.forEach((p, i) => { if (!(p[0] instanceof RegExp) && !(p[0] && p[0].test)) errors.push(`patrón ${i} sin RegExp`); if (String(p[0]) !== String(en.AERIS_EN_PATTERNS[i][0])) errors.push(`patrón ${i}: la expresión debe ser la misma que en en.js`); });
}

// 2) Personalidades
const enP = load('public/i18n/personas-en.js').AERIS_PERSONAS_EN;
try {
    const P = load(`public/i18n/personas-${lang}.js`)[`AERIS_PERSONAS_${L}`];
    if (!P) errors.push(`falta window.AERIS_PERSONAS_${L}`);
    else for (const k of Object.keys(enP)) {
        if (!P[k] || !P[k].name) { errors.push(`personalidad ${k} sin nombre`); continue; }
        for (const c of Object.keys(enP[k].tips)) {
            const a = (P[k].tips || {})[c];
            if (!Array.isArray(a) || a.length !== enP[k].tips[c].length) errors.push(`personas ${k}.${c}: ${a ? a.length : 0} frases, deben ser ${enP[k].tips[c].length}`);
            else a.forEach((s, i) => { if (!s || s.length > 80) errors.push(`personas ${k}.${c}[${i}] vacía o >80 caracteres`); });
        }
    }
} catch (e) { errors.push(`public/i18n/personas-${lang}.js: ${e.message}`); }

// 3) Textos del servidor
const { ES } = require(path.join(root, 'lib', 'i18n-server.js'));
try {
    const S = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'i18n-server', `${lang}.json`), 'utf-8'));
    for (const k of Object.keys(ES)) {
        if (!(k in S)) errors.push(`servidor: falta ${k}`);
        else if (k !== 'precipBody' && k !== 'aemetTitle' && k !== 'widgetAviso' && holes(ES[k]) !== holes(S[k])) errors.push(`servidor: huecos distintos en ${k}`);
    }
    for (const k of Object.keys(S)) if (!(k in ES)) errors.push(`servidor: clave que no existe: ${k}`);
} catch (e) { errors.push(`lib/i18n-server/${lang}.json: ${e.message}`); }

// 4) Privacidad
try {
    const h = fs.readFileSync(path.join(root, 'lib', `privacy-${lang}.html`), 'utf-8');
    if (!h.includes('{{CONTACTO}}')) errors.push('privacy: falta {{CONTACTO}}');
    if (!h.includes(`<html lang="${lang}">`)) errors.push(`privacy: debe empezar con <html lang="${lang}">`);
} catch (e) { errors.push(`lib/privacy-${lang}.html: ${e.message}`); }

if (errors.length) { console.log(`MAL (${errors.length})`); errors.slice(0, 60).forEach(e => console.log(' -', e)); process.exit(1); }
console.log(`OK ${lang}`);
