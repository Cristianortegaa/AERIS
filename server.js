require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const webpush = require('web-push');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

const app = express();

// --- LOG HELPER ---
const log = (level, msg, ...args) => {
    const ts = new Date().toISOString();
    if (level === 'error') console.error(`[${ts}] ERROR: ${msg}`, ...args);
    else console.log(`[${ts}] ${level.toUpperCase()}: ${msg}`, ...args);
};

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
app.use(express.static('public'));

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

// --- DB (SQLite en disco) ---
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dbDir, 'aeris.db'),
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT }
}, { timestamps: true, createdAt: false, updatedAt: 'updatedAt' });

const Subscription = sequelize.define('Subscription', {
    endpoint: { type: DataTypes.STRING, primaryKey: true },
    keys: { type: DataTypes.JSON },
    lat: { type: DataTypes.FLOAT },
    lon: { type: DataTypes.FLOAT },
    city: { type: DataTypes.STRING },
    lastNotification: { type: DataTypes.DATE }
}, { timestamps: false });

sequelize.sync().then(() => log('info', 'Base de datos lista.'));

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

const windDirectionText = (degrees) => {
    if (degrees === undefined || degrees === null) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round(degrees / 45) % 8];
};

// --- MOTOR DE ALERTAS ---
const generateAlerts = (w) => {
    const alerts = [];
    const wind = w.current.wind_speed_10m;
    const temp = w.current.temperature_2m;
    const code = w.current.weather_code;
    const rain = w.current.precipitation;

    if (wind >= 90) alerts.push({ level: 'red', title: 'Viento Huracanado', msg: 'Rachas extremas > 90 km/h. Peligro!' });
    else if (wind >= 70) alerts.push({ level: 'orange', title: 'Viento Fuerte', msg: 'Rachas muy fuertes. Precaucion.' });
    else if (wind >= 50) alerts.push({ level: 'yellow', title: 'Aviso Viento', msg: 'Rachas moderadas de viento.' });

    if (temp >= 40) alerts.push({ level: 'red', title: 'Calor Extremo', msg: 'Riesgo extremo para la salud.' });
    else if (temp >= 36) alerts.push({ level: 'orange', title: 'Ola de Calor', msg: 'Temperaturas muy altas.' });
    else if (temp <= -5) alerts.push({ level: 'orange', title: 'Ola de Frio', msg: 'Temperaturas bajo cero peligrosas.' });

    if (code >= 95) alerts.push({ level: 'orange', title: 'Tormenta Electrica', msg: 'Actividad electrica detectada.' });
    if (rain >= 10) alerts.push({ level: 'orange', title: 'Lluvia Torrencial', msg: 'Precipitacion intensa.' });
    if (code === 75 || code === 86) alerts.push({ level: 'orange', title: 'Nevada Fuerte', msg: 'Acumulacion de nieve rapida.' });

    return alerts;
};

// --- RUTAS ---
app.get('/api/vapid-key', (req, res) => {
    if (!publicVapidKey) return res.status(503).json({ error: 'Notificaciones no disponibles.' });
    res.json({ key: publicVapidKey });
});

app.post('/api/subscribe', subscribeLimiter, async (req, res) => {
    try {
        await Subscription.upsert({
            endpoint: req.body.subscription.endpoint,
            keys: req.body.subscription.keys,
            lat: req.body.lat,
            lon: req.body.lon,
            city: req.body.city,
            lastNotification: new Date(0)
        });
        res.status(201).json({});
    } catch (e) {
        log('error', 'subscribe', e.message);
        res.status(500).json({});
    }
});

app.get('/api/search/:query', async (req, res) => {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(req.params.query)}&count=8&language=es&format=json`;
        const response = await axios.get(url);
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
app.get('/api/weather/:id', weatherLimiter, async (req, res) => {
    let locationId = req.params.id;
    let forcedName = req.query.name;
    let forcedRegion = req.query.region || "";

    try {
        let lat, lon;

        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
            const badNames = ['undefined', 'null', 'Ubicacion', 'Tu ubicacion', 'Ubicacion detectada', 'Ubicacion Detectada', '', 'My Location'];

            if (!forcedName || badNames.includes(forcedName)) {
                try {
                    const geoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=es&format=json`;
                    const geoRes = await axios.get(geoUrl);
                    if (geoRes.data.results && geoRes.data.results.length > 0) {
                        forcedName = `Tu ubicacion (${geoRes.data.results[0].name})`;
                        const r = geoRes.data.results[0];
                        forcedRegion = [r.admin1, r.country].filter(Boolean).join(', ');
                    } else { throw new Error("OpenMeteo Empty"); }
                } catch (err) {
                    try {
                        // Nominatim con zoom=14 para nombre de barrio/localidad
                        const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14`;
                        const nomRes = await axios.get(nomUrl, { headers: { 'User-Agent': 'AerisWeatherApp/1.0 (contact: aerisweatherapp@gmail.com)' } });
                        const a = nomRes.data.address;
                        const place = a.suburb || a.neighbourhood || a.city || a.town || a.village || a.municipality;
                        forcedName = place ? `Tu ubicacion (${place})` : "Tu ubicacion";
                        forcedRegion = [a.state, a.country].filter(Boolean).join(', ');
                    } catch (e2) { forcedName = "Tu ubicacion"; }
                }
            }
        } else {
            const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationId)}&count=1&language=es&format=json`);
            if (!geoRes.data.results) throw new Error("Ciudad no encontrada");
            lat = geoRes.data.results[0].latitude;
            lon = geoRes.data.results[0].longitude;
            locationId = `${lat},${lon}`;
            if (!forcedName) forcedName = geoRes.data.results[0].name;
        }

        const cache = await WeatherCache.findByPk(locationId);
        if (cache && (new Date() - new Date(cache.updatedAt) < 5 * 60 * 1000)) {
            const data = JSON.parse(cache.data);
            if (forcedName && forcedName !== "Tu ubicacion") data.location.name = forcedName;
            return res.json(data);
        }

        const [wRes, aRes, pRes] = await Promise.allSettled([
            axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,surface_pressure&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto&past_days=1`),
            axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`),
            axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen,oak_pollen,pine_pollen,cypress_pollen,hazel_pollen,plane_tree_pollen,poplar_pollen,ash_pollen&timezone=auto`)
        ]);

        if (wRes.status === 'rejected') {
            const errorReal = wRes.reason;
            const detalles = errorReal.response ? errorReal.response.data : errorReal.message;
            log('error', 'Open-Meteo:', JSON.stringify(detalles));
            throw new Error(`Fallo API Clima: ${errorReal.message}`);
        }

        const w = wRes.value.data;
        const a = (aRes.status === 'fulfilled') ? aRes.value.data : { current: {} };
        const p = (pRes.status === 'fulfilled') ? pRes.value.data : { current: {} };

        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);
        const currentTime = w.current.time;
        const currentHourStr = currentTime.substring(0, 13);

        let startIndex = w.hourly.time.findIndex(t => t.startsWith(currentHourStr));
        if (startIndex === -1) startIndex = 0;

        let comparisonText = "";
        try {
            if (startIndex >= 24) {
                const tempYesterday = w.hourly.temperature_2m[startIndex - 24];
                const tempToday = w.hourly.temperature_2m[startIndex];
                const diff = tempToday - tempYesterday;
                if (Math.abs(diff) < 1) comparisonText = "Misma temperatura que ayer";
                else if (diff > 0) comparisonText = `${Math.round(diff)}° mas calor que ayer`;
                else comparisonText = `${Math.abs(Math.round(diff))}° mas frio que ayer`;
            }
        } catch (err) { comparisonText = ""; }

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
                    icon: decodeWMO(w.hourly.weather_code[realIndex], w.hourly.is_day[realIndex]).icon
                };
            });

        let nowcast = { time: [], precipitation: [] };
        if (w.minutely_15) {
            const indices = w.minutely_15.time.map((t, i) => ({ t, i })).filter(item => item.t >= currentTime).map(item => item.i);
            nowcast.time = indices.map(i => w.minutely_15.time[i]);
            nowcast.precipitation = indices.map(i => w.minutely_15.precipitation[i]);
        }

        const pollenData = {
            alder: p.current.alder_pollen || 0, birch: p.current.birch_pollen || 0,
            grass: p.current.grass_pollen || 0, mugwort: p.current.mugwort_pollen || 0,
            olive: p.current.olive_pollen || 0, ragweed: p.current.ragweed_pollen || 0,
            oak: p.current.oak_pollen || 0, pine: p.current.pine_pollen || 0,
            cypress: p.current.cypress_pollen || 0, hazel: p.current.hazel_pollen || 0,
            plane: p.current.plane_tree_pollen || 0, poplar: p.current.poplar_pollen || 0,
            ash: p.current.ash_pollen || 0
        };

        const alerts = generateAlerts(w);

        const finalData = {
            location: { name: forcedName || "Tu ubicacion", region: forcedRegion, lat, lon, timezone: w.timezone },
            current: {
                temp: Math.round(w.current.temperature_2m),
                feelsLike: Math.round(w.current.apparent_temperature),
                humidity: w.current.relative_humidity_2m,
                windSpeed: Math.round(w.current.wind_speed_10m),
                windDir: windDirectionText(w.current.wind_direction_10m),
                pressure: Math.round(w.current.surface_pressure),
                desc: currentWMO.text,
                icon: currentWMO.icon,
                isDay: w.current.is_day === 1,
                uv: w.daily.uv_index_max[0] || 0,
                aqi: a.current.us_aqi || 0,
                pm25: a.current.pm2_5 || 0,
                pm10: a.current.pm10 || 0,
                time: w.current.time,
                cloudCover: w.current.cloud_cover || 0,
                comparison: comparisonText
            },
            nowcast,
            hourly,
            pollen: pollenData,
            alerts,
            daily: w.daily.time.map((t, i) => ({
                fecha: t,
                tempMax: Math.round(w.daily.temperature_2m_max[i]),
                tempMin: Math.round(w.daily.temperature_2m_min[i]),
                sunrise: w.daily.sunrise[i].split('T')[1],
                sunset: w.daily.sunset[i].split('T')[1],
                icon: decodeWMO(w.daily.weather_code[i], 1).icon,
                rainProbMax: w.daily.precipitation_probability_max[i],
                dayHours: w.hourly.time.reduce((acc, timeStr, idx) => {
                    if (timeStr.startsWith(t)) {
                        acc.push({
                            time: timeStr.split('T')[1],
                            temp: Math.round(w.hourly.temperature_2m[idx]),
                            rainProb: w.hourly.precipitation_probability[idx],
                            icon: decodeWMO(w.hourly.weather_code[idx], 1).icon
                        });
                    }
                    return acc;
                }, [])
            })).filter(d => d.fecha >= currentTime.split('T')[0])
        };

        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (e) {
        log('error', 'weather API', e.message);
        res.status(500).json({ error: "Error interno al obtener el tiempo." });
    }
});

// --- CRON JOB (protegido con secret) ---
app.get('/api/cron/check-rain', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['x-cron-secret'] !== secret) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    if (!publicVapidKey || !privateVapidKey) {
        return res.status(503).json({ error: 'VAPID no configurado, notificaciones desactivadas.' });
    }

    try {
        log('info', 'Ejecutando Cron Job...');
        const users = await Subscription.findAll();
        let sentCount = 0;

        for (const user of users) {
            if (new Date() - new Date(user.lastNotification) < 60 * 60 * 1000) continue;

            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${user.lat}&longitude=${user.lon}&minutely_15=precipitation&current=temperature_2m,weather_code,wind_speed_10m&forecast_days=1&timezone=auto`;
                const response = await axios.get(url);
                const nowcast = response.data.minutely_15;
                const current = response.data.current;

                let notif = null;

                // 1. Lluvia / Nieve inminente
                let rainSum = 0; let startMin = 0; let found = false;
                if (nowcast) {
                    for (let i = 0; i < 4; i++) {
                        const val = nowcast.precipitation[i] || 0;
                        rainSum += val;
                        if (val > 0 && !found) { startMin = i * 15; found = true; }
                    }
                }
                if (rainSum > 0.2) {
                    const isSnow = current.temperature_2m <= 2;
                    const type = isSnow ? "Nieve" : "Lluvia";
                    const icon = isSnow ? "❄️" : "☔";
                    const timeMsg = startMin === 0 ? "ahora mismo" : `en ${startMin} minutos`;
                    notif = { title: `${icon} ${type} en ${user.city}`, body: `Se espera ${type.toLowerCase()} ${timeMsg}.` };
                }

                // 2. Calor extremo
                if (!notif && current.temperature_2m >= 36) {
                    notif = {
                        title: `🌡️ Calor extremo en ${user.city}`,
                        body: `Temperatura: ${Math.round(current.temperature_2m)}°C. Hidratate y busca la sombra.`
                    };
                }

                // 3. Viento fuerte
                if (!notif && current.wind_speed_10m >= 70) {
                    notif = {
                        title: `💨 Viento fuerte en ${user.city}`,
                        body: `Rachas de ${Math.round(current.wind_speed_10m)} km/h. Precaucion en exteriores.`
                    };
                }

                // 4. Tormenta electrica
                if (!notif && current.weather_code >= 95) {
                    notif = {
                        title: `⚡ Tormenta en ${user.city}`,
                        body: `Actividad electrica detectada. Busca refugio.`
                    };
                }

                if (notif) {
                    await webpush.sendNotification(
                        { endpoint: user.endpoint, keys: user.keys },
                        JSON.stringify({ title: notif.title, body: notif.body, icon: '/logo.png', badge: '/logo.png' })
                    );
                    user.lastNotification = new Date();
                    await user.save();
                    sentCount++;
                }
            } catch (err) {
                if (err.statusCode === 410) {
                    await user.destroy();
                } else {
                    log('error', `cron usuario ${user.city}:`, err.message);
                }
            }
        }
        res.json({ success: true, message: `Cron ejecutado. Notificaciones enviadas: ${sentCount}` });
    } catch (error) {
        log('error', 'Cron Job:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CRON: RESUMEN MATUTINO (llámalo cada mañana a las 8h) ---
app.get('/api/cron/morning-summary', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['x-cron-secret'] !== secret) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    if (!publicVapidKey || !privateVapidKey) {
        return res.status(503).json({ error: 'VAPID no configurado.' });
    }
    try {
        const users = await Subscription.findAll();
        let sentCount = 0;
        for (const user of users) {
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${user.lat}&longitude=${user.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&current=temperature_2m&timezone=auto&forecast_days=1`;
                const response = await axios.get(url);
                const d = response.data.daily;
                if (!d) continue;
                const wmo = decodeWMO(d.weather_code[0], 1);
                const max = Math.round(d.temperature_2m_max[0]);
                const min = Math.round(d.temperature_2m_min[0]);
                const rain = d.precipitation_probability_max[0] || 0;
                const uv = d.uv_index_max[0] || 0;

                // Emoji según condición
                const emojis = { 'Despejado': '☀️', 'Parcialmente': '⛅', 'Nublado': '☁️', 'Lluvia': '🌧️', 'Nieve': '❄️', 'Tormenta': '⛈️', 'Niebla': '🌫️' };
                let emoji = '🌤️';
                for (const [k, v] of Object.entries(emojis)) { if (wmo.text.includes(k)) { emoji = v; break; } }

                // ¿Buen día? (comfort > 70 && sin lluvia && temp 18-28)
                const isNiceDay = rain < 20 && max >= 18 && max <= 28 && d.weather_code[0] <= 3;
                const niceExtra = isNiceDay ? ' ¡Buen día para salir! 🏃' : '';

                const notif = {
                    title: `${emoji} Buenos días en ${user.city}`,
                    body: `${wmo.text} · ${min}°–${max}° · Lluvia: ${rain}% · UV: ${uv}${niceExtra}`
                };
                await webpush.sendNotification(
                    { endpoint: user.endpoint, keys: user.keys },
                    JSON.stringify({ title: notif.title, body: notif.body, icon: '/logo.png', badge: '/logo.png' })
                );
                sentCount++;
            } catch (err) {
                if (err.statusCode === 410) await user.destroy();
                else log('error', `morning usuario ${user.city}:`, err.message);
            }
        }
        res.json({ success: true, message: `Resumen matutino enviado a ${sentCount} usuarios.` });
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
