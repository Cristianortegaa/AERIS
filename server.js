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
// Conversión de Open-Meteo a los datos de la app (la comparte el navegador)
const WeatherCore = require('./public/weather-core.js');
const { decodeWMO } = WeatherCore;

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
            "connect-src": ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com",
                "https://api.open-meteo.com", "https://air-quality-api.open-meteo.com", "https://geocoding-api.open-meteo.com",
                "https://ensemble-api.open-meteo.com", "https://archive-api.open-meteo.com", "https://marine-api.open-meteo.com",
                "https://api.rainviewer.com"],
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
    timezone: { type: DataTypes.STRING },       // zona horaria IANA (p. ej. Europe/Madrid) para la pausa nocturna
    prefs: { type: DataTypes.TEXT },            // JSON: tipos de aviso, nivel AEMET, parte de la mañana, sitios extra
    state: { type: DataTypes.TEXT }             // JSON: último aviso por sitio, día del último parte
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
    for (const col of ['prefs', 'state']) {
        if (!cols[col]) await qi.addColumn('Subscriptions', col, { type: DataTypes.TEXT });
    }
}).catch(e => log('error', 'Base de datos:', e.message));

// --- UTILS ---
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

// --- RUTAS ---
// Estado del servicio: qué está configurado (sí/no, nunca los valores). Sirve
// también para "despertar" el servidor antes del cron de la mañana.
app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        ok: true,
        uptimeMin: Math.round(process.uptime() / 60),
        db: sequelize.getDialect(),             // postgres = las suscripciones sobreviven a los despliegues
        aemetKey: !!process.env.AEMET_API_KEY,  // sin ella no hay avisos oficiales ni estaciones
        vapid: !!(publicVapidKey && privateVapidKey),
        cronSecret: !!process.env.CRON_SECRET,
        openMeteoPausado: Date.now() < openMeteoBlockedUntil
    });
});
app.get('/api/vapid-key', (req, res) => {
    if (!publicVapidKey) return res.status(503).json({ error: 'Notificaciones no disponibles.' });
    res.json({ key: publicVapidKey });
});

// Solo lo que entendemos, con límites (viene del navegador)
function cleanPrefs(p) {
    const types = {};
    for (const k of ['lluvia', 'tormenta', 'calor', 'viento']) types[k] = !(p.types && p.types[k] === false);
    const hour = Math.round(Number(p.morningHour));
    return {
        types,
        aemetMin: p.aemetMin === 'amarillo' ? 'amarillo' : p.aemetMin === 'rojo' ? 'rojo' : 'naranja',
        morning: p.morning !== false,
        morningHour: Number.isFinite(hour) && hour >= 5 && hour <= 12 ? hour : 8,
        calima: p.calima !== false,
        polen: !!p.polen,
        extras: (Array.isArray(p.extras) ? p.extras : []).slice(0, 2)
            .filter(e => e && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon)))
            .map(e => ({ lat: Number(e.lat), lon: Number(e.lon), city: String(e.city || '').slice(0, 120), region: String(e.region || '').slice(0, 120) }))
    };
}

app.post('/api/subscribe', subscribeLimiter, async (req, res) => {
    try {
        const { subscription, lat, lon, city, region, timezone, welcome, prefs } = req.body || {};
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
        if (prefs && typeof prefs === 'object') fields.prefs = JSON.stringify(cleanPrefs(prefs));
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

// --- SEO: UNA PÁGINA POR CIUDAD (/tiempo/valencia) ---
// La app es la misma; el servidor solo pone el título, la descripción, los
// datos estructurados y la ciudad, para que Google pueda indexar "el tiempo en
// <ciudad>" y el enlace abra directamente esa ciudad.
const SITE = process.env.PUBLIC_URL || 'https://aeris-ghg8.onrender.com';
const slugify = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
// Ciudades principales con coordenadas (sin gastar geocodificación) y su
// comunidad (para los avisos de AEMET)
const CIUDADES = [
    ['Madrid', 40.42, -3.70, 'Comunidad de Madrid'], ['Barcelona', 41.39, 2.17, 'Cataluña'], ['Valencia', 39.47, -0.38, 'Comunidad Valenciana'],
    ['Sevilla', 37.39, -5.98, 'Andalucía'], ['Zaragoza', 41.65, -0.89, 'Aragón'], ['Málaga', 36.72, -4.42, 'Andalucía'],
    ['Murcia', 37.99, -1.13, 'Región de Murcia'], ['Palma', 39.57, 2.65, 'Islas Baleares'], ['Las Palmas de Gran Canaria', 28.12, -15.44, 'Canarias'],
    ['Bilbao', 43.26, -2.93, 'País Vasco'], ['Alicante', 38.35, -0.48, 'Comunidad Valenciana'], ['Córdoba', 37.89, -4.78, 'Andalucía'],
    ['Valladolid', 41.65, -4.72, 'Castilla y León'], ['Vigo', 42.24, -8.72, 'Galicia'], ['Gijón', 43.54, -5.66, 'Asturias'],
    ['Vitoria-Gasteiz', 42.85, -2.67, 'País Vasco'], ['A Coruña', 43.36, -8.41, 'Galicia'], ['Granada', 37.18, -3.60, 'Andalucía'],
    ['Elche', 38.27, -0.70, 'Comunidad Valenciana'], ['Oviedo', 43.36, -5.85, 'Asturias'], ['Santa Cruz de Tenerife', 28.47, -16.25, 'Canarias'],
    ['Pamplona', 42.81, -1.64, 'Navarra'], ['Almería', 36.84, -2.46, 'Andalucía'], ['San Sebastián', 43.32, -1.98, 'País Vasco'],
    ['Santander', 43.46, -3.80, 'Cantabria'], ['Burgos', 42.34, -3.70, 'Castilla y León'], ['Castellón de la Plana', 39.99, -0.05, 'Comunidad Valenciana'],
    ['Albacete', 38.99, -1.86, 'Castilla-La Mancha'], ['Logroño', 42.47, -2.45, 'La Rioja'], ['Badajoz', 38.88, -6.97, 'Extremadura'],
    ['Salamanca', 40.97, -5.66, 'Castilla y León'], ['Huelva', 37.26, -6.95, 'Andalucía'], ['Lleida', 41.62, 0.62, 'Cataluña'],
    ['Tarragona', 41.12, 1.25, 'Cataluña'], ['León', 42.60, -5.57, 'Castilla y León'], ['Cádiz', 36.53, -6.29, 'Andalucía'],
    ['Jaén', 37.77, -3.79, 'Andalucía'], ['Ourense', 42.34, -7.86, 'Galicia'], ['Girona', 41.98, 2.82, 'Cataluña'],
    ['Lugo', 43.01, -7.56, 'Galicia'], ['Cáceres', 39.47, -6.37, 'Extremadura'], ['Santiago de Compostela', 42.88, -8.54, 'Galicia'],
    ['Guadalajara', 40.63, -3.17, 'Castilla-La Mancha'], ['Toledo', 39.86, -4.03, 'Castilla-La Mancha'], ['Pontevedra', 42.43, -8.65, 'Galicia'],
    ['Palencia', 42.01, -4.53, 'Castilla y León'], ['Ciudad Real', 38.98, -3.93, 'Castilla-La Mancha'], ['Zamora', 41.50, -5.75, 'Castilla y León'],
    ['Ávila', 40.66, -4.70, 'Castilla y León'], ['Cuenca', 40.07, -2.13, 'Castilla-La Mancha'], ['Huesca', 42.14, -0.41, 'Aragón'],
    ['Segovia', 40.95, -4.12, 'Castilla y León'], ['Soria', 41.76, -2.47, 'Castilla y León'], ['Teruel', 40.34, -1.11, 'Aragón'],
    ['Ceuta', 35.89, -5.32, 'Ceuta'], ['Melilla', 35.29, -2.94, 'Melilla'], ['Marbella', 36.51, -4.89, 'Andalucía'],
    ['Benidorm', 38.54, -0.13, 'Comunidad Valenciana'], ['Ibiza', 38.91, 1.43, 'Islas Baleares'], ['Jerez de la Frontera', 36.69, -6.14, 'Andalucía'],
    ['Cartagena', 37.61, -0.99, 'Región de Murcia'], ['Alcalá de Henares', 40.48, -3.36, 'Comunidad de Madrid'], ['Torrevieja', 37.98, -0.68, 'Comunidad Valenciana'],
    ['Mérida', 38.92, -6.34, 'Extremadura'], ['Santiago', 42.88, -8.54, 'Galicia']
].map(([name, lat, lon, region]) => ({ name, lat, lon, region: `${region}, España`, slug: slugify(name) }));
const ciudadPorSlug = new Map(CIUDADES.map(c => [c.slug, c]));
const slugCache = new Map(); // geocodificación de otros sitios (por slug)

async function resolveSlug(slug) {
    if (ciudadPorSlug.has(slug)) return ciudadPorSlug.get(slug);
    if (slugCache.has(slug)) return slugCache.get(slug);
    let found = null;
    try {
        const q = slug.replace(/-/g, ' ');
        const { data } = await http.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=es&format=json&countryCode=ES`);
        const g = data.results && data.results[0];
        if (g) found = { name: g.name, lat: g.latitude, lon: g.longitude, region: [g.admin1, g.country].filter(Boolean).join(', '), slug };
    } catch (e) { /* sin cupo o sin red: la app lo resolverá con el nombre */ }
    if (found) { if (slugCache.size > 2000) slugCache.clear(); slugCache.set(slug, found); }
    return found;
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let indexTemplate = null;
const getIndexTemplate = () => indexTemplate || (indexTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8'));

app.get('/tiempo/:slug', async (req, res) => {
    const slug = slugify(req.params.slug);
    if (!slug) return res.redirect(302, '/');
    if (slug !== req.params.slug) return res.redirect(301, `/tiempo/${slug}`);
    const city = await resolveSlug(slug);
    const name = city ? city.name : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const url = `${SITE}/tiempo/${slug}`;
    const title = `El tiempo en ${name} hoy y próximos días · AERIS`;
    const desc = `Previsión del tiempo en ${name}: lluvia en las próximas 2 horas, hora a hora, 15 días con su fiabilidad, avisos oficiales de AEMET, calidad del aire, calima y polen.`;
    const ld = {
        '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url, inLanguage: 'es',
        about: city ? { '@type': 'Place', name, geo: { '@type': 'GeoCoordinates', latitude: city.lat, longitude: city.lon } } : { '@type': 'Place', name }
    };
    let html = getIndexTemplate()
        .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
        .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escHtml(desc)}">\n    <link rel="canonical" href="${escHtml(url)}">`)
        .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escHtml(title)}">`)
        .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escHtml(desc)}">`)
        .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escHtml(url)}">`)
        .replace('</head>', `    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n`
            + `    <script>window.__CITY__ = ${JSON.stringify(city ? { name: city.name, lat: city.lat, lon: city.lon, region: city.region } : { name, query: slug.replace(/-/g, ' ') }).replace(/</g, '\\u003c')};</script>\n</head>`);
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(html);
});

// Sitemap con las ciudades principales
app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [`${SITE}/`, ...CIUDADES.filter(c => c.slug !== 'santiago').map(c => `${SITE}/tiempo/${c.slug}`)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
        + urls.map((u, i) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq><priority>${i === 0 ? '1.0' : '0.8'}</priority></url>`).join('\n')
        + `\n</urlset>\n`);
});

// --- OBSERVACIÓN REAL: estación de AEMET más cercana ---
// Se baja el último día de todas las estaciones (≈3 MB) como mucho cada 30
// min y se busca la más cercana. AEMET falla a menudo: si no hay datos, la
// app sigue sin este extra.
let obsCache = { ts: 0, byStation: null, loading: null };
async function loadObservaciones() {
    const apiKey = process.env.AEMET_API_KEY;
    if (!apiKey) return null;
    if (obsCache.byStation && Date.now() - obsCache.ts < 30 * 60 * 1000) return obsCache.byStation;
    if (obsCache.loading) return obsCache.loading;
    obsCache.loading = (async () => {
        try {
            const meta = await http.get('https://opendata.aemet.es/opendata/api/observacion/convencional/todas', { headers: { api_key: apiKey } });
            if (!meta.data || meta.data.estado !== 200 || !meta.data.datos) return obsCache.byStation;
            const { data } = await http.get(meta.data.datos, { timeout: 20000, responseType: 'arraybuffer' });
            const rows = JSON.parse(Buffer.from(data).toString('latin1'));
            const byStation = new Map();
            for (const r of rows) {
                if (!r || !r.idema || r.lat == null || r.lon == null) continue;
                const prev = byStation.get(r.idema);
                if (!prev || String(r.fint) > String(prev.fint)) byStation.set(r.idema, r);
            }
            obsCache = { ts: Date.now(), byStation, loading: null };
            return byStation;
        } catch (e) {
            log('error', 'AEMET observación:', e.message);
            return obsCache.byStation;
        } finally { obsCache.loading = null; }
    })();
    return obsCache.loading;
}
const distKm = (a, b, c, d) => {
    const R = 6371, toR = Math.PI / 180, dLat = (c - a) * toR, dLon = (d - b) * toR;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * toR) * Math.cos(c * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
};
const titleCase = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/(^|[\s/(-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/ (De|Del|La|Las|Los|El|Y) /g, (m) => m.toLowerCase());

app.get('/api/observacion', weatherLimiter, async (req, res) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'Coordenadas no válidas.' });
    const all = await loadObservaciones();
    if (!all) return res.json({ station: null });
    // La más cercana (a menos de 25 km) que tenga un dato de las últimas 3 h
    const age = (r) => Math.round((Date.now() - new Date(r.fint + (/[Z+]/.test(String(r.fint).slice(10)) ? '' : 'Z')).getTime()) / 60000);
    const near = [];
    for (const r of all.values()) {
        if (r.ta == null) continue;
        const dk = distKm(lat, lon, r.lat, r.lon);
        if (dk <= 25) near.push({ r, dist: dk });
    }
    near.sort((a, b) => a.dist - b.dist);
    const best = near.find(n => age(n.r) <= 180);
    if (!best) return res.json({ station: null });
    const r = best.r;
    const ageMin = age(r);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json({
        station: { id: r.idema, name: titleCase(r.ubi), km: Math.round(best.dist * 10) / 10, alt: r.alt ?? null },
        time: r.fint, ageMin,
        temp: r.ta, humidity: r.hr ?? null, wind: r.vv != null ? Math.round(r.vv * 3.6) : null, gust: r.vmax != null ? Math.round(r.vmax * 3.6) : null,
        rain: r.prec ?? null, pressure: r.pres_nmar ?? null
    });
});

// --- WEATHER API ---
// Coordenadas redondeadas a ~1 km: la caché sirve a todos los que están cerca
// (antes la clave era la coordenada exacta del GPS y casi nunca acertaba).
const roundCoord = (v) => (Math.round(Number(v) * 100) / 100).toFixed(2);
const WEATHER_CACHE_MS = 10 * 60 * 1000;
let openMeteoBlockedUntil = 0;

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
        // Tras un 429 de Open-Meteo no se vuelve a intentar en 10 min: el
        // cupo es por IP y la de Render se comparte con otras apps
        const blocked = Date.now() < openMeteoBlockedUntil;
        const [wRes, aRes, avisosRes] = await Promise.allSettled([
            blocked ? Promise.reject(new Error('Open-Meteo en pausa (cupo agotado)')) : http.get(WeatherCore.forecastUrl(lat, lon)),
            blocked ? Promise.reject(new Error('Open-Meteo en pausa (cupo agotado)')) : http.get(WeatherCore.airUrl(lat, lon)),
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
            if (errorReal.response && errorReal.response.status === 429) openMeteoBlockedUntil = Date.now() + 10 * 60 * 1000;
            // Sin caché: el móvil pide la previsión él mismo (con su propio
            // cupo) y aquí le damos lo que solo sabe el servidor: el nombre
            // del sitio y los avisos de AEMET.
            const reason = errorReal.response && errorReal.response.data && errorReal.response.data.reason;
            return res.status(503).json({
                fallback: 'client',
                code: `${errorReal.message}${reason ? ' · ' + reason : ''}`.slice(0, 160),
                location: { name: forcedName || 'Tu ubicacion', region: forcedRegion, lat, lon },
                avisosOficiales: (avisosRes.status === 'fulfilled') ? avisosRes.value.map(avisoPublico) : []
            });
        }
        if (aRes.status === 'rejected') log('error', 'Open-Meteo aire:', aRes.reason.message);

        const w = wRes.value.data;
        const a = (aRes.status === 'fulfilled') ? aRes.value.data : null;
        const avisosOficiales = (avisosRes.status === 'fulfilled') ? avisosRes.value.map(avisoPublico) : [];
        const finalData = WeatherCore.buildPayload({ w, a, lat, lon, name: forcedName, region: forcedRegion, avisosOficiales });

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

// --- PREFERENCIAS DE AVISOS ---
// prefs (lo elige el usuario en la app): tipos de aviso, nivel AEMET mínimo,
// parte de la mañana y su hora, y hasta 2 ubicaciones extra.
// state (lo lleva el servidor): último aviso AEMET por ubicación y día del
// último parte, para no repetir.
const parseJSON = (v, def) => { try { return v ? (typeof v === 'string' ? JSON.parse(v) : v) : def; } catch { return def; } };
const DEFAULT_PREFS = { types: { lluvia: true, tormenta: true, calor: true, viento: true }, aemetMin: 'naranja', morning: true, morningHour: 8, calima: true, polen: false, extras: [] };
const prefsOf = (user) => {
    const p = parseJSON(user.prefs, {});
    return { ...DEFAULT_PREFS, ...p, types: { ...DEFAULT_PREFS.types, ...(p.types || {}) }, extras: Array.isArray(p.extras) ? p.extras.slice(0, 2) : [] };
};
const stateOf = (user) => parseJSON(user.state, {});
async function saveState(user, state) {
    user.state = JSON.stringify(state);
    await user.save().catch(e => log('error', 'guardar estado:', e.message));
}
// Sitios a vigilar de un suscriptor: el principal y los extra
function targetsOf(user) {
    const main = { user, lat: user.lat, lon: user.lon, city: user.city, region: user.region, key: 'main', primary: true };
    const extras = prefsOf(user).extras
        .filter(e => Number.isFinite(+e.lat) && Number.isFinite(+e.lon))
        .map((e, i) => ({ user, lat: +e.lat, lon: +e.lon, city: String(e.city || '').slice(0, 120), region: String(e.region || '').slice(0, 120), key: `x${i}:${(+e.lat).toFixed(2)},${(+e.lon).toFixed(2)}` }));
    return [main, ...extras];
}
const localParts = (tz, date = new Date()) => {
    const zone = isValidTimeZone(tz) ? tz : 'Europe/Madrid';
    const f = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    return { day: f.slice(0, 10), hour: Number(f.slice(11, 13)) % 24, minute: Number(f.slice(14, 16)) };
};

// --- PARTE DE LA MAÑANA ---
// Una llamada de previsión (y otra de aire si alguien quiere calima/polen)
// por zona. Sale a la hora local que elija cada uno (por defecto, las 8).
async function sendMorning(users, stats) {
    const emojis = { 'Despejado': '☀️', 'Parcialmente': '⛅', 'Nublado': '☁️', 'Lluvia': '🌧️', 'Nieve': '❄️', 'Tormenta': '⛈️', 'Niebla': '🌫️' };
    const zones = groupByZone(users);
    await forEachLimit(zones, 6, async (zoneUsers) => {
        const { lat, lon } = zoneUsers[0];
        try {
            stats.llamadasOpenMeteo++;
            const { data } = await http.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&hourly=precipitation_probability&timezone=auto&forecast_days=1`);
            const d = data.daily;
            if (!d) return;
            let air = null;
            if (zoneUsers.some(u => prefsOf(u).calima || prefsOf(u).polen)) {
                try {
                    stats.llamadasOpenMeteo++;
                    air = (await http.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1&hourly=dust,grass_pollen,olive_pollen,birch_pollen,alder_pollen,mugwort_pollen,ragweed_pollen`)).data.hourly;
                } catch (e) { air = null; }
            }
            const wmo = decodeWMO(d.weather_code[0], 1);
            const max = Math.round(d.temperature_2m_max[0]), min = Math.round(d.temperature_2m_min[0]);
            const uv = Math.round(d.uv_index_max[0] || 0);
            // ¿Desde qué hora llueve? (la probabilidad horaria es de la hora anterior)
            const hp = data.hourly && data.hourly.precipitation_probability || [];
            const firstWet = hp.findIndex((v, i) => i >= 7 && v >= 50);
            const rainTxt = firstWet >= 0 ? `lluvia desde las ${String(Math.max(0, firstWet - 1)).padStart(2, '0')} h ☔` : (d.precipitation_probability_max[0] || 0) >= 30 ? 'algún chubasco posible' : 'sin lluvia';
            const maxOf = (arr) => arr ? Math.max(0, ...arr.filter(v => v != null)) : 0;
            const dust = air ? maxOf(air.dust) : 0;
            const pollenTop = air ? [['gramíneas', 'grass'], ['olivo', 'olive'], ['abedul', 'birch'], ['aliso', 'alder'], ['artemisa', 'mugwort'], ['ambrosía', 'ragweed']]
                .map(([n, k]) => [n, maxOf(air[`${k}_pollen`])]).sort((a, b) => b[1] - a[1])[0] : null;
            let emoji = '🌤️';
            for (const [k, v] of Object.entries(emojis)) { if (wmo.text.includes(k)) { emoji = v; break; } }
            for (const user of zoneUsers) {
                const p = prefsOf(user);
                const extra = [];
                if (p.calima && dust >= 50) extra.push(`calima ${dust >= 100 ? 'intensa' : 'moderada'}`);
                if (p.polen && pollenTop && pollenTop[1] > 50) extra.push(`polen de ${pollenTop[0]} alto`);
                if (uv >= 6) extra.push(`UV ${uv}, crema`);
                const body = `${wmo.text} · ${min}°–${max}° · ${rainTxt}${extra.length ? ' · ' + extra.join(' · ') : ''}`;
                if (await sendPush(user, { type: 'manana', section: 'parte', title: `${emoji} Buenos días en ${user.city}`, body })) stats.notificaciones++;
                const st = stateOf(user);
                st.morning = localParts(user.timezone).day;
                await saveState(user, st);
            }
        } catch (err) { log('error', `parte zona ${lat},${lon}:`, err.message); }
    });
}
// ¿Le toca el parte? (no enviado hoy, activado y es su hora o, si force, la mañana)
function wantsMorning(user, { force = false } = {}) {
    const p = prefsOf(user);
    if (p.morning === false) return false;
    const now = localParts(user.timezone);
    if (stateOf(user).morning === now.day) return false;
    if (force) return now.hour >= 6 && now.hour <= 11;
    return now.hour === Number(p.morningHour ?? 8);
}

const AEMET_RANK = { amarillo: 1, naranja: 2, rojo: 3 };

// --- CRON: avisos (llámalo cada 15 min) ---
app.get('/api/cron/check-rain', async (req, res) => {
    if (!cronAuthorized(req, res)) return;
    try {
        const users = await Subscription.findAll();
        const hourlyPass = new Date().getUTCMinutes() < 15; // la pasada "en punto"
        const stats = { suscriptores: users.length, llamadasOpenMeteo: 0, zonasEnPausaNocturna: 0, notificaciones: 0, partes: 0 };

        // 0. Avisos OFICIALES de AEMET, por sitio vigilado y sin límite general
        //    (se controla por aviso para no repetirlo). fetchAemetAvisos cachea
        //    15 min por comunidad: no gasta llamadas.
        const notifiedNow = new Set();
        for (const user of users) {
            const p = prefsOf(user), st = stateOf(user);
            st.aemet = st.aemet || {};
            let changed = false;
            for (const t of targetsOf(user)) {
                try {
                    const areaCode = t.region ? getAemetAreaCode(t.region) : null;
                    if (!areaCode) continue;
                    const min = AEMET_RANK[p.aemetMin] || 2;
                    const top = (await avisosParaPunto(areaCode, t.lat, t.lon)).find(a => (AEMET_RANK[a.nivel] || 0) >= min);
                    const avisoKey = top ? `${top.nivel}|${top.fenomeno}|${top.onset || ''}` : null;
                    const prev = t.primary ? (st.aemet[t.key] ?? user.lastAemetAviso) : st.aemet[t.key];
                    if (top && avisoKey !== prev) {
                        const emoji = top.nivel === 'rojo' ? '🔴' : top.nivel === 'naranja' ? '🟠' : '🟡';
                        if (await sendPush(user, {
                            type: `aemet${t.primary ? '' : '-' + t.key}`,
                            section: 'avisos',
                            requireInteraction: top.nivel === 'rojo',
                            title: `${emoji} Aviso ${top.nivel} por ${top.fenomeno.toLowerCase()} · ${t.city}`,
                            body: [avisoRango(top.onset, top.expires, user.timezone), top.titular].filter(Boolean).join(' · '),
                            url: cityUrl(t, 'avisos')
                        })) {
                            st.aemet[t.key] = avisoKey; changed = true;
                            user.lastNotification = new Date();
                            notifiedNow.add(user.endpoint);
                            stats.notificaciones++;
                        }
                    } else if (!top && prev) { st.aemet[t.key] = null; changed = true; }
                } catch (err) { log('error', `cron AEMET ${t.city}:`, err.message); }
            }
            if (changed) { user.lastAemetAviso = st.aemet.main || null; await saveState(user, st); }
        }

        // 1. Parte de la mañana a la hora local de cada uno
        const morningUsers = users.filter(u => wantsMorning(u));
        if (morningUsers.length) { await sendMorning(morningUsers, stats); stats.partes = morningUsers.length; }

        // 2. Avisos propios: máximo 1 por hora y usuario, en todos sus sitios
        const targets = users
            .filter(u => !notifiedNow.has(u.endpoint) && Date.now() - new Date(u.lastNotification) >= 60 * 60 * 1000)
            .flatMap(targetsOf);
        const zones = groupByZone(targets);
        const done = new Set(); // un aviso por usuario y pasada
        await forEachLimit(zones, 6, async (zoneTargets) => {
            const { lat, lon } = zoneTargets[0];
            if (!hourlyPass && isQuietHour(zoneTargets[0].user)) { stats.zonasEnPausaNocturna++; return; }
            try {
                stats.llamadasOpenMeteo++;
                const { data } = await http.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&minutely_15=precipitation&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m&forecast_days=2&timezone=auto`);
                for (const t of zoneTargets) {
                    if (done.has(t.user.endpoint)) continue;
                    const notif = weatherNotification(data, t.city);
                    if (!notif || prefsOf(t.user).types[notif.type] === false) continue;
                    if (await sendPush(t.user, { ...notif, url: cityUrl(t, notif.section) })) {
                        done.add(t.user.endpoint);
                        t.user.lastNotification = new Date();
                        await t.user.save();
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

// --- CRON: PARTE DE LA MAÑANA ---
// Lo envía ya el cron de cada 15 min a la hora de cada usuario. Esta ruta se
// mantiene para el cron antiguo de las 8: manda el parte a quien aún no lo
// haya recibido hoy y esté entre las 6 y las 11 de su hora.
app.get('/api/cron/morning-summary', async (req, res) => {
    if (!cronAuthorized(req, res)) return;
    try {
        const users = (await Subscription.findAll()).filter(u => wantsMorning(u, { force: true }));
        const stats = { suscriptores: users.length, llamadasOpenMeteo: 0, notificaciones: 0 };
        if (users.length) await sendMorning(users, stats);
        log('info', 'Cron resumen:', JSON.stringify(stats));
        res.json({ success: true, ...stats });
    } catch (error) {
        log('error', 'Morning cron:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Darse de baja desde la app (el navegador también deja de recibirlas)
app.post('/api/unsubscribe', subscribeLimiter, async (req, res) => {
    try {
        const endpoint = req.body && req.body.endpoint;
        if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) return res.status(400).json({ error: 'No válido.' });
        await Subscription.destroy({ where: { endpoint } });
        res.json({ ok: true });
    } catch (e) {
        log('error', 'unsubscribe', e.message);
        res.status(500).json({ error: 'No se pudo dar de baja.' });
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
