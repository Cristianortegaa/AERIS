require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.static('public'));

app.use((req, res, next) => {
    res.header('Content-Type', 'application/json; charset=utf-8');
    next();
});

// --- BASE DE DATOS LIMPIA (V22) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v22.sqlite', // Nombre nuevo para forzar limpieza
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- LISTA DE CIUDADES SEGURA (Para que no falle al cargar) ---
let CITIES_DB = [
    { id: '28079', name: 'Madrid', lat: 40.4168, lon: -3.7038 },
    { id: '08019', name: 'Barcelona', lat: 41.3851, lon: 2.1734 },
    { id: '46250', name: 'Valencia', lat: 39.4699, lon: -0.3763 },
    { id: '41091', name: 'Sevilla', lat: 37.3891, lon: -5.9845 },
    { id: '28065', name: 'Getafe', lat: 40.3083, lon: -3.7327 },
    { id: '28092', name: 'Móstoles', lat: 40.3224, lon: -3.8695 },
    { id: '29067', name: 'Málaga', lat: 36.7213, lon: -4.4216 },
    { id: '48020', name: 'Bilbao', lat: 43.2630, lon: -2.9350 },
    { id: '50297', name: 'Zaragoza', lat: 41.6488, lon: -0.8891 },
    { id: '03014', name: 'Alicante', lat: 38.3452, lon: -0.4810 },
    { id: '14021', name: 'Córdoba', lat: 37.8882, lon: -4.7794 },
    { id: '47186', name: 'Valladolid', lat: 41.6523, lon: -4.7245 },
    { id: '36057', name: 'Vigo', lat: 42.2406, lon: -8.7207 },
    { id: '33044', name: 'Gijón', lat: 43.5322, lon: -5.6611 }
];

// ICONOS
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

app.get('/api/search/:query', (req, res) => {
    const q = req.params.query.toLowerCase();
    res.json(CITIES_DB.filter(c => c.name.toLowerCase().includes(q)).slice(0, 10));
});

app.get('/api/geo', (req, res) => {
    const { lat, lon } = req.query;
    if(!lat || !lon) return res.status(400).json({error:"Faltan datos"});
    // Simple mock: devuelve Madrid si no encuentra nada cercano para no romper
    res.json(CITIES_DB[0]); 
});

app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    const city = CITIES_DB.find(c => c.id === locationId);
    
    if(!city) return res.status(404).json({error: "Ciudad no encontrada (Usa las de la lista por ahora)"});

    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Cache 15 min
        if (cache && (new Date() - new Date(cache.updatedAt) < 15 * 60 * 1000)) {
            return res.json(JSON.parse(cache.data));
        }

        if (!process.env.WEATHER_API_KEY) throw new Error("Falta WEATHER_API_KEY en .env");

        // PETICIÓN A WEATHERAPI
        const url = `http://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_API_KEY}&q=${city.lat},${city.lon}&days=3&aqi=no&alerts=no&lang=es`;
        const response = await axios.get(url);
        const data = response.data;

        // FORMATO PARA FRONTEND
        const finalData = {
            current: {
                temp: Math.round(data.current.temp_c),
                feelsLike: Math.round(data.current.feelslike_c),
                humidity: data.current.humidity,
                pressure: data.current.pressure_mb,
                windSpeed: Math.round(data.current.wind_kph),
                desc: data.current.condition.text,
                icon: mapIcon(data.current.condition.code, data.current.is_day),
                isDay: data.current.is_day,
                uv: data.current.uv
            },
            hourly: [
                ...data.forecast.forecastday[0].hour,
                ...data.forecast.forecastday[1].hour
            ].map(h => ({
                fullDate: h.time, 
                epoch: h.time_epoch,
                temp: Math.round(h.temp_c),
                rainProb: h.chance_of_rain,
                icon: mapIcon(h.condition.code, h.is_day),
                desc: h.condition.text
            })),
            daily: data.forecast.forecastday.map(d => ({
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

        await WeatherCache.upsert({ locationId: locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ error: "Error de servidor o API Key inválida" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Aeris V22 (Final Fix) en puerto ${PORT}`);
});