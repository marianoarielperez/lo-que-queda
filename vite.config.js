import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Cifras que el HTML necesita antes de que corra el JavaScript (la descripción para buscadores y redes).
// Salen de resumen.json como todas las demás: en index.html van como %NOMBRE%.
function cifrasDelResumen() {
  return {
    name: 'cifras-del-resumen',
    transformIndexHtml: {
      order: 'pre', // antes del reemplazo de variables de entorno de Vite, que usa la misma sintaxis
      handler(html) {
        const R = JSON.parse(readFileSync(new URL('./public/data/resumen.json', import.meta.url), 'utf-8'));
        const cifras = { POZOS_CUENCA: R.cuenca.total.toLocaleString('es-AR') };
        return html.replace(/%([A-Z_]+)%/g, (m, k) => cifras[k] ?? m);
      },
    },
  };
}

// base './' para que funcione en GitHub Pages bajo /<repo>/ sin configurar nada más.
export default defineConfig({
  base: './',
  plugins: [cifrasDelResumen()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173 },
});
