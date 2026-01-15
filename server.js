require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- 1. CONFIGURACIÓN BASE DE DATOS (Caché) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v4.sqlite', // Nueva versión de DB para limpiar errores viejos
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- 2. DICCIONARIO DE ICONOS (Traducción AEMET -> Bootstrap) ---
const getIcon = (code) => {
    // Limpiamos sufijos (n = noche, p = periodo)
    const cleanCode = code ? String(code).replace(/\D/g, '') : '11';

    const iconMap = {
        // ☀️ SOL / NUBES
        '11': 'bi-sun-fill',            // Despejado
        '12': 'bi-cloud-sun-fill',      // Poco nuboso
        '13': 'bi-cloud-sun',           // Intervalos nubosos
        '14': 'bi-cloud-fill',          // Nuboso
        '15': 'bi-clouds-fill',         // Muy nuboso
        '16': 'bi-clouds',              // Cubierto
        '17': 'bi-cloud-haze-fill',     // Nubes altas

        // 🌧️ LLUVIA Y NIEVE
        '43': 'bi-cloud-drizzle-fill',      // Llovizna
        '44': 'bi-cloud-drizzle',           // Lluvia débil
        '45': 'bi-cloud-rain-fill',         // Lluvia
        '46': 'bi-cloud-rain-heavy-fill',   // Lluvia persistente
        '23': 'bi-cloud-rain-heavy',        // Lluvia e intervalos
        '24': 'bi-cloud-rain-heavy-fill',   // Muy nuboso con lluvia
        '25': 'bi-cloud-rain-heavy-fill',   // Muy nuboso con lluvia
        '26': 'bi-cloud-rain-heavy-fill',   // Cubierto con lluvia

        // ⛈️ TORMENTA
        '51': 'bi-cloud-lightning-fill',    // Tormenta
        '52': 'bi-cloud-lightning-rain-fill', // Tormenta con lluvia
        '53': 'bi-cloud-lightning-rain-fill', // Tormenta fuerte
        '54': 'bi-cloud-lightning-rain-fill', // Tormenta muy fuerte
        '61': 'bi-cloud-lightning',         // Tormenta seca

        // 🌨️ NIEVE
        '33': 'bi-cloud-snow',          // Nevadas débiles
        '34': 'bi-cloud-snow',          // Nevadas
        '35': 'bi-cloud-snow-fill',     // Nevadas fuertes
        '36': 'bi-cloud-snow-fill',     // Nevadas muy fuertes
        '71': 'bi-cloud-snow',          // Intervalos nubosos con nieve
        '72': 'bi-cloud-snow',          // Nuboso con nieve
        '73': 'bi-cloud-snow-fill',     // Muy nuboso con nieve
        '74': 'bi-cloud-snow-fill',     // Cubierto con nieve

        // 🌫️ NIEBLA
        '81': 'bi-cloud-fog2-fill',     // Niebla
        '82': 'bi-cloud-fog2-fill'      // Bruma
    };

    return iconMap[cleanCode] || 'bi-cloud-sun';
};

// Utilidad para rotación del viento
const getWindRotation = (dir) => {
    const dirs = { 'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SO': 225, 'O': 270, 'NO': 315, 'C': 0 };
    return dirs[dir] || 0;
};

// --- 3. PARSEO INTELIGENTE DE DATOS ---
const parseAemetData = (rawData) => {
    if (!rawData || !rawData[0] || !rawData[0].prediccion) return [];
    
    return rawData[0].prediccion.dia.map(dia => {
        // A. Obtener Probabilidad de Lluvia MÁXIMA del día (para evitar el error del 0%)
        // AEMET da periodos (00-06, 06-12, etc). Buscamos el valor más alto.
        let maxRainProb = 0;
        if (Array.isArray(dia.probPrecipitacion)) {
            maxRainProb = Math.max(...dia.probPrecipitacion.map(p => parseInt(p.value || 0)));
        }

        // B. Buscar el estado del cielo más representativo (priorizamos 12-24, si no el primero que haya)
        let estadoCieloObj = dia.estadoCielo.find(e => e.periodo === '12-24') || dia.estadoCielo.find(e => e.periodo === '00-24') || dia.estadoCielo[0];
        
        // C. Buscar datos de viento (priorizamos mediodía)
        let vientoObj = dia.viento.find(e => e.periodo === '12-24') || dia.viento[0];

        // D. Si hay lluvia (>0%), pero el icono es de sol, forzamos un icono de lluvia ligera si la prob es alta
        let iconoFinal = getIcon(estadoCieloObj?.value);
        if (maxRainProb > 40 && !iconoFinal.includes('rain') && !iconoFinal.includes('drizzle') && !iconoFinal.includes('snow')) {
            iconoFinal = 'bi-cloud-drizzle'; // Corrección visual si llueve pero AEMET manda icono de sol
        }

        return {
            fecha: dia.fecha,
            tempMax: dia.temperatura.maxima,
            tempMin: dia.temperatura.minima,
            // Datos generales del día (corregidos)
            iconoGeneral: iconoFinal,
            descripcionGeneral: estadoCieloObj?.descripcion || 'Variable',
            uv: dia.uvMax || 0,
            
            // Periodos detallados para el acordeón
            periodos: ['00-06', '06-12', '12-18', '18-24'].map(rango => {
                const cielo = dia.estadoCielo.find(e => e.periodo === rango);
                const prob = dia.probPrecipitacion.find(e => e.periodo === rango);
                const viento = dia.viento.find(e => e.periodo === rango);
                
                return {
                    horario: rango,
                    icono: getIcon(cielo?.value),
                    probLluvia: prob?.value ? parseInt(prob.value) : 0,
                    vientoVel: viento?.velocidad || 0,
                    vientoRot: getWindRotation(viento?.direccion)
                };
            })
        };
    });
};

// --- 4. ENDPOINT API ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;

    try {
        await sequelize.sync();
        
        // 1. Check Caché (Validez: 1 hora)
        const cache = await WeatherCache.findByPk(locationId);
        const oneHourAgo = new Date(new Date() - 60 * 60 * 1000);

        if (cache && cache.updatedAt > oneHourAgo) {
            console.log(`⚡ Caché HIT: ${locationId}`);
            return res.json(JSON.parse(cache.data));
        }

        // 2. Petición a AEMET
        console.log(`🌐 API CALL AEMET: ${locationId}`);
        if (!process.env.AEMET_API_KEY) throw new Error("Falta API Key");

        const urlResponse = await axios.get(
            `https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/${locationId}`,
            { headers: { 'api_key': process.env.AEMET_API_KEY } }
        );

        if (urlResponse.data.estado === 404) return res.status(404).json({ error: "Municipio no encontrado" });
        
        // La URL de datos viene en la respuesta
        const weatherResponse = await axios.get(urlResponse.data.datos);
        
        // 3. Procesar datos con nuestra nueva lógica
        const cleanData = parseAemetData(weatherResponse.data);

        // 4. Guardar en Caché
        await WeatherCache.upsert({
            locationId: locationId,
            data: JSON.stringify(cleanData),
            updatedAt: new Date()
        });

        res.json(cleanData);

    } catch (error) {
        console.error("Error servidor:", error.message);
        res.status(500).json({ error: "Error interno", details: error.message });
    }
});

// Respaldo de puerto para local vs producción
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris Server v4.0 (Smart Data) en puerto ${PORT}`));