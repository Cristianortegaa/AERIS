require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- 1. BASE DE DATOS (Caché v7 - Forzamos limpieza) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v7.sqlite', // IMPORTANTE: v7 para borrar datos corruptos viejos
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- 2. DICCIONARIO DE ICONOS (AEMET -> BOOTSTRAP) ---
const getIcon = (code) => {
    const cleanCode = code ? String(code).replace(/\D/g, '') : '11'; 
    
    const iconMap = {
        '11': 'bi-sun-fill',           // Despejado
        '12': 'bi-cloud-sun-fill',     // Poco nuboso
        '13': 'bi-cloud-sun',          // Intervalos nubosos
        '14': 'bi-cloud-fill',         // Nuboso
        '15': 'bi-clouds-fill',        // Muy nuboso
        '16': 'bi-clouds',             // Cubierto
        '17': 'bi-cloud-haze-fill',    // Nubes altas
        '81': 'bi-cloud-fog2-fill',    // Niebla
        '82': 'bi-cloud-fog2-fill',    // Bruma
        
        // Lluvia
        '43': 'bi-cloud-drizzle-fill', // Llovizna
        '44': 'bi-cloud-drizzle',      // Lluvia debil
        '45': 'bi-cloud-rain-fill',    // Lluvia
        '46': 'bi-cloud-rain-heavy-fill', 
        '23': 'bi-cloud-rain-heavy', 
        '24': 'bi-cloud-rain-heavy-fill', 
        '25': 'bi-cloud-rain-heavy-fill', 
        '26': 'bi-cloud-rain-heavy-fill',

        // Tormenta
        '51': 'bi-cloud-lightning-fill',
        '52': 'bi-cloud-lightning-rain-fill',
        '53': 'bi-cloud-lightning-rain-fill',
        '54': 'bi-cloud-lightning-rain-fill',
        '61': 'bi-cloud-lightning',
        
        // Nieve
        '33': 'bi-cloud-snow',
        '34': 'bi-cloud-snow',
        '35': 'bi-cloud-snow-fill',
        '36': 'bi-cloud-snow-fill',
        '71': 'bi-cloud-snow',
        '72': 'bi-cloud-snow',
        '73': 'bi-cloud-snow-fill',
        '74': 'bi-cloud-snow-fill'
    };
    // Fallback: Si el código falla, devolvemos sol
    return iconMap[cleanCode] || 'bi-cloud-sun';
};

// --- 3. PARSEO ROBUSTO (Lógica Blindada) ---
const parseAemetData = (rawData) => {
    if (!rawData || !rawData[0] || !rawData[0].prediccion) return [];
    
    return rawData[0].prediccion.dia.map(dia => {
        
        // A. OBTENER PROBABILIDAD DE LLUVIA MÁXIMA (Vital para el finde)
        let rainMax = 0;
        if (Array.isArray(dia.probPrecipitacion)) {
            // Extraemos SOLO los números. Si viene 'null' o texto raro, lo convertimos a 0.
            const values = dia.probPrecipitacion.map(p => {
                const val = parseInt(p.value);
                return isNaN(val) ? 0 : val;
            });
            rainMax = Math.max(...values, 0);
        }

        // B. OBTENER DATOS GENERALES (Cielo y Viento)
        // Buscamos cualquier dato disponible. Prioridad: 12-24 > 00-24 > El primero que pille
        const findValid = (arr) => {
            if (!arr || arr.length === 0) return null;
            return arr.find(x => x.periodo === '12-24') || 
                   arr.find(x => x.periodo === '00-24') || 
                   arr[0];
        };

        const cieloObj = findValid(dia.estadoCielo);
        const vientoObj = findValid(dia.viento);

        let iconoFinal = getIcon(cieloObj?.value);
        let descFinal = cieloObj?.descripcion || '';
        let vientoVel = vientoObj?.velocidad ? parseInt(vientoObj.velocidad) : 0;
        let uvMax = dia.uvMax || 0;

        // C. REGLAS DE COHERENCIA (Icono vs Datos)
        
        // 1. Si llueve mucho (>35%) y el icono es Sol -> Ponemos Lluvia
        if (rainMax >= 35 && !iconoFinal.includes('rain') && !iconoFinal.includes('snow') && !iconoFinal.includes('lightning')) {
            iconoFinal = 'bi-cloud-rain-fill'; 
        }
        
        // 2. Si NO llueve (0%) y el icono es Lluvia -> Ponemos Nubes
        const esIconoLluvia = iconoFinal.includes('rain') || iconoFinal.includes('drizzle') || iconoFinal.includes('lightning');
        if (rainMax === 0 && esIconoLluvia) {
            iconoFinal = 'bi-cloud-sun';
            descFinal = 'Intervalos nubosos';
        }

        // D. GENERAR PERIODOS (Arreglo Sábado/Domingo)
        // El frontend espera un array de periodos.
        let periodosOutput = [];

        // Si tenemos datos detallados (Hoy/Mañana tienen 3 o más tramos horarios)
        if (dia.probPrecipitacion.length >= 3) {
            const rangos = ['00-06', '06-12', '12-18', '18-24'];
            periodosOutput = rangos.map(r => {
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
            // SI ES FINDE (O días lejanos con pocos datos)
            // Creamos 4 periodos FALSOS pero con el dato REAL MÁXIMO del día.
            // Así tu web leerá "40%" en todos los tramos y mostrará 40% en el resumen.
            periodosOutput = Array(4).fill({
                horario: 'Día', 
                probLluvia: rainMax, // Usamos el máximo calculado arriba
                vientoVel: vientoVel,
                icono: iconoFinal
            });
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

// --- 4. ENDPOINT ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Caché de 30 mins
        if (cache && (new Date() - new Date(cache.updatedAt) < 30 * 60 * 1000)) {
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
        console.error("Error Servidor:", error.message);
        res.status(500).json({ error: "Error Interno" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris v7 (Final Fix) corriendo en puerto ${PORT}`));