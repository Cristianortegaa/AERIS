// Lectura de avisos de AEMET con un paquete real (Cantabria, 3-10-2026:
// naranja por lluvias en el litoral y amarillos en el resto). Si AEMET
// cambia el formato otra vez, esto falla antes de que lo note nadie.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { extractXmlsFromTar, parseAvisosCap, parseCapPolygon, avisoAfecta } = require('../lib/aemet-cap');

const TAR = fs.readFileSync(path.join(__dirname, 'fixtures', 'aemet-cantabria.tar'));
const DURANTE = Date.parse('2026-10-03T11:00:00Z'); // avisos vigentes
const DESPUES = Date.parse('2026-10-05T12:00:00Z'); // ya caducados
const SANTANDER = [43.46, -3.80];
const REINOSA = [43.00, -4.14];

test('extrae los XML del .tar', async () => {
    const xmls = await extractXmlsFromTar(TAR);
    assert.equal(xmls.length, 23);
    assert.ok(xmls.every(x => x.includes('<alert')));
});

test('también acepta .tar.gz (el formato antiguo) y un XML suelto', async () => {
    assert.equal((await extractXmlsFromTar(zlib.gzipSync(TAR))).length, 23);
    const [uno] = await extractXmlsFromTar(TAR);
    assert.equal((await extractXmlsFromTar(Buffer.from(uno))).length, 1);
});

test('lee nivel, fenómeno, zonas y fechas', async () => {
    const avisos = parseAvisosCap(await extractXmlsFromTar(TAR), DURANTE);
    assert.equal(avisos.length, 10);
    for (const a of avisos) {
        assert.ok(['amarillo', 'naranja', 'rojo'].includes(a.nivel), a.nivel);
        assert.ok(a.fenomeno && !a.fenomeno.includes(';'), a.fenomeno); // "LL;Lluvias" → "Lluvias"
        assert.ok(a.zonas.length > 0);
        assert.ok(a.poligonos.length > 0 && a.poligonos[0].length > 2);
        assert.ok(!Number.isNaN(Date.parse(a.onset)) && !Number.isNaN(Date.parse(a.expires)));
    }
    const fenomenos = new Set(avisos.map(a => a.fenomeno));
    assert.deepEqual([...fenomenos].sort(), ['Lluvias', 'Tormentas']);
});

test('el más grave va primero', async () => {
    const avisos = parseAvisosCap(await extractXmlsFromTar(TAR), DURANTE);
    const orden = { rojo: 0, naranja: 1, amarillo: 2 };
    assert.equal(avisos[0].nivel, 'naranja');
    for (let i = 1; i < avisos.length; i++) assert.ok(orden[avisos[i - 1].nivel] <= orden[avisos[i].nivel]);
});

test('los avisos caducados no salen', async () => {
    assert.equal(parseAvisosCap(await extractXmlsFromTar(TAR), DESPUES).length, 0);
});

test('cada aviso solo afecta a su zona', async () => {
    const avisos = parseAvisosCap(await extractXmlsFromTar(TAR), DURANTE);
    const litoral = avisos.find(a => a.nivel === 'naranja' && a.zonas.includes('Litoral cántabro'));
    assert.ok(litoral);
    assert.equal(avisoAfecta(litoral, ...SANTANDER), true);
    assert.equal(avisoAfecta(litoral, ...REINOSA), false);
    // Santander: naranja por lluvias y amarillos por lluvias y tormentas
    const santander = avisos.filter(a => avisoAfecta(a, ...SANTANDER));
    assert.deepEqual(santander.map(a => `${a.nivel} ${a.fenomeno}`).sort(), ['amarillo Lluvias', 'amarillo Tormentas', 'naranja Lluvias']);
});

test('sin polígono o sin coordenadas, el aviso se muestra', () => {
    assert.equal(avisoAfecta({ poligonos: [] }, ...SANTANDER), true);
    assert.equal(avisoAfecta({ poligonos: [[[0, 0], [0, 1], [1, 1]]] }, NaN, NaN), true);
});

test('polígono CAP', () => {
    assert.deepEqual(parseCapPolygon('43.1,-3.9 43.5,-3.7 43.2,-3.5'), [[43.1, -3.9], [43.5, -3.7], [43.2, -3.5]]);
    assert.deepEqual(parseCapPolygon(''), []);
});
