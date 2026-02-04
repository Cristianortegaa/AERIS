// --- WEATHER API ---
app.get('/api/weather/:id', async (req, res) => {
    let locationId = req.params.id;
    let forcedName = req.query.name;
    let forcedRegion = req.query.region || "";

    try {
        let lat, lon;
        
        if (locationId.includes(',')) {
            [lat, lon] = locationId.split(',');
            // Lista negra para forzar geocodificación inversa
            const badNames = ['undefined', 'null', 'Ubicación', 'Tu ubicación', 'Ubicación detectada', 'Ubicación Detectada', '', 'My Location'];
            
            if (!forcedName || badNames.includes(forcedName)) {
                try {
                    // Intento 1: Open-Meteo
                    const geoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=es&format=json`;
                    const geoRes = await axios.get(geoUrl);
                    if (geoRes.data.results && geoRes.data.results.length > 0) {
                        // CAMBIO: Formato "Tu ubicación (Ciudad)"
                        forcedName = `Tu ubicación (${geoRes.data.results[0].name})`;
                        const r = geoRes.data.results[0];
                        forcedRegion = [r.admin1, r.country].filter(Boolean).join(', ');
                    } else { throw new Error("OpenMeteo Empty"); }
                } catch(err) {
                    try {
                        // Intento 2: Nominatim
                        const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
                        const nomRes = await axios.get(nomUrl, { headers: { 'User-Agent': 'AerisApp/1.0' } });
                        const a = nomRes.data.address;
                        const place = a.city || a.town || a.village || a.municipality;
                        // CAMBIO: Formato "Tu ubicación (Ciudad)"
                        forcedName = place ? `Tu ubicación (${place})` : "Tu ubicación";
                        forcedRegion = [a.state, a.country].filter(Boolean).join(', ');
                    } catch(e2) { forcedName = "Tu ubicación"; }
                }
            }
        } else {
            // Búsqueda por texto (no cambiamos nada, muestra el nombre de la ciudad tal cual)
            const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationId)}&count=1&language=es&format=json`);
            if (!geoRes.data.results) throw new Error("Ciudad no encontrada");
            lat = geoRes.data.results[0].latitude;
            lon = geoRes.data.results[0].longitude;
            locationId = `${lat},${lon}`;
            if (!forcedName) forcedName = geoRes.data.results[0].name;
        }

        const cache = await WeatherCache.findByPk(locationId);
        if (cache && (new Date() - new Date(cache.updatedAt) < 5 * 60 * 1000)) {
            const data = JSON.parse(cache.data);
            if (forcedName && forcedName !== "Tu ubicación") data.location.name = forcedName;
            return res.json(data);
        }

        const [wRes, aRes, pRes] = await Promise.allSettled([
            axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,cloud_cover&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&timezone=auto&past_days=1`),
            axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5&timezone=auto`),
            axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen,oak_pollen,pine_pollen,cypress_pollen,hazel_pollen,plane_tree_pollen,poplar_pollen,ash_pollen&timezone=auto`)
        ]);

        if (wRes.status === 'rejected') throw new Error("Fallo API Clima");
        const w = wRes.value.data;
        const a = (aRes.status === 'fulfilled') ? aRes.value.data : { current: {} };
        const p = (pRes.status === 'fulfilled') ? pRes.value.data : { current: {} };
        
        const currentWMO = decodeWMO(w.current.weather_code, w.current.is_day);
        const currentTime = w.current.time;
        const currentHourStr = currentTime.substring(0, 13);
        
        let startIndex = w.hourly.time.findIndex(t => t.startsWith(currentHourStr));
        if (startIndex === -1) startIndex = 0;

        let comparisonText = "";
        try {
            if (startIndex >= 24) {
                const tempYesterday = w.hourly.temperature_2m[startIndex - 24];
                const tempToday = w.hourly.temperature_2m[startIndex];
                const diff = tempToday - tempYesterday;
                if (Math.abs(diff) < 1) comparisonText = "Misma temperatura que ayer";
                else if (diff > 0) comparisonText = `${Math.round(diff)}° más calor que ayer`;
                else comparisonText = `${Math.abs(Math.round(diff))}° más frío que ayer`;
            }
        } catch (err) { comparisonText = ""; }

        const hourly = w.hourly.time
            .slice(startIndex, startIndex + 24)
            .map((t, i) => {
                const realIndex = startIndex + i;
                return { 
                    fullDate: t, hour: parseInt(t.split('T')[1].split(':')[0]), displayTime: t.split('T')[1], 
                    temp: Math.round(w.hourly.temperature_2m[realIndex]), rainProb: w.hourly.precipitation_probability[realIndex], 
                    precip: w.hourly.precipitation[realIndex], icon: decodeWMO(w.hourly.weather_code[realIndex], w.hourly.is_day[realIndex]).icon 
                };
            });

        let nowcast = { time: [], precipitation: [] };
        if (w.minutely_15) {
            const indices = w.minutely_15.time.map((t, i) => ({ t, i })).filter(item => item.t >= currentTime).map(item => item.i);
            nowcast.time = indices.map(i => w.minutely_15.time[i]);
            nowcast.precipitation = indices.map(i => w.minutely_15.precipitation[i]);
        }

        const pollenData = {
            alder: p.current.alder_pollen || 0, birch: p.current.birch_pollen || 0, grass: p.current.grass_pollen || 0,
            mugwort: p.current.mugwort_pollen || 0, olive: p.current.olive_pollen || 0, ragweed: p.current.ragweed_pollen || 0,
            oak: p.current.oak_pollen || 0, pine: p.current.pine_pollen || 0, cypress: p.current.cypress_pollen || 0,
            hazel: p.current.hazel_pollen || 0, plane: p.current.plane_tree_pollen || 0, poplar: p.current.poplar_pollen || 0,
            ash: p.current.ash_pollen || 0
        };

        const alerts = generateAlerts(w);

        const finalData = {
            location: { name: forcedName || "Tu ubicación", region: forcedRegion, lat, lon, timezone: w.timezone },
            current: { 
                temp: Math.round(w.current.temperature_2m), feelsLike: Math.round(w.current.apparent_temperature), humidity: w.current.relative_humidity_2m, 
                windSpeed: Math.round(w.current.wind_speed_10m), desc: currentWMO.text, icon: currentWMO.icon, isDay: w.current.is_day === 1, 
                uv: w.daily.uv_index_max[0] || 0, aqi: a.current.us_aqi || 0, pm25: a.current.pm2_5 || 0, pm10: a.current.pm10 || 0, time: w.current.time,
                cloudCover: w.current.cloud_cover || 0, comparison: comparisonText
            },
            nowcast: nowcast, hourly: hourly, pollen: pollenData, alerts: alerts, 
            daily: w.daily.time.map((t, i) => {
                return { 
                    fecha: t, tempMax: Math.round(w.daily.temperature_2m_max[i]), tempMin: Math.round(w.daily.temperature_2m_min[i]), 
                    sunrise: w.daily.sunrise[i].split('T')[1], sunset: w.daily.sunset[i].split('T')[1], icon: decodeWMO(w.daily.weather_code[i], 1).icon, 
                    rainProbMax: w.daily.precipitation_probability_max[i],
                    dayHours: w.hourly.time.reduce((acc, timeStr, idx) => {
                        if (timeStr.startsWith(t)) {
                            acc.push({
                                time: timeStr.split('T')[1], temp: Math.round(w.hourly.temperature_2m[idx]), rainProb: w.hourly.precipitation_probability[idx], 
                                icon: decodeWMO(w.hourly.weather_code[idx], 1).icon
                            });
                        }
                        return acc;
                    }, [])
                };
            }).filter(d => d.fecha >= currentTime.split('T')[0])
        };

        await WeatherCache.upsert({ locationId, data: JSON.stringify(finalData), updatedAt: new Date() });
        res.json(finalData);

    } catch (e) { console.error(e); res.status(500).json({ error: "Error interno" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Aeris LIVE en puerto ${PORT}`));