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

// --- BASE DE DATOS (Caché v16 - Nueva estructura) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v16.sqlite',
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    dailyData: { type: DataTypes.TEXT },
    hourlyData: { type: DataTypes.TEXT },
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

const parseCoordinate = (coordStr) => {
    if (!coordStr) return 0;
    const regex = /(\d+)(\d{2})(\d{2})([NSEW])/;
    const match = coordStr.match(regex);
    if (!match) return 0;
    const deg = parseInt(match[1]);
    const min = parseInt(match[2]);
    const sec = parseInt(match[3]);
    const dir = match[4];
    let decimal = deg + (min / 60) + (sec / 3600);
    if (dir === 'S' || dir === 'W') decimal = decimal * -1;
    return decimal;
};

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
};

const getIcon = (code) => {
    const cleanCode = code ? String(code).replace(/\D/g, '') : '11'; 
    const iconMap = {
        '11': 'bi-sun-fill', '12': 'bi-cloud-sun-fill', '13': 'bi-cloud-sun', '14': 'bi-cloud-fill', '15': 'bi-clouds-fill', '16': 'bi-clouds', '17': 'bi-cloud-haze-fill', '81': 'bi-cloud-fog2-fill', '82': 'bi-cloud-fog2-fill', '43': 'bi-cloud-drizzle-fill', '44': 'bi-cloud-drizzle', '45': 'bi-cloud-rain-fill', '46': 'bi-cloud-rain-heavy-fill', '23': 'bi-cloud-rain-heavy', '24': 'bi-cloud-rain-heavy-fill', '25': 'bi-cloud-rain-heavy-fill', '26': 'bi-cloud-rain-heavy-fill', '51': 'bi-cloud-lightning-fill', '52': 'bi-cloud-lightning-rain-fill', '53': 'bi-cloud-lightning-rain-fill', '54': 'bi-cloud-lightning-rain-fill', '61': 'bi-cloud-lightning', '33': 'bi-cloud-snow', '34': 'bi-cloud-snow', '35': 'bi-cloud-snow-fill', '36': 'bi-cloud-snow-fill', '71': 'bi-cloud-snow', '72': 'bi-cloud-snow', '73': 'bi-cloud-snow-fill', '74': 'bi-cloud-snow-fill'
    };
    return iconMap[cleanCode] || 'bi-cloud-sun';
};

const loadAllCities = async () => {
    const filePath = './cities_full.json';
    if (fs.existsSync(filePath)) {
        console.log("📂 Cargando municipios extra...");
        const extraCities = JSON.parse(fs.readFileSync(filePath));
        const currentIds = new Set(CITIES_DB.map(c => c.id));
        extraCities.forEach(c => { if(!currentIds.has(c.id)) CITIES_DB.push(c); });
        return;
    }
    console.log("⚠️ Usando lista manual de respaldo.");
};

// --- PARSEADOR DIARIO ---
const parseAemetData = (rawData) => {
    if (!rawData || !rawData[0] || !rawData[0].prediccion) return [];
    return rawData[0].prediccion.dia.map(dia => {
        let rainMax = 0;
        if (Array.isArray(dia.probPrecipitacion)) {
            const values = dia.probPrecipitacion.map(p => parseInt(p.value)).filter(v => !isNaN(v));
            rainMax = Math.max(...values, 0);
        }

        const findData = (collection, targetStart, targetEnd) => {
            if (!collection || collection.length === 0) return null;
            const exact = collection.find(x => x.periodo === `${targetStart}-${targetEnd}`);
            if (exact) return exact;
            return collection.find(x => x.periodo === '00-24') || collection[0];
        };

        const periodosStandard = ['00-06', '06-12', '12-18', '18-24'];
        const periodosOutput = periodosStandard.map(rango => {
            const [start, end] = rango.split('-');
            const p = findData(dia.probPrecipitacion, start, end);
            const v = findData(dia.viento, start, end);
            const c = findData(dia.estadoCielo, start, end);
            let probVal = p ? parseInt(p.value) : 0;
            if (isNaN(probVal)) probVal = 0;
            return {
                horario: rango,
                probLluvia: probVal,
                vientoVel: v ? (parseInt(v.velocidad) || 0) : 0,
                vientoRot: v ? (parseInt(v.direccion) || 0) : 0,
                icono: getIcon(c?.value)
            };
        });

        const mainSky = findData(dia.estadoCielo, '12', '18') || dia.estadoCielo[0];
        let iconoFinal = getIcon(mainSky?.value);
        let descFinal = mainSky?.descripcion || 'Variable';
        if (rainMax >= 60 && !iconoFinal.includes('rain') && !iconoFinal.includes('lightning')) iconoFinal = 'bi-cloud-rain-fill';

        return {
            fecha: dia.fecha, 
            tempMax: dia.temperatura.maxima, 
            tempMin: dia.temperatura.minima,
            iconoGeneral: iconoFinal, 
            descripcionGeneral: descFinal, 
            uv: dia.uvMax || 0,
            periodos: periodosOutput
        };
    });
};

// --- 🔥 PARSEADOR HORARIO (EXTRAE MÁS DATOS) 🔥 ---
const parseAemetHourly = (hourlyRaw, dailyClean) => {
    if (!hourlyRaw || !hourlyRaw[0] || !hourlyRaw[0].prediccion) return [];
    
    let hourlyCombined = [];
    const dias = hourlyRaw[0].prediccion.dia; 

    dias.forEach(diaH => {
        const fechaBase = diaH.fecha; 
        const dailyMatch = dailyClean.find(d => d.fecha === fechaBase);

        if(diaH.estadoCielo && Array.isArray(diaH.estadoCielo)){
            diaH.estadoCielo.forEach(item => {
                const horaStr = item.periodo;
                if(!horaStr) return;
                const horaInt = parseInt(horaStr);

                // --- EXTRACCIÓN DE DATOS PRECISOS ---
                const tempObj = diaH.temperatura.find(t => t.periodo === horaStr);
                const sensObj = diaH.sensTermica ? diaH.sensTermica.find(t => t.periodo === horaStr) : null;
                const humObj = diaH.humedadRelativa ? diaH.humedadRelativa.find(t => t.periodo === horaStr) : null;
                // AEMET no da presión horaria exacta en este endpoint, usaremos una simulación lógica en front o dato diario si hubiese
                
                let probRain = 0;
                if(dailyMatch) {
                    let periodoKey = '';
                    if (horaInt >= 0 && horaInt < 6) periodoKey = '00-06';
                    else if (horaInt >= 6 && horaInt < 12) periodoKey = '06-12';
                    else if (horaInt >= 12 && horaInt < 18) periodoKey = '12-18';
                    else periodoKey = '18-24';
                    const periodoFound = dailyMatch.periodos.find(p => p.horario === periodoKey);
                    if(periodoFound) probRain = periodoFound.probLluvia;
                }

                hourlyCombined.push({
                    fullDate: `${fechaBase}T${horaStr}:00:00`,
                    date: fechaBase,
                    hour: horaInt,
                    temp: tempObj ? parseInt(tempObj.value) : 0,
                    feelsLike: sensObj ? parseInt(sensObj.value) : (tempObj ? parseInt(tempObj.value) : 0), // Nuevo
                    humidity: humObj ? parseInt(humObj.value) : 50, // Nuevo
                    rainProb: probRain, 
                    icon: getIcon(item.value),
                    desc: item.descripcion
                });
            });
        }
    });

    const nowMadrid = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Madrid"}));
    const currentYear = nowMadrid.getFullYear();
    const currentMonth = String(nowMadrid.getMonth() + 1).padStart(2, '0');
    const currentDay = String(nowMadrid.getDate()).padStart(2, '0');
    const todayMadridStr = `${currentYear}-${currentMonth}-${currentDay}`;
    const currentHourMadrid = nowMadrid.getHours();

    return hourlyCombined.filter(h => {
        if (h.date > todayMadridStr) return true;
        if (h.date === todayMadridStr && h.hour >= currentHourMadrid) return true;
        return false;
    }).slice(0, 24);
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
    let closest = null, minD = Infinity;
    CITIES_DB.forEach(c => {
        const d = getDistanceFromLatLonInKm(lat, lon, c.lat, c.lon);
        if (d < minD) { minD = d; closest = c; }
    });
    res.json(closest || { error: "No encontrada" });
});

app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        if (cache && (new Date() - new Date(cache.updatedAt) < 30 * 60 * 1000)) {
            return res.json({
                daily: JSON.parse(cache.dailyData),
                hourly: JSON.parse(cache.hourlyData || '[]')
            });
        }

        if (!process.env.AEMET_API_KEY) throw new Error("Falta API Key");

        const urlResDaily = await axios.get(`https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/${locationId}`, { headers: { 'api_key': process.env.AEMET_API_KEY } });
        const weatherResDaily = await axios.get(urlResDaily.data.datos);
        const cleanDaily = parseAemetData(weatherResDaily.data);

        const urlResHourly = await axios.get(`https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/horaria/${locationId}`, { headers: { 'api_key': process.env.AEMET_API_KEY } });
        const weatherResHourly = await axios.get(urlResHourly.data.datos);
        
        const cleanHourly = parseAemetHourly(weatherResHourly.data, cleanDaily);

        await WeatherCache.upsert({ 
            locationId: locationId, 
            dailyData: JSON.stringify(cleanDaily), 
            hourlyData: JSON.stringify(cleanHourly),
            updatedAt: new Date() 
        });

        res.json({ daily: cleanDaily, hourly: cleanHourly });

    } catch (error) {
        console.error(error);
        try { 
            const cache = await WeatherCache.findByPk(locationId);
            if(cache) return res.json({ daily: JSON.parse(cache.dailyData), hourly: JSON.parse(cache.hourlyData || '[]') });
        } catch(e) {}
        res.status(500).json({ error: "Error Servidor AEMET" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Aeris V16 en puerto ${PORT}`);
    await loadAllCities();
});