// Textos del servidor (notificaciones, widget, páginas para Google) en cada
// idioma. Español e inglés están aquí; catalán, gallego y euskera en
// lib/i18n-server/<idioma>.json, con las mismas claves.
// tr('en', 'heatTitle', { place: 'Sevilla' }) → "🌡️ Extreme heat in Sevilla"
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LANGS = ['es', 'en', 'ca', 'gl', 'eu'];

const ES = {
    welcomeTitle: '✅ Avisos de AERIS activados',
    welcomeBody: 'Te avisaremos de lluvia, tormentas y calor extremo en {place}.',
    yourArea: 'tu zona',
    yourLocation: 'tu ubicación',
    // Lluvia o nieve inminente. {type}: "Lluvia"/"Nieve"; {typeLower}: en minúscula;
    // {intensity}: "débil"/"moderada"/"fuerte"; {intensityCap}: con mayúscula.
    rain: 'Lluvia', snow: 'Nieve',
    intensityLight: 'débil', intensityModerate: 'moderada', intensityHeavy: 'fuerte',
    whenNow: 'ahora mismo', whenSoon: 'en unos {min} min',
    precipTitleNow: '{icon} {type} ya en {place}',
    precipTitleSoon: '{icon} {type} en unos {min} min en {place}',
    precipBody: '{type} {intensity} {when}. {tip}',
    tipRain: 'Ten el paraguas a mano.',
    tipSnow: 'Abrígate y cuidado con el suelo.',
    heatTitle: '🌡️ Calor extremo en {place}',
    heatBody: 'Temperatura: {temp}°C. Hidrátate y busca la sombra.',
    windTitle: '💨 Viento fuerte en {place}',
    windBody: 'Rachas de {gust} km/h. Precaución en exteriores.',
    stormTitle: '⚡ Tormenta en {place}',
    stormBody: 'Actividad eléctrica detectada. Busca refugio.',
    // Avisos de AEMET. {nivel}: "naranja"; {Nivel}: "Naranja"; {fen}: "lluvias"
    levelRed: 'rojo', levelOrange: 'naranja', levelYellow: 'amarillo',
    aemetTitle: '{emoji} Aviso {nivel} por {fen} · {place}',
    today: 'Hoy', tomorrow: 'Mañana',
    // Parte de la mañana
    morningTitle: '{emoji} Buenos días en {place}',
    morningRainFrom: 'lluvia desde las {h} h ☔',
    morningShowers: 'algún chubasco posible',
    morningNoRain: 'sin lluvia',
    dustModerate: 'calima moderada', dustHeavy: 'calima intensa',
    pollenHigh: 'polen de {name} alto',
    pollen_grass: 'gramíneas', pollen_olive: 'olivo', pollen_birch: 'abedul', pollen_alder: 'aliso', pollen_mugwort: 'artemisa', pollen_ragweed: 'ambrosía',
    uvTip: 'UV {uv}, crema',
    heatRisk: 'riesgo por calor nivel {n} ({lvl})',
    heatLow: 'bajo', heatMedium: 'medio', heatHigh: 'alto',
    // Widget de iPhone
    widgetStops: 'Para en {min} min', widgetRaining: 'Lloviendo', widgetRainIn: 'Lluvia en {min} min',
    widgetAviso: 'Aviso {nivel} · {fen}',
    // Páginas para Google
    seoCityTitle: 'El tiempo en {name} hoy y próximos días · AERIS',
    seoCityDesc: 'Previsión del tiempo en {name}: lluvia en las próximas 2 horas, hora a hora, 15 días con su fiabilidad, avisos oficiales de AEMET, calidad del aire, calima y polen.',
    seoHomeTitle: 'AERIS - Tu App del Tiempo',
    seoHomeDesc: 'AERIS es tu app del tiempo con personalidad. Pronóstico, alertas de lluvia, calidad del aire, polen y recomendaciones de ropa según el clima.',
    // Página de privacidad: contacto
    privacyContact: '<b>Cualquier duda sobre tus datos:</b> escribe a {mail}.',
    privacyNoContact: '<b>Sin intermediarios:</b> como AERIS no te pide nombre ni email, todo lo que guarda de ti lo puedes borrar tú desde la app.'
};

const EN = {
    welcomeTitle: '✅ AERIS alerts are on',
    welcomeBody: "We'll let you know about rain, storms and extreme heat in {place}.",
    yourArea: 'your area',
    yourLocation: 'your location',
    rain: 'Rain', snow: 'Snow',
    intensityLight: 'light', intensityModerate: 'moderate', intensityHeavy: 'heavy',
    whenNow: 'right now', whenSoon: 'in about {min} min',
    precipTitleNow: '{icon} {type} now in {place}',
    precipTitleSoon: '{icon} {type} in about {min} min in {place}',
    precipBody: '{intensityCap} {typeLower} {when}. {tip}',
    tipRain: 'Keep your umbrella handy.',
    tipSnow: 'Wrap up and watch your step.',
    heatTitle: '🌡️ Extreme heat in {place}',
    heatBody: 'Temperature: {temp}°C. Stay hydrated and find shade.',
    windTitle: '💨 Strong wind in {place}',
    windBody: 'Gusts of {gust} km/h. Take care outdoors.',
    stormTitle: '⚡ Thunderstorm in {place}',
    stormBody: 'Lightning detected. Seek shelter.',
    levelRed: 'red', levelOrange: 'orange', levelYellow: 'yellow',
    aemetTitle: '{emoji} {Nivel} warning for {fen} · {place}',
    today: 'Today', tomorrow: 'Tomorrow',
    morningTitle: '{emoji} Good morning, {place}',
    morningRainFrom: 'rain from {h}:00 ☔',
    morningShowers: 'a shower is possible',
    morningNoRain: 'no rain',
    dustModerate: 'moderate Saharan dust', dustHeavy: 'heavy Saharan dust',
    pollenHigh: 'high {name} pollen',
    pollen_grass: 'grass', pollen_olive: 'olive', pollen_birch: 'birch', pollen_alder: 'alder', pollen_mugwort: 'mugwort', pollen_ragweed: 'ragweed',
    uvTip: 'UV {uv}, wear sunscreen',
    heatRisk: 'heat health risk level {n} ({lvl})',
    heatLow: 'low', heatMedium: 'medium', heatHigh: 'high',
    widgetStops: 'Stops in {min} min', widgetRaining: 'Raining', widgetRainIn: 'Rain in {min} min',
    widgetAviso: '{Nivel} warning · {fen}',
    seoCityTitle: 'Weather in {name} today and the next days · AERIS',
    seoCityDesc: 'Weather forecast for {name}, Spain: rain in the next 2 hours, hour by hour, 15 days with how reliable each one is, official AEMET warnings, air quality, Saharan dust and pollen.',
    seoHomeTitle: 'AERIS · Weather for Spain, with official AEMET warnings',
    seoHomeDesc: 'Weather app for Spain: rain in the next 2 hours, official AEMET warnings in English, 15-day forecast with reliability, air quality, Saharan dust and pollen. No ads, no tracking.',
    privacyContact: '<b>Any questions about your data:</b> write to {mail}.',
    privacyNoContact: "<b>No middlemen:</b> AERIS doesn't ask for your name or email, so you can delete everything it stores about you from the app."
};

const TABLES = { es: ES, en: EN };
for (const l of ['ca', 'gl', 'eu']) {
    try { TABLES[l] = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-server', `${l}.json`), 'utf-8')); }
    catch (e) { TABLES[l] = {}; }
}

const normLang = (l) => LANGS.includes(l) ? l : 'es';
const fill = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
// Texto del servidor en ese idioma (si falta, en español)
function tr(lang, key, vars) {
    const t = TABLES[normLang(lang)];
    return fill(t[key] != null ? t[key] : ES[key], vars);
}

// Diccionarios de la app (public/i18n/<idioma>.js): para traducir lo que el
// servidor tiene en español ("Nublado", "Lluvias"…)
const DICTS = {};
function appDict(lang) {
    lang = normLang(lang);
    if (lang === 'es') return {};
    if (!DICTS[lang]) {
        try {
            const ctx = { window: {} };
            vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n', `${lang}.js`), 'utf-8'), ctx);
            DICTS[lang] = ctx.window[`AERIS_${lang.toUpperCase()}`] || {};
        } catch (e) { DICTS[lang] = {}; }
    }
    return DICTS[lang];
}
// "Nublado" → "Cloudy" / "Ennuvolat"…
const trApp = (lang, es) => appDict(lang)[es] || es;

// Rutas de la app en cada idioma
const HOME = { es: '/', en: '/en/', ca: '/ca/', gl: '/gl/', eu: '/eu/' };
const CITY_BASE = { es: '/tiempo/', en: '/en/weather/', ca: '/ca/temps/', gl: '/gl/tempo/', eu: '/eu/eguraldia/' };
const LOCALES = { es: 'es-ES', en: 'en-GB', ca: 'ca-ES', gl: 'gl-ES', eu: 'eu-ES' };

module.exports = { LANGS, ES, EN, TABLES, tr, trApp, appDict, normLang, HOME, CITY_BASE, LOCALES };
