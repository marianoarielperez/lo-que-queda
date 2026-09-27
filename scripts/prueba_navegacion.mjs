// Prueba de aceptación de la navegación (docs/specs/2026-09-27-cierre-y-visualizador-design.md):
// recorrido → visualizador → inicio → reentrada con estado → "Atrás" → ventana de Metodología → links directos.
// Corre en un Chrome sin ventana (dibuja aunque la pantalla esté tapada) contra un servidor ya levantado:
//   npm run build && npx vite preview --port 4173
//   PUPPETEER_CORE_DIR=<carpeta que contiene node_modules/puppeteer-core> node scripts/prueba_navegacion.mjs [url]
// puppeteer-core no es dependencia del proyecto; viene, por ejemplo, con `npx -y lighthouse@12`.
import { createRequire } from 'node:module';

const dir = process.env.PUPPETEER_CORE_DIR;
const require = createRequire(dir ? `${dir.replace(/[\\/]+$/, '')}/` : import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://localhost:4173/';

let fallas = 0;
const ok = (cond, texto) => { console.log(`${cond ? 'OK   ' : 'FALLA'} ${texto}`); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function pagina(url, celular = false) {
  const page = await browser.newPage();
  await page.setViewport(celular ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1366, height: 800 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('listo'), { timeout: 60000 });
  return page;
}

const estado = (page) => page.evaluate(() => {
  const f = document.activeElement;
  return {
    hash: location.hash, scrollY: Math.round(scrollY),
    explorar: document.body.classList.contains('modo-explorar'),
    story: getComputedStyle(document.getElementById('story')).display,
    panel: !document.getElementById('explore').classList.contains('hidden'),
    ventana: document.getElementById('ventana-metodologia')?.open ?? null,
    activa: document.querySelector('.step.activa')?.dataset.step,
    foco: f?.id || f?.dataset?.ir || f?.dataset?.abrir || f?.tagName,
    ficha: !document.getElementById('ficha').classList.contains('hidden'),
    provincia: document.getElementById('f-provincia').value,
  };
});

async function bajarHastaElFinal(page) {
  const alto = await page.evaluate(() => innerHeight);
  for (let i = 0; i < 120; i++) {
    if ((await estado(page)).activa === '8') break;
    await page.mouse.move(200, alto / 2);
    await page.mouse.wheel({ deltaY: alto / 4 });
    await espera(80);
  }
  await espera(700);
}

// ---- Escritorio ----
{
  const page = await pagina(BASE);
  ok((await estado(page)).activa === '0', 'la portada arranca activa');
  ok((await page.$('section#metodologia')) === null, 'la metodología ya no es una sección de la página');
  await bajarHastaElFinal(page);
  let e = await estado(page);
  ok(e.activa === '8', 'se llega a la tarjeta 8');
  ok(!e.panel, 'el panel no se abre solo en el paso 8');
  const fin = await page.evaluate(() => {
    const card = document.querySelector('.step[data-step="8"] .card').getBoundingClientRect();
    return {
      sobra: Math.round(document.documentElement.scrollHeight - (scrollY + card.bottom)),
      botones: [...document.querySelectorAll('.step[data-step="8"] [data-ir], .step[data-step="8"] [data-abrir]')].map((b) => b.textContent.trim()),
    };
  });
  ok(fin.botones.join('|') === 'Explorá el mapa|Metodología', `botones de la tarjeta 8: ${fin.botones.join(', ')}`);
  ok(fin.sobra < 800, `nada después de la tarjeta 8 (sobran ${fin.sobra} px)`);

  await page.click('.step[data-step="8"] [data-ir="explorar"]');
  await espera(800);
  e = await estado(page);
  ok(e.hash === '#explorar' && e.explorar, 'la dirección pasa a #explorar');
  ok(e.story === 'none' && e.panel, 'sin tarjetas y con el panel');
  ok(e.foco === 'explore-titulo', `el foco va al título del panel (${e.foco})`);

  await page.select('#f-provincia', '2');
  await page.type('#f-buscar', 'CH-679');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('ficha').classList.contains('hidden'), { timeout: 20000 });
  ok(true, 'la ficha se abre desde el buscador');

  await page.click('.explore-nav [data-ir="inicio"]');
  await espera(800);
  e = await estado(page);
  ok(e.hash === '' && !e.explorar && e.story !== 'none', 'vuelve al recorrido sin #explorar');
  ok(e.scrollY === 0 && e.activa === '0', `vuelve a la portada (scroll ${e.scrollY}, paso ${e.activa})`);
  ok(!e.panel && !e.ficha, 'panel y ficha ocultos en el recorrido');
  ok(e.foco === 'btn-empezar', `el foco va a "Desplazá para empezar" (${e.foco})`);

  await page.click('.accesos [data-ir="explorar"]');
  await espera(1500);
  e = await estado(page);
  ok(e.explorar && e.provincia === '2', 'al volver a entrar se conserva el filtro');
  ok(e.ficha, 'al volver a entrar se conserva la ficha');

  await page.goBack();
  await espera(800);
  e = await estado(page);
  ok(!e.explorar && e.scrollY === 0, '"Atrás" vuelve a la portada, desde donde se entró');

  await bajarHastaElFinal(page);
  // El botón a la vista antes de medir (si no, el clic de Puppeteer desplaza la página después de medir)
  await page.$eval('.step[data-step="8"] [data-ir="explorar"]', (b) => b.scrollIntoView({ block: 'center' }));
  await espera(300);
  const y8 = (await estado(page)).scrollY;
  await page.click('.step[data-step="8"] [data-ir="explorar"]');
  await espera(800);
  await page.goBack();
  await espera(1000);
  e = await estado(page);
  ok(!e.explorar && Math.abs(e.scrollY - y8) < 5 && e.activa === '8', `"Atrás" vuelve a la tarjeta 8 (scroll ${e.scrollY}; antes ${y8})`);

  await page.click('.step[data-step="8"] [data-abrir="metodologia"]');
  await espera(400);
  e = await estado(page);
  ok(e.ventana === true && e.hash === '#metodologia', 'la Metodología se abre con #metodologia');
  await page.keyboard.press('Escape');
  await espera(400);
  e = await estado(page);
  ok(e.ventana === false && e.hash === '' && e.activa === '8', 'Escape la cierra y deja la tarjeta 8');
  ok(e.foco === 'metodologia', `el foco vuelve al botón Metodología (${e.foco})`);
  await page.close();
}

// ---- Links directos ----
{
  const page = await pagina(`${BASE}#explorar`);
  await espera(800);
  let e = await estado(page);
  ok(e.explorar && e.panel && e.story === 'none', 'el link #explorar abre el visualizador');
  ok((await page.$eval('#n-total', (x) => x.textContent)) === '44.390', 'el panel muestra los pozos');
  await page.click('.explore-nav [data-abrir="metodologia"]');
  await espera(400);
  e = await estado(page);
  ok(e.ventana === true && e.hash === '#explorar', 'la Metodología se abre sobre el visualizador sin cambiar la dirección');
  await page.goBack();
  await espera(500);
  e = await estado(page);
  ok(e.ventana === false && e.explorar, '"Atrás" cierra la Metodología y sigue el visualizador');
  await page.close();
}
{
  const page = await pagina(`${BASE}#metodologia`);
  let e = await estado(page);
  ok(e.ventana === true && !e.explorar, 'el link #metodologia abre la ventana sobre la portada');
  await page.mouse.click(5, 5);
  await espera(400);
  e = await estado(page);
  ok(e.ventana === false && e.hash === '', 'un clic afuera la cierra y queda la portada');
  await page.close();
}

// ---- Celular ----
{
  const page = await pagina(BASE, true);
  await bajarHastaElFinal(page);
  await page.click('.step[data-step="8"] [data-ir="explorar"]');
  await espera(800);
  let e = await estado(page);
  ok(e.explorar && e.panel, 'celular: la tarjeta 8 abre el visualizador');
  const visibleNav = () => page.$eval('.explore-nav', (n) => n.getBoundingClientRect().height > 0);
  ok(await visibleNav(), 'celular: "Volver al inicio" y "Metodología" a la vista');
  await page.click('#btn-plegar');
  await espera(200);
  ok(await visibleNav(), 'celular: siguen a la vista con el panel plegado');
  await page.close();
}

await browser.close();
console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
