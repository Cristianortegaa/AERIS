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

// --- BASE DE DATOS (Caché V20 - WeatherAPI) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v20.sqlite', 
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- LISTA DE MUNICIPIOS ---
let CITIES_DB = [
    { id: '28079', name: 'Madrid', lat: 40.4168, lon: -3.7038 },
    { id: '08019', name: 'Barcelona', lat: 41.3851, lon: 2.1734 },
    { id: '28065', name: 'Getafe', lat: 40.3083, lon: -3.7327 },
    { id: '46250', name: 'Valencia', lat: 39.4699, lon: -0.3763 },
    { id: '41091', name: 'Sevilla', lat: 37.3891, lon: -5.9845 },
    { id: '28092', name: 'Móstoles', lat: 40.3224, lon: -3.8695 },
    { id: '28074', name: 'Leganés', lat: 40.3280, lon: -3.7635 },
    { id: '28058', name: 'Fuenlabrada', lat: 40.2842, lon: -3.7942 },
    { id: '28005', name: 'Alcalá de Henares', lat: 40.4818, lon: -3.3643 },
    { id: '28007', name: 'Alcorcón', lat: 40.3458, lon: -3.8249 },
    { id: '06015', name: 'Badajoz', lat: 38.8794, lon: -6.9706 },
    { id: '15030', name: 'A Coruña', lat: 43.3623, lon: -8.4115 },
    { id: '18087', name: 'Granada', lat: 37.1773, lon: -3.5986 },
    { id: '48020', name: 'Bilbao', lat: 43.2630, lon: -2.9350 },
    { id: '26089', name: 'Logroño', lat: 42.4664, lon: -2.4456 }
];

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
};

// --- MAPEO DE ICONOS DE WEATHERAPI A BOOTSTRAP ---
// WeatherAPI da códigos numéricos. Los mapeamos a tus iconos.
const mapIcon = (code, isDay) => {
    // Códigos simplificados. WeatherAPI tiene muchos, agrupamos los principales.
    const c = parseInt(code);
    if (c === 1000) return isDay ? 'bi-sun' : 'bi-moon'; // Despejado
    if (c === 1003) return isDay ? 'bi-cloud-sun' : 'bi-cloud-moon'; // Parcialmente nublado
    if (c === 1006 || c === 1009) return 'bi-clouds'; // Nublado
    if ([1030, 1135, 1147].includes(c)) return 'bi-cloud-haze2'; // Niebla
    if ([1063, 1180, 1183, 1186, 1189, 1240].includes(c)) return 'bi-cloud-drizzle'; // Lluvia ligera
    if ([1192, 1195, 1198, 1201, 1243, 1246].includes(c)) return 'bi-cloud-rain-heavy'; // Lluvia fuerte
    if ([1066, 1114, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(c)) return 'bi-cloud-snow'; // Nieve
    if ([1087, 1273, 1276, 1279, 1282].includes(c)) return 'bi-cloud-lightning-rain'; // Tormenta
    return 'bi-cloud'; // Por defecto
};

// --- CARGAR CIUDADES (Igual que antes) ---
const loadAllCities = async () => {
    const filePath = './cities_full.json';
    if (fs.existsSync(filePath)) {
        console.log("📂 Cargando municipios extra...");
        const extraCities = JSON.parse(fs.readFileSync(filePath));
        const currentIds = new Set(CITIES_DB.map(c => c.id));
        extraCities.forEach(c => { if(!currentIds.has(c.id)) CITIES_DB.push(c); });
    }
};

// --- ENDPOINTS ---
app.get('/api/search/:query', (req, res) => {
    const query = req.params.query.toLowerCase();
    const results = CITIES_DB.filter(city => city.name.toLowerCase().includes(query)).slice(0, 10);
    res.json(results);
});

app.get('/api/geo', (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "Faltan coordenadas" });
    let closest = CITIES_DB[0], minD = Infinity;
    CITIES_DB.forEach(c => {
        const d = getDistanceFromLatLonInKm(lat, lon, c.lat, c.lon);
        if (d < minD) { minD = d; closest = c; }
    });
    res.json(closest);
});

app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    const city = CITIES_DB.find(c => c.id === locationId);
    
    if(!city) return res.status(404).json({error: "Ciudad no encontrada"});

    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Cache 15 min
        if (cache && (new Date() - new Date(cache.updatedAt) < 15 * 60 * 1000)) {
            return res.json(JSON.parse(cache.data));
        }

        if (!process.env.WEATHER_API_KEY) throw new Error("Falta API Key de WeatherAPI");

        // 🔥 LLAMADA A WEATHERAPI.COM 🔥
        // Pedimos 3 días de previsión (days=3) y en español (lang=es)
        const url = `http://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_API_KEY}&q=${city.lat},${city.lon}&days=7&aqi=no&alerts=no&lang=es`;
        
        const response = await axios.get(url);
        const data = response.data;

        // Formatear datos para nuestro Frontend
        const current = data.current;
        const forecast = data.forecast.forecastday;

        const finalData = {
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
            // Aplanamos las horas de hoy y mañana
            hourly: [
                ...forecast[0].hour,
                ...forecast[1].hour
            ].map(h => ({
                fullDate: h.time, // "2023-10-27 14:00"
                epoch: h.time_epoch,
                temp: Math.round(h.temp_c),
                rainProb: h.chance_of_rain, // ¡DATO REAL!
                icon: mapIcon(h.condition.code, h.is_day),
                desc: h.condition.text
            })),
            daily: forecast.map(d => ({
                fecha: d.date,
                tempMax: Math.round(d.day.maxtemp_c),
                tempMin: Math.round(d.day.mintemp_c),
                uv: d.day.uv,
                sunrise: d.astro.sunrise, // "07:30 AM"
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
        console.error("WeatherAPI Error:", error.message);
        res.status(500).json({ error: "Error conectando con WeatherAPI" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Aeris V20 en puerto ${PORT}`);
    await loadAllCities();
});