# ☁️ Aeris Weather

> **El clima, elevado.**
> Una Progressive Web App (PWA) meteorológica que fusiona datos de **Open-Meteo** y avisos oficiales de **AEMET** con una experiencia visual inmersiva basada en Glassmorphism y Mesh Gradients.

![Aeris Banner](https://github.com/user-attachments/assets/48dff143-cf29-4453-b7cd-4cd23276126a)

## ✨ Características Principales

### 🎨 Experiencia de Usuario (UX/UI)
* **Diseño Bento Grid:** Interfaz modular y responsive inspirada en los widgets de iOS.
* **Estética Glassmorphism:** Tarjetas translúcidas con efectos de desenfoque (`backdrop-filter`) en tiempo real.
* **Fondos Vivos:** Animaciones *Mesh Gradient* que fluyen suavemente y cambian según el tema (Día/Noche).
* **Gráficos:** tendencia de máximas y mínimas de la semana con `Chart.js`.
* **Lluvia en las próximas 2 h:** tramos de 15 min con intensidad y cuenta atrás.
* **15 personalidades:** el comentario del tiempo cambia de tono, desde Zen hasta Villano.
* **Aire y polen:** calidad del aire, polvo (calima) y polen por especie.
* **Sol y luna:** reloj solar y fase real de la luna con su salida y puesta.

### ⚙️ Arquitectura Técnica
* **Backend Node.js:** Servidor Express ligero y rápido, con `helmet` (cabeceras de seguridad) y `compression` (respuestas comprimidas).
* **Caché Inteligente (SQLite):** Sistema de persistencia que almacena las peticiones por ubicación para evitar límites de la API y mejorar la velocidad de carga (Hit de caché < 10ms).
* **Datos:** Integración directa con la API **Open-Meteo** (previsión, calidad del aire y polen), búsqueda con el geocoding de Open-Meteo, nombre del sitio con Nominatim, y **avisos oficiales de AEMET Meteoalerta** filtrados por la zona de aviso de cada ubicación.
* **Persistencia:** Recuerda tu última ubicación seleccionada mediante `localStorage`.
* **Notificaciones Push:** Avisos de lluvia, calor extremo, viento y tormenta, más resumen matutino, vía `web-push` + cron.

> **Nota sobre los datos:** la previsión, la calidad del aire y el polen vienen de Open-Meteo (motor principal). AEMET se usa para los avisos oficiales de Meteoalerta (amarillo/naranja/rojo): se descargan por comunidad y se filtran con el polígono de cada zona, y se muestran junto a las alertas propias calculadas por umbrales.

## 🛠️ Stack Tecnológico

* **Frontend:** HTML5, CSS3 (variables + transiciones), Vanilla JS, Bootstrap Icons, reboot de Bootstrap 5.3, SunCalc.
* **Backend:** Node.js, Express, Helmet, Compression.
* **Base de Datos:** SQLite (vía Sequelize ORM).
* **Librerías:** Chart.js (Gráficos), Bootstrap Icons, html2canvas (tarjetas para compartir).

## 🚀 Instalación y Despliegue

Sigue estos pasos para ejecutar Aeris en tu máquina local:

1.  **Clona el repositorio:**
    ```bash
    git clone https://github.com/TU_USUARIO/aeris-weather.git
    cd aeris-weather
    ```

2.  **Instala las dependencias:**
    ```bash
    npm install
    ```

3.  **Configura las Variables de Entorno:**
    Crea un archivo `.env` en la raíz del proyecto:
    ```env
    PORT=3000

    # VAPID keys para notificaciones push (opcional — sin ellas, la app
    # funciona igual pero sin notificaciones push).
    # Genera las tuyas con:
    # node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k)"
    VAPID_PUBLIC_KEY=
    VAPID_PRIVATE_KEY=

    # Secret para proteger los endpoints de cron (/api/cron/check-rain
    # y /api/cron/morning-summary). Ponlo también en tu servicio de cron
    # (cabecera x-cron-secret: ESTE_VALOR).
    CRON_SECRET=

    # Orígenes permitidos para CORS, separados por coma.
    # Si no se define, se permite cualquier origen.
    # Ejemplo: ALLOWED_ORIGIN=https://tudominio.com
    ALLOWED_ORIGIN=

    # API key gratuita de AEMET OpenData (opcional — sin ella la app
    # funciona igual pero sin avisos oficiales). Se consigue en:
    # https://opendata.aemet.es/centrodedescargas/altaUsuario
    AEMET_API_KEY=
    ```
    No hace falta ninguna API key para el clima en sí: Open-Meteo es gratuita y no requiere autenticación. Solo `AEMET_API_KEY` es necesaria para los avisos oficiales.

4.  **Arranca el servidor:**
    ```bash
    npm start
    ```

5.  **¡Listo!** Abre tu navegador en: `http://localhost:3000`

## 🔮 Roadmap / Próximas Mejoras
- [x] Avisos oficiales de AEMET Meteoalerta junto a las alertas propias.
- [x] Geolocalización automática en el primer uso.
- [ ] Radar propio (RainViewer/Leaflet) en vez del iframe de Windy.
- [ ] Datos estructurados (JSON-LD) y rutas indexables por ciudad para SEO.

## 📄 Licencia
Este proyecto está bajo la Licencia MIT. Siéntete libre de usarlo y aprender de él.

---
Hecho con 💙 y mucho ☕ por Cristian Ortega
