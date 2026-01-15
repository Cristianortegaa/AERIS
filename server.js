require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- 1. BASE DE DATOS (Caché v9 - Features Nuevas) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v9.sqlite', 
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- 2. BASE DE DATOS LOCAL DE CIUDADES (Para Búsqueda y Geo) ---
// Lista de las principales ciudades para mapear coordenadas -> ID AEMET
const CITIES_DB = [
    { id: '28079', name: 'Madrid', lat: 40.4168, lon: -3.7038 },
    { id: '08019', name: 'Barcelona', lat: 41.3851, lon: 2.1734 },
    { id: '46250', name: 'Valencia', lat: 39.4699, lon: -0.3763 },
    { id: '41091', name: 'Sevilla', lat: 37.3891, lon: -5.9845 },
    { id: '50297', name: 'Zaragoza', lat: 41.6488, lon: -0.8891 },
    { id: '29067', name: 'Málaga', lat: 36.7213, lon: -4.4214 },
    { id: '30030', name: 'Murcia', lat: 37.9922, lon: -1.1307 },
    { id: '07040', name: 'Palma', lat: 39.5696, lon: 2.6502 },
    { id: '35016', name: 'Las Palmas de Gran Canaria', lat: 28.1235, lon: -15.4363 },
    { id: '48020', name: 'Bilbao', lat: 43.2630, lon: -2.9350 },
    { id: '03014', name: 'Alicante', lat: 38.3452, lon: -0.4810 },
    { id: '14021', name: 'Córdoba', lat: 37.8882, lon: -4.7794 },
    { id: '47186', name: 'Valladolid', lat: 41.6523, lon: -4.7245 },
    { id: '36057', name: 'Vigo', lat: 42.2406, lon: -8.7207 },
    { id: '33024', name: 'Gijón', lat: 43.5322, lon: -5.6611 },
    { id: '01059', name: 'Vitoria-Gasteiz', lat: 42.8467, lon: -2.6716 },
    { id: '15030', name: 'A Coruña', lat: 43.3623, lon: -8.4115 },
    { id: '18087', name: 'Granada', lat: 37.1773, lon: -3.5986 },
    { id: '03065', name: 'Elche', lat: 38.2669, lon: -0.6983 },
    { id: '33044', name: 'Oviedo', lat: 43.3619, lon: -5.8494 },
    { id: '28065', name: 'Getafe', lat: 40.3083, lon: -3.7327 },
    { id: '28089', name: 'Moraleja de Enmedio', lat: 40.2625, lon: -3.8631 },
    { id: '06126', name: 'Siruela', lat: 38.9766, lon: -5.0521 },
    { id: '45013', name: 'Almorox', lat: 40.2312, lon: -4.3906 },
    { id: '28074', name: 'Leganés', lat: 40.3280, lon: -3.7635 },
    { id: '28058', name: 'Fuenlabrada', lat: 40.2842, lon: -3.7942 },
    { id: '28005', name: 'Alcalá de Henares', lat: 40.4818, lon: -3.3643 },
    { id: '28007', name: 'Alcorcón', lat: 40.3458, lon: -3.8249 },
    { id: '09059', name: 'Burgos', lat: 42.3439, lon: -3.6969 },
    { id: '39075', name: 'Santander', lat: 43.4623, lon: -3.8099 },
    { id: '12040', name: 'Castellón de la Plana', lat: 39.9864, lon: -0.0513 },
    { id: '26089', name: 'Logroño', lat: 42.4623, lon: -2.4449 },
    { id: '06015', name: 'Badajoz', lat: 38.8794, lon: -6.9706 },
    { id: '37274', name: 'Salamanca', lat: 40.9701, lon: -5.6635 },
    { id: '21041', name: 'Huelva', lat: 37.2614, lon: -6.9447 },
    { id: '28006', name: 'Alcobendas', lat: 40.5475, lon: -3.6421 },
    { id: '28148', name: 'Torrejón de Ardoz', lat: 40.4554, lon: -3.4697 }
];

// --- 3. LOGICA AUXILIAR (Iconos y Distancia) ---

// Fórmula de Haversine para calcular distancia en KM
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radio de la tierra en km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
};

const getIcon = (code) => {
    const cleanCode = code ? String(code).replace(/\D/g, '') : '11'; 
    const iconMap = {
        '11': 'bi-sun-fill', '12': 'bi-cloud-sun-fill', '13': 'bi-cloud-sun',
        '14': 'bi-cloud-fill', '15': 'bi-clouds-fill', '16': 'bi-clouds',
        '17': 'bi-cloud-haze-fill', '81': 'bi-cloud-fog2-fill', '82': 'bi-cloud-fog2-fill',
        '43': 'bi-cloud-drizzle-fill', '44': 'bi-cloud-drizzle', '45': 'bi-cloud-rain-fill',
        '46': 'bi-cloud-rain-heavy-fill', '23': 'bi-cloud-rain-heavy', '24': 'bi-cloud-rain-heavy-fill',
        '25': 'bi-cloud-rain-heavy-fill', '26': 'bi-cloud-rain-heavy-fill',
        '51': 'bi-cloud-lightning-fill', '52': 'bi-cloud-lightning-rain-fill',
        '53': 'bi-cloud-lightning-rain-fill', '54': 'bi-cloud-lightning-rain-fill',
        '61': 'bi-cloud-lightning', '33': 'bi-cloud-snow', '34': 'bi-cloud-snow',
        '35': 'bi-cloud-snow-fill', '36': 'bi-cloud-snow-fill', '71': 'bi-cloud-snow',
        '72': 'bi-cloud-snow', '73': 'bi-cloud-snow-fill', '74': 'bi-cloud-snow-fill'
    };
    return iconMap[cleanCode] || 'bi-cloud-sun';
};

// --- 4. PARSEO DE DATOS (Logica V8 intacta) ---
const parseAemetData = (rawData) => {
    if (!rawData || !rawData[0] || !rawData[0].prediccion) return [];
    
    return rawData[0].prediccion.dia.map(dia => {
        let rainMax = 0;
        if (Array.isArray(dia.probPrecipitacion)) {
            const values = dia.probPrecipitacion.map(p => parseInt(p.value)).filter(v => !isNaN(v));
            rainMax = Math.max(...values, 0);
        }

        const findValid = (arr) => {
            if (!arr || arr.length === 0) return null;
            return arr.find(x => x.periodo === '12-24') || arr.find(x => x.periodo === '00-24') || arr[0];
        };

        const cieloObj = findValid(dia.estadoCielo);
        const vientoObj = findValid(dia.viento);

        let iconoFinal = getIcon(cieloObj?.value);
        let descFinal = cieloObj?.descripcion || 'Sin datos';
        let vientoVel = vientoObj?.velocidad ? parseInt(vientoObj.velocidad) : 0;
        let uvMax = dia.uvMax || 0;

        if (rainMax >= 35 && !iconoFinal.includes('rain') && !iconoFinal.includes('snow') && !iconoFinal.includes('lightning')) {
            iconoFinal = 'bi-cloud-rain-fill'; 
        }
        const esIconoLluvia = iconoFinal.includes('rain') || iconoFinal.includes('drizzle') || iconoFinal.includes('lightning');
        if (rainMax === 0 && esIconoLluvia) {
            iconoFinal = 'bi-cloud-sun';
            descFinal = 'Intervalos nubosos';
        }

        const periodosNombres = ['00-06', '06-12', '12-18', '18-24'];
        let periodosOutput = [];

        if (dia.probPrecipitacion.length >= 3) {
            periodosOutput = periodosNombres.map(r => {
                const p = dia.probPrecipitacion.find(e => e.periodo === r);
                const v = dia.viento.find(e => e.periodo === r);
                const c = dia.estadoCielo.find(e => e.periodo === r);
                return {
                    horario: r,
                    probLluvia: p ? parseInt(p.value || 0) : 0,
                    vientoVel: v ? parseInt(v.velocidad || 0) : 0,
                    icono: getIcon(c?.value)
                };
            });
        } else {
            periodosOutput = periodosNombres.map(r => ({
                horario: r,
                probLluvia: rainMax,
                vientoVel: vientoVel,
                icono: iconoFinal
            }));
        }

        return {
            fecha: dia.fecha,
            tempMax: dia.temperatura.maxima,
            tempMin: dia.temperatura.minima,
            iconoGeneral: iconoFinal,
            descripcionGeneral: descFinal,
            uv: uvMax,
            periodos: periodosOutput
        };
    });
};

// --- 5. ENDPOINTS API ---

// A. Buscador de Municipios
app.get('/api/search/:query', (req, res) => {
    const query = req.params.query.toLowerCase();
    const results = CITIES_DB.filter(city => city.name.toLowerCase().includes(query)).slice(0, 5); // Max 5 resultados
    res.json(results);
});

// B. Geolocalización (Buscar ciudad más cercana)
app.get('/api/geo', (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "Faltan coordenadas" });

    let closestCity = null;
    let minDistance = Infinity;

    CITIES_DB.forEach(city => {
        const dist = getDistanceFromLatLonInKm(lat, lon, city.lat, city.lon);
        if (dist < minDistance) {
            minDistance = dist;
            closestCity = city;
        }
    });

    if (closestCity) {
        res.json(closestCity);
    } else {
        res.status(404).json({ error: "No se encontró ciudad cercana" });
    }
});

// C. Alertas Meteorológicas (Simulación basada en predicción)
app.get('/api/alerts/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Si no hay caché o es vieja, en un caso real llamaríamos a la API weather.
        // Asumimos que el frontend llama primero a /weather y llena la caché.
        if (!cache) return res.json({ alert: null }); // Sin datos no hay alerta

        const weatherData = JSON.parse(cache.data);
        const today = weatherData[0];
        
        let alert = null;
        
        // Calcular máximos de hoy
        const maxRain = Math.max(...today.periodos.map(p => p.probLluvia));
        const maxWind = Math.max(...today.periodos.map(p => p.vientoVel));
        const tempMax = today.tempMax;

        // Lógica de Alertas
        if (maxWind >= 50) {
            alert = { type: 'wind', level: 'warning', msg: `Aviso: Rachas de viento fuertes (${maxWind} km/h)`, icon: 'bi-wind' };
        } else if (maxRain >= 80) {
            alert = { type: 'rain', level: 'warning', msg: `Precaución: Probabilidad alta de lluvia intensa (${maxRain}%)`, icon: 'bi-cloud-rain-heavy-fill' };
        } else if (tempMax >= 38) {
            alert = { type: 'heat', level: 'danger', msg: `Alerta de Calor: Temperaturas extremas (${tempMax}°C)`, icon: 'bi-thermometer-sun' };
        } else if (tempMax <= 0) {
            alert = { type: 'cold', level: 'info', msg: `Aviso de Heladas: Temperaturas bajo cero`, icon: 'bi-thermometer-snow' };
        }

        res.json({ alert });

    } catch (error) {
        console.error("Error Alertas:", error);
        res.status(500).json({ alert: null });
    }
});

// D. Endpoint Principal del Tiempo
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        if (cache && (new Date() - new Date(cache.updatedAt) < 20 * 60 * 1000)) {
            return res.json(JSON.parse(cache.data));
        }

        if (!process.env.AEMET_API_KEY) throw new Error("Falta API Key");
        
        const urlRes = await axios.get(`https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/${locationId}`, { 
            headers: { 'api_key': process.env.AEMET_API_KEY } 
        });

        if (urlRes.data.estado !== 200) return res.status(404).json({error: "Error AEMET"});
        const weatherRes = await axios.get(urlRes.data.datos);
        
        const cleanData = parseAemetData(weatherRes.data);
        
        await WeatherCache.upsert({
            locationId: locationId,
            data: JSON.stringify(cleanData),
            updatedAt: new Date()
        });

        res.json(cleanData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error Servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris v9 (Geo & Search) en puerto ${PORT}`));