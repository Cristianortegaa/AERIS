require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- BASE DE DATOS ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v27.sqlite',
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

// --- API BÚSQUEDA ---
app.get('/api/search/:query', async (req, res) => {
    try {
        if (!process.env.WEATHER_API_KEY) throw new Error("Falta API Key");
        const url = `https://api.weatherapi.com/v1/search.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(req.params.query)}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (e) {
        res.json([]);
    }
});

// --- API GEO ---
app.get('/api/geo', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!process.env.WEATHER_API_KEY) throw new Error("Falta API Key");
        const url = `https://api.weatherapi.com/v1/search.json?key=${process.env.WEATHER_API_KEY}&q=${lat},${lon}`;
        const response = await axios.get(url);
        res.json(response.data[0]);
    } catch (e) {
        res.status(500).json({ error: "Geo Error" });
    }
});

// --- API PREVISIÓN ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Cache 10 min
        if (cache && (new Date() - new Date(cache.updatedAt) < 10 * 60 * 1000)) {
            return res.json(JSON.parse(cache.data));
        }

        const q = isNaN(locationId) ? locationId : `id:${locationId}`;
        const url = `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_API_KEY}&q=${q}&days=14&aqi=yes&alerts=no&lang=es`;
        
        const response = await axios.get(url);
        const data = response.data;

        // Extraer AQI
        const aqiData = data.current.air_quality || {};
        const usEpaIndex = aqiData['us-epa-index'] || 1; 

        const finalData = {
            location: { 
                name: data.location.name, 
                region: data.location.region,
                lat: data.location.lat,
                lon: data.location.lon
            },
            current: {
                temp: Math.round(data.current.temp_c),
                feelsLike: Math.round(data.current.feelslike_c), // YA ESTABA, PERO NOS ASEGURAMOS
                humidity: data.current.humidity,
                pressure: data.current.pressure_mb,
                windSpeed: Math.round(data.current.wind_kph),
                desc: data.current.condition.text,
                icon: mapIcon(data.current.condition.code, data.current.is_day),
                isDay: data.current.is_day === 1,
                uv: data.current.uv,
                aqi: usEpaIndex,
                pm25: Math.round(aqiData.pm2_5 || 0),
                pm10: Math.round(aqiData.pm10 || 0)
            },
            hourly: [
                ...data.forecast.forecastday[0].hour,
                ...(data.forecast.forecastday[1] ? data.forecast.forecastday[1].hour : [])
            ].map(h => ({
                epoch: h.time_epoch,
                fullDate: h.time,
                temp: Math.round(h.temp_c),
                rainProb: h.chance_of_rain,
                icon: mapIcon(h.condition.code, h.is_day)
            })),
            daily: data.forecast.forecastday.map(d => ({
                fecha: d.date,
                tempMax: Math.round(d.day.maxtemp_c),
                tempMin: Math.round(d.day.mintemp_c),
                uv: d.day.uv,
                sunrise: d.astro.sunrise, // AÑADIDO
                sunset: d.astro.sunset,   // AÑADIDO
                icon: mapIcon(d.day.condition.code, 1),
                desc: d.day.condition.text,
                rainProbMax: d.day.daily_chance_of_rain // YA ESTABA, NOS ASEGURAMOS
            }))
        };

        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Error obteniendo datos" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris V27 HTTPS en puerto ${PORT}`));