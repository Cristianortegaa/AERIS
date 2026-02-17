(() => {
    'use strict';

    const getStoredTheme = () => localStorage.getItem('theme');
    const setStoredTheme = theme => localStorage.setItem('theme', theme);

    const getPreferredTheme = () => {
        const storedTheme = getStoredTheme();
        if (storedTheme) {
            return storedTheme;
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const updateIcon = theme => {
        const btn = document.getElementById('themeBtn');
        if (btn) {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = theme === 'dark' ? 'bi bi-sun-fill fs-5' : 'bi bi-moon-stars-fill fs-5';
            }
        }
    };

    const setTheme = theme => {
        document.documentElement.setAttribute('data-bs-theme', theme);
        updateIcon(theme);
    };

    // Aplicar tema inmediatamente al cargar
    setTheme(getPreferredTheme());

    // Escuchar cambios en la preferencia del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!getStoredTheme()) {
            setTheme(getPreferredTheme());
        }
    });

    // EXPORTAR FUNCIONES para usarlas desde index.html
    window.setTheme = (theme, save = false) => {
        document.documentElement.setAttribute('data-bs-theme', theme);
        if (save) setStoredTheme(theme);
    };

    window.hasStoredTheme = () => {
        return !!getStoredTheme();
    };

    // Función global para alternar el tema (úsala en el onclick de tu botón)
    window.toggleTheme = () => {
        const current = document.documentElement.getAttribute('data-bs-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        setStoredTheme(next);
        setTheme(next);
    };

    // Conectar botón automáticamente
    window.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('themeBtn');
        if (btn) btn.addEventListener('click', window.toggleTheme);
        updateIcon(document.documentElement.getAttribute('data-bs-theme'));

        // INYECTAR ESTILOS DE ICONOS METEOROLÓGICOS (Superprofesional)
        const style = document.createElement('style');
        style.innerHTML = `
            /* Sol: Amarillo vibrante con resplandor */
            .wi-sun { color: #ffc107; filter: drop-shadow(0 0 8px rgba(255, 193, 7, 0.6)); }
            
            /* Luna: Blanco azulado suave */
            .wi-moon { color: #f1f2f6; filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.4)); }
            
            /* Nubes: Gris neutro con profundidad */
            .wi-cloud { color: #a4b0be; filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.3)); }
            
            /* Lluvia: Cian/Azul eléctrico */
            .wi-rain { color: #00d2d3; filter: drop-shadow(0 0 6px rgba(0, 210, 211, 0.5)); }
            
            /* Nieve: Blanco puro brillante */
            .wi-snow { color: #ffffff; filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.8)); }
            
            /* Tormenta: Violeta intenso */
            .wi-storm { color: #a55eea; filter: drop-shadow(0 0 8px rgba(165, 94, 234, 0.6)); }
            
            /* Niebla: Gris translúcido */
            .wi-fog { color: #ced6e0; opacity: 0.7; filter: blur(0.5px); }

            /* EFECTO MAGIA: Sol Amarillo + Nube Gris (Degradado diagonal) */
            .wi-partly-day {
                background: linear-gradient(135deg, #ffc107 45%, #b2bec3 55%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            }

            /* Luna + Nube */
            .wi-partly-night {
                background: linear-gradient(135deg, #f1f2f6 45%, #636e72 55%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
        `;
        document.head.appendChild(style);
    });
})();
