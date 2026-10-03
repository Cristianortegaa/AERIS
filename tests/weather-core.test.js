// weather-core.js lo usan el servidor y el navegador: si se rompe, la app
// no pinta nada. Respuestas reales de Open-Meteo guardadas (Madrid).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decodeWMO, windDirectionText, generateAlerts, forecastUrl, airUrl, buildPayload } = require('../public/weather-core.js');

const leer = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf-8'));
const W = leer('forecast-madrid.json');
const A = leer('air-madrid.json');
const copia = (o) => JSON.parse(JSON.stringify(o));

test('códigos WMO: texto e icono de día y de noche', () => {
    assert.deepEqual(decodeWMO(0, 1), { text: 'Despejado', icon: 'bi-sun' });
    assert.equal(decodeWMO(0, 0).icon, 'bi-moon');
    assert.equal(decodeWMO(63, 1).text, 'Lluvia');
    assert.equal(decodeWMO(99, 0).icon, 'bi-cloud-lightning-rain');
    assert.equal(decodeWMO(1234, 1).text, 'Variable');
});

test('dirección del viento', () => {
    assert.equal(windDirectionText(0), 'N');
    assert.equal(windDirectionText(225), 'SO');
    assert.equal(windDirectionText(359), 'N');
    assert.equal(windDirectionText(null), '');
});

test('URLs de Open-Meteo con las coordenadas', () => {
    assert.match(forecastUrl(40.4, -3.7), /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=40\.4&longitude=-3\.7&/);
    assert.match(airUrl(40.4, -3.7), /^https:\/\/air-quality-api\.open-meteo\.com\//);
});

test('alertas propias por umbrales', () => {
    const w = copia(W);
    Object.assign(w.current, { wind_gusts_10m: 30, temperature_2m: 20, weather_code: 1 });
    w.hourly.precipitation = w.hourly.precipitation.map(() => 0);
    assert.deepEqual(generateAlerts(w), []);

    Object.assign(w.current, { wind_gusts_10m: 95, temperature_2m: 41, weather_code: 95 });
    w.hourly.precipitation[1] = 12;
    const titulos = generateAlerts(w).map(a => a.title);
    assert.deepEqual(titulos, ['Viento muy fuerte', 'Calor extremo', 'Tormenta eléctrica', 'Lluvia intensa prevista']);
});

test('buildPayload: lo que pinta la app', () => {
    const avisos = [{ nivel: 'amarillo', fenomeno: 'Lluvias', zonas: ['Metropolitana y Henares'] }];
    const d = buildPayload({ w: copia(W), a: copia(A), lat: 40.4168, lon: -3.7038, name: 'Madrid', region: 'Comunidad de Madrid', avisosOficiales: avisos });
    assert.equal(d.location.name, 'Madrid');
    assert.equal(typeof d.current.temp, 'number');
    assert.ok(d.current.desc && d.current.icon);
    assert.ok(Array.isArray(d.hourly) && d.hourly.length >= 24, `horas: ${d.hourly && d.hourly.length}`);
    assert.ok(d.hourly.every(h => typeof h.temp === 'number' && h.displayTime));
    assert.ok(Array.isArray(d.daily) && d.daily.length >= 7, `días: ${d.daily && d.daily.length}`);
    assert.ok(d.daily.every(x => x.tempMax >= x.tempMin));
    assert.ok(Array.isArray(d.nowcast.time) && Array.isArray(d.nowcast.precipitation));
    assert.deepEqual(d.avisosOficiales, avisos);
    assert.ok(Array.isArray(d.alerts));
});

test('buildPayload aguanta sin datos de aire', () => {
    const d = buildPayload({ w: copia(W), a: null, lat: 40.4168, lon: -3.7038, name: 'Madrid', region: '' });
    assert.equal(typeof d.current.temp, 'number');
    assert.deepEqual(d.avisosOficiales, []);
});
