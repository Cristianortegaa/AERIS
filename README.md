# ☁️ Aeris Weather

> **El clima, elevado.**
> Una Progressive Web App (PWA) meteorológica que fusiona datos precisos de la AEMET con una experiencia visual inmersiva basada en Glassmorphism y Mesh Gradients.

![Aeris Banner](https://github.com/user-attachments/assets/48dff143-cf29-4453-b7cd-4cd23276126a)

)
## ✨ Características Principales

### 🎨 Experiencia de Usuario (UX/UI)
* **Diseño Bento Grid:** Interfaz modular y responsive inspirada en los widgets de iOS.
* **Estética Glassmorphism:** Tarjetas translúcidas con efectos de desenfoque (`backdrop-filter`) en tiempo real.
* **Fondos Vivos:** Animaciones *Mesh Gradient* que fluyen suavemente y cambian según el tema (Día/Noche).
* **Gráficos Interactivos:** Visualización de tendencias con `Chart.js`, permitiendo "viajar en el tiempo" al hacer clic en días futuros.
* **Interpolación Térmica:** Algoritmo propio para estimar la temperatura actual basándose en la hora del día (ya que AEMET solo ofrece Max/Min).

### ⚙️ Arquitectura Técnica
* **Backend Node.js:** Servidor Express ligero y rápido.
* **Caché Inteligente (SQLite):** Sistema de persistencia que almacena las peticiones por ID de municipio para evitar límites de la API y mejorar la velocidad de carga (Hit de caché < 10ms).
* **Datos Oficiales:** Integración directa con la API **OpenData AEMET** (Agencia Estatal de Meteorología).
* **Persistencia:** Recuerda tu última ubicación seleccionada mediante `localStorage`.

## 🛠️ Stack Tecnológico

* **Frontend:** HTML5, CSS3 (Variables + Keyframes), Vanilla JS, Bootstrap 5.3.
* **Backend:** Node.js, Express.
* **Base de Datos:** SQLite (vía Sequelize ORM).
* **Librerías:** Chart.js (Gráficos), Bootstrap Icons.

## 🚀 Instalación y Despliegue

Sigue estos pasos para ejecutar Aeris en tu máquina local:

1.  **Clona el repositorio:**
    ```bash
    git clone [https://github.com/TU_USUARIO/aeris-weather.git](https://github.com/TU_USUARIO/aeris-weather.git)
    cd aeris-weather
    ```

2.  **Instala las dependencias:**
    ```bash
    npm install
    ```

3.  **Configura las Variables de Entorno:**
    Crea un archivo `.env` en la raíz del proyecto y añade tu clave de la AEMET:
    ```env
    PORT=3000
    # Consigue tu clave gratis en [https://opendata.aemet.es/centrodedescargas](https://opendata.aemet.es/centrodedescargas)
    AEMET_API_KEY=TU_CLAVE_AQUI
    ```

4.  **Arranca el servidor:**
    ```bash
    node server.js
    ```

5.  **¡Listo!** Abre tu navegador en: `http://localhost:3000`

## 🔮 Roadmap / Próximas Mejoras
- [ ] Añadir geolocalización automática del navegador.
- [ ] Implementar búsqueda de municipios por nombre (buscador en tiempo real).
- [ ] Alertas meteorológicas en tiempo real.

## 📄 Licencia
Este proyecto está bajo la Licencia MIT. Siéntete libre de usarlo y aprender de él.

---
Hecho con 💙 y mucho ☕ por Cristian Ortega
