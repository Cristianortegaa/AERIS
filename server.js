require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(cors());
app.use(express.static('public'));

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

sequelize.sync();

// --- TRADUCTOR WMO ---
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

// --- BÚSQUEDA CORREGIDA (NO MÁS UNDEFINED) ---
app.get('/api/search/:query', async (req, res) => {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(req.params.query)}&count=8&language=es&format=json`;
        const response = await axios.get(url);
        
        if (!response.data.results) return res.json([]);

        const cities = response.data.results.map(city => {
            // LÓGICA DE LIMPIEZA EXTREMA:
            let regionParts = [];
            
            // 1. Añadir región si existe y no es igual a la ciudad
            if (city.admin1 && city.admin1 !== city.name) regionParts.push(city.admin1);
            
            // 2. Añadir país si existe
            if (city.country) regionParts.push(city.country);
            
            // 3. Filtrar cualquier valor nulo, undefined o vacío Y unir con comas
            const regionText = regionParts.filter(part => part && part !== 'undefined').join(', ');

            return {
                id: `${city.latitude},${city.longitude}`, 
                name: city.name,
                region: regionText, // Esto enviamos al frontend, limpio
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
        
        // Limpieza también aquí por si acaso
        let regionParts = [];
        if (addr.state) regionParts.push(addr.state);
        if (addr.country) regionParts.push(addr.country);
        const region = regionParts.filter(Boolean).join(', ');

        res.json({ id: `${lat},${lon}`, name: realName, region: region, lat, lon });
    } catch (e) {
        res.json({ id: `${lat},${lon}`, name: "Ubicación Detectada", region: "GPS", lat, lon });
    }
});

// --- API CLIMA ---
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
            axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto`),
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