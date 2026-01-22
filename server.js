require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- CLAVES DE NOTIFICACIONES (VAPID) ---
// En un proyecto real, estas claves no deberían cambiar.
const publicVapidKey = 'BJthRQ5myDgc7OSXzPCMftGw-nJmqzaSGq5QAcksgXr4S4VM15q1ifV48o80H1EgtW29d1u5cL0rCM1f2td8j6E';
const privateVapidKey = '3KjvO8t8y92j34d567g890h123i456j789k012l345m';

webpush.setVapidDetails(
    'mailto:tu@email.com',
    publicVapidKey,
    privateVapidKey
);

// --- BASE DE DATOS (RAM) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:', 
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

const Subscription = sequelize.define('Subscription', {
    endpoint: { type: DataTypes.STRING, primaryKey: true },
    keys: { type: DataTypes.JSON },
    lat: { type: DataTypes.FLOAT },
    lon: { type: DataTypes.FLOAT },
    city: { type: DataTypes.STRING },
    lastNotification: { type: DataTypes.DATE }
});

sequelize.sync();

// --- TRADUCTOR CLIMA ---
const decodeWMO = (code, isDay = 1) => {
    const c = parseInt(code);
    const dayIcons = {
        0: 'bi-sun', 1: 'bi-cloud-sun', 2: 'bi-cloud', 3: 'bi-clouds',
        45: 'bi-cloud-haze2', 48: 'bi-cloud-haze2',
        51: 'bi-cloud-drizzle', 53: 'bi-cloud-drizzle', 55: 'bi-cloud-drizzle',
        61: 'bi-cloud-rain', 63: 'bi-cloud-rain', 65: 'bi-cloud-rain-heavy',
        71: 'bi-cloud-snow', 73: 'bi-cloud-snow', 75: 'bi-snow',
        80: 'bi-cloud-drizzle', 81: 'bi-cloud-rain', 82: 'bi-cloud-rain-heavy',
        95: 'bi-cloud-lightning', 96: 'bi-cloud-lightning-rain', 99: 'bi-cloud-lightning-rain'
    };
    const nightIcons = { 0: 'bi-moon', 1: 'bi-cloud-moon', 2: 'bi-cloud-moon', 3: 'bi-clouds' };
    const textMap = {
        0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Niebla", 48: "Niebla escarcha",
        51: "Llovizna", 53: "Llovizna moderada", 55: "Llovizna fuerte",
        61: "Lluvia leve", 63: "Lluvia", 65: "Lluvia fuerte",
        71: "Nieve leve", 73: "Nieve", 75: "Nieve fuerte",
        80: "Chubascos", 81: "Chubascos fuertes", 82: "Tormenta violenta",
        95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta fuerte"
    };
    let icon = isDay ? (dayIcons[c] || 'bi-cloud') : (nightIcons[c] || dayIcons[c] || 'bi-cloud');
    return { text: textMap[c] || "Variable", icon: icon };
};

// --- API NOTIFICACIONES ---
app.get('/api/vapid-key', (req, res) => res.json({ key: publicVapidKey }));

app.post('/api/subscribe', async (req, res) => {
    const { subscription, lat, lon, city } = req.body;
    try {
        await Subscription.upsert({
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            lat, lon, city,
            lastNotification: new Date(0) 
        });
        res.status(201).json({});
        console.log(`🔔 Suscripción guardada para: ${city}`);
    } catch (e) { res.status(500).json({}); }
});

// --- EL VIGILANTE DEL TIEMPO (CRON JOB) ---
// Se ejecuta cada 15 minutos para todos los usuarios
setInterval(async () => {
    console.log("🌦️ Analizando lluvia para usuarios...");
    const users = await Subscription.findAll();
    
    for (const user of users) {
        // Evitar molestar: máximo 1 notificación cada 60 min
        if (new Date() - new Date(user.lastNotification) < 60 * 60 * 1000) continue;

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${user.lat}&longitude=${user.lon}&minutely_15=precipitation&forecast_days=1`;
            const response = await axios.get(url);
            const nowcast = response.data.minutely_15;

            let rainSum = 0;
            let startInMinutes = 0;
            let foundStart = false;

            // Analizar los próximos 60 minutos (4 bloques de 15 min)
            for(let i=0; i<4; i++) {
                const amount = nowcast.precipitation[i] || 0;
                rainSum += amount;
                if (amount > 0 && !foundStart) {
                    startInMinutes = i * 15;
                    foundStart = true;
                }
            }

            // SI LLUEVE >= 0.1mm, ENVIAR AVISO
            if (rainSum >= 0.1) {
                let intensity = "ligera";
                if (rainSum > 2) intensity = "moderada";
                if (rainSum > 5) intensity = "FUERTE";

                let timeText = "ahora mismo";
                if (startInMinutes > 0) timeText = `en ${startInMinutes} minutos`;

                const payload = JSON.stringify({
                    title: `☔ Lluvia ${intensity} en ${user.city}`,
                    body: `Se espera precipitación ${timeText}. Total: ${rainSum.toFixed(1)}mm.`,
                    icon: '/logo.png',
                    badge: '/logo.png'
                });

                await webpush.sendNotification({
                    endpoint: user.endpoint,
                    keys: user.keys
                }, payload);

                // Actualizar fecha para no repetir
                user.lastNotification = new Date();
                await user.save();
                console.log(`✅ Notificación enviada a ${user.city}`);
            }
        } catch (err) {
            if (err.statusCode === 410) await user.destroy(); // Borrar usuario si ya no existe
        }
    }
}, 15 * 60 * 1000); // 15 minutos

// --- API BÚSQUEDA (LIMPIA, SIN UNDEFINED) ---
app.get('/api/search/:query', async (req, res) => {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(req.params.query)}&count=8&language=es&format=json`;
        const response = await axios.get(url);
        
        if (!response.data.results) return res.json([]);

        const cities = response.data.results.map(city => {
            // Limpieza estricta de región
            let regionParts = [];
            if (city.admin1 && city.admin1 !== city.name) regionParts.push(city.admin1);
            if (city.country) regionParts.push(city.country);
            
            // Filtro triple: existe, no es 'undefined', no está vacío
            const regionText = regionParts
                .filter(p => p && p !== 'undefined' && p.trim() !== '')
                .join(', ');

            return {
                id: `${city.latitude},${city.longitude}`, 
                name: city.name,
                region: regionText,
                country_code: city.country_code,
                lat: city.latitude,
                lon: city.longitude
            };
        });
        res.json(cities);
    } catch (e) { res.json([]); }
});

// --- API GEO (NOMINATIM) ---
app.get('/api/geo', async (req, res) => {
    const { lat, lon } = req.query;
    try {
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
            params: { lat, lon, format: 'json', zoom: 12, addressdetails: 1 },
            headers: { 'User-Agent': 'AerisApp/1.0' }
        });
        const addr = response.data.address;
        const realName = addr.city || addr.town || addr.village || addr.municipality || "Ubicación";
        
        let regionParts = [];
        if (addr.state) regionParts.push(addr.state);
        if (addr.country) regionParts.push(addr.country);
        const region = regionParts.filter(Boolean).join(', ');

        res.json({ id: `${lat},${lon}`, name: realName, region: region, lat, lon });
    } catch (e) {
        res.json({ id: `${lat},${lon}`, name: "Ubicación Detectada", region: "GPS", lat, lon });
    }
});

// --- API WEATHER (CON DATOS PARA GRÁFICA) ---
app.get('/api/weather/:id', async (req, res) => {
    let locationId = req.params.id;
    let forcedName = req.query.name; 
    let forcedRegion = req.query.region || "";

    try {
        let lat, lon;
        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
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
            if (forcedName) data.location.name = forcedName; 
            if (forcedRegion) data.location.region = forcedRegion;
            return res.json(data);
        }

        const [wRes, aRes] = await Promise.allSettled([
            axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto`),
            axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`)
        ]);

        if (wRes.status === 'rejected') throw new Error("Fallo API Clima");
        const w = wRes.value.data;
        const a = (aRes.status === 'fulfilled') ? aRes.value.data : { current: {} };

        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);

        const finalData = {
            location: { name: forcedName || "Ubicación", region: forcedRegion, lat, lon, timezone: w.timezone },
            current: {
                temp: Math.round(w.current.temperature_2m),
                feelsLike: Math.round(w.current.apparent_temperature),
                humidity: w.current.relative_humidity_2m,
                windSpeed: Math.round(w.current.wind_speed_10m),
                desc: currentWMO.text,
                icon: currentWMO.icon,
                isDay: w.current.is_day === 1,
                uv: w.daily.uv_index_max[0] || 0,
                aqi: a.current.us_aqi || 0,
                pm25: a.current.pm2_5 || 0,
                pm10: a.current.pm10 || 0,
                time: w.current.time 
            },
            nowcast: { time: w.minutely_15?.time || [], precipitation: w.minutely_15?.precipitation || [] },
            hourly: w.hourly.time.map((t, i) => ({
                fullDate: t,
                hour: parseInt(t.split('T')[1].split(':')[0]),
                displayTime: t.split('T')[1],
                temp: Math.round(w.hourly.temperature_2m[i]),
                rainProb: w.hourly.precipitation_probability[i],
                precip: w.hourly.precipitation[i], // DATO CLAVE PARA LA GRÁFICA
                icon: decodeWMO(w.hourly.weather_code[i], w.hourly.is_day[i]).icon
            })),
            daily: w.daily.time.map((t, i) => ({
                fecha: t,
                tempMax: Math.round(w.daily.temperature_2m_max[i]),
                tempMin: Math.round(w.daily.temperature_2m_min[i]),
                sunrise: w.daily.sunrise[i].split('T')[1],
                sunset: w.daily.sunset[i].split('T')[1],
                icon: decodeWMO(w.daily.weather_code[i], 1).icon,
                rainProbMax: w.daily.precipitation_probability_max[i]
            }))
        };

        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Error interno" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris LIVE en puerto ${PORT}`));