# Análisis a fondo de AERIS Weather — cómo llegar a "la mejor web del tiempo del mundo"

Análisis hecho leyendo el código real del proyecto (`server.js`, `public/app.js`, `index.html`, `styles.css`, `manifest.json`, `service-worker.js`, `theme.js`, `README.md`, `package.json`, `.env`) directamente en tu carpeta `aemet-app`.

Primero lo bueno, porque es mucho: para ser un proyecto de una persona, **AERIS ya está muy por encima de la media**. Tienes Bento Grid + Glassmorphism, mesh gradients animados, 14 personalidades de IA para los consejos, índice de confort calculado, reloj solar + fase lunar dibujados a mano en canvas, polen, calidad del aire, gráficas con Chart.js, tarjetas para compartir con html2canvas, notificaciones push (lluvia, calor, viento, tormenta y resumen matutino vía cron), modo offline con caché local, onboarding, favoritos, buscador con geocoding y detección de "trampa" de TikTok/Instagram para instalar la PWA. Eso no lo tiene el 95% de las apps del tiempo indie. El salto a "la mejor del mundo" no va de añadir más widgets — va de arreglar unos huecos concretos y luego apostar fuerte por 2-3 cosas que nadie más tiene.

---

## 0. El hallazgo más importante: la app no usa AEMET

Esto es lo primero que arreglaría, porque afecta a tu credibilidad y a tu propia marca:

- La carpeta se llama `aemet-app`, el `README.md` dice literalmente *"fusiona datos precisos de la AEMET"* y da instrucciones para meter una `AEMET_API_KEY`.
- Pero en `server.js` no hay ni una sola referencia a AEMET (`grep -rn "AEMET"` no encuentra nada en el código, solo en el README). Todo el clima, el aire y el polen vienen de **Open-Meteo** (modelo ECMWF/GFS), y el geocoding de Open-Meteo + Nominatim.
- El radar "en vivo" tampoco es tuyo: es un `<iframe>` de **Windy.com** (`embed.windy.com`), con su marca de agua y sus cookies de terceros.

Esto no es necesariamente malo — Open-Meteo es una fuente sólida y gratuita — pero para una app que se llama y se vende como española/AEMET, te estás dejando en la mesa justo lo que te diferenciaría de las mil apps clónicas que ya usan Open-Meteo:

- **Avisos oficiales de AEMET (Meteoalerta)**: es una API pública gratuita por provincia (amarillo/naranja/rojo, por fenómeno). Ahora mismo tus alertas (`generateAlerts` en `server.js`) son umbrales que te has inventado tú (viento ≥ 90 = rojo, calor ≥ 40 = rojo, etc.). Son útiles, pero no son *oficiales*. Mostrar el aviso real de AEMET junto a tu alerta "inteligente" te da autoridad que ninguna app basada solo en Open-Meteo puede igualar en España.
- **AEMET OpenData** también tiene predicción horaria/diaria municipal oficial, radar y satélite propios (imágenes, no iframes de terceros), y observación de estaciones en tiempo real — podrías mostrar "AEMET dice X, nuestro modelo dice Y" como un plus de transparencia único.
- Como mínimo, corregiría el README para que no prometa algo que no se cumple (o añadiría un pequeño disclaimer "datos de Open-Meteo" en la propia app — ahora mismo el usuario final no sabe de dónde salen los datos).

**Esto es lo que te acerca de verdad a "la mejor del mundo para España"**: las apps globales (Apple Weather, AccuWeather, Windy) no tienen acceso privilegiado a avisos oficiales locales bien integrados en una UI tan bonita como la tuya. Ese es tu foso competitivo.

---

## 1. Rendimiento (lo primero que nota cualquier usuario)

- **`public/icono-clima.png` pesa 506 KB** para un icono de sol+nube que se muestra a 48–160px. Es, con diferencia, el archivo más pesado de toda la app (más que `app.js` y `styles.css` juntos). Comprimido y pasado a WebP debería pesar 15–30 KB. En 4G en España eso son décimas de segundo perdidas en cada carga, y en un icono que se ve en casi todas las pantallas.
- Cargas **Bootstrap Icons Y Font Awesome completos** a la vez desde CDN. Son dos librerías de iconos de varios cientos de KB para, seguramente, usar un subconjunto pequeño de cada una. Con una sola (o iconos SVG inline sueltos) te ahorras bastante peso y una petición HTTP.
- Bootstrap CSS+JS, Chart.js y html2canvas se cargan siempre, aunque html2canvas solo se usa al pulsar "Compartir". Cargarlo de forma diferida (import dinámico o `<script defer>` que se inyecta al abrir el modal de compartir) evita bloquear el arranque para una función que muchos usuarios no tocarán nunca.
- No hay compresión gzip/brotli en `server.js` (falta el middleware `compression`), ni cabeceras `Cache-Control` para los estáticos servidos con `express.static('public')`. Son dos líneas de código con impacto real en tiempo de carga repetida.
- El Service Worker cachea los recursos de CDN como parte del cache estático "cache-first" indefinidamente hasta que subes la versión `CACHE_NAME` a mano — es razonable, pero mezclarlo con una estrategia *stale-while-revalidate* te libraría de tener que acordarte de subir el número de versión cada vez que tocas algo.

**Quick win con más impacto por minuto invertido: comprimir ese PNG de 506 KB.**

---

## 2. Autenticidad y fiabilidad de los datos

- Ningún `axios.get(...)` en `server.js` tiene `timeout`. Si Open-Meteo, Nominatim o el geocoding tardan o se cuelgan, la petición del usuario se queda colgada sin límite de tiempo en vez de fallar rápido y mostrar el banner de error o el caché. Añadir `{ timeout: 5000 }` (y quizá un retry corto) a cada llamada es barato y evita el "se ha quedado cargando para siempre".
- La caché SQLite (`WeatherCache`) es por 5 minutos y por coordenada exacta — bien para no reventar límites de API, pero no hay ningún *fallback* de "última fuente que funcionó" separado del caché normal si Open-Meteo cae por completo (solo tienes el offline-cache del propio navegador, que es por usuario, no por ciudad a nivel servidor).
- El polen y la calidad del aire fallan en silencio a `{}` si la petición falla (`Promise.allSettled`), lo cual está bien para no romper la respuesta, pero el frontend no distingue "0 real" de "no disponible" — un usuario alérgico podría pensar que hoy no hay polen cuando en realidad el dato no llegó.

---

## 3. PWA, temas y "code smells" que vale la pena limpiar

- **`public/theme.js` es código muerto**: no está enlazado en ningún `<script>` de `index.html`, usa una clave de `localStorage` (`theme`) distinta a la que usa el resto de la app (`aeris_theme_pref`), y busca un botón `#themeBtn` que no existe en el HTML. Confunde a cualquiera que toque el repo después (incluida una IA). Bórralo o cablealo de verdad.
- Relacionado: el script anti-parpadeo en el `<head>` de `index.html` lee `localStorage.getItem('aeris_theme_pref')`, pero **nada en toda la app escribe esa clave** — el tema real lo decide `autoThemeByTime()` en `app.js` según la hora de salida/puesta de sol, y solo se aplica *después* de que llegue la respuesta de la API. Resultado: si abres la app de noche, verás un parpadeo de tema claro antes de que cambie a oscuro. Esto es un bug de UX real y fácil de arreglar (guarda el tema calculado en esa clave la primera vez que lo calculas, o cambia el script del head para usar la hora local del dispositivo como estimación inicial).
- El `manifest.json` usa el mismo `logo.png` como icono de 192 y 512, sin variante *maskable* dedicada de verdad y sin `screenshots` ni `shortcuts`. Los `shortcuts` (p. ej. acceso directo a "Mi ubicación" o a tu ciudad favorita desde el icono, mantener pulsado) y los `screenshots` mejoran el prompt de instalación en Chrome/Android y hacen que la ficha de instalación se vea "de app seria".
- No hay soporte de **Badging API** (mostrar un numerito o icono de lluvia sobre el icono de la app cuando va a llover pronto) ni de **Web Share Target** (que otras apps puedan "compartir hacia" AERIS). Ambas son API modernas de PWA que muy pocas apps del tiempo usan y que reforzarían el "esto no es una web cualquiera, es una app de verdad".

---

## 4. Backend: seguridad y solidez

- No hay `helmet` (cabeceras de seguridad: CSP, X-Frame-Options, etc.) ni `compression` en las dependencias. Son dos `npm install` y cuatro líneas que suben el nivel de "esto es una app seria" de forma barata.
- CORS por defecto permite cualquier origen (`allowedOrigins = ['*']`) si no defines `ALLOWED_ORIGIN` — vale para desarrollo, pero en producción merece la pena fijarlo a tu dominio real.
- Varias funciones de `app.js` insertan datos con `innerHTML` sin escapar (nombre de ciudad, región, favoritos, sugerencias de búsqueda) — por ejemplo la línea que construye `TU UBICACIÓN (<small>...</small>)` a partir de `loc.name`, o el listado de favoritos. Hoy esos datos vienen de Open-Meteo/Nominatim y de lo que el propio usuario ha guardado, así que el riesgo práctico es bajo, pero es una costura frágil: si algún día un proveedor externo devuelve un nombre de lugar "raro" (username de OSM, etc.), se ejecutaría como HTML. Cambiar esos `innerHTML` por `textContent` (o escapar antes de insertar) es una hora de trabajo y cierra la puerta del todo.
- No hay tests automáticos (`package.json` tiene el `test` script por defecto sin implementar), ni linter, ni CI. Para un proyecto de este tamaño no hace falta gastarse mucho, pero un par de tests de `server.js` (que `/api/weather/:id` devuelva 200 con forma esperada, que el rate limiter funcione) te protegen de romper algo sin darte cuenta al seguir añadiendo features.
- No hay endpoint de *health check* (`/healthz`) ni logging estructurado/monitorización (algo tipo Sentry o incluso un log a fichero rotado) — si la app está en producción (el `README` apunta a Render), cuando algo falle de madrugada te enterarás por un usuario enfadado, no por una alerta.
- SQLite + `sequelize` en disco es perfectamente válido a tu escala actual, pero si la app crece (más ciudades, más usuarios de push) vas a querer vigilar la concurrencia de escritura de SQLite; no es urgente, pero es la primera pared con la que chocarías si esto se vuelve muy grande.

---

## 5. Producto: qué meter para de verdad destacar

Aquí es donde decides si quieres ser "la más bonita" o "la más útil además de bonita". Te propongo, en orden de impacto:

1. **Avisos oficiales de AEMET** (ver punto 0) — el diferenciador más grande y más alineado con tu propio nombre de proyecto.
2. **Geolocalización automática al abrir** (ya está en tu propio roadmap del README) — hoy el usuario nuevo llega y ve Madrid por defecto hasta que pulsa el botón de geo. Pedir permiso de ubicación al primer uso (con buen copy, ya tienes onboarding) sube muchísimo la relevancia inmediata.
3. **Radar propio** en vez del iframe de Windy: con Leaflet + los tiles gratuitos de RainViewer (o el radar de AEMET/Open-Meteo) tendrías un radar sin marca ajena, más rápido y consistente con tu diseño glassmorphism, en vez de un iframe con su propia UI y cookies.
4. **Notificaciones más inteligentes**: ahora mismo el cron manda "va a llover" con umbrales fijos para todo el mundo. Podrías dejar que el usuario elija sensibilidad (ligero/moderado/todo) o el tipo de aviso que le interesa (solo tormentas, solo nieve si esquía, etc.) desde el propio modal de notificaciones.
5. **Comparativa histórica** más allá de "más frío/calor que ayer": normales climatológicas (¿hace más calor de lo normal para un 1 de septiembre en Madrid?), algo que Open-Meteo permite consultar vía su API de archivo histórico.
6. **Modo "hoy no llueve, ¿y en 15 días?"**: ya tienes `daily` a 7 días; Open-Meteo tiene modelos estacionales/16 días que podrías añadir como pestaña "tendencia a largo plazo" con el disclaimer de menor fiabilidad.
7. **Compartir más allá de la imagen**: usar la Web Share API nativa (`navigator.share`) además de `html2canvas`, para compartir directamente a WhatsApp/Instagram Stories sin pasar por "descargar imagen y luego subirla".
8. **Widgets nativos** (pantalla de inicio Android / pantalla bloqueada iOS): esto ya se sale de "PWA pura" y necesitaría envolver la app con Capacitor/Trusted Web Activity, pero es lo que de verdad usa la gente de una app del tiempo día a día — es la inversión más grande de esta lista pero también la que más fideliza.
9. **Internacionalización**: hoy todo está en español y con humor muy español/latino (las 14 personalidades son un puntazo, por cierto — es la función más original que tienes). Si el objetivo real es "la mejor del mundo" y no "la mejor de España", en algún momento vas a querer inglés como mínimo, con las personalidades adaptadas culturalmente (no traducidas literalmente, porque el chiste no vive fuera del contexto español).

---

## 6. SEO y que te encuentren

- No hay `robots.txt` ni `sitemap.xml` en `public/`.
- No hay datos estructurados (`schema.org` / JSON-LD tipo `WeatherForecast`) que permitan a Google mostrar un rich snippet de tu previsión directamente en el buscador.
- Los metadatos Open Graph están bien puestos (título, descripción, imagen), lo cual ya te pone por delante de mucha competencia amateur, pero al ser una SPA sin rutas por ciudad (todo vive en `/` con querystring), cada ciudad no tiene su propia URL indexable — no hay forma de que Google indexe "tiempo en Valencia" y aterrice a alguien directamente en esa ciudad. Aunque sea solo para SEO, unas rutas tipo `/tiempo/valencia` que precarguen esa ciudad (aunque la app siga siendo la misma SPA por debajo) te abrirían muchísimo tráfico orgánico de búsquedas locales, que es como la gente de verdad busca "el tiempo en mi pueblo".

---

## 7. Accesibilidad

Aquí ya has hecho bastante deberes: hay `aria-label`, `role="listbox"`, `aria-live` en banners de error/offline y en alertas — mejor que la mayoría de apps del tiempo. Lo que falta:

- No he encontrado ninguna regla `prefers-reduced-motion` en `styles.css`. Con mesh gradients, partículas de lluvia/nieve en `<canvas>`, animaciones de splash y de tarjetas, alguien con sensibilidad al movimiento (mareos, migrañas) no tiene forma de pedirle a la app que se calme. Es una media query de pocas líneas que desactiva o reduce esas animaciones cuando el sistema operativo lo pide.
- No he visto estilos `:focus-visible` personalizados — merece la pena comprobar con el teclado (Tab) que se ve claramente qué elemento tiene el foco en toda la interfaz, sobre todo dentro de los modales y el sidebar de favoritos.

---

## 8. Monetización / crecimiento (ya que hablamos de ser "la mejor del mundo", también hay que sobrevivir)

- Ya tienes un botón de Ko-fi, que está bien para donaciones puntuales. Si el proyecto crece, un nivel "Pro" sin anuncios / con notificaciones ilimitadas / con radar en alta resolución es un modelo probado en apps del tiempo indie (Carrot Weather, por ejemplo, vive de eso).
- No hay ninguna analítica (ni siquiera algo respetuoso con la privacidad tipo Plausible/Umami). Sin saber qué ciudades se buscan más, qué personalidad se usa más, o en qué paso se cae la gente del onboarding, es difícil priorizar qué construir después con datos reales en vez de intuición.

---

## Roadmap sugerido, de menor a mayor esfuerzo

**Esta tarde (quick wins, <1h cada uno):**
- Comprimir `icono-clima.png` (506 KB → ~20 KB).
- Añadir `timeout` a todas las llamadas `axios.get` en `server.js`.
- Borrar `public/theme.js` (código muerto) o cablearlo de verdad.
- Añadir `compression` + `helmet` a `server.js`.
- Añadir `robots.txt` y un `sitemap.xml` básico.
- Corregir el README para que refleje que la fuente real es Open-Meteo (o ponerlo en la propia UI como pie de página "Datos: Open-Meteo").

**Esta semana:**
- Arreglar el parpadeo de tema día/noche al cargar.
- Sustituir los `innerHTML` con datos externos por `textContent`/escapado.
- Geolocalización automática al primer uso.
- `prefers-reduced-motion` en el CSS.
- Cargar Chart.js/html2canvas de forma diferida.

**Este mes (las apuestas grandes):**
- Integrar avisos oficiales de AEMET Meteoalerta junto a tus alertas propias.
- Radar propio (RainViewer/Leaflet) sustituyendo el iframe de Windy.
- Datos estructurados + rutas por ciudad para SEO.
- Analítica de producto básica y respetuosa con la privacidad.

Si quieres, puedo ponerme ya con cualquiera de estos puntos directamente sobre tu carpeta — dime por cuál empezamos.
