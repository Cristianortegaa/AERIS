# AERIS: qué meter para que sea la mejor app del tiempo

Fecha: 2026-10-02 · Commit analizado: `8225647`

Este documento junta tres análisis hechos a la vez:

1. **Competencia y usuarios:** más de 25 apps (Apple Weather, CARROT, Windy, AccuWeather, Meteored, eltiempo.es, AEMET, Acme, snowy.es…), reseñas, tendencias 2025-2026 y lo específico de España.
2. **Inventario de AERIS:** todo lo que tiene la app hoy, qué datos pide y qué datos gratuitos está desaprovechando. Los endpoints se probaron en vivo.
3. **Experiencia premium:** las skills `apple-design`, `emil-design-eng`, `mobile-native`, `find-animation-opportunities`, `animate`, `prototype` y `pick-ui-library` aplicadas a funciones nuevas, no a arreglos.

No repite lo de [ANALISIS-MEJORAS.md](ANALISIS-MEJORAS.md) ni [ANALISIS-SKILLS.md](ANALISIS-SKILLS.md), que tratan de arreglos.

---

## La idea en una frase

> **La app del tiempo de España sin anuncios que te dice qué hacer hoy y cuánto puedes fiarte de la previsión.**

Por qué esta posición está libre:

- **AEMET** es oficial y no tiene anuncios, pero tiene 2,8★ en Google Play. No ofrece lluvia por minutos, ni horas más allá del día 3, ni polen, aire o explicaciones. Su rediseño de junio de 2026 desorientó a muchos usuarios.
- **Meteored y eltiempo.es** tienen anuncios invasivos y comparten la ubicación con anunciantes. eltiempo.es es más un medio de noticias que una herramienta.
- **Apple Weather no da la lluvia de la próxima hora en España** (solo en AU, IE, JP, UK y US).
- **Nadie en España** enseña cuánto fiarse de la previsión, el riesgo de calor para la salud por zona, ni una tarjeta que junte calima, polen y aire.
- La queja número 2 de todo el sector son los anuncios (23 %), y la peor de todas es un anuncio entre una alerta grave y su información. AERIS no tiene anuncios: hay que decirlo en voz alta.
- Lo que ya diferencia a AERIS (las 14 personalidades, el cristal y los avisos de AEMET) encaja con esta posición.

Hay cinco pilares, y el orden importa: **primero confianza, luego España, luego decidir, luego sensación nativa.** Una app bonita con un UV equivocado pierde al usuario en una semana.

---

## 0. Antes de añadir nada: los datos tienen que ser correctos

Al hacer el inventario aparecieron fallos de datos. **Van primero**, porque una app del tiempo vive de la confianza. Los marcados con ✔ están comprobados en vivo contra la API.

| # | Fallo | Efecto | Arreglo |
|---|---|---|---|
| 1 ✔ | **El polen nunca ha funcionado.** Se piden 7 especies que Open-Meteo no tiene (`oak`, `pine`, `cypress`, `hazel`, `plane_tree`, `poplar`, `ash`) y la API responde con error. | La tarjeta de polen no sale nunca y las frases de alergia de la IA tampoco. | Pedir solo las 6 válidas (aliso, abedul, gramíneas, artemisa, olivo, ambrosía). `server.js:502` |
| 2 ✔ | **El UV que se ve es el máximo de ayer.** Con `past_days=1`, `daily[0]` es ayer. | Hoy se ve 4.8 y es 5.0. | Usar el índice de hoy y, mejor, el UV horario actual. `server.js:592` |
| 3 | **Los avisos AEMET van por comunidad, no por zona.** | Un aviso naranja en la costa de Almería le llega por push a alguien de Sevilla. | Cruzar el polígono o geocódigo del CAP con la ubicación. Sin llamadas extra. |
| 4 | **Las "rachas" son viento medio** (`wind_speed_10m`). | El aviso de viento casi nunca salta. | Usar `wind_gusts_10m`. |
| 5 | **La presión sale en 949 hPa en Madrid** (`surface_pressure`, a la altitud de la ciudad). | Todo el mundo espera unos 1013. | Usar `pressure_msl`. |
| 6 | El reloj solar y el tema día/noche usan **la hora del dispositivo**, no la de la ciudad. | Falla en Canarias y en el extranjero. | Usar la zona horaria de la ciudad (`location.timezone`). |
| 7 | La tendencia de presión compara ciudades distintas. | Flecha falsa al cambiar de ciudad. | Calcularla con `hourly.pressure_msl` de hace 3 h. |
| 8 | La "lluvia torrencial" usa lo ya caído, no la previsión. | Casi nunca salta. | Usar la previsión horaria. |
| 9 | Todas las notificaciones comparten la misma `tag`, y al tocarlas siempre se abre `/`. | El resumen matutino tapa un aviso naranja sin leer. | Una `tag` por tipo y `data.url` a la ciudad o el aviso. |
| 10 | `getBestWindows()` propone correr a las 4 de la madrugada. | — | Limitar a 7–22 h, salvo "Estrellas". |
| 11 | La caché del servidor usa la coordenada exacta del GPS. | Casi nunca acierta y la tabla crece sin límite. | Redondear a unos 1 km y purgar. |
| 12 | Se llama a `geocoding…/v1/reverse`, que no existe (404). | Una llamada perdida antes de Nominatim. | Quitarla. |
| 13 | `#nowcast-text` tiene `aria-live` y se repinta cada minuto. | VoiceOver lee la cuenta atrás sin parar. | Anunciar solo los cambios seco ↔ lluvia. |
| 14 | "RADAR EN VIVO" es en realidad el modelo ECMWF de Windy. | El rótulo engaña. | Cambiar el rótulo, o poner un radar real (punto 4.4). |
| 15 | La luna es un emoji calculado con un ciclo medio. | No da salida, puesta ni iluminación. | SunCalc (4 KB), con la zona horaria de la ciudad. |
| 16 | El icono del hero flota en bucle de 6 s (~0,17 Hz). | Es la franja de oscilación que apple-design pide evitar por mareo. | Quitar el bucle. |
| 17 | Errores de texto: "mas frio" sin tildes, "14 personalidades" cuando son 15, y el README promete funciones que no existen. | — | Corregir. |
| 18 | La vibración salta **en cada toque de la barra inferior**. | El usuario aprende a ignorar todas las vibraciones (apple-design §13). | Quitarla de ahí. |

**Esfuerzo:** casi todo es S (pequeño). Es un sprint de 1–2 días y lo que más mejora la confianza por hora invertida.

---

## Pilar 1 · Confianza: que la gente se fíe de AERIS

### 1.1 «¿Cuánto me fío?» (incertidumbre de la previsión) ★ diferenciador
- **Qué es:** cada día de la previsión lleva una nota de confianza ("Fiable", "Bastante seguro", "Incierto: revísalo mañana"). Al tocar el gráfico, una franja con el rango probable (p10–p90) en lugar de una sola línea, y la probabilidad de lluvia calculada de verdad con los miembros del ensemble.
- **Por qué:** es *la* tendencia de producto de 2026. Acme Weather, de los fundadores de Dark Sky, la ha hecho su función principal. La investigación (UCAR, Winton Centre) dice que dar la incertidumbre mejora las decisiones y la confianza. Nadie lo hace en España.
- **Datos:** la Ensemble API de Open-Meteo ya tiene **ECMWF AIFS ENS** (la IA de ECMWF, 51 miembros) y **Google WeatherNext 2** (64 miembros). Se probó con 51 miembros.
- **Coste:** cada miembro cuenta como variable en la cuota. Pedirlo solo bajo demanda y con caché de 6 h por celda.
- **Esfuerzo:** M.

### 1.2 Frescura y procedencia de cada dato
- **Frescura:** "Actualizado hace 14 min" (solo pasados 10 min) y, sin red, un chip discreto "Datos de las 14:05". Ojo: es **distinto** del banner de "Sin conexión" que se quitó; aquí solo se indica de cuándo son los datos.
- **Procedencia:** al tocar, de dónde sale el dato: "Modelo AROME 1,5 km · actualizado 13:00" o "Aviso oficial AEMET".
- **Explicar la sensación térmica:** qué la sube o la baja, con viento y humedad. La queja que recibe RealFeel es justo que sea opaca.
- **Esfuerzo:** S.

### 1.3 Dato real de la estación más cercana
- **Qué es:** "Ahora mismo en Madrid-Retiro: 18,4 °C, racha 22 km/h" junto al dato del modelo.
- **Datos:** AEMET OpenData, `observacion/convencional/todas` (probado, OK). Bajarlo cada 30–60 min en el servidor y buscar la estación más cercana.
- **Ojo:** AEMET devolvió 503 por mantenimiento en algunas pruebas. Siempre con caché y con un respaldo.
- **Esfuerzo:** M.

### 1.4 «Modo serio» con avisos naranja o rojo
- **Qué es:** con un aviso naranja o rojo, la personalidad deja de bromear y enseña el aviso en tono neutro: "Aviso naranja por tormentas · 16:00–22:00". El Villano no puede decir "¡Que arda todo!" con un aviso rojo por calor.
- **Por qué:** apple-design, *Responsibility*. Protege la seña de identidad de la app en el único momento en que puede volverse en contra.
- **Esfuerzo:** S (unas 15 líneas).

### 1.5 Avisos AEMET de calidad (en la app y en el push)
- **Contenido:** "desde / hasta" (`onset` / `expires` ya llegan y no se muestran), el acumulado previsto (mm en 1 h y en 12 h) y consejos concretos ("no cruces vados").
- **Cuándo se notifica:** solo cuando **cambia el nivel**, nunca repetido. Requiere el arreglo 3.
- **Al tocarlo:** se abre **directamente el aviso**, sin nada en medio. Es la regla de producto que sale de la peor queja del sector.
- **Esfuerzo:** M.

---

## Pilar 2 · Hecha para España (lo que no tiene ninguna app internacional)

### 2.1 Tarjeta «Aire»: calima, polen y AQI europeo ★
- **Calima:** variable `dust` de la Air Quality API. Esta semana marca hasta 152 µg/m³ en Madrid. Avisa de "lluvia de barro" (calima con lluvia) y da consejos: no lavar el coche, no tender la ropa, cuidado los asmáticos. En España hay entre 5 y 15 episodios al año y nadie lo cuenta bien.
- **Polen por tipo:** olivo y gramíneas son clave en el sur y el centro. Tiene previsión de 4 días y aviso de pico. Decir con honestidad lo que **no** cubre (cupresáceas y plátano de sombra, muy importantes en Madrid).
- **AQI europeo (EAQI):** es el estándar en Europa; hoy la app usa el de EE. UU. Incluye previsión horaria, ozono y NO₂.
- **Esfuerzo:** S–M. Es el mismo endpoint que ya se usa, cambiando parámetros.

### 2.2 Calor y salud
- **Riesgo para la salud por calor en tu zona:** se compara la máxima prevista con el umbral de su **zona Meteosalud** (182 zonas: 25,7 °C en Asturias, 41,5 °C en Sevilla). ⚠ Hay que conseguir la tabla de umbrales de Sanidad.
- **Noches tropicales (≥ 20 °C) y tórridas (≥ 25 °C):** un concepto muy español que ninguna app internacional enseña. El verano de 2026 fue el más cálido de la serie, con 61 días de ola de calor.
- **«Hoy hace +3° sobre lo normal»:** normales de 1991–2020 (ERA5 vía la archive-api de Open-Meteo, o las normales oficiales de AEMET por estación). Se precalculan una vez por celda y se guardan para siempre.
- **Visualización:** dos marcas finas con la mínima y la máxima de ayer y una banda tenue con lo normal, dibujadas **sobre la barra del día** que ya existe. Sin animación.
- **Esfuerzo:** S para lo de ayer (los datos ya llegan con `past_days=1`), M para las normales y Meteosalud.

### 2.3 Día de playa y mar
- **Qué es:** una puntuación "Día de playa" con temperatura del agua, oleaje, viento de tierra o de mar (poniente / levante), UV y nubes. Arregla la actividad "Playa", que hoy no mira el mar.
- **Datos:** Marine API (probado en Málaga: agua a 23,1 °C y olas de 0,74 m). Solo para ubicaciones costeras.
- **Más adelante:** predicción de playas de AEMET. Las medusas, enlazando con MedusApp o Infomedusa.
- **Esfuerzo:** M.

### 2.4 Incendios
- **Qué es:** riesgo meteorológico de incendio del día, focos activos (NASA FIRMS) y humo (PM2.5 de CAMS).
- **Por qué:** 2025 fue el peor año desde 1994, y un artículo de El Español de 2026 señala que faltan apps de incendios y humo.
- **Ojo:** el mapa de riesgo de AEMET es una imagen, no un dato por punto. Hay que buscar una fuente por punto o usar FIRMS más el viento.
- **Esfuerzo:** M–L.

### 2.5 Previsión para el puente o un viaje
- **Qué es:** una tarjeta "Este puente en Valencia" con el nivel de confianza del punto 1.1, o "Mi viaje: Granada del 10 al 12" (como el *Trip Forecast* de Mercury).
- **Cuándo:** el Puente del Pilar es del 10 al 12 de octubre y en diciembre hay "acueducto". Requiere la previsión a 16 días (punto 3.4).
- **Esfuerzo:** M.

### 2.6 Nieve y montaña
- **Qué es:** cota de nieve (`freezing_level_height`) y nieve acumulada, y "nieve en la cota de la estación" para las estaciones de esquí.
- **Esfuerzo:** M.

---

## Pilar 3 · Decidir: que la app diga qué hacer, no solo qué tiempo hace

### 3.1 Resumen en una frase
- **En las próximas 24 h:** "Chubascos hasta las 15:00; después, intervalos nubosos. Máxima de 24° hacia las 16:00".
- **Para mañana:** otra frase similar.
- **Por qué:** es lo más valorado del *AI Weather Report* de Pixel y de Apple Weather.
- **Cómo:** con reglas sobre los datos horarios, **sin necesidad de un LLM**. Mejor prudente ("posibles chubascos por la tarde") que con una precisión falsa.
- **Esfuerzo:** S.

### 3.2 «Mejor momento hoy»
- **Qué es:** al tocar una actividad, la tira horaria se desplaza a su ventana y la marca con una barra de color. Hoy "↗ 4–7h" es críptico.
- **Ampliarlo:** con las preferencias del 3.4 (correr, bici, terraza, playa). Samsung lo añadió en One UI 7.
- **Esfuerzo:** S–M.

### 3.3 Parte matinal útil
- **Qué cambia:**
  - Se envía a **la hora local** de cada usuario (hoy sale a todos a la vez, sin mirar su zona horaria).
  - Al tocarlo se abre una hoja con tres filas: **qué ponerte**, **cuándo salir** y **qué cambia respecto a ayer**.
  - Usa la personalidad elegida, salvo que haya un aviso (punto 1.4).
- **Esfuerzo:** M.

### 3.4 Bienvenida que personaliza
- **Qué es:** tres pasos que sirven para algo, todos con opción de saltar:
  1. Ubicación, pidiendo el permiso explicando para qué.
  2. "¿Qué haces al aire libre?" y "Tengo alergia a…".
  3. Elegir la personalidad, viendo en directo la frase de hoy.
- **Para qué:** las respuestas ordenan las actividades, priorizan la tarjeta de polen y ajustan los avisos.
- **Esfuerzo:** M.

### 3.5 Avisos configurables
- **Qué es:** el usuario elige qué avisos quiere (lluvia, tormenta, calor, viento, AEMET por nivel, calima, polen, UV, bajada de presión para migrañas) y a qué hora le llega el parte.
- **Varias ubicaciones:** "avísame en casa y en el trabajo", sin que consultar Tokio te mueva los avisos a Tokio.
- **Por qué:** "notificaciones spam" es el 12 % de las quejas del sector.
- **Esfuerzo:** M. Hace falta guardar preferencias y una tabla de ubicaciones por suscripción.

### 3.6 Hoja de detalle por dato
- **Qué es:** tocar Humedad, Viento, Presión o UV abre una hoja con su curva de 24 h y una frase que lo explica. Por ejemplo: "Punto de rocío 17°: ambiente bochornoso" o "UV 7 a las 14:00: crema de 12 a 17 h".
- **Por qué:** lo básico a la vista y lo avanzado un nivel más abajo, que es lo que da profundidad a Apple Weather.
- **Esfuerzo:** M.

---

## Pilar 4 · Sentirse nativa y «premium»

### 4.1 Recorrer la curva de 24 h con el dedo ★ lo que más se nota
- **Qué es:** encima de la tira horaria, una curva de temperatura con las barras de lluvia. Al arrastrar el dedo, el hero muestra esa hora en vivo ("Previsto · 17:00") y, al soltar, vuelve a "Ahora".
- **Por qué:** manipulación directa (apple-design §2) con respuesta continua (§1). Es el gesto que convierte la app en un instrumento.
- **Cómo:**
  - `touch-action: pan-y` en la curva, para que el scroll vertical siga siendo de la página.
  - Mientras se arrastra, el hero cambia sin animación.
  - Al soltar, vuelve con `blurIn` (280 ms).
- **Esfuerzo:** M. Hay que afinarlo en un móvil real.

### 4.2 Un cielo que sigue la posición real del sol
- **Qué es:** un cielo continuo en lugar de 7 fondos fijos: noche, hora azul, hora dorada con un brillo cálido en el horizonte y día pleno. Las nubes lo apagan hacia gris. Arregla el salto brusco de claro a oscuro.
- **Cómo:** la altura del sol se calcula con la fecha, la latitud y el amanecer y anochecer. Se interpolan las variables `--sky-*`, que ya tienen transición.
- **Esfuerzo:** M.

### 4.3 La lluvia te acompaña al hacer scroll
- **Qué es:** si llueve en menos de 2 h y el hero sale de pantalla, la píldora "Lluvia en 12 min" se queda fija bajo la barra superior, como un *Live Activity*.
- **Cómo se siente:** entra en 220 ms y sale en 160 ms. Se descarta deslizando hacia arriba. Sin pulsos en bucle.
- **Esfuerzo:** S.

### 4.4 Radar de verdad con línea de tiempo
- **Qué es:** un radar observado (RainViewer, con 2 h de pasado cada 10 min), con deslizador de tiempo, reproducir y pausa, tu posición y pantalla completa. Windy se queda como capa de "modelo".
- **⚠ Licencia de RainViewer:** "uso personal y educativo", atribución obligatoria y zoom máximo 7. Revisarla si la app llega a monetizarse.
- **AEMET:** su endpoint de radar devolvió 404. Hay que volver a mirarlo cuando lleguen sus 18 radares nuevos (finales de 2026).
- **Esfuerzo:** L.

### 4.5 Deslizar entre ciudades guardadas
- **Qué es:** deslizar en horizontal sobre el hero para pasar de una ciudad guardada a otra, con puntitos de página, como en Apple Weather. La primera página es "Mi ubicación".
- **Esfuerzo:** L. Necesita precargar las ciudades vecinas y probarlo en un móvil real; conviene prototiparlo antes.

### 4.6 Favoritos con datos en vivo
- **Qué es:** el panel de favoritos muestra la temperatura y el icono de cada ciudad.
- **Cómo:** una sola petición a Open-Meteo para varias coordenadas.
- **Esfuerzo:** S–M.

### 4.7 Lo que se puede hacer en vez de widgets
- **Por qué:** una PWA no puede tener widgets ni Live Activities, ni en iOS ni en Android.
- **Lo que sí se puede:**
  - **Globo en el icono** (Badging API, iOS 16.4+ instalada) con los avisos activos.
  - **Accesos directos** al mantener pulsado el icono (Android): "Lluvia ahora", "Radar", "Mis lugares".
  - **Notificaciones ricas** con acciones y enlace directo.
  - **Declarative Web Push** en iOS 18.4+: más fiable y gasta menos batería.
  - **Share Target** en Android: compartir una ubicación hacia AERIS.
- **Esfuerzo:** S–M.

### 4.8 Detalles que suman
- **Pull-to-refresh propio:** solo en la app instalada. Recarga los datos sin el splash y con un muelle que respeta la velocidad del dedo.
- **Hero compacto:** al hacer scroll, la barra superior muestra "Madrid · 19° · Chubascos".
- **Transición al elegir ciudad** (View Transitions): el nombre "vuela" de la sugerencia al título.
- **Vibraciones con criterio:** solo en momentos con significado (cambio de hora al recorrer la curva, umbral del pull-to-refresh, aviso rojo).
- **Ilustraciones propias del tiempo:** SVG por capas y luna con su fase real, animadas solo al cambiar el estado, nunca en bucle. Es L y depende del arte; si no queda al nivel del resto, mejor no hacerlo.
- **Accesibilidad:**
  - un resumen del hero para VoiceOver;
  - `aria-label` en cada hora;
  - respetar el tamaño de texto de iOS.

---

## Pilar 5 · Personalidad (lo que ya es único, llevado más lejos)

- **Estados vacíos y errores con la voz de la personalidad.** Por ejemplo, la Madre: "¿Otra vez sin cobertura? Te dejo lo último que vi, de las 14:05".
- **Búsqueda aproximada:** "¿Querías decir Xàtiva?".
- **Las frases usan la previsión, no solo el estado actual:** "Ahora sol, pero a las 17 h te mojas".
- **Compartir con la personalidad:** la imagen lleva la frase del día. Es lo que hace que la gente la comparta.

---

## Crecimiento y negocio

1. **Una URL propia por ciudad** (`/tiempo/valencia`):
   - el servidor la devuelve con su `<title>`, su descripción, datos JSON-LD y la previsión ya incluida;
   - `sitemap.xml` con todas las localidades.
   - Es como la gente busca de verdad ("tiempo en mi pueblo"), y ayuda al arranque en frío.
2. **El mensaje de marca** en la bienvenida y en la ficha: "Sin anuncios, sin rastreo. Avisos oficiales de AEMET y los mejores modelos de Europa, incluida la IA de ECMWF".
3. **⚠ Licencia de Open-Meteo:** el plan gratis es **solo para uso no comercial** (CC BY 4.0, 10 000 llamadas al día).
   - Con anuncios o un plan "Pro" hay que pasar al plan de pago (Standard: 1 M de llamadas al mes).
   - La atribución tiene que verse y estar enlazada; hoy solo está en el panel lateral.
   - Lo que hay en el mercado: un Pro barato (~10 €/año, sin anuncios de partida) o donaciones.
4. **Cuota:** con unas 100 zonas activas, el aviso de lluvia (cada 15 min) gasta solo la cuota diaria de Open-Meteo. Antes de crecer:
   - en el cron, pedir `forecast_days=1`;
   - caché por fuente: aire y polen 1 h, geocodificación 30 días;
   - las fuentes caras (ensemble, marine, normales) solo bajo demanda.
5. **Infraestructura:**
   - En el plan gratis de Render el servidor se duerme a los ~15 min sin uso, y el primer usuario espera de 30 a 60 s.
   - Hace falta `/healthz` y un cron versionado en el repo (hoy no está).
   - Confirmar que producción tiene `DATABASE_URL`. Si no, Render borra las suscripciones en cada despliegue. Mejor Neon o Supabase que el Postgres gratis de Render.

---

## Qué NO meter (y por qué)

| Tentación | Por qué no |
|---|---|
| Anuncios | Es la queja número 2 del sector y lo que más diferencia a AERIS de Meteored y eltiempo.es. Además obliga al plan comercial de Open-Meteo. |
| Lluvia o nieve más densas a pantalla completa, rayos en bucle | Mareos, fotosensibilidad y batería. El canvas ya es lo más caro de la app. |
| Parallax con el giroscopio | Pide permiso en iOS, marea y es decoración. |
| Contador de temperatura que sube desde 0, escalonados en listas diarias | Se ven decenas de veces al día y son datos que se leen. |
| Sonido ambiente automático | Rompe la sensación de control del usuario. |
| «Stories» a pantalla completa que avanzan solas | Imponen su ritmo. El parte matinal (3.3) da lo mismo sin secuestrar la pantalla. |
| Confeti por «día perfecto» | Adorno sin función, y se vería varias veces por semana. |
| Detalle horario a 14 días presentado como fiable | Es una de las causas de desconfianza. A 16 días, solo tendencia y con la confianza (1.1). |
| Chat con un LLM | Caro, y un resumen hecho con reglas (3.1) da el 90 % del valor. Como mucho más adelante, y nunca para avisos. |

> Nota: el análisis de experiencia recomendaba acortar el splash (3 s en cada apertura chocan con la *respuesta inmediata* de apple-design). Se mantiene en 3 s porque lo pediste así; si algún día se quiere, puede durar 3 s solo la primera vez y menos cuando ya hay datos guardados.

---

## Hoja de ruta

| Fase | Qué | Por qué en este orden | Esfuerzo |
|---|---|---|---|
| **1. Datos correctos** | Los 18 fallos de la sección 0 | Sin esto lo demás no sirve. Se nota enseguida (polen, UV, avisos AEMET por zona). | 1–2 días |
| **2. Confianza e identidad** | Modo serio (1.4), frescura y procedencia (1.2), resumen en una frase (3.1), tarjeta Aire con calima, polen y EAQI (2.1), "vs ayer" sobre la barra (2.2), píldora de lluvia fija (4.3), globo en el icono, accesos directos y notificaciones con enlace (4.7) | Mucho impacto con poco esfuerzo; mayoría S | ~1 semana |
| **3. Lo que se nota** | Curva con el dedo (4.1), cielo según el sol (4.2), mejor momento (3.2), detalle por dato (3.6), favoritos con datos (4.6), avisos AEMET de calidad (1.5) | Lo que hace que se sienta "la mejor" | 2 semanas |
| **4. Diferenciadores** | Incertidumbre con AIFS y WeatherNext (1.1), calor y salud con normales y Meteosalud (2.2), avisos configurables y varias ubicaciones (3.5), parte matinal a la hora local (3.3), bienvenida personalizada (3.4), URLs por ciudad (SEO) | Lo que nadie hace en España | 3–4 semanas |
| **5. Apuestas grandes** | Radar propio (4.4), deslizar entre ciudades (4.5), playa y mar (2.3), estación cercana (1.3), puente o viaje (2.5), incendios (2.4), ilustraciones propias | Más esfuerzo o dependen de terceros (licencias, AEMET) | según prioridad |

**Para elegir solo tres cosas fuera de la fase 1:**

1. La **tarjeta Aire con la calima**: es muy española y barata.
2. **«¿Cuánto me fío?»**: es la tendencia de 2026 y no la hace nadie en España.
3. La **curva que se recorre con el dedo**: es lo que más "premium" se siente.

---

## Fuentes principales

- **Competencia y quejas:**
  - [unstar 2026 (quejas por app)](https://unstar.app/blog/weather-apps-ranked-by-user-complaints-2026)
  - [Acme Weather](https://acmeweather.com/blog/introducing-acme-weather)
  - [Apple: disponibilidad de funciones](https://support.apple.com/en-gb/105038)
  - [AEMET app](https://www.aemet.es/eu/app/eltiempodeAEMET)
  - [Meteored en tuapppara](https://tuapppara.com/aplicaciones/meteored/)
  - [snowy.es](https://snowy.es/)
- **Modelos de IA:**
  - [ECMWF AIFS ENS operativo](https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ensemble-ai-forecasts-become-operational)
  - [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api)
- **España:**
  - [AEMET olas de calor 2026](https://www.aemet.es/es/noticias/2026/09/olas_de_calor_2026)
  - [umbrales Meteosalud (El Debate)](https://www.eldebate.com/sociedad/sociedad-medio-ambiente/20260604/estas-son-temperaturas-daninas-salud-fija-sanidad-257-c-asturias-415-sevilla_424691.html)
  - [apps para fenómenos extremos (El Español)](https://www.elespanol.com/elandroidelibre/aplicaciones/20260222/danas-olas-metros-aplicaciones-imprescindibles-sobrevivir-fenomenos-extremos-espana/1003744127078_0.html)
- **PWA:**
  - [WebKit: Declarative Web Push](https://webkit.org/?p=16535)
  - [Periodic Background Sync](https://developer.chrome.com/docs/capabilities/periodic-background-sync?hl=es)
- **Datos y licencias:**
  - [Open-Meteo docs](https://open-meteo.com/en/docs)
  - [Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
  - [Marine API](https://open-meteo.com/en/docs/marine-weather-api)
  - [Open-Meteo terms](https://open-meteo.com/en/terms)
  - [RainViewer API](https://www.rainviewer.com/api.html)

⚠ Algunas cifras de reseñas salen de agregadores (unstar, tuapppara), no de las tiendas. Hay que verificar la tabla de umbrales Meteosalud, las condiciones actuales de RainViewer y los endpoints de AEMET, que fallaron por mantenimiento durante las pruebas.


---

## Estado (2026-10-03)

**Hecho y en producción:**
- **Fase 1 (datos correctos):** todos los fallos de la sección 0. Además, los avisos de AEMET llevaban tiempo sin funcionar (AEMET pasó de `.tar.gz` a `.tar`), y ya funcionan y se filtran por zona.
- **Imprevisto:** el servidor se quedaba sin el cupo diario de Open-Meteo (IP compartida en Render). Ahora, si pasa, la app pide los datos desde el móvil con el mismo código (`weather-core.js`).
- **Fase 2:** modo serio, frescura y procedencia, resumen en una frase, tarjeta Aire con calima, ICA y polen, comparación con ayer, píldora de lluvia, accesos directos y globo en el icono.
- **Fase 3:** curva de 24 h con el dedo, detalle por dato (humedad, viento, presión, UV, sensación), mejor momento, favoritos con temperatura en vivo, cielo según el sol y consejos en los avisos.
- **Fase 4:**
  - fiabilidad por día con el ensemble AIFS de ECMWF y tendencia a 15 días;
  - próximo puente;
  - lo normal (ERA5 1991–2020) y noches tropicales;
  - ajustes de avisos (tipos, nivel de AEMET, hasta 2 sitios más, parte a la hora local con calima y polen, baja);
  - "Tu parte de hoy";
  - bienvenida personalizada;
  - `/tiempo/<ciudad>` con SEO y sitemap.
- **Fase 5:**
  - radar propio (RainViewer + Leaflet, con el modelo de Windy como pestaña);
  - mar y playa;
  - estación de AEMET más cercana;
  - riesgo meteorológico de incendio (Fosberg);
  - deslizar entre ciudades con puntos de página;
  - resumen arriba al hacer scroll;
  - tirar para recargar en la app instalada;
  - búsqueda directa;
  - accesibilidad (resumen para el lector de pantalla y horas con etiqueta);
  - frase de la personalidad en la imagen para compartir;
  - estados vacíos;
  - aviso de lluvia más tarde en la frase.

- **Riesgo para la salud por calor (hecho después):** se usan las 182 zonas de meteosalud y sus umbrales oficiales (Plan Nacional 2026, Anexo I, Ministerio de Sanidad), con el índice oficial (suma en 3 días de lo que la máxima supera el umbral → niveles 0–3). Las zonas están en `lib/meteosalud-2026.json`.

- **Focos de calor por satélite (hecho después):** sin clave, con los ficheros públicos de 24 h de NASA FIRMS (VIIRS de NOAA-20, NOAA-21 y Suomi NPP). Aviso en la tarjeta de aire si hay focos a menos de 50 km y puntos en el mapa del radar. Pueden ser incendios, quemas agrícolas o industrias, y así se dice. Canarias sale del fichero de "norte y centro de África" (solo los focos dentro de las islas).

- **Mis viajes (hecho después):** destino y fechas con previsión del ensemble, qué llevar y día a día.
- **Iconos 3D (hecho después):** Meteocons "fill" (MIT) en toda la app; el sol y nube plano de antes ya no se usa.
- **Tamaño de texto de iOS (hecho después):** escala respecto al tamaño por defecto (16 px sin cambios), tope +35 % y maquetación holgada con letra grande.
- **Widget de iPhone (hecho después):** con Scriptable. Página /widget con instrucciones y script, /api/widget e iconos PNG. Android sigue sin widget (haría falta una app nativa).

- **Clave de AEMET en Render, `/healthz` y avisos agrupados (hecho después):**
  - La clave está puesta y caduca el 10-12-2026.
  - `/healthz` dice si todo va bien, cuándo pasó el último cron, el estado de AEMET y los días que le quedan a la clave.
  - Si hay varios avisos, sale una tarjeta resumen y la lista completa al tocarla. El mismo aviso en dos zonas sale una sola vez.

**Comprobado:** `/healthz` dice `db: postgres`, así que `DATABASE_URL` está configurada.

- **Privacidad, atribución y pruebas automáticas (hecho después):**
  - `/privacidad` explica qué se guarda, para qué y cómo borrarlo. El email de contacto sale de `CONTACT_EMAIL` en Render; mientras falte, `/healthz` lo marca como problema.
  - Enlaces a Open-Meteo (CC BY 4.0) y © AEMET en el panel lateral, y aviso de privacidad en los ajustes de notificaciones.
  - Pruebas automáticas con `npm test`, sobre un paquete real de avisos de AEMET y respuestas reales de Open-Meteo, que GitHub Actions pasa en cada subida. La lectura de avisos está ahora en `lib/aemet-cap.js`.
  - Arreglado de paso: si AEMET fallaba en una consulta, esa ciudad se quedaba hasta 10 minutos sin avisos. Ahora los avisos se refrescan aparte y, si AEMET falla, se reintenta al minuto.

---

## Qué más (revisión del 2026-10-03, tarde)

Casi toda la hoja de ruta está hecha. Lo que queda, por orden de importancia:

### A. Para no perder nada (lo primero)

1. **¿La base de datos es la Postgres gratis de Render?**
   - Si lo es, caduca a los 30 días y se pierden las suscripciones.
   - Se mira en Render → Databases.
   - Si es así, conviene pasarla a Neon o Supabase (gratis y sin caducidad).
   - Esfuerzo: 15 min.
2. **Que te avise solo si algo se rompe.**
   - UptimeRobot (gratis), con un monitor de palabra clave `"todoBien":true` en `/healthz`, que te manda un email.
   - Así te enteras si caduca la clave, se para el cron o AEMET deja de responder.
   - Sin código. Esfuerzo: 5 min.
3. ✅ **Pruebas automáticas mínimas.**
   - AEMET ya cambió el formato una vez (de `.tar.gz` a `.tar`) y los avisos estuvieron rotos sin que nadie lo viera.
   - Propuesta:
     - tests con un paquete de avisos real guardado, `generateAlerts` y `buildPayload`;
     - GitHub Actions que los pase en cada push.
   - Esfuerzo: ~1 h.

### B. Legal

4. ✅ **Página de privacidad.**
   - Se guarda la ubicación de quien activa las notificaciones, y el RGPD pide explicar qué se guarda, para qué y cómo borrarlo (la baja ya existe).
   - Propuesta: `/privacidad` y un enlace en el panel lateral y al activar los avisos.
   - Esfuerzo: 30 min.
5. ✅ **Atribución con enlace.**
   - Hoy pone «Datos: Open-Meteo · AEMET» sin enlazar.
   - Open-Meteo (CC BY 4.0) pide enlace.
   - AEMET pide citarla como fuente («Información elaborada por la Agencia Estatal de Meteorología»).
   - Esfuerzo: 10 min.

### C. Producto (lo que más se notaría)

6. **Lluvia caída de verdad.**
   - «Han caído 23 l/m² en las últimas 24 h», con la estación de AEMET más cercana (sus datos ya se descargan).
   - En España es de lo que más se mira después de una tormenta.
   - Esfuerzo: S.
7. **Compartir un aviso por WhatsApp.**
   - Texto con el aviso y el enlace a `/tiempo/<ciudad>`.
   - Es como se difunden los avisos en España, y trae usuarios.
   - Esfuerzo: S.
8. **Idiomas.**
   - Inglés para turistas; catalán, gallego y euskera.
   - Multiplica las búsquedas que encuentran `/tiempo/<ciudad>`.
   - Esfuerzo: L (los textos están repartidos por `app.js`).
9. **Estar en Google Play (TWA con Bubblewrap).**
   - La misma app, en la tienda de Android.
   - Pide una cuenta de desarrollador (25 $ una vez).
   - No da widget en Android: eso seguiría necesitando una app nativa.
   - Esfuerzo: M.

### D. Ver y medir

10. **Saber qué se usa sin rastrear a nadie.**
    - Contadores agregados en el servidor (ciudades consultadas al día, aperturas, notificaciones enviadas), sin cookies ni IDs.
    - Encaja con «sin rastreo» y sirve para decidir qué mejorar.
    - Esfuerzo: S.
