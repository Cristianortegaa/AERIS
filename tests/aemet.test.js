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

test('cuenta cuántos avisos ha entendido (para detectar un cambio de formato)', async () => {
    const xmls = await extractXmlsFromTar(TAR);
    const stats = {};
    parseAvisosCap(xmls, DURANTE, stats);
    assert.equal(stats.xmls, 23);
    assert.equal(stats.leidos, 23); // todos tienen nivel, también los verdes

    // Si AEMET cambia los nombres de los campos, no hay error: solo 0 leídos
    const raro = xmls.map(x => x.split('AEMET-Meteoalerta nivel').join('nivel-nuevo'));
    const stats2 = {};
    assert.deepEqual(parseAvisosCap(raro, DURANTE, stats2), []);
    assert.deepEqual(stats2, { xmls: 23, leidos: 0 });
});

// Madrid, 3-10-2026: amarillos en "Metropolitana y Henares" y en "Sur, Vegas
// y Oeste". Getafe está en la primera, a 3,9 km del borde de la segunda.
const TAR_MADRID = fs.readFileSync(path.join(__dirname, 'fixtures', 'aemet-madrid.tar'));
const { parseZonasCap, zonasDelPunto, avisosEnPunto } = require('../lib/aemet-cap');

test('zonas de aviso de la comunidad (también las que están en verde)', async () => {
    const zonas = parseZonasCap(await extractXmlsFromTar(TAR_MADRID));
    assert.deepEqual([...zonas.keys()].sort(), ['Metropolitana y Henares', 'Sierra de Madrid', 'Sur, Vegas y Oeste']);
});

test('cada sitio, en su zona', async () => {
    const zonas = parseZonasCap(await extractXmlsFromTar(TAR_MADRID));
    assert.deepEqual(zonasDelPunto(zonas, 40.305, -3.733), ['Metropolitana y Henares']); // Getafe
    assert.deepEqual(zonasDelPunto(zonas, 40.4168, -3.7038), ['Metropolitana y Henares']); // Madrid
    assert.deepEqual(zonasDelPunto(zonas, 40.241, -3.700), ['Sur, Vegas y Oeste']); // Pinto
    assert.deepEqual(zonasDelPunto(zonas, 40.659, -3.766), ['Sierra de Madrid']); // Colmenar Viejo
    assert.deepEqual(zonasDelPunto(zonas, 41.65, -0.89), []); // Zaragoza: fuera de la comunidad
});

test('solo salen los avisos de la zona del sitio, no los de la vecina', async () => {
    const xmls = await extractXmlsFromTar(TAR_MADRID);
    const avisos = parseAvisosCap(xmls, DURANTE);
    const zonas = parseZonasCap(xmls);
    const getafe = avisosEnPunto(avisos, zonas, 40.305, -3.733);
    assert.ok(getafe.length > 0);
    assert.ok(getafe.every(a => a.zonas.includes('Metropolitana y Henares')), getafe.map(a => a.zonas.join('/')).join(', '));
    const pinto = avisosEnPunto(avisos, zonas, 40.241, -3.700);
    assert.ok(pinto.every(a => a.zonas.includes('Sur, Vegas y Oeste')));
});

test('en la costa: su zona de tierra y la de mar', async () => {
    const zonas = parseZonasCap(await extractXmlsFromTar(TAR));
    const santander = zonasDelPunto(zonas, ...SANTANDER);
    assert.equal(santander[0], 'Litoral cántabro');
    assert.ok(santander.every(z => z === 'Litoral cántabro' || z === 'Costa - Litoral cántabro'), santander.join(' + '));
    assert.deepEqual(zonasDelPunto(zonas, ...REINOSA).filter(z => z.startsWith('Costa')), []); // interior: nada de mar
});

test('fuera de todas las zonas por poco (costa): la más cercana', () => {
    const cuadrado = (la, lo, d) => [[la, lo], [la + d, lo], [la + d, lo + d], [la, lo + d]];
    const zonas = new Map([['A', [cuadrado(40, -4, 0.5)]], ['B', [cuadrado(40, -3.4, 0.5)]]]);
    assert.deepEqual(zonasDelPunto(zonas, 40.2, -3.98), ['A']); // dentro de A
    assert.deepEqual(zonasDelPunto(zonas, 40.2, -4.02), ['A']); // 2 km fuera de A
    assert.deepEqual(zonasDelPunto(zonas, 40.2, -4.2), []); // lejos de todo
    const avisos = [{ nivel: 'amarillo', zonas: ['A'] }, { nivel: 'naranja', zonas: ['B'] }];
    assert.deepEqual(avisosEnPunto(avisos, zonas, 40.2, -3.98).map(a => a.nivel), ['amarillo']);
});

test('polígono CAP', () => {
    assert.deepEqual(parseCapPolygon('43.1,-3.9 43.5,-3.7 43.2,-3.5'), [[43.1, -3.9], [43.5, -3.7], [43.2, -3.5]]);
    assert.deepEqual(parseCapPolygon(''), []);
});
