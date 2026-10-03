// AERIS · widget de pantalla de inicio para Scriptable (iPhone / iPad)
// https://aeris-ghg8.onrender.com/widget
//
// Parámetro del widget (opcional): una ciudad ("Valencia") o coordenadas
// ("39.47,-0.38"). Sin parámetro usa tu ubicación.
// Tamaños: pequeño y mediano.

const BASE = 'https://aeris-ghg8.onrender.com';
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), 'aeris');
if (!fm.fileExists(dir)) fm.createDirectory(dir);

// --- Dónde ---
const param = String(args.widgetParameter || '').trim();
let query;
if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(param)) {
    const [la, lo] = param.split(',').map(s => s.trim());
    query = `lat=${la}&lon=${lo}`;
} else if (param) {
    query = `q=${encodeURIComponent(param)}`;
} else {
    try {
        Location.setAccuracyToThreeKilometers();
        const l = await Location.current();
        query = `lat=${l.latitude.toFixed(3)}&lon=${l.longitude.toFixed(3)}`;
    } catch (e) {
        query = 'q=Madrid'; // sin permiso de ubicación
    }
}

// --- Datos (con copia del último por si no hay red) ---
const cacheFile = fm.joinPath(dir, `datos-${query.replace(/[^a-z0-9]/gi, '_')}.json`);
let data = null, stale = false;
try {
    const req = new Request(`${BASE}/api/widget?${query}`);
    req.timeoutInterval = 25; // el servidor puede estar despertando
    data = await req.loadJSON();
    if (!data || data.error) throw new Error(data && data.error);
    fm.writeString(cacheFile, JSON.stringify(data));
} catch (e) {
    if (fm.fileExists(cacheFile)) { data = JSON.parse(fm.readString(cacheFile)); stale = true; }
}

// --- Iconos 3D (se guardan en el móvil) ---
async function icon(name) {
    const f = fm.joinPath(dir, `${name}.png`);
    if (fm.fileExists(f)) return fm.readImage(f);
    try {
        const img = await new Request(`${BASE}/icons/meteocons-png/${name}.png`).loadImage();
        fm.writeImage(f, img);
        return img;
    } catch (e) { return null; }
}

// --- Colores según el cielo ---
function sky(d) {
    const desc = String(d && d.desc || '').toLowerCase();
    if (/lluvia|llovizna|chubasco|tormenta/.test(desc)) return ['#101824', '#3a4f6c'];
    if (/nieve/.test(desc)) return ['#3f5f88', '#92abc8'];
    if (/nublado|cubierto|niebla/.test(desc)) return d.isDay ? ['#3f5068', '#8a9fb6'] : ['#0a0e15', '#2c3849'];
    return d && d.isDay === false ? ['#070b1f', '#2a2370'] : ['#1554c0', '#5ea6ec'];
}
const white = (a = 1) => new Color('#ffffff', a);
function text(stack, s, size, opts = {}) {
    const t = stack.addText(String(s));
    t.font = opts.weight === 'light' ? Font.lightSystemFont(size) : opts.weight === 'semibold' ? Font.semiboldSystemFont(size) : Font.mediumSystemFont(size);
    t.textColor = opts.color || white(opts.alpha ?? 1);
    t.lineLimit = opts.lines || 1;
    t.minimumScaleFactor = 0.7;
    return t;
}

// --- Widget ---
const w = new ListWidget();
const family = config.widgetFamily || 'medium';
const [c1, c2] = sky(data);
const g = new LinearGradient();
g.colors = [new Color(c1), new Color(c2)];
g.locations = [0, 1];
w.backgroundGradient = g;
w.setPadding(14, 14, 14, 14);
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (!data) {
    text(w, 'AERIS', 14, { weight: 'semibold' });
    w.addSpacer(6);
    text(w, 'Sin datos ahora mismo. Se volverá a intentar en unos minutos.', 12, { alpha: 0.8, lines: 4 });
} else {
    w.url = `${BASE}/?lat=${data.lat}&lon=${data.lon}&name=${encodeURIComponent(data.city || '')}`;
    const row = w.addStack();
    row.layoutHorizontally();

    // Columna principal: ciudad, icono + temperatura, cielo, máx/mín
    const main = row.addStack();
    main.layoutVertically();
    text(main, data.city || 'AERIS', 13, { weight: 'semibold', alpha: 0.9 });
    main.addSpacer(2);
    const tr = main.addStack();
    tr.centerAlignContent();
    const ic = await icon(data.icon);
    if (ic) { const im = tr.addImage(ic); im.imageSize = new Size(40, 40); tr.addSpacer(4); }
    text(tr, `${Math.round(data.temp)}°`, 36, { weight: 'light' });
    text(main, data.desc || '', 12, { alpha: 0.85 });
    if (data.max != null) text(main, `↑${data.max}°  ↓${data.min}°`, 12, { alpha: 0.75 });
    main.addSpacer();
    if (data.aviso) text(main, data.aviso.texto, 11, { weight: 'semibold', color: new Color(data.aviso.nivel === 'rojo' ? '#ff8a8a' : data.aviso.nivel === 'naranja' ? '#ffb46b' : '#ffe066') });
    else if (data.lluvia) text(main, `☂ ${data.lluvia}`, 11, { weight: 'semibold', color: new Color('#8fd3ff') });
    else if (stale) text(main, 'Sin conexión: últimos datos', 10, { alpha: 0.6 });

    // Mediano: las próximas horas a la derecha
    if (family !== 'small' && Array.isArray(data.horas) && data.horas.length) {
        row.addSpacer();
        const hours = row.addStack();
        hours.layoutHorizontally();
        hours.spacing = 6;
        for (const h of data.horas.slice(0, 4)) {
            const col = hours.addStack();
            col.layoutVertically();
            col.centerAlignContent();
            text(col, h.h, 11, { alpha: 0.75 });
            col.addSpacer(4);
            const hi = await icon(h.icon);
            if (hi) { const im = col.addImage(hi); im.imageSize = new Size(26, 26); }
            col.addSpacer(2);
            text(col, `${h.t}°`, 13, { weight: 'semibold' });
            text(col, h.p >= 20 ? `${h.p}%` : ' ', 10, { color: new Color('#8fd3ff') });
        }
    }
}

if (config.runsInWidget) Script.setWidget(w);
else if (family === 'small') await w.presentSmall();
else await w.presentMedium();
Script.complete();
