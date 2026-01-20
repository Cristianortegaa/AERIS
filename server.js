require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- BASE DE DATOS (Caché en Memoria para velocidad) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:', // Usamos RAM para máxima velocidad en versión gratuita
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

sequelize.sync();

// --- DICCIONARIO WMO (El Traductor Clave) ---
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
        0: 'bi-moon', 1: 'bi-cloud-moon', 2: 'bi-cloud-moon', 3: 'bi-clouds',
        // El resto suelen ser iguales de noche
    };
    
    const textMap = {
        0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Niebla", 48: "Niebla con escarcha",
        51: "Llovizna ligera", 53: "Llovizna", 55: "Llovizna intensa",
        61: "Lluvia ligera", 63: "Lluvia", 65: "Lluvia fuerte",
        71: "Nieve ligera", 73: "Nieve", 75: "Nieve fuerte",
        80: "Chubascos leves", 81: "Chubascos", 82: "Chubascos fuertes",
        95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta fuerte"
    };

    // Selección de icono (Día o Noche)
    let icon = isDay ? (dayIcons[c] || 'bi-cloud') : (nightIcons[c] || dayIcons[c] || 'bi-cloud');
    return { text: textMap[c] || "Variable", icon: icon };
};

// --- API BÚSQUEDA ---
app.get('/api/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        // Buscamos en Open-Meteo Geocoding
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=es&format=json`;
        const response = await axios.get(url);
        
        if (!response.data.results) return res.json([]);

        // Formateamos para que el Frontend entienda
        const cities = response.data.results.map(city => ({
            id: `${city.latitude},${city.longitude}`, // ID son las coordenadas
            name: city.name,
            region: city.admin1 || city.country,
            country: city.country,
            lat: city.latitude,
            lon: city.longitude
        }));
        res.json(cities);
    } catch (e) {
        console.error("Search error:", e.message);
        res.json([]);
    }
});

// --- API GEO ---
app.get('/api/geo', (req, res) => {
    // Rebotamos coordenadas limpias
    const { lat, lon } = req.query;
    res.json({
        id: `${lat},${lon}`,
        name: "Mi Ubicación",
        region: "GPS",
        lat: lat,
        lon: lon
    });
});

// --- API CLIMA (El Cerebro) ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id; // "40.41,-3.7"
    // RECIBIMOS EL NOMBRE DEL FRONTEND (LA CLAVE DEL FIX)
    const forcedName = req.query.name || "Ubicación"; 
    const forcedRegion = req.query.region || "";

    try {
        // Cache Check (5 min)
        const cache = await WeatherCache.findByPk(locationId);
        if (cache && (new Date() - new Date(cache.updatedAt) < 5 * 60 * 1000)) {
            const cachedData = JSON.parse(cache.data);
            // Inyectamos el nombre actualizado aunque sea caché
            cachedData.location.name = forcedName;
            cachedData.location.region = forcedRegion;
            return res.json(cachedData);
        }

        // Parsear coordenadas
        let lat, lon;
        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
        } else {
            return res.status(400).json({ error: "Coordenadas inválidas" });
        }

        // PETICIÓN A OPEN-METEO
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto`;
        const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`;

        // Promise.allSettled para que si falla el aire, no rompa el clima
        const [wRes, aRes] = await Promise.allSettled([
            axios.get(weatherUrl),
            axios.get(airUrl)
        ]);

        if (wRes.status === 'rejected') throw new Error("Fallo en Open-Meteo Weather");

        const w = wRes.value.data;
        const a = (aRes.status === 'fulfilled') ? aRes.value.data : { current: {} };

        // TRADUCCIÓN DE DATOS
        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);
        
        const finalData = {
            location: {
                name: forcedName, // Usamos el nombre que nos pasó el frontend
                region: forcedRegion,
                lat: lat,
                lon: lon
            },
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
                pm10: a.current.pm10 || 0
            },
            nowcast: {
                time: w.minutely_15 ? w.minutely_15.time : [],
                precipitation: w.minutely_15 ? w.minutely_15.precipitation : []
            },
            hourly: w.hourly.time.map((t, i) => ({
                epoch: new Date(t).getTime() / 1000,
                fullDate: t.replace('T', ' '),
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

        // Guardar caché
        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Open-Meteo (Fix Nombres) en puerto ${PORT}`));