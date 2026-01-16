require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

app.use((req, res, next) => {
    res.header('Content-Type', 'application/json; charset=utf-8');
    next();
});

// --- BASE DE DATOS CACHÉ (V23 - Search API) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v23.sqlite', 
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- ICONOS ---
const mapIcon = (code, isDay) => {
    const c = parseInt(code);
    if (c === 1000) return isDay ? 'bi-sun' : 'bi-moon';
    if (c === 1003) return isDay ? 'bi-cloud-sun' : 'bi-cloud-moon';
    if ([1006, 1009].includes(c)) return 'bi-clouds';
    if ([1030, 1135, 1147].includes(c)) return 'bi-cloud-haze2';
    if ([1063, 1180, 1183, 1186, 1189, 1240].includes(c)) return 'bi-cloud-drizzle';
    if ([1192, 1195, 1198, 1201, 1243, 1246].includes(c)) return 'bi-cloud-rain-heavy';
    if ([1066, 1114, 1210, 1213, 1216, 1219, 1222, 1225].includes(c)) return 'bi-cloud-snow';
    if ([1087, 1273, 1276, 1279, 1282].includes(c)) return 'bi-cloud-lightning-rain';
    return 'bi-cloud';
};

// --- ENDPOINT 1: BÚSQUEDA REAL (Cualquier pueblo de España) ---
app.get('/api/search/:query', async (req, res) => {
    const query = req.params.query;
    if (!process.env.WEATHER_API_KEY) return res.status(500).json([]);

    try {
        // Buscamos directamente en la API de WeatherAPI
        const url = `http://api.weatherapi.com/v1/search.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(query)}`;
        const response = await axios.get(url);
        
        // Devolvemos la lista de ciudades encontradas
        // Filtramos para limpiar un poco y asegurar formato
        const results = response.data.map(city => ({
            id: String(city.id), // WeatherAPI devuelve un ID único
            name: city.name,
            region: city.region, // Provincia/Comunidad
            country: city.country,
            lat: city.lat,
            lon: city.lon,
            url: city.url // Slug útil
        }));
        
        res.json(results);
    } catch (error) {
        console.error("Search Error:", error.message);
        res.json([]); // Devolver array vacío si falla para no romper front
    }
});

// --- ENDPOINT 2: GEOLOCALIZACIÓN INVERSA ---
app.get('/api/geo', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "Faltan coordenadas" });

    try {
        // Usamos la API Search con coordenadas ("q=lat,lon") para saber qué ciudad es
        const url = `http://api.weatherapi.com/v1/search.json?key=${process.env.WEATHER_API_KEY}&q=${lat},${lon}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.length > 0) {
            const city = response.data[0];
            res.json({
                id: String(city.id),
                name: city.name,
                region: city.region,
                lat: city.lat,
                lon: city.lon
            });
        } else {
            res.status(404).json({ error: "No encontrado" });
        }
    } catch (error) {
        res.status(500).json({ error: "Error Geo API" });
    }
});

// --- ENDPOINT 3: PREVISIÓN ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;

    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Cache 15 min
        if (cache && (new Date() - new Date(cache.updatedAt) < 15 * 60 * 1000)) {
            return res.json(JSON.parse(cache.data));
        }

        if (!process.env.WEATHER_API_KEY) throw new Error("Falta WEATHER_API_KEY");

        // Usamos "id:NUMERO" para buscar por ID exacto en WeatherAPI
        const query = locationId.startsWith('id:') ? locationId : `id:${locationId}`;
        
        const url = `http://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_API_KEY}&q=${query}&days=3&aqi=no&alerts=no&lang=es`;
        const response = await axios.get(url);
        const data = response.data;

        const current = data.current;
        const forecast = data.forecast.forecastday;

        const finalData = {
            location: {
                name: data.location.name,
                region: data.location.region
            },
            current: {
                temp: Math.round(current.temp_c),
                feelsLike: Math.round(current.feelslike_c),
                humidity: current.humidity,
                pressure: current.pressure_mb,
                windSpeed: Math.round(current.wind_kph),
                desc: current.condition.text,
                icon: mapIcon(current.condition.code, current.is_day),
                isDay: current.is_day === 1,
                uv: current.uv
            },
            hourly: [
                ...forecast[0].hour,
                ...(forecast[1] ? forecast[1].hour : [])
            ].map(h => ({
                fullDate: h.time, 
                epoch: h.time_epoch,
                temp: Math.round(h.temp_c),
                rainProb: h.chance_of_rain,
                icon: mapIcon(h.condition.code, h.is_day),
                desc: h.condition.text
            })),
            daily: forecast.map(d => ({
                fecha: d.date,
                tempMax: Math.round(d.day.maxtemp_c),
                tempMin: Math.round(d.day.mintemp_c),
                uv: d.day.uv,
                sunrise: d.astro.sunrise,
                sunset: d.astro.sunset,
                icon: mapIcon(d.day.condition.code, 1),
                desc: d.day.condition.text,
                rainProbMax: d.day.daily_chance_of_rain
            }))
        };

        await WeatherCache.upsert({ 
            locationId: locationId, 
            data: JSON.stringify(finalData), 
            updatedAt: new Date() 
        });

        res.json(finalData);

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Error WeatherAPI" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Aeris V23 (Global Search) en puerto ${PORT}`);
});