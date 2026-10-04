// Genera las versiones en PNG del ícono de la pestaña desde public/favicon.svg (Chrome sin ventana, como la prueba de
// navegación): public/favicon-64.png (de ahí sale favicon.ico) y public/apple-touch-icon.png (180 px, con fondo, para la
// pantalla de inicio del iPhone). Después: python scripts/favicon_ico.py
//   PUPPETEER_CORE_DIR=<carpeta que contiene node_modules/puppeteer-core> node scripts/favicon.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = process.env.PUPPETEER_CORE_DIR;
const require = createRequire(dir ? `${dir.replace(/[\\/]+$/, '')}/` : import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();

/** Dibuja el SVG en un cuadrado de `lado` px; `fondo` (o transparente) y `margen` alrededor del círculo. */
async function png(ruta, lado, { fondo = null, margen = 0 } = {}) {
  await page.setViewport({ width: lado, height: lado, deviceScaleFactor: 1 });
  const icono = svg.replace(/width="32" height="32"/, `width="${lado - 2 * margen}" height="${lado - 2 * margen}"`);
  await page.setContent(`<body style="margin:0;background:${fondo || 'transparent'};display:flex;align-items:center;justify-content:center;width:${lado}px;height:${lado}px">${icono}</body>`);
  await page.screenshot({ path: fileURLToPath(new URL(`../public/${ruta}`, import.meta.url)), omitBackground: !fondo });
}

await png('favicon-64.png', 64);
await png('apple-touch-icon.png', 180, { fondo: '#f3efe7', margen: 22 }); // --fondo de styles.css; iOS redondea las esquinas
await browser.close();
console.log('Listo: public/favicon-64.png y public/apple-touch-icon.png');
