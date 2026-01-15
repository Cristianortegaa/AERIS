require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- 1. BASE DE DATOS (Caché) ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './weather_db_v5.sqlite', // V5 para limpiar caché antigua
    logging: false
});

const WeatherCache = sequelize.define('WeatherCache', {
    locationId: { type: DataTypes.STRING, primaryKey: true },
    data: { type: DataTypes.TEXT },
    updatedAt: { type: DataTypes.DATE }
});

// --- 2. DICCIONARIO DE ICONOS (AEMET -> BOOTSTRAP) ---
const getIcon = (code) => {
    const cleanCode = code ? String(code).replace(/\D/g, '') : '11'; // Quitar letras (n, p)
    
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
    return iconMap[cleanCode] || 'bi-cloud-sun';
};

// --- 3. LÓGICA DE DATOS ROBUSTA ---
const parseAemetData = (rawData) => {
    if (!rawData || !rawData[0] || !rawData[0].prediccion) return [];
    
    return rawData[0].prediccion.dia.map(dia => {
        
        // A. CALCULAR LLUVIA REAL (Buscando en todos los periodos disponibles)
        let maxRainProb = 0;
        if (Array.isArray(dia.probPrecipitacion)) {
            // Extraemos todos los valores numéricos que haya, sin importar el periodo
            const probs = dia.probPrecipitacion.map(p => parseInt(p.value || 0));
            maxRainProb = Math.max(...probs, 0);
        }

        // B. ELEGIR ICONO Y CORREGIR INCOHERENCIAS
        // Priorizamos el estado del cielo entre las 12 y las 24, o el general (00-24)
        let cieloObj = dia.estadoCielo.find(e => e.periodo === '12-24') || 
                       dia.estadoCielo.find(e => e.periodo === '00-24') || 
                       dia.estadoCielo[0];
        
        let iconoCode = cieloObj?.value;
        let descripcion = cieloObj?.descripcion || '';
        let iconoFinal = getIcon(iconoCode);

        // --- REGLAS DE COHERENCIA (MAGIA AQUÍ) ---
        
        // REGLA 1: Si probabilidad es 0% y el icono es de lluvia -> Forzamos SOL/NUBES
        const esIconoLluvia = iconoFinal.includes('rain') || iconoFinal.includes('drizzle') || iconoFinal.includes('lightning');
        if (maxRainProb === 0 && esIconoLluvia) {
            iconoFinal = 'bi-cloud-sun'; // Lo cambiamos a "Intervalos nubosos" para que cuadre
            descripcion = descripcion.replace('con lluvia', '').replace('con tormenta', ''); // Limpiamos texto
            if(descripcion === '') descripcion = 'Intervalos nubosos';
        }

        // REGLA 2: Si probabilidad > 0% (ej: 5%) y el icono es de sol -> Ponemos nube con gotitas
        if (maxRainProb > 0 && !esIconoLluvia && !iconoFinal.includes('snow') && !iconoFinal.includes('fog')) {
            // Solo si es > 25% forzamos el cambio visual, si es 5% puede ser sol con 4 gotas
            if (maxRainProb >= 25) {
                iconoFinal = 'bi-cloud-drizzle'; 
            }
        }

        // C. VIENTO (Buscar valor numérico disponible)
        let vientoObj = dia.viento.find(e => e.periodo === '12-24') || dia.viento.find(e => e.periodo === '00-24') || dia.viento[0];
        let vientoVel = vientoObj ? parseInt(vientoObj.velocidad || 0) : 0;
        let vientoDir = vientoObj ? vientoObj.direccion : 'C';

        // D. DATOS PARA PERIODOS (Frontend)
        // Mapeamos lo que haya para que el acordeón no falle
        // Intentamos normalizar: Mañana (00-12) y Tarde (12-24) para días futuros
        const periodosMap = [];
        
        // Función auxiliar para buscar dato en rango
        const findData = (arr, p1, p2) => arr.find(e => e.periodo === p1 || e.periodo === p2);

        // Periodo Mañana
        let pManana = findData(dia.probPrecipitacion, '00-06', '00-12');
        let cManana = findData(dia.estadoCielo, '00-06', '00-12');
        let vManana = findData(dia.viento, '00-06', '00-12');

        // Periodo Tarde
        let pTarde = findData(dia.probPrecipitacion, '12-18', '12-24');
        let cTarde = findData(dia.estadoCielo, '12-18', '12-24');
        let vTarde = findData(dia.viento, '12-18', '12-24');

        // Construimos 2 bloques principales para asegurar datos en días lejanos
        // (El frontend usará el array 'periodos', nos aseguramos que tenga datos)
        const periodosList = [
            { h: 'Mañana', p: pManana, c: cManana, v: vManana },
            { h: 'Tarde', p: pTarde, c: cTarde, v: vTarde }
        ];

        const periodosClean = periodosList.map(item => ({
            horario: item.h,
            icono: getIcon(item.c?.value),
            probLluvia: item.p?.value ? parseInt(item.p.value) : 0,
            vientoVel: item.v?.velocidad || 0,
            vientoRot: 0 // Simplificamos rotación
        }));

        // Hack: Para mantener compatibilidad con tu frontend que espera 4 periodos o usa indices
        // Rellenamos el array con los datos "reales" máximos calculados antes
        const periodosFrontend = [
            { horario: '00-12', probLluvia: maxRainProb, vientoVel: vientoVel, icono: iconoFinal },
            { horario: '12-24', probLluvia: maxRainProb, vientoVel: vientoVel, icono: iconoFinal } 
            // Ponemos el mismo dato general si no hay detalle, para que siempre salga bien el numero
        ];

        // Si tenemos datos detallados de AEMET (días 0-2), usamos los reales
        if(dia.probPrecipitacion.length > 2) {
             // Es un día con detalle (hoy/mañana) -> devolvemos la estructura original mapeada
             return {
                 fecha: dia.fecha,
                 tempMax: dia.temperatura.maxima,
                 tempMin: dia.temperatura.minima,
                 iconoGeneral: iconoFinal,
                 descripcionGeneral: descripcion,
                 uv: dia.uvMax || 0,
                 periodos: ['00-06','06-12','12-18','18-24'].map(r => {
                     let p = dia.probPrecipitacion.find(e=>e.periodo === r);
                     let c = dia.estadoCielo.find(e=>e.periodo === r);
                     let v = dia.viento.find(e=>e.periodo === r);
                     return {
                         horario: r,
                         probLluvia: p ? parseInt(p.value) : 0,
                         vientoVel: v ? v.velocidad : 0,
                         icono: getIcon(c?.value)
                     }
                 })
             };
        }

        // Si es día futuro (Sábado 17...), devolvemos estructura simplificada pero correcta
        return {
            fecha: dia.fecha,
            tempMax: dia.temperatura.maxima,
            tempMin: dia.temperatura.minima,
            iconoGeneral: iconoFinal,
            descripcionGeneral: descripcion,
            uv: dia.uvMax || 0,
            // Truco: Enviamos el dato MAXIMO en todos los periodos del array
            // Así tu frontend `Math.max(...periodos)` siempre sacará el dato correcto
            periodos: Array(4).fill({
                horario: 'Gen',
                probLluvia: maxRainProb, // <--- AQUÍ ESTÁ LA CLAVE (Forzamos el valor real)
                vientoVel: vientoVel,
                icono: iconoFinal
            })
        };
    });
};

// --- 4. ENDPOINT ---
app.get('/api/weather/:id', async (req, res) => {
    const locationId = req.params.id;
    try {
        await sequelize.sync();
        const cache = await WeatherCache.findByPk(locationId);
        
        // Caché de 30 minutos para asegurar datos frescos
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
        console.error(error);
        res.status(500).json({ error: "Error Servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris v5 Corrector Lluvia activo en ${PORT}`));