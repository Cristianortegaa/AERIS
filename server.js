require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- BASE DE DATOS (Caché Optimizado) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_cache_db.sqlite',
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// Iniciamos DB una sola vez al arrancar
sequelize.sync().then(() => console.log("💾 Base de datos lista"));

// --- TRADUCTOR DE CLIMA (WMO Codes) ---
const decodeWMO = (code, isDay = 1) => {
    const c = parseInt(code);
    if (c === 0) return { text: "Despejado", icon: isDay ? 'bi-sun' : 'bi-moon' };
    if (c === 1) return { text: "Mayormente despejado", icon: isDay ? 'bi-cloud-sun' : 'bi-cloud-moon' };
    if (c === 2) return { text: "Parcialmente nublado", icon: isDay ? 'bi-cloud' : 'bi-cloud-moon' };
    if (c === 3) return { text: "Cielo cubierto", icon: 'bi-clouds' };
    if ([45, 48].includes(c)) return { text: "Niebla", icon: 'bi-cloud-haze2' };
    if ([51, 53, 55, 56, 57].includes(c)) return { text: "Llovizna", icon: 'bi-cloud-drizzle' };
    if ([61, 63, 65, 66, 67].includes(c)) return { text: "Lluvia", icon: 'bi-cloud-rain' };
    if ([71, 73, 75, 77].includes(c)) return { text: "Nieve", icon: 'bi-cloud-snow' };
    if ([80, 81, 82].includes(c)) return { text: "Chubascos", icon: 'bi-cloud-rain-heavy' };
    if ([85, 86].includes(c)) return { text: "Nieve fuerte", icon: 'bi-snow' };
    if ([95, 96, 99].includes(c)) return { text: "Tormenta", icon: 'bi-cloud-lightning-rain' };
    return { text: "Variable", icon: 'bi-cloud' };
};

// --- API BÚSQUEDA (Geocoding) ---
app.get('/api/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        // Buscamos ciudades
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=es&format=json`;
        const response = await axios.get(url);
        
        if (!response.data.results) return res.json([]);

        // Formateamos para el frontend
        const cities = response.data.results.map(city => ({
            id: `${city.latitude},${city.longitude}`, // El ID son las coordenadas
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

// --- API GEO (Ubicación actual) ---
app.get('/api/geo', (req, res) => {
    // Simplemente rebotamos las coordenadas con un nombre genérico
    // El frontend se encargará de ponerle nombre si lo tiene guardado
    const { lat, lon } = req.query;
    res.json({
        id: `${lat},${lon}`,
        name: "Mi Ubicación",
        region: "Localizado por GPS",
        lat: lat,
        lon: lon
    });
});

// --- API CLIMA (Weather Full) ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id; // "lat,lon"
    const forcedName = req.query.name; // Nombre forzado desde el frontend
    const forcedRegion = req.query.region;

    try {
        // Cache Check
        const cache = await WeatherCache.findByPk(locationId);
        if (cache && (new Date() - new Date(cache.updatedAt) < 10 * 60 * 1000)) {
            // Si usamos caché, inyectamos el nombre actualizado si viene en la query
            const cachedData = JSON.parse(cache.data);
            if (forcedName) cachedData.location.name = forcedName;
            if (forcedRegion) cachedData.location.region = forcedRegion;
            return res.json(cachedData);
        }

        // Parsear coordenadas
        let lat, lon;
        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
        } else {
            return res.status(400).json({ error: "Formato ID inválido" });
        }

        // Peticiones paralelas a Open-Meteo (Clima + Aire)
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto`;
        const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`;

        const [wRes, aRes] = await Promise.all([
            axios.get(weatherUrl),
            axios.get(airUrl).catch(() => ({ data: { current: {} } })) // Si falla el aire, seguimos
        ]);

        const w = wRes.data;
        const a = aRes.data;
        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);

        // Construir respuesta
        const finalData = {
            location: {
                name: forcedName || "Ubicación",
                region: forcedRegion || "",
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

        // Guardar en caché
        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Error de servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Listo en puerto ${PORT}`));