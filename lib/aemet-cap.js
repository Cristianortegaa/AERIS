// Lectura de los avisos de AEMET (formato CAP de Meteoalerta). Aparte del
// servidor para poder probarlo con paquetes reales guardados (tests/).
const zlib = require('zlib');
const tarStream = require('tar-stream');
const { XMLParser } = require('fast-xml-parser');

const NIVEL_ORDEN = { rojo: 0, naranja: 1, amarillo: 2, verde: 3 };

// Fenómeno en inglés (el "event" en inglés de AEMET viene como "Severe rain
// warning" y con alguna errata, "coastalevent"): tabla propia
const FENOMENO_EN = {
    'lluvias': 'Rain', 'tormentas': 'Thunderstorms', 'vientos': 'Wind', 'nevadas': 'Snow',
    'costeros': 'Coastal events', 'nieblas': 'Fog', 'temperaturas máximas': 'High temperatures',
    'temperaturas mínimas': 'Low temperatures', 'polvo en suspensión': 'Dust', 'deshielos': 'Thaw',
    'galernas': 'Galerna (sudden gale)', 'aludes': 'Avalanches', 'rissagas': 'Rissaga (meteotsunami)'
};
const fenomenoEn = (es, eventEn) => FENOMENO_EN[String(es || '').toLowerCase()]
    || String(eventEn || '').replace(/^(minor|moderate|severe|extreme)\s+/i, '').replace(/\s*warning$/i, '').replace(/^\w/, c => c.toUpperCase())
    || es;

// Extrae el texto de cada XML del paquete de avisos de AEMET. Antes venía
// como .tar.gz y ahora llega como .tar sin comprimir: se aceptan los dos (y
// un XML suelto, por si acaso).
function extractXmlsFromTar(buffer) {
    return new Promise((resolve, reject) => {
        let raw = buffer;
        if (raw[0] === 0x1f && raw[1] === 0x8b) {
            try { raw = zlib.gunzipSync(raw); } catch (e) { return reject(e); }
        }
        const head = raw.slice(0, 64).toString('utf-8').trimStart();
        if (head.startsWith('<?xml') || head.startsWith('<alert')) return resolve([raw.toString('utf-8')]);
        const extract = tarStream.extract();
        const xmls = [];
        extract.on('entry', (header, stream, next) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
                if (header.name.endsWith('.xml')) xmls.push(Buffer.concat(chunks).toString('utf-8'));
                next();
            });
            stream.on('error', reject);
            stream.resume();
        });
        extract.on('finish', () => resolve(xmls));
        extract.on('error', reject);
        extract.end(raw);
    });
}

// Polígono CAP ("lat,lon lat,lon ...") → [[lat, lon], ...]
const parseCapPolygon = (str) => String(str || '').trim().split(/\s+/)
    .map(pair => pair.split(',').map(Number))
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));

function pointInPolygon(lat, lon, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [yi, xi] = poly[i], [yj, xj] = poly[j];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
// Distancia aproximada (en grados de latitud) del punto al borde del polígono
function distToPolygon(lat, lon, poly) {
    const k = Math.cos(lat * Math.PI / 180); // un grado de longitud mide menos que uno de latitud
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const ax = poly[j][1] * k, ay = poly[j][0], bx = poly[i][1] * k, by = poly[i][0], px = lon * k, py = lat;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
        best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
    return best;
}
// ¿Afecta el aviso a este punto? Dentro de su zona o a menos de ~4 km del
// borde (los polígonos de AEMET están simplificados). Sin polígono, sí.
const avisoAfecta = (aviso, lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !aviso.poligonos || !aviso.poligonos.length) return true;
    return aviso.poligonos.some(p => p.length > 2 && (pointInPolygon(lat, lon, p) || distToPolygon(lat, lon, p) < 0.04));
};

// XMLs del paquete → avisos vigentes (sin "verde" ni caducados), sin
// repetir y del más grave al más leve. `now` se puede fijar en las pruebas.
// `stats` (opcional) cuenta cuántos XML había y cuántos se han entendido
// (con nivel, incluido el verde): si llegan XML y no se entiende ninguno,
// AEMET ha cambiado el formato aunque no haya ningún error.
function parseAvisosCap(xmls, now, stats) {
    if (stats) { stats.xmls = xmls.length; stats.leidos = 0; }
    const parser = new XMLParser({ ignoreAttributes: false, textNodeName: '#text' });
    now = now ?? Date.now();
    const seen = new Set();
    const avisos = [];

    for (const xml of xmls) {
        let doc;
        try { doc = parser.parse(xml); } catch (e) { continue; }
        const alert = doc && doc.alert;
        if (!alert || !alert.info) continue;

        const infos = Array.isArray(alert.info) ? alert.info : [alert.info];
        const info = infos.find(i => i.language === 'es-ES') || infos[0];
        if (!info) continue;
        const infoEn = infos.find(i => i.language === 'en-GB'); // AEMET lo manda también en inglés

        const params = Array.isArray(info.parameter) ? info.parameter : (info.parameter ? [info.parameter] : []);
        const getParam = (name) => {
            const p = params.find(p => p.valueName === name);
            return p ? String(p.value) : null;
        };

        const nivel = (getParam('AEMET-Meteoalerta nivel') || '').toLowerCase();
        if (stats && nivel in NIVEL_ORDEN) stats.leidos++;
        if (!nivel || nivel === 'verde') continue; // "verde" = sin riesgo, no interesa mostrarlo

        const expires = info.expires ? new Date(info.expires).getTime() : null;
        if (expires && expires < now) continue; // ya caducado

        const areasRaw = Array.isArray(info.area) ? info.area : (info.area ? [info.area] : []);
        const zonas = areasRaw.map(a => a && a.areaDesc).filter(Boolean);
        const poligonos = areasRaw.flatMap(a => [].concat((a && a.polygon) || [])).map(parseCapPolygon).filter(p => p.length > 2);

        // El fenómeno viene en eventCode ("TO;Tormentas"); en versiones
        // antiguas venía como parámetro
        const codes = [].concat(info.eventCode || []);
        const ec = codes.find(c => c && c.valueName === 'AEMET-Meteoalerta fenomeno');
        const fenomenoRaw = (ec && String(ec.value)) || getParam('AEMET-Meteoalerta fenomeno') || '';
        const fenomeno = fenomenoRaw.includes(';') ? fenomenoRaw.split(';')[1] : fenomenoRaw;

        const key = `${nivel}|${fenomeno}|${zonas.join(',')}|${info.onset || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        avisos.push({
            nivel,                                 // amarillo | naranja | rojo
            fenomeno: fenomeno || 'Fenómeno adverso',
            titular: info.headline || info.event || '',
            descripcion: info.description || '',
            consejo: info.instruction || '',
            probabilidad: getParam('AEMET-Meteoalerta probabilidad') || '',
            zonas,
            onset: info.onset || null,
            expires: info.expires || null,
            poligonos,
            // Lo mismo en inglés (texto oficial de AEMET; el fenómeno, de la tabla)
            en: {
                fenomeno: fenomenoEn(fenomeno, infoEn && infoEn.event),
                titular: (infoEn && (infoEn.headline || infoEn.event)) || '',
                descripcion: (infoEn && infoEn.description) || '',
                consejo: (infoEn && infoEn.instruction) || ''
            }
        });
    }

    // Primero el más grave y, a igual nivel, el que empieza antes
    avisos.sort((a, b) => ((NIVEL_ORDEN[a.nivel] ?? 9) - (NIVEL_ORDEN[b.nivel] ?? 9))
        || String(a.onset).localeCompare(String(b.onset)));
    return avisos;
}

// Zonas de aviso de la comunidad con su polígono, sacadas de TODOS los XML
// (también los verdes): así se sabe en qué zona está un punto aunque su
// zona no tenga avisos. Map nombre de zona → [polígonos]
function parseZonasCap(xmls) {
    const parser = new XMLParser({ ignoreAttributes: false, textNodeName: '#text' });
    const zonas = new Map();
    for (const xml of xmls) {
        let doc;
        try { doc = parser.parse(xml); } catch (e) { continue; }
        const infos = [].concat((doc && doc.alert && doc.alert.info) || []);
        const info = infos.find(i => i.language === 'es-ES') || infos[0];
        if (!info) continue;
        for (const a of [].concat(info.area || [])) {
            if (!a || !a.areaDesc || zonas.has(a.areaDesc)) continue;
            const polys = [].concat(a.polygon || []).map(parseCapPolygon).filter(p => p.length > 2);
            if (polys.length) zonas.set(a.areaDesc, polys);
        }
    }
    return zonas;
}

// Zonas del punto. AEMET separa tierra ("Litoral gaditano") y mar
// ("Costa - Litoral gaditano"), y una ciudad de costa necesita las dos:
// - tierra: la que lo contiene o, si los polígonos simplificados lo dejan
//   fuera (pasa en la costa), la más cercana a menos de ~10 km;
// - mar: la que lo contiene o queda a menos de ~4 km (oleaje, costeros).
const esMar = (z) => /^costa\s*-/i.test(z);
function zonasDelPunto(zonas, lat, lon) {
    const dist = (polys) => polys.some(p => pointInPolygon(lat, lon, p)) ? 0 : Math.min(...polys.map(p => distToPolygon(lat, lon, p)));
    const d = [...zonas].map(([z, polys]) => [z, dist(polys)]);
    const tierra = d.filter(([z]) => !esMar(z));
    let mias = tierra.filter(([, x]) => x === 0).map(([z]) => z);
    if (!mias.length) {
        const cerca = tierra.filter(([, x]) => x < 0.1).sort((a, b) => a[1] - b[1])[0];
        if (cerca) mias = [cerca[0]];
    }
    const mar = d.filter(([z, x]) => esMar(z) && x < 0.04).map(([z]) => z);
    return [...mias, ...mar];
}

// Avisos de un punto: solo los de SU zona (antes también salían los de una
// zona vecina si su borde estaba a menos de 4 km: Getafe recibía los de
// "Sur, Vegas y Oeste" estando en "Metropolitana y Henares").
function avisosEnPunto(avisos, zonas, lat, lon) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return avisos;
    if (!zonas || !zonas.size) return avisos.filter(a => avisoAfecta(a, lat, lon)); // sin zonas: como antes
    const mias = zonasDelPunto(zonas, lat, lon);
    return avisos.filter(a => (a.zonas || []).some(z => mias.includes(z))
        || (!(a.zonas || []).length && avisoAfecta(a, lat, lon)));
}

module.exports = { extractXmlsFromTar, parseCapPolygon, pointInPolygon, distToPolygon, avisoAfecta, parseAvisosCap, parseZonasCap, zonasDelPunto, avisosEnPunto, NIVEL_ORDEN, FENOMENO_EN, fenomenoEn };
