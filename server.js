require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const webpush = require('web-push');
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const zlib = require('zlib');
const tarStream = require('tar-stream');
const { XMLParser } = require('fast-xml-parser');

const app = express();
// La app corre detrás del proxy del hosting: sin esto todas las peticiones
// llegan con la IP del proxy y el límite por IP se comparte entre TODOS los
// usuarios (al pasarse, la app recibía 429 y parecía que no había conexión).
app.set('trust proxy', 1);

// --- Cliente HTTP con timeout para APIs externas (evita peticiones colgadas) ---
const http = axios.create({ timeout: 8000 });

// --- LOG HELPER ---
const log = (level, msg, ...args) => {
    const ts = new Date().toISOString();
    if (level === 'error') console.error(`[${ts}] ERROR: ${msg}`, ...args);
    else console.log(`[${ts}] ${level.toUpperCase()}: ${msg}`, ...args);
};

// --- SEGURIDAD (helmet) Y COMPRESION ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            "font-src": ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            "img-src": ["'self'", "data:", "https:"],
            // El service worker hereda esta CSP: necesita poder pedir a los CDNs
            // que cachea para el modo sin conexión (con solo 'self' fallaba su
            // instalación y, sin service worker, no hay notificaciones).
            "connect-src": ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
            "frame-src": ["https://embed.windy.com"],
            "object-src": ["'none'"],
            "upgrade-insecure-requests": null
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// --- CORS ---
const allowedOrigins = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',').map(s => s.trim())
    : ['*'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    }
}));

app.use(express.json());
app.use(express.static('public', {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// --- RATE LIMITING ---
const weatherLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones, espera un momento.' }
});

const subscribeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Demasiadas peticiones.' }
});

// --- NOTIFICACIONES ---
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails('mailto:aerisweatherapp@gmail.com', publicVapidKey, privateVapidKey);
    log('info', 'VAPID configurado correctamente.');
} else {
    log('warn', 'VAPID keys no configuradas. Las notificaciones push estaran desactivadas.');
}

// --- DB ---
// Con DATABASE_URL (Postgres: Neon, Supabase, Render...) las suscripciones
// sobreviven a despliegues y reinicios. Sin ella, SQLite en disco local
// (válido en desarrollo; en el plan gratuito de Render el disco se borra).
let sequelize;
if (process.env.DATABASE_URL) {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: process.env.DATABASE_SSL === 'false' ? {} : { ssl: { require: true, rejectUnauthorized: false } },
        pool: { max: 5, idle: 10000 }
    });
} else {
    const dbDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: path.join(dbDir, 'aeris.db'),
        logging: false
    });
}

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT }
}, { timestamps: true, createdAt: false, updatedAt: 'updatedAt' });

const Subscription = sequelize.define('Subscription', {
    // TEXT: los endpoints de push (sobre todo Apple/Mozilla) pueden pasar de 255 caracteres
    endpoint: { type: DataTypes.TEXT, primaryKey: true },
    keys: { type: DataTypes.JSON },
    lat: { type: DataTypes.FLOAT },
    lon: { type: DataTypes.FLOAT },
    city: { type: DataTypes.STRING },
    region: { type: DataTypes.STRING },
    lastNotification: { type: DataTypes.DATE },
    lastAemetAviso: { type: DataTypes.STRING }, // identificador del último aviso oficial ya notificado (evita repetir)
    timezone: { type: DataTypes.STRING }        // zona horaria IANA (p. ej. Europe/Madrid) para la pausa nocturna
}, { timestamps: false });

sequelize.sync().then(async () => {
    log('info', `Base de datos lista (${sequelize.getDialect()}).`);
    // Migración segura para bases de datos ya existentes que no tenían
    // estas columnas (sync() no altera tablas existentes por defecto).
    const qi = sequelize.getQueryInterface();
    const cols = await qi.describeTable('Subscriptions');
    for (const col of ['region', 'lastAemetAviso', 'timezone']) {
        if (!cols[col]) await qi.addColumn('Subscriptions', col, { type: DataTypes.STRING });
    }
}).catch(e => log('error', 'Base de datos:', e.message));

// --- UTILS ---
const decodeWMO = (code, isDay = 1) => {
    const c = parseInt(code);
    const dayIcons = {
        0: 'bi-sun', 1: 'bi-cloud-sun', 2: 'bi-cloud', 3: 'bi-clouds',
        45: 'bi-cloud-haze2', 48: 'bi-cloud-haze2',
        51: 'bi-cloud-drizzle', 53: 'bi-cloud-drizzle', 55: 'bi-cloud-drizzle',
        56: 'bi-cloud-drizzle', 57: 'bi-cloud-drizzle',
        61: 'bi-cloud-rain', 63: 'bi-cloud-rain', 65: 'bi-cloud-rain-heavy',
        66: 'bi-cloud-rain', 67: 'bi-cloud-rain-heavy',
        71: 'bi-cloud-snow', 73: 'bi-cloud-snow', 75: 'bi-snow',
        77: 'bi-cloud-snow',
        80: 'bi-cloud-drizzle', 81: 'bi-cloud-rain', 82: 'bi-cloud-rain-heavy',
        85: 'bi-cloud-snow', 86: 'bi-snow',
        95: 'bi-cloud-lightning', 96: 'bi-cloud-lightning-rain', 99: 'bi-cloud-lightning-rain'
    };
    const nightIcons = { 0: 'bi-moon', 1: 'bi-cloud-moon', 2: 'bi-cloud-moon', 3: 'bi-clouds' };
    const textMap = {
        0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Niebla", 48: "Niebla escarcha",
        51: "Llovizna", 53: "Llovizna moderada", 55: "Llovizna fuerte",
        56: "Llovizna helada", 57: "Llovizna helada fuerte",
        61: "Lluvia leve", 63: "Lluvia", 65: "Lluvia fuerte",
        66: "Lluvia helada", 67: "Lluvia helada fuerte",
        71: "Nieve leve", 73: "Nieve", 75: "Nieve fuerte",
        77: "Granizo fino",
        80: "Chubascos", 81: "Chubascos fuertes", 82: "Tormenta violenta",
        85: "Chubascos de nieve", 86: "Nevada fuerte",
        95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta fuerte"
    };
    const icon = isDay ? (dayIcons[c] || 'bi-cloud') : (nightIcons[c] || dayIcons[c] || 'bi-cloud');
    return { text: textMap[c] || "Variable", icon };
};

// --- AVISOS OFICIALES DE AEMET (Meteoalerta) ---
// Códigos de área verificados a mano contra la API real de AEMET (una
// petición por código y comprobación del areaDesc/zona devuelta), ya que
// la documentación pública no los lista de forma fiable.
const AEMET_AREA_KEYWORDS = [
    ['61', ['andaluc']],
    ['62', ['aragon']],
    ['63', ['asturias']],
    ['64', ['balear']],
    ['65', ['canaria']],
    ['66', ['cantabria']],
    ['67', ['castilla y leon', 'castilla-leon']],
    ['68', ['castilla-la mancha', 'castilla la mancha']],
    ['69', ['catalu']],
    ['70', ['extremadura']],
    ['71', ['galicia']],
    ['72', ['madrid']],
    ['73', ['murcia']],
    ['74', ['navarra']],
    ['75', ['pais vasco', 'euskadi']],
    ['76', ['rioja']],
    ['77', ['valenc']],
    ['78', ['ceuta']],
    ['79', ['melilla']]
];

const normalizeRegion = (str) => String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getAemetAreaCode = (regionName) => {
    const n = normalizeRegion(regionName);
    if (!n) return null;
    for (const [code, keywords] of AEMET_AREA_KEYWORDS) {
        if (keywords.some(k => n.includes(k))) return code;
    }
    return null;
};

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
// Lo que se manda al cliente (sin los polígonos, que pesan)
const avisoPublico = ({ poligonos, ...a }) => a;

const AEMET_NIVEL_ORDEN = { rojo: 0, naranja: 1, amarillo: 2, verde: 3 };
const aemetAvisosCache = new Map(); // areaCode -> { data, ts }
const AEMET_CACHE_MS = 15 * 60 * 1000; // 15 min: los avisos no cambian cada minuto

async function fetchAemetAvisos(areaCode) {
    const apiKey = process.env.AEMET_API_KEY;
    if (!apiKey || !areaCode) return [];

    const cached = aemetAvisosCache.get(areaCode);
    if (cached && (Date.now() - cached.ts) < AEMET_CACHE_MS) return cached.data;

    try {
        const metaRes = await http.get(`https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/${areaCode}`, {
            headers: { api_key: apiKey }
        });
        if (!metaRes.data || metaRes.data.estado !== 200 || !metaRes.data.datos) {
            aemetAvisosCache.set(areaCode, { data: [], ts: Date.now() });
            return [];
        }

        const tarRes = await http.get(metaRes.data.datos, {
            headers: { api_key: apiKey },
            responseType: 'arraybuffer'
        });

        const xmls = await extractXmlsFromTar(Buffer.from(tarRes.data));
        const parser = new XMLParser({ ignoreAttributes: false, textNodeName: '#text' });
        const now = Date.now();
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
        avisos.sort((a, b) => ((AEMET_NIVEL_ORDEN[a.nivel] ?? 9) - (AEMET_NIVEL_ORDEN[b.nivel] ?? 9))
            || String(a.onset).localeCompare(String(b.onset)));
        aemetAvisosCache.set(areaCode, { data: avisos, ts: Date.now() });
        return avisos;
    } catch (e) {
        log('error', 'AEMET avisos:', e.message);
        return cached ? cached.data : []; // si falla, mejor devolver lo último bueno que nada
    }
}

// Avisos de la comunidad que afectan a un punto concreto
async function avisosParaPunto(areaCode, lat, lon) {
    return (await fetchAemetAvisos(areaCode)).filter(a => avisoAfecta(a, Number(lat), Number(lon)));
}

const windDirectionText = (degrees) => {
    if (degrees === undefined || degrees === null) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round(degrees / 45) % 8];
};

// --- MOTOR DE ALERTAS ---
// Alertas propias por umbrales, complementarias a los avisos oficiales.
// El viento va por RACHAS (antes se usaba el viento medio y casi nunca
// saltaba) y la lluvia intensa por lo PREVISTO en las próximas 3 h (antes,
// por lo que ya había caído).
const generateAlerts = (w, startIndex = 0) => {
    const alerts = [];
    const c = w.current;
    const gust = c.wind_gusts_10m ?? c.wind_speed_10m;
    const temp = c.temperature_2m;
    const code = c.weather_code;
    const next3h = (w.hourly.precipitation || []).slice(startIndex, startIndex + 3).map(v => v || 0);
    const rainPeak = next3h.length ? Math.max(...next3h) : 0;

    if (gust >= 110) alerts.push({ level: 'red', title: 'Viento huracanado', msg: `Rachas de ${Math.round(gust)} km/h. Evita salir.` });
    else if (gust >= 90) alerts.push({ level: 'orange', title: 'Viento muy fuerte', msg: `Rachas de ${Math.round(gust)} km/h. Cuidado con objetos sueltos.` });
    else if (gust >= 70) alerts.push({ level: 'yellow', title: 'Rachas fuertes', msg: `Rachas de ${Math.round(gust)} km/h.` });

    if (temp >= 40) alerts.push({ level: 'red', title: 'Calor extremo', msg: 'Riesgo alto para la salud: agua, sombra y nada de esfuerzos.' });
    else if (temp >= 36) alerts.push({ level: 'orange', title: 'Calor muy intenso', msg: 'Hidrátate y evita el sol en las horas centrales.' });
    else if (temp <= -5) alerts.push({ level: 'orange', title: 'Frío intenso', msg: 'Temperaturas bajo cero peligrosas: abrígate bien.' });

    if (code >= 95) alerts.push({ level: 'orange', title: 'Tormenta eléctrica', msg: 'Actividad eléctrica en la zona. Busca refugio.' });
    if (rainPeak >= 10) alerts.push({ level: 'orange', title: 'Lluvia intensa prevista', msg: `Hasta ${Math.round(rainPeak)} mm en una hora en las próximas 3 h. No cruces zonas inundadas.` });
    if (code === 75 || code === 86) alerts.push({ level: 'orange', title: 'Nevada fuerte', msg: 'Acumulación rápida de nieve.' });

    return alerts;
};

// --- RUTAS ---
app.get('/api/vapid-key', (req, res) => {
    if (!publicVapidKey) return res.status(503).json({ error: 'Notificaciones no disponibles.' });
    res.json({ key: publicVapidKey });
});

app.post('/api/subscribe', subscribeLimiter, async (req, res) => {
    try {
        const { subscription, lat, lon, city, region, timezone, welcome } = req.body || {};
        if (!subscription || typeof subscription.endpoint !== 'string' || !/^https:\/\//.test(subscription.endpoint)
            || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth
            || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
            return res.status(400).json({ error: 'Suscripción no válida.' });
        }
        const fields = {
            keys: subscription.keys,
            lat: Number(lat),
            lon: Number(lon),
            city: String(city || '').slice(0, 120),
            region: String(region || '').slice(0, 120),
            timezone: isValidTimeZone(timezone) ? timezone : null
        };
        // La app se re-suscribe en cada visita para mantener la ciudad al día:
        // no tocamos lastNotification/lastAemetAviso de una suscripción existente,
        // o se saltaría el límite de 1 aviso por hora y se repetirían avisos.
        const existing = await Subscription.findByPk(subscription.endpoint);
        if (existing) await existing.update(fields);
        else await Subscription.create({ endpoint: subscription.endpoint, ...fields, lastNotification: new Date(0) });

        // Notificación de bienvenida al activar: confirma al momento que toda
        // la cadena (claves VAPID, service worker, permiso) funciona. El
        // resultado vuelve al cliente para poder diagnosticar desde el móvil.
        let push = 'skipped';
        if (welcome && publicVapidKey && privateVapidKey) {
            try {
                const r = await webpush.sendNotification(
                    { endpoint: subscription.endpoint, keys: subscription.keys },
                    JSON.stringify({
                        tag: 'aeris-bienvenida', url: '/',
                        title: '✅ Avisos de AERIS activados',
                        body: `Te avisaremos de lluvia, tormentas y calor extremo en ${fields.city || 'tu zona'}.`,
                        icon: '/icon-192.png', badge: '/icon-192.png'
                    }),
                    { TTL: 3600, urgency: 'high' }
                );
                push = `sent:${r.statusCode}`;
            } catch (e) {
                const detail = (e.body && String(e.body).slice(0, 120)) || e.message;
                push = `error:${e.statusCode || 'x'}:${detail}`;
                log('error', 'push bienvenida:', e.statusCode, detail);
            }
        }
        const host = (() => { try { return new URL(subscription.endpoint).host; } catch { return '?'; } })();
        res.status(201).json({ ok: true, push, host });
    } catch (e) {
        log('error', 'subscribe', e.message);
        res.status(500).json({ error: 'No se pudo guardar la suscripción.' });
    }
});

app.get('/api/search/:query', async (req, res) => {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(req.params.query)}&count=8&language=es&format=json`;
        const response = await http.get(url);
        if (!response.data.results) return res.json([]);
        const cities = response.data.results.map(city => {
            const parts = [];
            if (city.admin1 && city.admin1 !== city.name) parts.push(city.admin1);
            if (city.country) parts.push(city.country);
            return {
                id: `${city.latitude},${city.longitude}`,
                name: city.name,
                region: parts.filter(p => p && p !== 'undefined').join(', '),
                lat: city.latitude,
                lon: city.longitude
            };
        });
        res.json(cities);
    } catch (e) {
        log('error', 'search', e.message);
        res.json([]);
    }
});

// --- WEATHER API ---
// Coordenadas redondeadas a ~1 km: la caché sirve a todos los que están cerca
// (antes la clave era la coordenada exacta del GPS y casi nunca acertaba).
const roundCoord = (v) => (Math.round(Number(v) * 100) / 100).toFixed(2);
const WEATHER_CACHE_MS = 10 * 60 * 1000;

// Purga de la caché: lo que tiene más de un día ya no sirve ni de respaldo
setInterval(() => {
    WeatherCache.destroy({ where: { updatedAt: { [Op.lt]: new Date(Date.now() - 24 * 3600 * 1000) } } })
        .catch(e => log('error', 'purga caché:', e.message));
}, 6 * 3600 * 1000).unref();

// Nombre del sitio a partir de coordenadas. Nominatim pide como mucho 1
// petición por segundo y no abusar: se recuerda por celda de ~1 km.
const reverseCache = new Map();
async function reverseGeocode(lat, lon) {
    const k = `${roundCoord(lat)},${roundCoord(lon)}`;
    if (reverseCache.has(k)) return reverseCache.get(k);
    try {
        const { data } = await http.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14&accept-language=es`, {
            headers: { 'User-Agent': 'AerisWeatherApp/1.0 (contact: aerisweatherapp@gmail.com)' }
        });
        const a = data.address || {};
        const place = a.suburb || a.neighbourhood || a.city || a.town || a.village || a.municipality;
        const r = { name: place ? `Tu ubicacion (${place})` : 'Tu ubicacion', region: [a.state, a.country].filter(Boolean).join(', ') };
        if (reverseCache.size > 5000) reverseCache.clear();
        reverseCache.set(k, r);
        return r;
    } catch (e) {
        return { name: 'Tu ubicacion', region: '' };
    }
}

const POLLEN_TYPES = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed']; // las que da Open-Meteo (CAMS Europa)

// Máximo por día de unas series horarias ("YYYY-MM-DDTHH:mm")
function dailyMax(times, series) {
    const out = {};
    (times || []).forEach((t, i) => {
        const d = t.slice(0, 10);
        for (const [k, arr] of Object.entries(series)) {
            const v = arr && arr[i];
            if (v == null) continue;
            out[d] = out[d] || {};
            out[d][k] = Math.max(out[d][k] ?? -Infinity, v);
        }
    });
    return Object.entries(out).map(([fecha, v]) => ({ fecha, ...v }));
}

app.get('/api/weather/:id', weatherLimiter, async (req, res) => {
    let locationId = req.params.id;
    let forcedName = req.query.name;
    let forcedRegion = req.query.region || "";

    try {
        let lat, lon;

        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',').map(Number);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Ciudad no encontrada");
            const badNames = ['undefined', 'null', 'Ubicacion', 'Tu ubicacion', 'Ubicacion detectada', 'Ubicacion Detectada', '', 'My Location'];
            if (!forcedName || badNames.includes(forcedName)) {
                const r = await reverseGeocode(lat, lon);
                forcedName = r.name;
                if (!forcedRegion) forcedRegion = r.region;
            }
        } else {
            const geoRes = await http.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationId)}&count=1&language=es&format=json`);
            if (!geoRes.data.results) throw new Error("Ciudad no encontrada");
            const g = geoRes.data.results[0];
            lat = g.latitude;
            lon = g.longitude;
            if (!forcedName) forcedName = g.name;
            if (!forcedRegion) forcedRegion = [g.admin1, g.country].filter(Boolean).join(', ');
        }
        const cacheKey = `${roundCoord(lat)},${roundCoord(lon)}`;

        // La caché es una optimización: si la BD falla, se sigue sirviendo el tiempo
        const cache = await WeatherCache.findByPk(cacheKey).catch(e => { log('error', 'caché (lectura):', e.message); return null; });
        if (cache && (new Date() - new Date(cache.updatedAt) < WEATHER_CACHE_MS)) {
            const data = JSON.parse(cache.data);
            if (forcedName && forcedName !== "Tu ubicacion") data.location.name = forcedName;
            return res.json(data);
        }

        const aemetAreaCode = getAemetAreaCode(forcedRegion);
        const pollenVars = POLLEN_TYPES.map(t => `${t}_pollen`).join(',');

        const [wRes, aRes, avisosRes] = await Promise.allSettled([
            http.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
                + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl,dew_point_2m,uv_index,visibility`
                + `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day,wind_gusts_10m,uv_index,pressure_msl`
                + `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max`
                + `&minutely_15=precipitation&timezone=auto&past_days=1`),
            // Aire y polen en UNA llamada (antes eran dos y la del polen fallaba
            // siempre: pedía especies que Open-Meteo no tiene)
            http.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=4`
                + `&current=european_aqi,us_aqi,pm10,pm2_5,dust,${pollenVars}`
                + `&hourly=european_aqi,dust,pm10,${pollenVars}`),
            avisosParaPunto(aemetAreaCode, lat, lon)
        ]);

        if (wRes.status === 'rejected') {
            const errorReal = wRes.reason;
            const detalles = errorReal.response ? errorReal.response.data : errorReal.message;
            log('error', 'Open-Meteo:', JSON.stringify(detalles));
            // Mejor datos de hace un rato que un error: si hay caché, aunque
            // haya caducado, se sirve.
            if (cache) {
                const data = JSON.parse(cache.data);
                if (forcedName && forcedName !== "Tu ubicacion") data.location.name = forcedName;
                return res.json(data);
            }
            const reason = errorReal.response && errorReal.response.data && errorReal.response.data.reason;
            throw new Error(`Fallo API Clima: ${errorReal.message}${reason ? ' · ' + reason : ''}`);
        }
        if (aRes.status === 'rejected') log('error', 'Open-Meteo aire:', aRes.reason.message);

        const w = wRes.value.data;
        const a = (aRes.status === 'fulfilled') ? aRes.value.data : { current: {}, hourly: {} };
        const avisosOficiales = (avisosRes.status === 'fulfilled') ? avisosRes.value.map(avisoPublico) : [];

        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);
        const currentTime = w.current.time;
        const currentHourStr = currentTime.substring(0, 13);
        const todayStr = currentTime.split('T')[0];

        let startIndex = w.hourly.time.findIndex(t => t.startsWith(currentHourStr));
        if (startIndex === -1) startIndex = 0;

        let comparisonText = "";
        try {
            if (startIndex >= 24) {
                const diff = w.hourly.temperature_2m[startIndex] - w.hourly.temperature_2m[startIndex - 24];
                if (Math.abs(diff) < 1) comparisonText = "Misma temperatura que ayer";
                else if (diff > 0) comparisonText = `${Math.round(diff)}° más calor que ayer`;
                else comparisonText = `${Math.abs(Math.round(diff))}° más frío que ayer`;
            }
        } catch (err) { comparisonText = ""; }

        // Tendencia de presión: ahora frente a hace 3 h (antes se comparaba con
        // la última consulta, que podía ser de otra ciudad)
        const pr = w.hourly.pressure_msl || [];
        const pressureTrend = (startIndex >= 3 && pr[startIndex] != null && pr[startIndex - 3] != null)
            ? Math.round((pr[startIndex] - pr[startIndex - 3]) * 10) / 10 : null;

        const hourly = w.hourly.time
            .slice(startIndex, startIndex + 24)
            .map((t, i) => {
                const realIndex = startIndex + i;
                return {
                    fullDate: t,
                    hour: parseInt(t.split('T')[1].split(':')[0]),
                    displayTime: t.split('T')[1],
                    temp: Math.round(w.hourly.temperature_2m[realIndex]),
                    rainProb: w.hourly.precipitation_probability[realIndex],
                    precip: w.hourly.precipitation[realIndex],
                    gust: Math.round(w.hourly.wind_gusts_10m?.[realIndex] ?? 0),
                    uv: Math.round((w.hourly.uv_index?.[realIndex] ?? 0) * 10) / 10,
                    icon: decodeWMO(w.hourly.weather_code[realIndex], w.hourly.is_day[realIndex]).icon
                };
            });

        // Nowcast: tramos de 15 min desde ahora. Bastan 4 h (16 tramos): el
        // cliente usa las 2 próximas y el resto cubre la caché.
        let nowcast = { time: [], precipitation: [] };
        if (w.minutely_15) {
            const indices = w.minutely_15.time.map((t, i) => ({ t, i })).filter(item => item.t >= currentTime).map(item => item.i).slice(0, 16);
            nowcast.time = indices.map(i => w.minutely_15.time[i]);
            nowcast.precipitation = indices.map(i => w.minutely_15.precipitation[i] || 0);
        }

        const ac = a.current || {}, ah = a.hourly || {};
        const pollenData = Object.fromEntries(POLLEN_TYPES.map(t => [t, Math.round(ac[`${t}_pollen`] || 0)]));
        // Previsión por día (máximos): polen, AQI europeo y polvo (calima)
        const airDaily = dailyMax(ah.time, {
            eaqi: ah.european_aqi, dust: ah.dust, pm10: ah.pm10,
            ...Object.fromEntries(POLLEN_TYPES.map(t => [t, ah[`${t}_pollen`]]))
        }).filter(d => d.fecha >= todayStr);

        const alerts = generateAlerts(w, startIndex);

        const dIdx = w.daily.time.indexOf(todayStr);
        const yesterday = dIdx > 0 ? {
            tempMax: Math.round(w.daily.temperature_2m_max[dIdx - 1]),
            tempMin: Math.round(w.daily.temperature_2m_min[dIdx - 1])
        } : null;

        const finalData = {
            location: { name: forcedName || "Tu ubicacion", region: forcedRegion, lat, lon, timezone: w.timezone },
            updatedAt: new Date().toISOString(),
            current: {
                temp: Math.round(w.current.temperature_2m),
                feelsLike: Math.round(w.current.apparent_temperature),
                humidity: w.current.relative_humidity_2m,
                dewPoint: Math.round(w.current.dew_point_2m ?? 0),
                windSpeed: Math.round(w.current.wind_speed_10m),
                windGust: Math.round(w.current.wind_gusts_10m ?? w.current.wind_speed_10m),
                windDir: windDirectionText(w.current.wind_direction_10m),
                pressure: Math.round(w.current.pressure_msl),      // a nivel del mar (la de superficie daba 949 hPa en Madrid)
                pressureTrend,
                visibility: w.current.visibility ?? null,
                desc: currentWMO.text,
                icon: currentWMO.icon,
                isDay: w.current.is_day === 1,
                uv: Math.round((w.current.uv_index ?? 0) * 10) / 10, // el de ahora (antes era el máximo de AYER)
                uvMax: dIdx >= 0 ? (w.daily.uv_index_max[dIdx] || 0) : 0,
                aqi: ac.us_aqi || 0,
                eaqi: ac.european_aqi ?? null,
                pm25: ac.pm2_5 || 0,
                pm10: ac.pm10 || 0,
                dust: ac.dust ?? null,
                time: w.current.time,
                cloudCover: w.current.cloud_cover || 0,
                comparison: comparisonText
            },
            yesterday,
            nowcast,
            hourly,
            pollen: pollenData,
            airDaily,
            alerts,
            avisosOficiales,
            daily: w.daily.time.map((t, i) => ({
                fecha: t,
                tempMax: Math.round(w.daily.temperature_2m_max[i]),
                tempMin: Math.round(w.daily.temperature_2m_min[i]),
                sunrise: w.daily.sunrise[i].split('T')[1],
                sunset: w.daily.sunset[i].split('T')[1],
                icon: decodeWMO(w.daily.weather_code[i], 1).icon,
                rainProbMax: w.daily.precipitation_probability_max[i],
                precipSum: Math.round((w.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
                gustMax: Math.round(w.daily.wind_gusts_10m_max?.[i] ?? 0),
                uvMax: w.daily.uv_index_max[i] || 0,
                dayHours: w.hourly.time.reduce((acc, timeStr, idx) => {
                    if (timeStr.startsWith(t)) {
                        acc.push({
                            time: timeStr.split('T')[1],
                            temp: Math.round(w.hourly.temperature_2m[idx]),
                            rainProb: w.hourly.precipitation_probability[idx],
                            precip: w.hourly.precipitation[idx],
                            icon: decodeWMO(w.hourly.weather_code[idx], w.hourly.is_day[idx]).icon
                        });
                    }
                    return acc;
                }, [])
            })).filter(d => d.fecha >= todayStr)
        };

        await WeatherCache.upsert({ locationId: cacheKey, data: JSON.stringify(finalData), updatedAt: new Date() })
            .catch(e => log('error', 'caché (escritura):', e.message));
        res.json(finalData);

    } catch (e) {
        log('error', 'weather API', e.stack || e.message);
        if (e.message === "Ciudad no encontrada") return res.status(404).json({ error: "Ciudad no encontrada." });
        // El motivo (sin datos sensibles) ayuda a diagnosticar sin acceso a los logs
        res.status(500).json({ error: "Error interno al obtener el tiempo.", code: String(e.message || '').slice(0, 160) });
    }
});

// Lluvia/nieve en la próxima hora a partir de minutely_15 de Open-Meteo.
// minutely_15 empieza a las 00:00 del día, así que hay que localizar el tramo
// actual. Cada valor es la precipitación de los 15 min ANTERIORES a su hora:
// el tramo con hora t cubre (t-15, t]. Devuelve { title, body } o null.
function imminentRainNotification(nowcast, current, city) {
    if (!nowcast || !nowcast.time || !current || !current.time) return null;
    let start = nowcast.time.findIndex(t => t > current.time);
    if (start === -1) return null;
    const slots = nowcast.precipitation.slice(start, start + 4).map(v => v || 0);
    const rainSum = slots.reduce((a, b) => a + b, 0);
    const firstWet = slots.findIndex(v => v >= 0.05);
    if (rainSum <= 0.2 || firstWet === -1) return null;

    const isSnow = current.temperature_2m <= 2;
    const type = isSnow ? "Nieve" : "Lluvia";
    const icon = isSnow ? "❄️" : "☔";
    const mmh = Math.max(...slots) * 4;
    const intensidad = mmh >= 10 ? 'fuerte' : mmh >= 2 ? 'moderada' : 'débil';
    const startMs = Date.parse(nowcast.time[start + firstWet] + ':00Z') - 15 * 60000;
    const minutos = Math.max(0, Math.round((startMs - Date.parse(current.time + ':00Z')) / 60000 / 5) * 5);
    const yaEsta = firstWet === 0 || minutos === 0;
    const timeMsg = yaEsta ? "ahora mismo" : `en unos ${minutos} min`;
    return {
        title: `${icon} ${type} ${yaEsta ? 'ya' : timeMsg} en ${city}`,
        body: `${type} ${intensidad} ${timeMsg}. ${isSnow ? 'Abrígate y cuidado con el suelo.' : 'Ten el paraguas a mano.'}`
    };
}

// --- CRON: utilidades compartidas ---
// Zona ≈ celda de 0,1° (unos 11 × 8 km en España): todos los suscriptores de
// una zona comparten UNA llamada a Open-Meteo en vez de una por persona.
const zoneKey = (lat, lon) => `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
function groupByZone(users) {
    const zones = new Map();
    for (const u of users) {
        if (!Number.isFinite(u.lat) || !Number.isFinite(u.lon)) continue;
        const k = zoneKey(u.lat, u.lon);
        if (!zones.has(k)) zones.set(k, []);
        zones.get(k).push(u);
    }
    return [...zones.values()];
}

// De madrugada (00:00–07:00 en la hora local del suscriptor) basta con
// comprobar una vez por hora en vez de cada 15 min. Con la zona horaria real:
// la hora solar no sirve (en España el reloj va ~2 h por delante del sol y se
// perderían los avisos de las 7–9 de la mañana). Sin zona guardada (suscripciones
// antiguas) usamos la hora solar con una ventana más estrecha, 01–06.
function isValidTimeZone(tz) {
    if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; }
}
function isQuietHour(user, date = new Date()) {
    if (user.timezone && isValidTimeZone(user.timezone)) {
        const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: user.timezone, hour: '2-digit', hour12: false }).format(date)) % 24;
        return h < 7;
    }
    const solar = ((date.getUTCHours() + date.getUTCMinutes() / 60 + user.lon / 15) % 24 + 24) % 24;
    return solar >= 1 && solar < 6;
}

// Concurrencia limitada: rápido, pero sin saturar APIs ni pasarse del
// tiempo máximo de espera del servicio de cron.
async function forEachLimit(items, limit, fn) {
    let next = 0;
    const worker = async () => { while (next < items.length) await fn(items[next++]); };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// "Hoy 14:00–23:59" / "Mañana 10:00–19:59" en la zona horaria del usuario
function avisoRango(onset, expires, tz) {
    if (!onset) return '';
    const zone = isValidTimeZone(tz) ? tz : 'Europe/Madrid';
    const day = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const hm = (d) => new Intl.DateTimeFormat('es-ES', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const a = new Date(onset), b = expires ? new Date(expires) : null;
    const today = day(new Date()), tomorrow = day(new Date(Date.now() + 86400000));
    const label = day(a) === today ? 'Hoy' : day(a) === tomorrow ? 'Mañana' : new Intl.DateTimeFormat('es-ES', { timeZone: zone, weekday: 'long' }).format(a);
    return `${label} ${hm(a)}${b ? '–' + hm(b) : ''}`;
}

// Enlace que abre la app en la ciudad del suscriptor (y en una sección)
const cityUrl = (user, section) => {
    const q = new URLSearchParams({ lat: user.lat, lon: user.lon });
    if (user.city) q.set('name', user.city);
    if (section) q.set('ver', section);
    return `/?${q.toString()}`;
};

// Envía un push; si el navegador ya no tiene esa suscripción (404/410) la borramos.
// payload.type decide la etiqueta: un aviso de lluvia ya no sustituye al
// resumen de la mañana ni a un aviso oficial sin leer.
async function sendPush(user, payload) {
    try {
        const { type = 'aviso', section, ...rest } = payload;
        await webpush.sendNotification(
            { endpoint: user.endpoint, keys: user.keys },
            JSON.stringify({ icon: '/icon-192.png', badge: '/icon-192.png', tag: `aeris-${type}`, type, url: cityUrl(user, section), ...rest }),
            { TTL: 3600, urgency: 'high' } // un aviso de lluvia de hace horas ya no sirve
        );
        return true;
    } catch (err) {
        // 404/410: el navegador ya no tiene la suscripción. 403 (VAPID distinto):
        // se creó con otras claves y nunca funcionará; la app la rehará al abrirse.
        const vapidMismatch = err.statusCode === 403 && /vapid|credentials|BadJwtToken/i.test(String(err.body || ''));
        if (err.statusCode === 410 || err.statusCode === 404 || vapidMismatch) await user.destroy().catch(() => {});
        else log('error', `push ${user.city}:`, err.statusCode || err.message);
        return false;
    }
}

// Qué avisar con los datos de una zona (lluvia inminente > calor > viento > tormenta)
function weatherNotification(data, city) {
    const current = data.current;
    if (!current) return null;
    const rain = imminentRainNotification(data.minutely_15, current, city);
    return (rain && { ...rain, type: 'lluvia', section: 'lluvia' })
        || (current.temperature_2m >= 36 && {
            type: 'calor',
            title: `🌡️ Calor extremo en ${city}`,
            body: `Temperatura: ${Math.round(current.temperature_2m)}°C. Hidrátate y busca la sombra.`
        })
        || ((current.wind_gusts_10m ?? current.wind_speed_10m) >= 70 && {
            type: 'viento',
            title: `💨 Viento fuerte en ${city}`,
            body: `Rachas de ${Math.round(current.wind_gusts_10m ?? current.wind_speed_10m)} km/h. Precaución en exteriores.`
        })
        || (current.weather_code >= 95 && {
            type: 'tormenta',
            title: `⚡ Tormenta en ${city}`,
            body: 'Actividad eléctrica detectada. Busca refugio.'
        })
        || null;
}

const cronAuthorized = (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['x-cron-secret'] !== secret) { res.status(401).json({ error: 'No autorizado' }); return false; }
    if (!publicVapidKey || !privateVapidKey) { res.status(503).json({ error: 'VAPID no configurado, notificaciones desactivadas.' }); return false; }
    return true;
};

// --- CRON: avisos (llámalo cada 15 min) ---
app.get('/api/cron/check-rain', async (req, res) => {
    if (!cronAuthorized(req, res)) return;
    try {
        const zones = groupByZone(await Subscription.findAll());
        const hourlyPass = new Date().getUTCMinutes() < 15; // la pasada "en punto"
        const stats = { zonas: zones.length, llamadasOpenMeteo: 0, zonasEnPausaNocturna: 0, notificaciones: 0 };

        await forEachLimit(zones, 6, async (zoneUsers) => {
            const pending = [];
            // 0. Aviso OFICIAL de AEMET (naranja/rojo), por usuario y sin cooldown
            //    general: se controla por aviso concreto para no repetirlo.
            //    fetchAemetAvisos ya cachea 15 min por área, no gasta llamadas.
            for (const user of zoneUsers) {
                try {
                    const areaCode = user.region ? getAemetAreaCode(user.region) : null;
                    if (areaCode) {
                        // Solo los de SU zona (antes, los de toda la comunidad)
                        const topAviso = (await avisosParaPunto(areaCode, user.lat, user.lon)).find(a => a.nivel === 'rojo' || a.nivel === 'naranja');
                        // Se notifica cuando cambia el aviso (nivel, fenómeno o inicio), nunca repetido
                        const avisoKey = topAviso ? `${topAviso.nivel}|${topAviso.fenomeno}|${topAviso.onset || ''}`.slice(0, 250) : null;
                        if (topAviso && avisoKey !== user.lastAemetAviso) {
                            const emoji = topAviso.nivel === 'rojo' ? '🔴' : '🟠';
                            if (await sendPush(user, {
                                type: 'aemet',
                                section: 'avisos',
                                requireInteraction: topAviso.nivel === 'rojo',
                                title: `${emoji} Aviso ${topAviso.nivel} por ${topAviso.fenomeno.toLowerCase()} · ${user.city}`,
                                body: [avisoRango(topAviso.onset, topAviso.expires, user.timezone), topAviso.titular].filter(Boolean).join(' · ')
                            })) {
                                user.lastAemetAviso = avisoKey;
                                user.lastNotification = new Date();
                                await user.save();
                                stats.notificaciones++;
                            }
                            continue; // ya avisado en esta pasada
                        } else if (!topAviso && user.lastAemetAviso) {
                            user.lastAemetAviso = null; // el aviso terminó: se podrá avisar de uno nuevo
                            await user.save();
                        }
                    }
                } catch (err) { log('error', `cron AEMET ${user.city}:`, err.message); }
                // Máximo 1 aviso propio por hora y usuario
                if (Date.now() - new Date(user.lastNotification) >= 60 * 60 * 1000) pending.push(user);
            }
            if (!pending.length) return;

            const { lat, lon } = pending[0];
            if (!hourlyPass && isQuietHour(pending[0])) { stats.zonasEnPausaNocturna++; return; }

            try {
                stats.llamadasOpenMeteo++;
                const { data } = await http.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&minutely_15=precipitation&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m&forecast_days=2&timezone=auto`);
                for (const user of pending) {
                    const notif = weatherNotification(data, user.city);
                    if (notif && await sendPush(user, notif)) {
                        user.lastNotification = new Date();
                        await user.save();
                        stats.notificaciones++;
                    }
                }
            } catch (err) { log('error', `cron zona ${lat},${lon}:`, err.message); }
        });

        log('info', 'Cron avisos:', JSON.stringify(stats));
        res.json({ success: true, ...stats });
    } catch (error) {
        log('error', 'Cron Job:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CRON: RESUMEN MATUTINO (llámalo cada mañana a las 8h) ---
app.get('/api/cron/morning-summary', async (req, res) => {
    if (!cronAuthorized(req, res)) return;
    try {
        const zones = groupByZone(await Subscription.findAll());
        const stats = { zonas: zones.length, llamadasOpenMeteo: 0, notificaciones: 0 };
        const emojis = { 'Despejado': '☀️', 'Parcialmente': '⛅', 'Nublado': '☁️', 'Lluvia': '🌧️', 'Nieve': '❄️', 'Tormenta': '⛈️', 'Niebla': '🌫️' };

        await forEachLimit(zones, 6, async (zoneUsers) => {
            const { lat, lon } = zoneUsers[0];
            try {
                stats.llamadasOpenMeteo++;
                const { data } = await http.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=auto&forecast_days=1`);
                const d = data.daily;
                if (!d) return;
                const wmo = decodeWMO(d.weather_code[0], 1);
                const max = Math.round(d.temperature_2m_max[0]);
                const min = Math.round(d.temperature_2m_min[0]);
                const rain = d.precipitation_probability_max[0] || 0;
                const uv = d.uv_index_max[0] || 0;
                let emoji = '🌤️';
                for (const [k, v] of Object.entries(emojis)) { if (wmo.text.includes(k)) { emoji = v; break; } }
                const isNiceDay = rain < 20 && max >= 18 && max <= 28 && d.weather_code[0] <= 3;
                const body = `${wmo.text} · ${min}°–${max}° · Lluvia: ${rain}% · UV: ${uv}${isNiceDay ? ' ¡Buen día para salir! 🏃' : ''}`;
                for (const user of zoneUsers) {
                    if (await sendPush(user, { type: 'manana', title: `${emoji} Buenos días en ${user.city}`, body })) stats.notificaciones++;
                }
            } catch (err) { log('error', `morning zona ${lat},${lon}:`, err.message); }
        });

        log('info', 'Cron resumen:', JSON.stringify(stats));
        res.json({ success: true, ...stats });
    } catch (error) {
        log('error', 'Morning cron:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => log('info', `Aeris LIVE en puerto ${PORT}`));

// --- GRACEFUL SHUTDOWN ---
const shutdown = () => {
    log('info', 'Cerrando servidor...');
    server.close(() => {
        sequelize.close().then(() => {
            log('info', 'Servidor cerrado correctamente.');
            process.exit(0);
        });
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
