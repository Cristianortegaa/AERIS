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
const getIcon = (code) => {
    const cleanCode = code ? code.replace('n', '') : '11';
    const iconMap = {
        '11': 'bi-sun', '12': 'bi-cloud-sun', '13': 'bi-cloud', '14': 'bi-clouds',
        '15': 'bi-cloud-haze', '16': 'bi-cloud-haze2', '17': 'bi-sun',
        '43': 'bi-cloud-drizzle', '44': 'bi-cloud-rain', '45': 'bi-cloud-rain-heavy',
        '46': 'bi-cloud-rain-heavy', '23': 'bi-cloud-lightning-rain', '24': 'bi-cloud-lightning',
        '81': 'bi-cloud-fog', '82': 'bi-cloud-fog2'
    };
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