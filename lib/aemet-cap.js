// Lectura de los avisos de AEMET (formato CAP de Meteoalerta). Aparte del
// servidor para poder probarlo con paquetes reales guardados (tests/).
const zlib = require('zlib');
const tarStream = require('tar-stream');
const { XMLParser } = require('fast-xml-parser');

const NIVEL_ORDEN = { rojo: 0, naranja: 1, amarillo: 2, verde: 3 };

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
            poligonos
        });
    }

    // Primero el más grave y, a igual nivel, el que empieza antes
    avisos.sort((a, b) => ((NIVEL_ORDEN[a.nivel] ?? 9) - (NIVEL_ORDEN[b.nivel] ?? 9))
        || String(a.onset).localeCompare(String(b.onset)));
    return avisos;
}

module.exports = { extractXmlsFromTar, parseCapPolygon, pointInPolygon, distToPolygon, avisoAfecta, parseAvisosCap, NIVEL_ORDEN };
