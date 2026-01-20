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
    const nightIcons = {
        0: 'bi-moon', 1: 'bi-cloud-moon', 2: 'bi-cloud-moon', 3: 'bi-clouds'
    };
    
    const textMap = {
        0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Niebla", 48: "Niebla escarcha",
        51: "Llovizna", 53: "Llovizna moderada", 55: "Llovizna densa",
        61: "Lluvia leve", 63: "Lluvia", 65: "Lluvia fuerte",
        71: "Nieve leve", 73: "Nieve", 75: "Nieve fuerte",
        80: "Chubascos", 81: "Chubascos fuertes", 82: "Chubascos violentos",
        95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta fuerte"
    };

    let icon = isDay ? (dayIcons[c] || 'bi-cloud') : (nightIcons[c] || dayIcons[c] || 'bi-cloud');
    return { text: textMap[c] || "Variable", icon: icon };
};

// --- BÚSQUEDA ---
app.get('/api/search/:query', async (req, res) => {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(req.params.query)}&count=5&language=es&format=json`;
        const response = await axios.get(url);
        if (!response.data.results) return res.json([]);

        const cities = response.data.results.map(city => ({
            id: `${city.latitude},${city.longitude}`, 
            name: city.name,
            region: city.admin1 || city.country,
            lat: city.latitude,
            lon: city.longitude
        }));
        res.json(cities);
    } catch (e) { res.json([]); }
});

// --- API GEO (FIX: AHORA USA OPENSTREETMAP/NOMINATIM PARA EL NOMBRE EXACTO) ---
app.get('/api/geo', async (req, res) => {
    const { lat, lon } = req.query;
    try {
        // Nominatim es el mejor servicio gratuito para obtener el nombre exacto de un punto
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
            params: {
                lat: lat,
                lon: lon,
                format: 'json',
                zoom: 10 // Zoom nivel ciudad
            },
            headers: { 'User-Agent': 'AerisApp/1.0' } // Requerido por Nominatim
        });

        const address = response.data.address;
        // Prioridad: Ciudad > Pueblo > Villa > Municipio
        const realName = address.city || address.town || address.village || address.municipality || address.county || "Ubicación Detectada";
        const region = address.state || address.region || "";

        res.json({
            id: `${lat},${lon}`,
            name: realName, 
            region: region,
            lat: lat,
            lon: lon
        });
    } catch (e) {
        console.error("Geo Error:", e.message);
        // Fallback solo si falla OpenStreetMap
        res.json({ id: `${lat},${lon}`, name: "Ubicación GPS", region: "", lat, lon });
    }
});

// --- API CLIMA ---
app.get('/api/weather/:id', async (req, res) => {
    let locationId = req.params.id;
    let forcedName = req.query.name || "Ubicación";
    let forcedRegion = req.query.region || "";

    try {
        let lat, lon;
        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
        } else {
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationId)}&count=1&language=es&format=json`;
            const geoRes = await axios.get(geoUrl);
            if (geoRes.data.results) {
                lat = geoRes.data.results[0].latitude;
                lon = geoRes.data.results[0].longitude;
                locationId = `${lat},${lon}`;
                if(forcedName === "Ubicación") forcedName = geoRes.data.results[0].name;
            } else {
                throw new Error("Ubicación no encontrada");
            }
        }

        const cache = await WeatherCache.findByPk(locationId);
        if (cache && (new Date() - new Date(cache.updatedAt) < 10 * 60 * 1000)) {
            const cachedData = JSON.parse(cache.data);
            cachedData.location.name = forcedName; 
            return res.json(cachedData);
        }

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto`;
        const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`;

        const [wRes, aRes] = await Promise.allSettled([
            axios.get(weatherUrl),
            axios.get(airUrl)
        ]);

        if (wRes.status === 'rejected') throw new Error("Fallo API Clima");
        const w = wRes.value.data;
        const a = (aRes.status === 'fulfilled') ? aRes.value.data : { current: {} };

        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);

        const finalData = {
            location: { name: forcedName, region: forcedRegion, lat, lon, timezone: w.timezone },
            current: {
                temp: Math.round(w.current.temperature_2m),
                feelsLike: Math.round(w.current.apparent_temperature),
                humidity: w.current.relative_humidity_2m,
                windSpeed: Math.round(w.current.wind_speed_10m),
                desc: currentWMO.text,
                icon: currentWMO.icon,
                isDay: w.current.is_day === 1,
                uv: w.daily.uv_index_max[0] || 0,
                aqi: a.current.us_aqi || 1,
                pm25: a.current.pm2_5 || 0,
                pm10: a.current.pm10 || 0,
                localTime: w.current.time 
            },
            nowcast: { time: w.minutely_15 ? w.minutely_15.time : [], precipitation: w.minutely_15 ? w.minutely_15.precipitation : [] },
            hourly: w.hourly.time.map((t, i) => ({
                fullDate: t.replace('T', ' '),
                hourOnly: t.split('T')[1],
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
        res.status(500).json({ error: "Error Servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris LIVE en puerto ${PORT}`));