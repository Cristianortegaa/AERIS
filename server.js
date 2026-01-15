require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const fs = require('fs'); // Para guardar el listado de ciudades

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- 1. BASE DE DATOS METEOROLÓGICA (Caché) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v11.sqlite', 
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- 2. SISTEMA DE CIUDADES (CARGA MASIVA DE ESPAÑA) ---
let CITIES_DB = []; // Aquí vivirán los 8.000 municipios en memoria

// Utilidad: Convierte coordenadas AEMET (GradosMinutosSegundos) a Decimal (Google Maps)
// Ejemplo AEMET: "403040N" -> 40.5111...
const parseCoordinate = (coordStr) => {
    if (!coordStr) return 0;
    // Formato DDMMSSX (Ej: 413040N o 020510W)
    // A veces AEMET manda 6 caracteres, a veces 7. Ajustamos.
    const regex = /(\d+)(\d{2})(\d{2})([NSEW])/;
    const match = coordStr.match(regex);
    
    if (!match) return 0;
    
    const deg = parseInt(match[1]);
    const min = parseInt(match[2]);
    const sec = parseInt(match[3]);
    const dir = match[4];
    
    let decimal = deg + (min / 60) + (sec / 3600);
    
    if (dir === 'S' || dir === 'W') {
        decimal = decimal * -1;
    }
    return decimal;
};

// FUNCIÓN DE ARRANQUE: Cargar o Descargar Municipios
const loadAllCities = async () => {
    const filePath = './cities_full.json';

    // A. Si ya tenemos el archivo descargado, lo cargamos rápido
    if (fs.existsSync(filePath)) {
        console.log("📂 Cargando municipios desde archivo local...");
        const raw = fs.readFileSync(filePath);
        CITIES_DB = JSON.parse(raw);
        console.log(`✅ ¡Carga completada! ${CITIES_DB.length} municipios listos.`);
        return;
    }

    // B. Si no existe, lo pedimos a AEMET (Solo la primera vez)
    console.log("🌐 Descargando Listado Maestro de AEMET (Esto tarda unos segundos)...");
    
    if (!process.env.AEMET_API_KEY) {
        console.error("❌ ERROR: No hay API KEY, no puedo descargar las ciudades.");
        // Carga de emergencia (Top 5 para que no rompa)
        CITIES_DB = [{id:'28079', name:'Madrid', lat:40.4, lon:-3.7}, {id:'28065', name:'Getafe', lat:40.3, lon:-3.7}];
        return;
    }

    try {
        // 1. Pedir URL del maestro
        const resUrl = await axios.get('https://opendata.aemet.es/opendata/api/maestro/municipios', {
            headers: { 'api_key': process.env.AEMET_API_KEY }
        });
        
        if (resUrl.data.estado !== 200) throw new Error("AEMET denegó el acceso al maestro");

        // 2. Descargar el JSON gigante
        const resData = await axios.get(resRes.data.datos); // A veces AEMET devuelve un link, a veces datos.
        // Nota: A veces la variable es resUrl.data.datos. Corregimos flujo estándar:
        const dataUrl = resUrl.data.datos;
        const resJson = await axios.get(dataUrl);
        
        // 3. Procesar y Limpiar (AEMET da datos sucios)
        const rawCities = resJson.data; // Array gigante
        
        CITIES_DB = rawCities.map(c => ({
            id: c.id.replace('id', ''), // AEMET pone "id28079", lo dejamos en "28079"
            name: c.nombre,
            lat: parseCoordinate(c.latitud),
            lon: parseCoordinate(c.longitud)
        }));

        // 4. Guardar en disco para la próxima vez
        fs.writeFileSync(filePath, JSON.stringify(CITIES_DB));
        console.log(`✅ ¡Descarga exitosa! ${CITIES_DB.length} municipios de España guardados.`);

    } catch (error) {
        console.error("⚠️ Error descargando ciudades:", error.message);
        console.log("⚠️ Usando base de datos mínima de emergencia.");
        CITIES_DB = [
            { id: '28079', name: 'Madrid', lat: 40.4168, lon: -3.7038 },
            { id: '28065', name: 'Getafe', lat: 40.3083, lon: -3.7327 }
        ];
    }
};

// --- 3. UTILS COMUNES ---
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

// --- 4. PARSEO WEATHER (Fix Finde v10 integrado) ---
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
            const container = collection.find(x => {
                if (!x.periodo || x.periodo.length < 3) return false;
                const [pStart, pEnd] = x.periodo.split('-').map(Number);
                return (targetStart >= pStart && targetEnd <= pEnd);
            });
            if (container) return container;
            return collection.find(x => x.periodo === '00-24') || collection[0];
        };

        const periodosStandard = ['00-06', '06-12', '12-18', '18-24'];
        const periodosOutput = periodosStandard.map(rango => {
            const [start, end] = rango.split('-');
            const p = findData(dia.probPrecipitacion, start, end);
            const v = findData(dia.viento, start, end);
            const c = findData(dia.estadoCielo, start, end);
            let probVal = p ? parseInt(p.value) : rainMax;
            if (isNaN(probVal)) probVal = rainMax;

            return {
                horario: rango,
                probLluvia: probVal,
                vientoVel: v ? (parseInt(v.velocidad) || 0) : 0,
                icono: getIcon(c?.value)
            };
        });

        const mainSky = findData(dia.estadoCielo, '12', '18');
        let iconoFinal = getIcon(mainSky?.value);
        let descFinal = mainSky?.descripcion || 'Variable';
        if (rainMax >= 40 && !iconoFinal.includes('rain') && !iconoFinal.includes('snow') && !iconoFinal.includes('lightning')) {
            iconoFinal = 'bi-cloud-rain-fill'; 
        }
        const esIconoLluvia = iconoFinal.includes('rain') || iconoFinal.includes('drizzle') || iconoFinal.includes('lightning');
        if (rainMax === 0 && esIconoLluvia) {
            iconoFinal = 'bi-cloud-sun';
            descFinal = 'Intervalos nubosos';
        }

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

// --- 5. ENDPOINTS ---

// BUSCADOR MASIVO (Filtra entre 8000 ciudades)
app.get('/api/search/:query', (req, res) => {
    const query = req.params.query.toLowerCase();
    // Filtramos. Como son 8000, limitamos a 10 resultados para no colapsar
    const results = CITIES_DB.filter(city => city.name.toLowerCase().includes(query)).slice(0, 10);
    res.json(results);
});

// GEO MASIVO (Busca la más cercana entre 8000)
app.get('/api/geo', (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "Faltan coordenadas" });
    
    let closest = null;
    let minD = Infinity;
    
    // Algoritmo rápido
    for (const city of CITIES_DB) {
        // Optimización: Si la diferencia de latitud es muy grande (>1 grado), saltar (evita calculo Haversine costoso)
        if (Math.abs(city.lat - lat) > 1) continue;
        
        const d = getDistanceFromLatLonInKm(lat, lon, city.lat, city.lon);
        if (d < minD) { minD = d; closest = city; }
    }
    
    res.json(closest || { error: "No encontrada" });
});

app.get('/api/alerts/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        if (!cache) return res.json({ alert: null });
        const data = JSON.parse(cache.data)[0];
        let alert = null;
        const maxRain = Math.max(...data.periodos.map(p => p.probLluvia));
        const maxWind = Math.max(...data.periodos.map(p => p.vientoVel));

        if (maxWind >= 50) alert = { type: 'wind', level: 'warning', msg: `Viento fuerte (${maxWind} km/h)`, icon: 'bi-wind' };
        else if (maxRain >= 80) alert = { type: 'rain', level: 'warning', msg: `Lluvia intensa (${maxRain}%)`, icon: 'bi-cloud-rain-heavy-fill' };
        else if (data.tempMax >= 38) alert = { type: 'heat', level: 'danger', msg: `Calor extremo (${data.tempMax}°C)`, icon: 'bi-thermometer-sun' };
        else if (data.tempMax <= 0) alert = { type: 'cold', level: 'info', msg: `Heladas`, icon: 'bi-thermometer-snow' };
        res.json({ alert });
    } catch (e) { res.json({ alert: null }); }
});

app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        if (cache && (new Date() - new Date(cache.updatedAt) < 15 * 60 * 1000)) {
            return res.json(JSON.parse(cache.data));
        }
        if (!process.env.AEMET_API_KEY) throw new Error("Falta API Key");
        const urlRes = await axios.get(`https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/${locationId}`, { headers: { 'api_key': process.env.AEMET_API_KEY } });
        if (urlRes.data.estado !== 200) return res.status(404).json({error: "Error AEMET"});
        const weatherRes = await axios.get(urlRes.data.datos);
        const cleanData = parseAemetData(weatherRes.data);
        await WeatherCache.upsert({ locationId: locationId, data: JSON.stringify(cleanData), updatedAt: new Date() });
        res.json(cleanData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error Servidor" });
    }
});

// INICIALIZACIÓN
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Aeris V11 (FULL ESPAÑA) arrancando en puerto ${PORT}`);
    // Cargar ciudades al iniciar
    await loadAllCities();
});