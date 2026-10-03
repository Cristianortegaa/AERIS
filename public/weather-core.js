/* ============================================================
   AERIS — weather-core.js
   Lo que convierte las respuestas de Open-Meteo en los datos de la app.
   Lo usan el servidor (require) y el navegador (window.WeatherCore): así,
   si el servidor se queda sin cupo de Open-Meteo, el móvil puede pedir los
   datos él mismo y obtener exactamente lo mismo.
   ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.WeatherCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const decodeWMO = (code, isDay = 1) => {
    const c = parseInt(code);
    const dayIcons = {
        0: 'bi-sun', 1: 'bi-cloud-sun', 2: 'bi-cloud', 3: 'bi-clouds',
        45: 'bi-cloud-haze2', 48: 'bi-cloud-haze2',
        51: 'bi-cloud-drizzle', 53: 'bi-cloud-drizzle', 55: 'bi-cloud-drizzle',
        56: 'bi-cloud-drizzle', 57: 'bi-cloud-drizzle',
        61: 'bi-cloud-rain', 63: 'bi-cloud-rain', 65: 'bi-cloud-rain-heavy',
        66: 'bi-cloud-rain', 67: 'bi-cloud-rain-heavy',
        71: 'bi-cloud-snow', 73: 'bi-cloud-snow', 75: 'bi-snow',
        77: 'bi-cloud-snow',
        80: 'bi-cloud-drizzle', 81: 'bi-cloud-rain', 82: 'bi-cloud-rain-heavy',
        85: 'bi-cloud-snow', 86: 'bi-snow',
        95: 'bi-cloud-lightning', 96: 'bi-cloud-lightning-rain', 99: 'bi-cloud-lightning-rain'
    };
    const nightIcons = { 0: 'bi-moon', 1: 'bi-cloud-moon', 2: 'bi-cloud-moon', 3: 'bi-clouds' };
    const textMap = {
        0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Niebla", 48: "Niebla escarcha",
        51: "Llovizna", 53: "Llovizna moderada", 55: "Llovizna fuerte",
        56: "Llovizna helada", 57: "Llovizna helada fuerte",
        61: "Lluvia leve", 63: "Lluvia", 65: "Lluvia fuerte",
        66: "Lluvia helada", 67: "Lluvia helada fuerte",
        71: "Nieve leve", 73: "Nieve", 75: "Nieve fuerte",
        77: "Granizo fino",
        80: "Chubascos", 81: "Chubascos fuertes", 82: "Tormenta violenta",
        85: "Chubascos de nieve", 86: "Nevada fuerte",
        95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta fuerte"
    };
    const icon = isDay ? (dayIcons[c] || 'bi-cloud') : (nightIcons[c] || dayIcons[c] || 'bi-cloud');
    return { text: textMap[c] || "Variable", icon };
};

const windDirectionText = (degrees) => {
    if (degrees === undefined || degrees === null) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round(degrees / 45) % 8];
};

// --- MOTOR DE ALERTAS ---
// Alertas propias por umbrales, complementarias a los avisos oficiales.
// El viento va por RACHAS (antes se usaba el viento medio y casi nunca
// saltaba) y la lluvia intensa por lo PREVISTO en las próximas 3 h (antes,
// por lo que ya había caído).
const generateAlerts = (w, startIndex = 0) => {
    const alerts = [];
    const c = w.current;
    const gust = c.wind_gusts_10m ?? c.wind_speed_10m;
    const temp = c.temperature_2m;
    const code = c.weather_code;
    const next3h = (w.hourly.precipitation || []).slice(startIndex, startIndex + 3).map(v => v || 0);
    const rainPeak = next3h.length ? Math.max(...next3h) : 0;

    if (gust >= 110) alerts.push({ level: 'red', title: 'Viento huracanado', msg: `Rachas de ${Math.round(gust)} km/h. Evita salir.` });
    else if (gust >= 90) alerts.push({ level: 'orange', title: 'Viento muy fuerte', msg: `Rachas de ${Math.round(gust)} km/h. Cuidado con objetos sueltos.` });
    else if (gust >= 70) alerts.push({ level: 'yellow', title: 'Rachas fuertes', msg: `Rachas de ${Math.round(gust)} km/h.` });

    if (temp >= 40) alerts.push({ level: 'red', title: 'Calor extremo', msg: 'Riesgo alto para la salud: agua, sombra y nada de esfuerzos.' });
    else if (temp >= 36) alerts.push({ level: 'orange', title: 'Calor muy intenso', msg: 'Hidrátate y evita el sol en las horas centrales.' });
    else if (temp <= -5) alerts.push({ level: 'orange', title: 'Frío intenso', msg: 'Temperaturas bajo cero peligrosas: abrígate bien.' });

    if (code >= 95) alerts.push({ level: 'orange', title: 'Tormenta eléctrica', msg: 'Actividad eléctrica en la zona. Busca refugio.' });
    if (rainPeak >= 10) alerts.push({ level: 'orange', title: 'Lluvia intensa prevista', msg: `Hasta ${Math.round(rainPeak)} mm en una hora en las próximas 3 h. No cruces zonas inundadas.` });
    if (code === 75 || code === 86) alerts.push({ level: 'orange', title: 'Nevada fuerte', msg: 'Acumulación rápida de nieve.' });

    return alerts;
};

const POLLEN_TYPES = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed']; // las que da Open-Meteo (CAMS Europa)

// Máximo por día de unas series horarias ("YYYY-MM-DDTHH:mm")
function dailyMax(times, series) {
    const out = {};
    (times || []).forEach((t, i) => {
        const d = t.slice(0, 10);
        for (const [k, arr] of Object.entries(series)) {
            const v = arr && arr[i];
            if (v == null) continue;
            out[d] = out[d] || {};
            out[d][k] = Math.max(out[d][k] ?? -Infinity, v);
        }
    });
    return Object.entries(out).map(([fecha, v]) => ({ fecha, ...v }));
}

const POLLEN_VARS = () => POLLEN_TYPES.map(t => `${t}_pollen`).join(',');
const forecastUrl = (lat, lon) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl,dew_point_2m,uv_index,visibility`
    + `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day,wind_gusts_10m,uv_index,pressure_msl,relative_humidity_2m,wind_speed_10m,dew_point_2m,apparent_temperature`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max`
    + `&minutely_15=precipitation&timezone=auto&past_days=1`;
// Aire y polen en UNA llamada
const airUrl = (lat, lon) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=4`
    + `&current=european_aqi,us_aqi,pm10,pm2_5,dust,${POLLEN_VARS()}`
    + `&hourly=european_aqi,dust,pm10,${POLLEN_VARS()}`;

// w: respuesta de forecast · a: respuesta de air-quality (o null)
// avisosOficiales: avisos de AEMET ya filtrados para el punto
function buildPayload({ w, a, lat, lon, name, region, avisosOficiales = [] }) {
    a = a || { current: {}, hourly: {} };

    const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);
    const currentTime = w.current.time;
    const currentHourStr = currentTime.substring(0, 13);
    const todayStr = currentTime.split('T')[0];

    let startIndex = w.hourly.time.findIndex(t => t.startsWith(currentHourStr));
    if (startIndex === -1) startIndex = 0;

    let comparisonText = "";
    try {
        if (startIndex >= 24) {
            const diff = w.hourly.temperature_2m[startIndex] - w.hourly.temperature_2m[startIndex - 24];
            if (Math.abs(diff) < 1) comparisonText = "Misma temperatura que ayer";
            else if (diff > 0) comparisonText = `${Math.round(diff)}° más calor que ayer`;
            else comparisonText = `${Math.abs(Math.round(diff))}° más frío que ayer`;
        }
    } catch (err) { comparisonText = ""; }

    // Tendencia de presión: ahora frente a hace 3 h (antes se comparaba con
    // la última consulta, que podía ser de otra ciudad)
    const pr = w.hourly.pressure_msl || [];
    const pressureTrend = (startIndex >= 3 && pr[startIndex] != null && pr[startIndex - 3] != null)
        ? Math.round((pr[startIndex] - pr[startIndex - 3]) * 10) / 10 : null;

    const hourly = w.hourly.time
        .slice(startIndex, startIndex + 24)
        .map((t, i) => {
            const realIndex = startIndex + i;
            return {
                fullDate: t,
                hour: parseInt(t.split('T')[1].split(':')[0]),
                displayTime: t.split('T')[1],
                temp: Math.round(w.hourly.temperature_2m[realIndex]),
                rainProb: w.hourly.precipitation_probability[realIndex],
                precip: w.hourly.precipitation[realIndex],
                gust: Math.round(w.hourly.wind_gusts_10m?.[realIndex] ?? 0),
                uv: Math.round((w.hourly.uv_index?.[realIndex] ?? 0) * 10) / 10,
                icon: decodeWMO(w.hourly.weather_code[realIndex], w.hourly.is_day[realIndex]).icon,
                desc: decodeWMO(w.hourly.weather_code[realIndex], w.hourly.is_day[realIndex]).text,
                // Para la curva que se recorre con el dedo y las hojas de detalle
                feels: Math.round(w.hourly.apparent_temperature?.[realIndex] ?? w.hourly.temperature_2m[realIndex]),
                humidity: w.hourly.relative_humidity_2m?.[realIndex] ?? null,
                dewPoint: w.hourly.dew_point_2m?.[realIndex] != null ? Math.round(w.hourly.dew_point_2m[realIndex]) : null,
                wind: Math.round(w.hourly.wind_speed_10m?.[realIndex] ?? 0),
                pressure: w.hourly.pressure_msl?.[realIndex] != null ? Math.round(w.hourly.pressure_msl[realIndex]) : null
            };
        });

    // Nowcast: tramos de 15 min desde ahora. Bastan 4 h (16 tramos): el
    // cliente usa las 2 próximas y el resto cubre la caché.
    let nowcast = { time: [], precipitation: [] };
    if (w.minutely_15) {
        const indices = w.minutely_15.time.map((t, i) => ({ t, i })).filter(item => item.t >= currentTime).map(item => item.i).slice(0, 16);
        nowcast.time = indices.map(i => w.minutely_15.time[i]);
        nowcast.precipitation = indices.map(i => w.minutely_15.precipitation[i] || 0);
    }

    const ac = a.current || {}, ah = a.hourly || {};
    const pollenData = Object.fromEntries(POLLEN_TYPES.map(t => [t, Math.round(ac[`${t}_pollen`] || 0)]));
    // Previsión por día (máximos): polen, AQI europeo y polvo (calima)
    const airDaily = dailyMax(ah.time, {
        eaqi: ah.european_aqi, dust: ah.dust, pm10: ah.pm10,
        ...Object.fromEntries(POLLEN_TYPES.map(t => [t, ah[`${t}_pollen`]]))
    }).filter(d => d.fecha >= todayStr);

    const alerts = generateAlerts(w, startIndex);

    const dIdx = w.daily.time.indexOf(todayStr);
    const yesterday = dIdx > 0 ? {
        tempMax: Math.round(w.daily.temperature_2m_max[dIdx - 1]),
        tempMin: Math.round(w.daily.temperature_2m_min[dIdx - 1])
    } : null;

    return {
        location: { name: name || "Tu ubicacion", region: region || '', lat, lon, timezone: w.timezone },
        updatedAt: new Date().toISOString(),
        current: {
            temp: Math.round(w.current.temperature_2m),
            feelsLike: Math.round(w.current.apparent_temperature),
            humidity: w.current.relative_humidity_2m,
            dewPoint: Math.round(w.current.dew_point_2m ?? 0),
            windSpeed: Math.round(w.current.wind_speed_10m),
            windGust: Math.round(w.current.wind_gusts_10m ?? w.current.wind_speed_10m),
            windDir: windDirectionText(w.current.wind_direction_10m),
            pressure: Math.round(w.current.pressure_msl),      // a nivel del mar (la de superficie daba 949 hPa en Madrid)
            pressureTrend,
            visibility: w.current.visibility ?? null,
            desc: currentWMO.text,
            icon: currentWMO.icon,
            isDay: w.current.is_day === 1,
            uv: Math.round((w.current.uv_index ?? 0) * 10) / 10, // el de ahora (antes era el máximo de AYER)
            uvMax: dIdx >= 0 ? (w.daily.uv_index_max[dIdx] || 0) : 0,
            aqi: ac.us_aqi || 0,
            eaqi: ac.european_aqi ?? null,
            pm25: ac.pm2_5 || 0,
            pm10: ac.pm10 || 0,
            dust: ac.dust ?? null,
            time: w.current.time,
            cloudCover: w.current.cloud_cover || 0,
            comparison: comparisonText
        },
        yesterday,
        nowcast,
        hourly,
        pollen: pollenData,
        airDaily,
        alerts,
        avisosOficiales,
        daily: w.daily.time.map((t, i) => ({
            fecha: t,
            tempMax: Math.round(w.daily.temperature_2m_max[i]),
            tempMin: Math.round(w.daily.temperature_2m_min[i]),
            sunrise: w.daily.sunrise[i].split('T')[1],
            sunset: w.daily.sunset[i].split('T')[1],
            icon: decodeWMO(w.daily.weather_code[i], 1).icon,
            rainProbMax: w.daily.precipitation_probability_max[i],
            precipSum: Math.round((w.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
            gustMax: Math.round(w.daily.wind_gusts_10m_max?.[i] ?? 0),
            uvMax: w.daily.uv_index_max[i] || 0,
            dayHours: w.hourly.time.reduce((acc, timeStr, idx) => {
                if (timeStr.startsWith(t)) {
                    acc.push({
                        time: timeStr.split('T')[1],
                        temp: Math.round(w.hourly.temperature_2m[idx]),
                        rainProb: w.hourly.precipitation_probability[idx],
                        precip: w.hourly.precipitation[idx],
                        icon: decodeWMO(w.hourly.weather_code[idx], w.hourly.is_day[idx]).icon
                    });
                }
                return acc;
            }, [])
        })).filter(d => d.fecha >= todayStr)
    };
}

return { decodeWMO, windDirectionText, generateAlerts, POLLEN_TYPES, forecastUrl, airUrl, buildPayload };
});
