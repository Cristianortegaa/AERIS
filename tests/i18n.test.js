// Idiomas: todo texto que pasa por t('…') en app.js tiene traducción en
// inglés, catalán, gallego y euskera, y las traducciones conservan sus
// {huecos}. Si se añade un texto y se olvida traducirlo, esto falla.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

global.window = {};
require('../public/i18n/en.js');
require('../public/i18n/personas-en.js');
const EN = window.AERIS_EN;
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');

// Literales que aparecen como texto de t(...), también dentro de "a ? 'x' : 'y'"
function keysOfT(src) {
    const keys = new Set();
    const re = /\bt\(/g;
    let m;
    while ((m = re.exec(src))) {
        // Primer argumento: hasta la coma o el paréntesis que lo cierra al mismo nivel
        let i = m.index + 2, depth = 0, quote = null, arg = '';
        for (; i < src.length; i++) {
            const c = src[i];
            if (quote) { arg += c; if (c === '\\') { arg += src[++i]; continue; } if (c === quote) quote = null; continue; }
            if (c === "'" || c === '"') { quote = c; arg += c; continue; }
            if (c === '`') break; // plantillas con variables: no se pueden comprobar así
            if (c === '(' || c === '{' || c === '[') depth++;
            if (c === ')' || c === '}' || c === ']') { if (!depth) break; depth--; }
            if (c === ',' && !depth) break;
            arg += c;
        }
        // Las comparaciones (x === 'baja' ? 'Texto' : …) no son texto
        arg = arg.replace(/[!=]==\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, '');
        for (const lit of arg.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
            const k = (lit[1] ?? lit[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
            if (k.trim()) keys.add(k);
        }
    }
    return keys;
}

test('todo texto de t() tiene traducción al inglés', () => {
    const keys = [...keysOfT(app)];
    assert.ok(keys.length > 250, `solo ${keys.length} textos: ¿ha cambiado la forma de llamar a t()?`);
    const missing = keys.filter(k => !(k in EN));
    assert.deepEqual(missing, []);
});

test('las traducciones conservan sus {huecos}', () => {
    const bad = Object.entries(EN).filter(([es, en]) => {
        const a = (es.match(/\{\w+\}/g) || []).sort().join();
        const b = (en.match(/\{\w+\}/g) || []).map(x => x === '{Nivel}' ? '{nivel}' : x).sort().join();
        return a !== b;
    });
    assert.deepEqual(bad, []);
});

test('catalán, gallego y euskera: completos y con las mismas claves que el inglés', () => {
    const { execFileSync } = require('child_process');
    for (const l of ['ca', 'gl', 'eu']) {
        const out = execFileSync(process.execPath, [path.join(__dirname, 'validate-lang.js'), l], { encoding: 'utf-8' });
        assert.match(out, new RegExp(`^OK ${l}`), out);
    }
});

test('las 15 personalidades tienen sus frases en inglés', () => {
    const P = window.AERIS_PERSONAS_EN;
    assert.equal(Object.keys(P).length, 15);
    for (const [k, p] of Object.entries(P)) {
        assert.ok(p.name, k);
        for (const cat of ['hot', 'cold', 'rain', 'snow', 'wind', 'cloudy', 'nice', 'allergy']) assert.ok(p.tips[cat].length >= 5, `${k}.${cat}`);
    }
});
