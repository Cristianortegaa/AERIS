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

// --- NOTIFICACIONES ---
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BJthRQ5myDgc7OSXzPCMftGw-nJmqzaSGq5QAcksgXr4S4VM15q1ifV48o80H1EgtW29d1u5cL0rCM1f2td8j6E';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '3KjvO8t8y92j34d567g890h123i456j789k012l345m';

webpush.setVapidDetails('mailto:test@aeris.com', publicVapidKey, privateVapidKey);

// --- DB ---
const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
const WeatherCache = sequelize.define('WeatherCache', { locationId: { type: DataTypes.STRING, primaryKey: true }, data: { type: DataTypes.TEXT }, updatedAt: { type: DataTypes.DATE } });
const Subscription = sequelize.define('Subscription', { endpoint: { type: DataTypes.STRING, primaryKey: true }, keys: { type: DataTypes.JSON }, lat: { type: DataTypes.FLOAT }, lon: { type: DataTypes.FLOAT }, city: { type: DataTypes.STRING }, lastNotification: { type: DataTypes.DATE } });
sequelize.sync();

// --- UTILS ---
const decodeWMO = (code, isDay = 1) => {
    const c = parseInt(code);
    const dayIcons = { 0:'bi-sun', 1:'bi-cloud-sun', 2:'bi-cloud', 3:'bi-clouds', 45:'bi-cloud-haze2', 48:'bi-cloud-haze2', 51:'bi-cloud-drizzle', 53:'bi-cloud-drizzle', 55:'bi-cloud-drizzle', 61:'bi-cloud-rain', 63:'bi-cloud-rain', 65:'bi-cloud-rain-heavy', 71:'bi-cloud-snow', 73:'bi-cloud-snow', 75:'bi-snow', 80:'bi-cloud-drizzle', 81:'bi-cloud-rain', 82:'bi-cloud-rain-heavy', 95:'bi-cloud-lightning', 96:'bi-cloud-lightning-rain', 99:'bi-cloud-lightning-rain' };
    const nightIcons = { 0:'bi-moon', 1:'bi-cloud-moon', 2:'bi-cloud-moon', 3:'bi-clouds' };
    const textMap = { 0:"Despejado", 1:"Mayormente despejado", 2:"Parcialmente nublado", 3:"Nublado", 45:"Niebla", 48:"Niebla escarcha", 51:"Llovizna", 53:"Llovizna moderada", 55:"Llovizna fuerte", 61:"Lluvia leve", 63:"Lluvia", 65:"Lluvia fuerte", 71:"Nieve leve", 73:"Nieve", 75:"Nieve fuerte", 80:"Chubascos", 81:"Chubascos fuertes", 82:"Tormenta violenta", 95:"Tormenta", 96:"Tormenta con granizo", 99:"Tormenta fuerte" };
    let icon = isDay ? (dayIcons[c] || 'bi-cloud') : (nightIcons[c] || dayIcons[c] || 'bi-cloud');
    return { text: textMap[c] || "Variable", icon: icon };
};

// --- MOTOR DE ALERTAS ---
const generateAlerts = (w) => {
    const alerts = [];
    const wind = w.current.wind_speed_10m;
    const temp = w.current.temperature_2m;
    const code = w.current.weather_code;
    const rain = w.current.precipitation;

    if (wind >= 90) alerts.push({ level: 'red', title: 'Viento Huracanado', msg: 'Rachas extremas > 90 km/h. ¡Peligro!' });
    else if (wind >= 70) alerts.push({ level: 'orange', title: 'Viento Fuerte', msg: 'Rachas muy fuertes. Precaución.' });
    else if (wind >= 50) alerts.push({ level: 'yellow', title: 'Aviso Viento', msg: 'Rachas moderadas de viento.' });

    if (temp >= 40) alerts.push({ level: 'red', title: 'Calor Extremo', msg: 'Riesgo extremo para la salud.' });
    else if (temp >= 36) alerts.push({ level: 'orange', title: 'Ola de Calor', msg: 'Temperaturas muy altas.' });
    else if (temp <= -5) alerts.push({ level: 'orange', title: 'Ola de Frío', msg: 'Temperaturas bajo cero peligrosas.' });

    if (code >= 95) alerts.push({ level: 'orange', title: 'Tormenta Eléctrica', msg: 'Actividad eléctrica detectada.' });
    if (rain >= 10) alerts.push({ level: 'orange', title: 'Lluvia Torrencial', msg: 'Precipitación intensa.' });
    
    if (code === 75 || code === 86) alerts.push({ level: 'orange', title: 'Nevada Fuerte', msg: 'Acumulación de nieve rápida.' });

    return alerts;
};

app.get('/api/vapid-key', (req, res) => res.json({ key: publicVapidKey }));
app.post('/api/subscribe', async (req, res) => {
    try { await Subscription.upsert({ endpoint: req.body.subscription.endpoint, keys: req.body.subscription.keys, lat: req.body.lat, lon: req.body.lon, city: req.body.city, lastNotification: new Date(0) }); res.status(201).json({}); } catch (e) { res.status(500).json({}); }
});

setInterval(async () => {
    const users = await Subscription.findAll();
    for (const user of users) {
        if (new Date() - new Date(user.lastNotification) < 60 * 60 * 1000) continue;
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${user.lat}&longitude=${user.lon}&minutely_15=precipitation&current=temperature_2m&forecast_days=1&timezone=auto`;
            const response = await axios.get(url);
            const nowcast = response.data.minutely_15;
            const current = response.data.current;
            
            let rainSum = 0; let startMin = 0; let found = false;
            if(nowcast) { for(let i=0; i<4; i++) { const val = nowcast.precipitation[i] || 0; rainSum += val; if(val > 0 && !found) { startMin = i*15; found = true; } } }
            
            if (rainSum > 0.2) { 
                const isSnow = current.temperature_2m <= 2; 
                const type = isSnow ? "Nieve" : "Lluvia";
                const icon = isSnow ? "❄️" : "☔";
                const timeMsg = startMin === 0 ? "ahora mismo" : `en ${startMin} minutos`;
                
                await webpush.sendNotification({ endpoint: user.endpoint, keys: user.keys }, JSON.stringify({ title: `${icon} ${type} en ${user.city}`, body: `Se espera ${type.toLowerCase()} ${timeMsg}.`, icon: '/logo.png', badge: '/logo.png' }));
                
                user.lastNotification = new Date(); await user.save();
            }
        } catch (err) { if (err.statusCode === 410) await user.destroy(); }
    }
}, 15 * 60 * 1000);

app.get('/api/search/:query', async (req, res) => {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(req.params.query)}&count=8&language=es&format=json`;
        const response = await axios.get(url);
        if (!response.data.results) return res.json([]);
        const cities = response.data.results.map(city => {
            let parts = []; if (city.admin1 && city.admin1 !== city.name) parts.push(city.admin1); if (city.country) parts.push(city.country);
            return { id: `${city.latitude},${city.longitude}`, name: city.name, region: parts.filter(p=>p&&p!=='undefined').join(', '), lat: city.latitude, lon: city.longitude };
        });
        res.json(cities);
    } catch (e) { res.json([]); }
});

// CAMBIO 1: Nombre por defecto actualizado
app.get('/api/geo', async (req, res) => { res.json({ id: `${req.query.lat},${req.query.lon}`, name: "Tu ubicación", region: "", lat: req.query.lat, lon: req.query.lon }); });

// --- WEATHER API ---
app.get('/api/weather/:id', async (req, res) => {
    let locationId = req.params.id;
    let forcedName = req.query.name;
    let forcedRegion = req.query.region || "";

    try {
        let lat, lon;
        
        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
            // CAMBIO 2: Añadido "Tu ubicación" a la lista negra para forzar búsqueda real
            const badNames = ['undefined', 'null', 'Ubicación', 'Tu ubicación', 'Ubicación detectada', 'Ubicación Detectada', '', 'My Location'];
            if (!forcedName || badNames.includes(forcedName)) {
                try {
                    const geoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=es&format=json`;
                    const geoRes = await axios.get(geoUrl);
                    if (geoRes.data.results && geoRes.data.results.length > 0) {
                        forcedName = geoRes.data.results[0].name;
                        const r = geoRes.data.results[0];
                        forcedRegion = [r.admin1, r.country].filter(Boolean).join(', ');
                    } else { throw new Error("OpenMeteo Empty"); }
                } catch(err) {
                    try {
                        const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
                        const nomRes = await axios.get(nomUrl, { headers: { 'User-Agent': 'AerisApp/1.0' } });
                        const a = nomRes.data.address;
                        // CAMBIO 3: Fallback actualizado
                        forcedName = a.city || a.town || a.village || a.municipality || "Tu ubicación";
                        forcedRegion = [a.state, a.country].filter(Boolean).join(', ');
                    } catch(e2) { forcedName = "Tu ubicación"; }
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
            if (forcedName && forcedName !== "Tu ubicación") data.location.name = forcedName;
            return res.json(data);
        }

        const [wRes, aRes, pRes] = await Promise.allSettled([
            axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,cloud_cover&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto&past_days=1`),
            axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`),
            axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen,oak_pollen,pine_pollen,cypress_pollen,hazel_pollen,plane_tree_pollen,poplar_pollen,ash_pollen&timezone=auto`)
        ]);

        if (wRes.status === 'rejected') throw new Error("Fallo API Clima");
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
                else if (diff > 0) comparisonText = `${Math.round(diff)}° más calor que ayer`;
                else comparisonText = `${Math.abs(Math.round(diff))}° más frío que ayer`;
            }
        } catch (err) { comparisonText = ""; }

        const hourly = w.hourly.time
            .slice(startIndex, startIndex + 24)
            .map((t, i) => {
                const realIndex = startIndex + i;
                return { 
                    fullDate: t, hour: parseInt(t.split('T')[1].split(':')[0]), displayTime: t.split('T')[1], 
                    temp: Math.round(w.hourly.temperature_2m[realIndex]), rainProb: w.hourly.precipitation_probability[realIndex], 
                    precip: w.hourly.precipitation[realIndex], icon: decodeWMO(w.hourly.weather_code[realIndex], w.hourly.is_day[realIndex]).icon 
                };
            });

        let nowcast = { time: [], precipitation: [] };
        if (w.minutely_15) {
            const indices = w.minutely_15.time.map((t, i) => ({ t, i })).filter(item => item.t >= currentTime).map(item => item.i);
            nowcast.time = indices.map(i => w.minutely_15.time[i]);
            nowcast.precipitation = indices.map(i => w.minutely_15.precipitation[i]);
        }

        const pollenData = {
            alder: p.current.alder_pollen || 0, birch: p.current.birch_pollen || 0, grass: p.current.grass_pollen || 0,
            mugwort: p.current.mugwort_pollen || 0, olive: p.current.olive_pollen || 0, ragweed: p.current.ragweed_pollen || 0,
            oak: p.current.oak_pollen || 0, pine: p.current.pine_pollen || 0, cypress: p.current.cypress_pollen || 0,
            hazel: p.current.hazel_pollen || 0, plane: p.current.plane_tree_pollen || 0, poplar: p.current.poplar_pollen || 0,
            ash: p.current.ash_pollen || 0
        };

        const alerts = generateAlerts(w);

        const finalData = {
            // CAMBIO 4: Nombre final fallback
            location: { name: forcedName || "Tu ubicación", region: forcedRegion, lat, lon, timezone: w.timezone },
            current: { 
                temp: Math.round(w.current.temperature_2m), feelsLike: Math.round(w.current.apparent_temperature), humidity: w.current.relative_humidity_2m, 
                windSpeed: Math.round(w.current.wind_speed_10m), desc: currentWMO.text, icon: currentWMO.icon, isDay: w.current.is_day === 1, 
                uv: w.daily.uv_index_max[0] || 0, aqi: a.current.us_aqi || 0, pm25: a.current.pm2_5 || 0, pm10: a.current.pm10 || 0, time: w.current.time,
                cloudCover: w.current.cloud_cover || 0, comparison: comparisonText
            },
            nowcast: nowcast, hourly: hourly, pollen: pollenData, alerts: alerts, 
            daily: w.daily.time.map((t, i) => {
                return { 
                    fecha: t, tempMax: Math.round(w.daily.temperature_2m_max[i]), tempMin: Math.round(w.daily.temperature_2m_min[i]), 
                    sunrise: w.daily.sunrise[i].split('T')[1], sunset: w.daily.sunset[i].split('T')[1], icon: decodeWMO(w.daily.weather_code[i], 1).icon, 
                    rainProbMax: w.daily.precipitation_probability_max[i],
                    dayHours: w.hourly.time.reduce((acc, timeStr, idx) => {
                        if (timeStr.startsWith(t)) {
                            acc.push({
                                time: timeStr.split('T')[1], temp: Math.round(w.hourly.temperature_2m[idx]), rainProb: w.hourly.precipitation_probability[idx], 
                                icon: decodeWMO(w.hourly.weather_code[idx], 1).icon
                            });
                        }
                        return acc;
                    }, [])
                };
            }).filter(d => d.fecha >= currentTime.split('T')[0])
        };

        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (e) { console.error(e); res.status(500).json({ error: "Error interno" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris LIVE en puerto ${PORT}`));