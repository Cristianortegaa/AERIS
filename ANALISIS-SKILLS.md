# Análisis de AERIS con las skills de diseño, móvil y animación

Fecha: 2026-10-02 · Commit analizado: `bff8816`

Skills aplicadas (las de `.agents/skills/` que encajan con una PWA en JS sin framework):

| Lente | Skills |
|---|---|
| Móvil / PWA | `mobile-native` |
| Diseño y pulido de UI | `emil-design-eng`, `apple-design` |
| Animación | `improve-animations`, `review-animations`, `find-animation-opportunities` |

No aplican: `animate-expo` (React Native), `write-swift`, `ask-sonner` (React), `pick-ui-library`, `prototype`, `animation-vocabulary` (glosario).

Todo está contrastado con el código (`public/index.html`, `public/styles.css`, `public/app.js`). Lo marcado con 📱 hay que confirmarlo en un teléfono real. Los números de línea son del commit indicado.

**Resumen:** la base es muy buena. Hover protegido, safe areas, `dvh`, input a 16 px, curvas propias, sheets con física y una cobertura amplia de reduced-motion. Lo que queda no es "falta animación", sino:

- iconos de instalación mal hechos;
- scroll y gestos que se escapan (fondo bajo los modales, radar, pull-to-refresh);
- contraste bajo sobre el cristal;
- **animaciones que se repiten sin que cambie nada**;
- gasto de batería del canvas y los blobs bajo `backdrop-filter`.

---

## 🔴 Prioridad alta

### 1. Iconos de pantalla de inicio (móvil)
- No hay `<link rel="apple-touch-icon">` en `index.html`.
- `manifest.json` declara el mismo `logo.png` como 192 y como 512, con `"purpose": "any maskable"`.
- `logo.png` mide en realidad **500×500 y es RGBA transparente**. El logo solo ocupa el centro (bbox 149,164 → 351,336), un ~40 % del lienzo.
- **Efecto:** en iOS la transparencia se rellena de negro y queda un logo diminuto sobre un cuadrado negro. En Android, el maskable con transparencia también queda pequeño, y Chrome avisa de que los tamaños no coinciden.
- **Arreglo:**
  - Generar PNG opacos sobre `#1554c0`: `apple-touch-icon.png` de 180, `icon-192.png`, `icon-512.png` (logo al ~80 %) e `icon-maskable-512.png` (logo dentro del 80 % central, `purpose: "maskable"`).
  - Añadir `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`.
  - Meter los iconos en `CORE_ASSETS` y subir `CACHE_NAME`.
  - 📱 Desinstalar y reinstalar en los dos sistemas.

### 2. Animaciones que se repiten sin que cambien los datos (animación + diseño)
- `setInterval` llama a `renderNowcast` cada 60 s (`app.js:1108`). Reescribe `innerHTML` y las barras de "lluvia próximas 2 h" **vuelven a crecer desde cero cada minuto** (`ncGrow 600ms`, `styles.css:1027`).
- Cada `renderWeather` (refresco al volver a la app, cambio °C/°F, fallo de geolocalización) hace lo siguiente:
  - recrea el gráfico de 7 días con `destroy()` + `new Chart`, y se vuelve a dibujar 800 ms;
  - reescribe el polen (`barReveal 800ms`) y las alertas (`alertIn`, que además empuja la página);
  - pone `scrollLeft = 0` en la tira horaria, aunque el usuario la hubiera desplazado.
- La primera vez, estas animaciones ocurren **detrás del splash**: no se ven cuando deberían y se ven cuando no deberían.
- **Arreglo:**
  ```js
  // Solo se reescribe (y se anima) lo que cambió
  const setHTMLIfChanged = (el, html) => { if (el._html === html) return false; el._html = html; el.innerHTML = html; return true; };
  // Usarlo en renderNowcast, renderAlerts, renderPollen, renderLifestyle, hourly y daily.
  // Hourly: if (setHTMLIfChanged(hCont, html) && placeChanged) hCont.scrollLeft = 0;
  // placeChanged = shownWeatherId !== id (calcularlo en getWeather antes de asignar)

  // Gráfico: actualizar en vez de recrear
  if (tempChart7Instance) {
      tempChart7Instance.data.labels = labels;
      tempChart7Instance.data.datasets[0].data = maxTemps;
      tempChart7Instance.data.datasets[1].data = minTemps;
      tempChart7Instance.update(placeChanged ? undefined : 'none');
      return;
  }
  ```
  ```css
  /* Que lo que entra con el primer pintado se anime cuando ya se ve */
  body:not(.is-ready) .nc-bar i,
  body:not(.is-ready) .alert-card,
  body:not(.is-ready) .pollen-bar-fill { animation-play-state: paused; }
  ```

### 3. El fondo se desplaza con el sidebar, las sheets y los modales abiertos (móvil)
- `openSidebar`, `openPersonaModal`, `openShareCard`, `openIosModal` e `initOnboarding` no bloquean el scroll del documento.
- Arrastrar sobre el fondo oscurecido mueve las tarjetas de detrás. En Android, si la página está arriba, **dispara pull-to-refresh con la sheet abierta**.
- **Arreglo:**
  ```css
  html.is-locked,
  html:has(.fav-sidebar.open, .persona-modal.show, .share-modal.show) { overflow: hidden; overscroll-behavior: none; }
  html { overscroll-behavior-y: contain; } /* fuera el pull-to-refresh que recarga la PWA entera con splash */
  ```
  ```js
  const lockScroll = (on) => document.documentElement.classList.toggle('is-locked', on);
  // en openIosModal / closeIosModal, installBtn y onboarding (abrir → true, finish → false)
  ```
  📱 Comprobarlo en iPhone y en Android.

### 4. El radar (iframe de Windy) atrapa el scroll (móvil + diseño)
- Mide 380 px y se queda con cualquier arrastre. En el preview, al hacer scroll encima, el mapa hizo zoom y la página no se movió. El botón "Radar" de la barra inferior lleva directamente a él.
- **Arreglo:** una tapa "Toca para mover el mapa" que se quita al tocarla y vuelve cuando la tarjeta sale de pantalla.
  ```html
  <button type="button" class="radar-cover" aria-label="Activar mapa del radar"><span>Toca para mover el mapa</span></button>
  ```
  ```css
  .radar-cover{position:absolute;inset:0;z-index:4;border:0;background:transparent;display:flex;align-items:flex-end;justify-content:center;padding-bottom:16px;color:#fff}
  .radar-cover span{padding:6px 12px;border-radius:99px;background:rgba(0,0,0,.5);font-size:.75rem;font-weight:600}
  .radar-card.is-live .radar-cover{display:none}
  ```
  ```js
  const rc = document.getElementById('section-mapa');
  rc.querySelector('.radar-cover').addEventListener('click', () => rc.classList.add('is-live'));
  new IntersectionObserver(([e]) => { if (!e.isIntersecting) rc.classList.remove('is-live'); }).observe(rc);
  ```

### 5. Contraste insuficiente sobre el cristal (diseño)
- `--text-3: rgba(255,255,255,.54)` (`styles.css:49`) se usa en etiquetas de 9–10 px (`.stat-label`, `.comfort-title`, `.aemet-badge`, `.radar-badge`…). Sobre el cristal de día da unos **2,7:1**.
- En los cielos claros (`bg-snow`, `bg-cloudy-day`) incluso el blanco puro queda en ≈4:1.
- Los textos de color ("Buena" en `#4ade80`, "Perfecto") quedan en ≈3:1.
- **Arreglo:**
  - `--text-3` a `.66`.
  - En `bg-snow` y `bg-cloudy-day`: `--glass: rgba(18,34,62,.44); --text-2: rgba(255,255,255,.88); --text-3: rgba(255,255,255,.74)`.
  - Tamaño mínimo de las etiquetas: `0.6875rem` (11 px).
  - Los estados de color, como chip tintado con texto blanco: `background: color-mix(in srgb, var(--c) 24%, transparent)`.

### 6. Splash en cada apertura aunque ya hay datos guardados (diseño)
- `aeris_offline_data` se guarda en cada carga, pero solo se usa si la red falla. Cada vez que se abre la PWA, el splash tapa la app hasta que responde la API (o hasta 4 s).
- **Arreglo** (stale-while-revalidate), en el `load` justo antes de `getWeather(currentId)`:
  ```js
  try {
    const saved = JSON.parse(localStorage.getItem('aeris_offline_data') || 'null');
    if (saved && saved.id === currentId && Date.now() - saved.timestamp < 6 * 3600e3) {
      renderWeather(saved.data);
      shownWeatherId = currentId;
    }
  } catch (e) {}
  ```
  Depende del punto 2: si no, al llegar los datos frescos se repetirían todas las animaciones.

### 7. Canvas de partículas: coste, borrosidad y velocidad según los fps (animación + móvil + diseño)
- **Coste:** es fijo, a pantalla completa, y repinta a 60 fps **debajo de unas 12 superficies con `backdrop-filter: blur(24px)`**. Cada frame obliga a volver a desenfocar todas. Es el mayor gasto de batería de la app.
- **Modo "sol" invisible:** su opacidad efectiva es de 0,012–0,044 (`app.js:311`) y mantiene el bucle activo todo el día cuando está despejado.
- **Velocidad:** `p.y += p.speed` va por frame, así que a 120 Hz la lluvia cae el doble de rápido y en Modo bajo consumo, a la mitad.
- **Borroso:** no usa `devicePixelRatio` (`app.js:296`). En el iPhone, con DPR 3, la lluvia y el reloj solar (`app.js:406`) se ven difuminados.
- **Saltos al hacer scroll:** se redimensiona con cada cambio de `innerHeight` (barra de URL) en mitad del scroll.
- **Arreglo:**
  ```js
  // 1) Borrar el modo 'sun' (getAnimationType → 'none' con despejado de día)
  // 2) Delta-time y 30 fps en gama baja
  const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  let lastT = 0;
  function animateWeather(now) {
      weatherAnimFrame = requestAnimationFrame(animateWeather);
      if (!lastT) lastT = now;
      const elapsed = now - lastT;
      if (LOW_END && elapsed < 32) return;
      const k = Math.min(elapsed, 50) / 16.667;
      lastT = now;
      // p.y += p.speed * k; ...
  }
  // 3) DPR: canvas.width = w * dpr; ctx.setTransform(dpr,0,0,dpr,0,0); y los límites con clientWidth/clientHeight
  // 4) Redimensionar solo si cambia el ancho
  // 5) Lluvia: agrupar la opacidad en 3 niveles y hacer 3 stroke() en vez de 120
  ```
- **Blobs del cielo:** `will-change` sobra (`styles.css:197`) y la deriva apenas se percibe en el móvil: `@media (pointer: coarse) { .sky-blob { animation: none; } }`.
- 📱 Medirlo antes y después en un Android de gama baja (DevTools remoto, Performance monitor).

### 8. `:active` puede no funcionar en iOS Safari (diseño)
- Todo el feedback al pulsar depende de `:active`, y en el proyecto **no hay ni un listener de `touchstart`**. WebKit en iOS no aplica `:active` sin él.
- **Arreglo** (una línea al principio de `app.js`): `document.addEventListener('touchstart', () => {}, { passive: true });`
- 📱 Comprobarlo en un iPhone.

### 9. En Android, la barra inferior sube encima del teclado al buscar (móvil)
- Con `interactive-widget=resizes-content`, `.bottom-nav` y `#installBtn` (son `fixed; bottom`) suben con el teclado y tapan las sugerencias.
- **Arreglo:**
  ```css
  body:has(.search-input:focus) .bottom-nav,
  body:has(.search-input:focus) #installBtn {
      opacity: 0; pointer-events: none;
      transform: translateX(-50%) translateY(calc(100% + 24px));
      transition: opacity 150ms ease, transform 200ms var(--ease-out);
  }
  ```

---

## 🟠 Prioridad media

### 10. Sheet de instalación en iOS (móvil + diseño + animación)
- Tiene grabber pero **no se puede arrastrar**.
- No tiene botón de cerrar.
- Entra animada pero se cierra con `display:none`, de golpe.
- **Arreglo:**
  - Pasarlo a `.show` con transition (`transform 420ms var(--ease-drawer)` al entrar, 300 ms al salir).
  - Generalizar `initSheetDrag(zone, sheet, onClose)` y reutilizarlo.
  - Añadir `<button class="btn-icon sm" aria-label="Cerrar">`.

### 11. Guardar imagen: hoja de compartir nativa, estados de carga y errores (móvil + diseño)
- **Descarga:** `<a download href="data:...">` en una PWA instalada en iOS acaba en Archivos o en una vista sin botón de volver. El icono `box-arrow-up` promete la hoja de compartir.
- **Estados:** la campana, "Sí, activar" y "Guardar imagen" lanzan tareas de hasta 10 s sin indicador ni bloqueo de doble toque. Los errores salen con `alert()` nativo.
- **Arreglo:**
  - `canvas.toBlob` → `new File` → `navigator.share({ files: [file] })` si `navigator.canShare`, y `<a download>` con `URL.createObjectURL` como respaldo.
  - Poner `is-loading` y `aria-busy` en el botón mientras dura la tarea (`.is-loading i` ya gira).
  - Cambiar `alert()` por `showToast(...)`.

### 12. Iconografía incoherente (diseño)
- `renderIcon` usa un PNG 3D solo para "sol y nube" y glifos planos para el resto. El hero y las horas cambian de estilo según el tiempo.
- Font Awesome se carga entero para unos 12 iconos, y mezcla relleno (`fa-shirt`) con contorno (`bi-person`).
- Hay iconos que significan otra cosa: `bi-emoji-dizzy` para la Bufanda, `bi-bricks` para el Abrigo, `bi-capslock` para la Gorra.
- **Arreglo:**
  - Quitar el caso especial del PNG y usar `bi-cloud-sun-fill`.
  - Dejar los chips de ropa solo con texto.
  - Sustituir Font Awesome por SVG inline y quitar `all.min.css`.

### 13. Bootstrap completo para un modal y cuatro utilidades (diseño + móvil)
- `bootstrap.min.css` y `bootstrap.bundle.min.js` bloquean el render (el JS va síncrono en el `<head>`) solo por `#notificationModal` y por `.small`, `.fw-bold` y `.mt-2`. Su reboot además activa `scroll-behavior: smooth`.
- **Arreglo:**
  - Rehacer el modal con el sistema de `.share-modal`.
  - Escribir esas utilidades en el CSS propio.
  - Quitar las dos etiquetas.
  - Mientras tanto, `defer` en el script y `<style>html{background:#0b1220}</style>` como primera línea del `<head>`.

### 14. Datos: alineación y formato (diseño)
- **Alineación:** `.stat-tile { align-content: center }` desalinea "HUMEDAD" respecto a "VIENTO" (solo una tiene `stat-sub`). Usar `start`.
- **Viento:** `cur.windDir || 'Viento'` repite la etiqueta; usar `|| ''`.
- **UV:** sale crudo ("4.85"). Usar `Math.round` y añadir el nivel (Bajo / Moderado / Alto / Muy alto / Extremo).
- **Decimales:** PM2.5 sale con punto. Formatear con `Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })`.
- **Ortografía:** en `server.js:539-540`, "mas frio" y "mas calor" → "más frío" y "más calor".
- **Mayúsculas:** `.share-desc { text-transform: capitalize }` da "Mayormente Despejado". Usar `::first-letter`.

### 15. Duraciones largas en cosas que se ven en cada apertura (animación + diseño)
| Ahora | Propuesto |
|---|---|
| `cardIn 520ms` con escalonado hasta 410 ms (hasta 930 ms en total) | `400ms`, escalonado de 40 ms y como máximo 160 ms |
| `blurIn` de 450 ms con `blur(8px)`, aplicado a ciudad, icono y descripción aunque solo cambie la temperatura | 280 ms, `blur(4px)`, y solo en la pieza que cambió |
| Toast: 400 ms también al salir | Salida en 200 ms |
| Sidebar y sheet: 420 ms al entrar y al salir | 420 ms al entrar y 300 ms al salir |
| Confort y AQI a 900 ms, polen a 800 ms | 600 ms y 500 ms |
| Indicador de la barra inferior a 380 ms con `will-change` fijo | 280 ms y sin `will-change` |
| Splash `600ms` con retrasos de 80/160 ms | 400 ms con 0/40/80 ms |
| Siete escalas de pulsación (0.9 a 0.98) | Tokens `--press: .97` y `--press-icon: .95` |

### 16. El primer toast aparece de golpe (animación)
- Se crea y recibe `.show` en el mismo frame, así que la transition no arranca. Añadir `void el.offsetWidth;` después de `appendChild`.

### 17. Accesibilidad y foco en los diálogos (diseño)
- Ningún diálogo mueve el foco ni marca el fondo como `inert`. Al abrir: `main.inert = true` y foco en el primer botón. Al cerrar, devolver el foco a quien lo abrió.
- Botones pequeños: `.btn-icon.sm` mide 38 px y `.fav-delete` 42 px. Ampliar el área de toque con `::after { inset: -4px }`, o subir a 44 px.

### 18. Otros fallos de comportamiento (diseño)
- **Tab "Radar":** nunca se activa al hacer scroll, porque el pivote del 35 % no llega. Activar la última sección cuando `innerHeight + scrollY >= scrollHeight - 4`.
- **Cambio de ciudad:** stats, horas y días siguen mostrando la ciudad anterior sin ninguna señal. Usar `body.is-fetching .glass-card:not(.hero-card) { opacity: .55 }`.
- **Error sin caché:** el hero se queda vacío ("↑ ° ↓ °"). Mantener los skeletons atenuados.
- **Radar sin shimmer:** `renderWeather` quita también `#radar-skeleton`. Usar `.skeleton:not(#radar-skeleton)`.
- **Aviso de notificaciones:** en la primera visita se solapa con el onboarding. Lanzarlo desde `finish()` o desde la diapositiva 3.

### 19. Partes de la app instalada (móvil)
- Detectar el modo instalado con `matchMedia('(display-mode: standalone)')` en vez de la regex de user agent, que deja fuera a los iPad. Añadir `@media (display-mode: standalone) { #installBtn { display: none !important; } }`.
- Falta `apple-touch-startup-image`.

---

## 🟡 Prioridad baja

- **Safe areas laterales en horizontal:** `padding-left/right: max(16px, env(safe-area-inset-left/right))` en `.app-shell` y `.fav-sidebar` (📱 girar el iPhone).
- **Buscador:** añadir `autocorrect="off"`, porque el autocorrector de iOS "corrige" Lleida, Ourense, etc.
- **Selección con pulsación larga:** añadir `.suggestion-item` y `.toast-msg` a la regla de `user-select: none`.
- **Scroll-snap:** `.day-detail-content` debería tenerlo igual que `.hourly-scroll`.
- **Tipografía:**
  - Geist Mono solo en algunas horas (`.hero-time`, `.solar-times`, `#comfort-score`, `.activity-time`): quitarla, ya está `tabular-nums`.
  - Usar `proportional-nums` en el número grande del hero.
  - Pasar los ~30 `font-size` sueltos a una escala de tokens.
  - Usar solo los `--radius-*` existentes.
- **Foco visible en el buscador:** `box-shadow: 0 0 0 2px rgba(255,255,255,.9)`.
- **`.ai-chip`:** su `aria-label` tapa la frase de la IA para el lector de pantalla.
- **Restraint:**
  - "· hora local" solo si la zona horaria es distinta de la del dispositivo.
  - Quitar "Toca un día para ver horas".
  - Replantear el gráfico de 7 días (repite las barras de rango, y pone "vie/sáb" en minúscula).
  - Primera hora del carrusel como "Ahora".
  - Sin emojis en los datos.
- **Drag del sheet:** calcular la velocidad con los últimos 3 `pointermove`, y que la duración del cierre siga esa velocidad.
- **Huecos en reduced-motion:**
  - `.comfort-bar-fill` y `.aqi-dot` siguen animándose.
  - El skeleton sigue barriendo: cambiarlo por un pulso de opacidad.
  - El acordeón pierde también el fundido.
  - Escuchar `matchMedia(...).addEventListener('change')`.
- **Shimmer del skeleton:** anima `background-position` y repinta cada frame. Pasarlo a un `::after` con `transform`.
- **Chart.js:** hover y tooltip a 120 ms en vez de 400 ms. Unificar el fundido del modal de Bootstrap a 250 ms `--ease-out`.
- **Código muerto:** `--invert-close`.
- **Teclado:** `.hourly-scroll` necesita `tabindex="0"`.
- **Dynamic Type:** `@supports (font: -apple-system-body)` (comprobar que el layout aguanta).
- **Unidades:** el botón °C/°F como segmentado "°C | °F".
- **Acordeón con `grid-template-rows`:** es correcto. Solo tocarlo si un perfil en gama baja muestra frames perdidos.

## Oportunidades de animación (pasan el filtro de frecuencia y propósito)

| Dónde | Propuesta |
|---|---|
| Borrar favorito | Fundido y `scale(.96)` en 160 ms, después colapsar la altura en 200 ms con `--ease-out`, y al terminar `renderFavorites()` |
| Sidebar de favoritos | Arrastrar a la izquierda para cerrar: 1:1 con el dedo, fricción hacia fuera y cierre con dx < -100 o velocidad > 0,11 px/ms |
| Fondo del sheet de personalidades | Que el oscurecido baje con el arrastre: `rgba(2,6,18, .52 × (1 − dy/alto))` |
| Gráfico al cambiar de ciudad | Los puntos se transforman en 400 ms con `update()` (incluido en el punto 2) |

**Descartadas a propósito:** contador animado de la temperatura, escalonado en horas, días y sugerencias, rebote en la barra inferior, parallax del cielo y animación hacia el botón de favoritos. Son elementos de alta frecuencia o datos para leer.

---

## Orden recomendado

1. **Rápidas y con mucho impacto:**
   - `touchstart` (8)
   - `void el.offsetWidth` en el toast (16)
   - `overscroll-behavior` y bloqueo del scroll (3)
   - teclado de Android (9)
   - contraste (5)
2. **No repetir animaciones:** `setHTMLIfChanged` y `update()` del gráfico (2). Después, pintar los datos guardados al abrir (6).
3. **Radar** (4) e **iconos de instalación** (1).
4. **Canvas y blobs** (7), midiendo antes y después en un teléfono real.
5. **Media:** sheet de iOS (10), compartir y estados de carga (11), iconos (12), quitar Bootstrap (13), datos (14) y duraciones (15).
6. El resto, como pulido.
