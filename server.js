require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- 1. BASE DE DATOS (Caché Distribuido por ID) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v3.sqlite',
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true }, // Clave: ID del pueblo
    cityName: { type: DataTypes.STRING }, // Guardamos nombre para debug
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- 2. UTILIDADES DE PARSEO (Robusto) ---
// --- DICCIONARIO DE ICONOS (Traductor AEMET -> Bootstrap) ---
const getIcon = (code) => {
    // 1. Limpieza: AEMET a veces manda "11n" (noche). Quitamos la 'n' para usar el mismo icono.
    const cleanCode = code ? code.replace('n', '').replace('p', '') : '11';

    const iconMap = {
        // ☀️ SOL / DESPEJADO
        '11': 'bi-sun-fill',            // Despejado
        '12': 'bi-cloud-sun-fill',      // Poco nuboso
        '13': 'bi-cloud-sun',           // Intervalos nubosos

        // ☁️ NUBES
        '14': 'bi-cloud-fill',          // Nuboso
        '15': 'bi-clouds-fill',         // Muy nuboso
        '16': 'bi-clouds',              // Cubierto
        '17': 'bi-cloud-haze-fill',     // Nubes altas

        // 🌧️ LLUVIA
        '43': 'bi-cloud-drizzle-fill',        // Llovizna
        '44': 'bi-cloud-drizzle',             // Lluvia débil
        '45': 'bi-cloud-rain-fill',           // Lluvia
        '46': 'bi-cloud-rain-heavy-fill',     // Lluvia persistente
        '23': 'bi-cloud-rain-heavy',          // Lluvia e intervalos
        '24': 'bi-cloud-rain-heavy-fill',     // Muy nuboso con lluvia
        '25': 'bi-cloud-rain-heavy-fill',     // Muy nuboso con lluvia
        '26': 'bi-cloud-rain-heavy-fill',     // Cubierto con lluvia

        // ⛈️ TORMENTA
        '51': 'bi-cloud-lightning-fill',      // Tormenta
        '52': 'bi-cloud-lightning-rain-fill', // Tormenta con lluvia
        '53': 'bi-cloud-lightning-rain-fill', // Tormenta fuerte
        '54': 'bi-cloud-lightning-rain-fill', // Tormenta muy fuerte
        '61': 'bi-cloud-lightning',           // Tormenta seca
        '62': 'bi-cloud-lightning',           // Tormenta seca
        '63': 'bi-cloud-lightning',           // Tormenta seca
        '64': 'bi-cloud-lightning',           // Tormenta seca

        // 🌨️ NIEVE
        '33': 'bi-cloud-snow',          // Nevadas débiles
        '34': 'bi-cloud-snow',          // Nevadas
        '35': 'bi-cloud-snow-fill',     // Nevadas fuertes
        '36': 'bi-cloud-snow-fill',     // Nevadas muy fuertes
        '71': 'bi-cloud-snow',          // Intervalos nubosos con nieve
        '72': 'bi-cloud-snow',          // Nuboso con nieve
        '73': 'bi-cloud-snow-fill',     // Muy nuboso con nieve
        '74': 'bi-cloud-snow-fill',     // Cubierto con nieve

        // 🌫️ NIEBLA / CALIMA
        '81': 'bi-cloud-fog2-fill',     // Niebla
        '82': 'bi-cloud-fog2-fill',     // Bruma
        '83': 'bi-cloud-haze2-fill'     // Calima
    };

    // Si el código no está en la lista (error raro), ponemos sol y nubes por defecto
    return iconMap[cleanCode] || 'bi-cloud-sun';
};

const getWindRotation = (dir) => {
    const dirs = { 'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SO': 225, 'O': 270, 'NO': 315, 'C': 0 };
    return dirs[dir] || 0;
};

const parseAemetData = (rawData) => {
    if (!rawData || !rawData[0] || !rawData[0].prediccion) return [];
    
    return rawData[0].prediccion.dia.map(dia => {
        const estadoCieloObj = dia.estadoCielo.find(e => e.periodo === '12-24') || dia.estadoCielo[0];
        
        return {
            fecha: dia.fecha,
            tempMax: dia.temperatura.maxima,
            tempMin: dia.temperatura.minima,
            iconoGeneral: getIcon(estadoCieloObj?.value),
            descripcionGeneral: estadoCieloObj?.descripcion || 'Variable',
            uv: dia.uvMax || 0,
            periodos: ['00-06', '06-12', '12-18', '18-24'].map(rango => {
                const cielo = dia.estadoCielo.find(e => e.periodo === rango);
                const prob = dia.probPrecipitacion.find(e => e.periodo === rango);
                const viento = dia.viento.find(e => e.periodo === rango);
                
                return {
                    horario: rango,
                    icono: getIcon(cielo?.value),
                    probLluvia: prob?.value || 0,
                    vientoVel: viento?.velocidad || 0,
                    vientoRot: getWindRotation(viento?.direccion)
                };
            })
        };
    });
};

// --- 3. ENDPOINT DINÁMICO ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;

    try {
        await sequelize.sync();
        
        // 1. Check Caché Local
        const cache = await WeatherCache.findByPk(locationId);
        const oneHourAgo = new Date(new Date() - 60 * 60 * 1000);

        if (cache && cache.updatedAt > oneHourAgo) {
            console.log(`⚡ Caché HIT para: ${locationId}`);
            return res.json(JSON.parse(cache.data));
        }

        // 2. Fetch AEMET
        console.log(`🌐 Fetching AEMET para: ${locationId}`);
        if (!process.env.AEMET_API_KEY) throw new Error("Falta API Key");

        const urlResponse = await axios.get(
            `https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/${locationId}`,
            { headers: { 'api_key': process.env.AEMET_API_KEY } }
        );

        if (urlResponse.data.estado === 404) return res.status(404).json({ error: "Municipio no encontrado" });
        if (urlResponse.data.estado === 401) return res.status(401).json({ error: "API Key inválida" });

        const weatherResponse = await axios.get(urlResponse.data.datos);
        const cleanData = parseAemetData(weatherResponse.data);

        // 3. Guardar en Caché (Upsert)
        await WeatherCache.upsert({
            locationId: locationId,
            data: JSON.stringify(cleanData),
            updatedAt: new Date()
        });

        res.json(cleanData);

    } catch (error) {
        console.error("Error:", error.message);
        // Modo Fallback si falla AEMET (Devuelve array vacío para que el front no explote)
        res.status(500).json({ error: "Error de servidor", details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Super App v3.0 corriendo en puerto ${PORT}`));