const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- BASE DE DATOS (Caché) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_cache_om.sqlite',
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- DICCIONARIO WMO (Traductor de códigos Open-Meteo a Texto/Iconos) ---
const decodeWMO = (code, isDay = 1) => {
    // Códigos: https://open-meteo.com/en/docs
    const c = parseInt(code);
    const daySuffix = isDay ? 'sun' : 'moon'; // Para iconos día/noche
    
    // 0: Despejado
    if (c === 0) return { text: "Despejado", icon: isDay ? 'bi-sun' : 'bi-moon' };
    // 1-3: Nublado
    if (c === 1) return { text: "Mayormente despejado", icon: isDay ? 'bi-cloud-sun' : 'bi-cloud-moon' };
    if (c === 2) return { text: "Parcialmente nublado", icon: isDay ? 'bi-cloud' : 'bi-cloud-moon' };
    if (c === 3) return { text: "Cielo cubierto", icon: 'bi-clouds' };
    // 45-48: Niebla
    if ([45, 48].includes(c)) return { text: "Niebla", icon: 'bi-cloud-haze2' };
    // 51-57: Llovizna
    if ([51, 53, 55, 56, 57].includes(c)) return { text: "Llovizna", icon: 'bi-cloud-drizzle' };
    // 61-67: Lluvia
    if ([61, 63, 65, 66, 67].includes(c)) return { text: "Lluvia", icon: 'bi-cloud-rain' };
    // 71-77: Nieve
    if ([71, 73, 75, 77].includes(c)) return { text: "Nieve", icon: 'bi-cloud-snow' };
    // 80-82: Chubascos
    if ([80, 81, 82].includes(c)) return { text: "Chubascos", icon: 'bi-cloud-rain-heavy' };
    // 85-86: Chubascos Nieve
    if ([85, 86].includes(c)) return { text: "Nieve fuerte", icon: 'bi-snow' };
    // 95-99: Tormenta
    if ([95, 96, 99].includes(c)) return { text: "Tormenta", icon: 'bi-cloud-lightning-rain' };
    
    return { text: "Desconocido", icon: 'bi-cloud' };
};

// --- API BÚSQUEDA (Geocoding Open-Meteo) ---
app.get('/api/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=es&format=json`;
        const response = await axios.get(url);
        
        if (!response.data.results) return res.json([]);

        // Mapeamos al formato que espera el Frontend
        const cities = response.data.results.map(city => ({
            id: `${city.latitude},${city.longitude}`, // USAMOS LAT,LON COMO ID
            name: city.name,
            region: city.admin1 || city.admin2 || '',
            country: city.country,
            lat: city.latitude,
            lon: city.longitude
        }));
        res.json(cities);
    } catch (e) {
        console.error("Search Error:", e.message);
        res.json([]);
    }
});

// --- API GEO (Reverse Geocoding) ---
app.get('/api/geo', async (req, res) => {
    // Open-Meteo no tiene Reverse Geocoding nativo fácil, devolvemos lat,lon directo
    // El frontend ya maneja lat,lon, así que simulamos un objeto ciudad
    const { lat, lon } = req.query;
    res.json({
        id: `${lat},${lon}`,
        name: `Ubicación (${Number(lat).toFixed(2)}, ${Number(lon).toFixed(2)})`, // Nombre genérico temporal
        region: '',
        lat: lat,
        lon: lon
    });
});

// --- API WEATHER (Open-Meteo Full) ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id; // Puede ser "40.41,-3.7" o "Madrid"
    
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Cache 15 minutos
        if (cache && (new Date() - new Date(cache.updatedAt) < 15 * 60 * 1000)) {
            return res.json(JSON.parse(cache.data));
        }

        // 1. Obtener Coordenadas
        let lat, lon, cityName = "Ubicación";
        let regionName = "";

        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
            // Intentamos recuperar nombre real si tenemos suerte (opcional), si no, usamos ID
        } else {
            // Si llega un nombre (legacy), buscamos coordenadas primero
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationId)}&count=1&language=es&format=json`;
            const geoRes = await axios.get(geoUrl);
            if (!geoRes.data.results) throw new Error("Ciudad no encontrada");
            lat = geoRes.data.results[0].latitude;
            lon = geoRes.data.results[0].longitude;
            cityName = geoRes.data.results[0].name;
            regionName = geoRes.data.results[0].admin1 || "";
        }

        // 2. Pedir DATOS CLIMA + CALIDAD AIRE (Paralelo)
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto`;
        
        const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`;

        const [weatherRes, airRes] = await Promise.all([
            axios.get(weatherUrl),
            axios.get(airUrl).catch(() => ({ data: { current: {} } })) // Si falla aire, no romper
        ]);

        const w = weatherRes.data;
        const a = airRes.data;

        // 3. Traducir al formato de tu App (WeatherAPI Style)
        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);
        
        const finalData = {
            location: {
                name: cityName === "Ubicación" ? locationId : cityName, // Fallback nombre
                region: regionName,
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
                uv: w.daily.uv_index_max[0], // Usamos el max del día como referencia hoy
                aqi: a.current.us_aqi || 1,
                pm25: a.current.pm2_5 || 0,
                pm10: a.current.pm10 || 0
            },
            // Gráfico de lluvia (Minutely 15)
            nowcast: {
                time: w.minutely_15.time,
                precipitation: w.minutely_15.precipitation
            },
            // Horas
            hourly: w.hourly.time.map((t, i) => {
                const hourWMO = decodeWMO(w.hourly.weather_code[i], w.hourly.is_day[i]);
                return {
                    epoch: new Date(t).getTime() / 1000,
                    fullDate: t.replace('T', ' '), // Formato ISO a "YYYY-MM-DD HH:MM"
                    temp: Math.round(w.hourly.temperature_2m[i]),
                    rainProb: w.hourly.precipitation_probability[i],
                    icon: hourWMO.icon
                };
            }),
            // Días
            daily: w.daily.time.map((t, i) => {
                const dayWMO = decodeWMO(w.daily.weather_code[i], 1);
                return {
                    fecha: t,
                    tempMax: Math.round(w.daily.temperature_2m_max[i]),
                    tempMin: Math.round(w.daily.temperature_2m_min[i]),
                    uv: w.daily.uv_index_max[i],
                    sunrise: w.daily.sunrise[i].split('T')[1],
                    sunset: w.daily.sunset[i].split('T')[1],
                    icon: dayWMO.icon,
                    desc: dayWMO.text,
                    rainProbMax: w.daily.precipitation_probability_max[i]
                };
            })
        };

        // Si buscamos por coordenadas, intentamos dar un nombre mejor en el caché si podemos (opcional)
        // Por ahora guardamos
        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Error obteniendo datos de Open-Meteo" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris Open-Meteo Edition en puerto ${PORT}`));