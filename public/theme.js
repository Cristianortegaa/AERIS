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

    const setTheme = theme => {
        document.documentElement.setAttribute('data-bs-theme', theme);
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

    // Opcional: Si tu botón tiene id="theme-toggle", esto lo conecta automáticamente
    window.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.addEventListener('click', window.toggleTheme);
    });
})();
