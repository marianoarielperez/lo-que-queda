# Cierre del recorrido, visualizador y Metodología — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** separar el cierre del recorrido (tarjeta 8) del visualizador (`…/#explorar`) y convertir la
Metodología en una ventana (`…/#metodologia`), según `docs/specs/2026-09-27-cierre-y-visualizador-design.md`.

**Arquitectura:** un módulo nuevo, `src/navegacion.js`, hace de la dirección y el historial la fuente de verdad: los
botones empujan entradas al historial y la página reacciona (clase `modo-explorar` en `body`, `<dialog>` abierto o
cerrado). `story.js` expone `pausar()`/`reanudar()` del recorrido; `explore.js` expone `entrar()`/`salir()` del
visualizador (guarda y recupera su estado); `map.js` agrega gestos libres y `vista()`/`irA()`.

**Tecnología:** JavaScript sin framework (módulos ES), Vite 6, MapLibre GL 5, deck.gl 9, scrollama 3, `<dialog>` nativo.
Prueba de aceptación con puppeteer-core (no es dependencia del proyecto) contra `vite preview`.

## Restricciones globales

- Sin librerías nuevas en `package.json`; sin `localStorage`, cookies ni analytics.
- Español rioplatense con voseo en todo texto visible. Textos nuevos exactos: "Explorá el mapa", "Metodología",
  "Ir directo al mapa", "← Volver al inicio", "Cerrar la metodología" (etiqueta accesible del ×), "Cargando el mapa…".
- Ninguna cifra tipeada a mano (las del panel y la metodología siguen saliendo de los datos y de `resumen.json`).
- Paleta (`src/paleta.js`) sin cambios. Comentarios en castellano. Controles reales (`button`, `a href`), foco visible.
- Antes de cerrar: `npm run build` sin errores, prueba en navegador, cifras nuevas cotejadas (no hay cifras nuevas).

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `scripts/prueba_navegacion.mjs` (nuevo) | Prueba de aceptación en Chrome sin ventana (escritorio y celular). |
| `src/navegacion.js` (nuevo) | Estados de la página, dirección, historial, desplazamiento, ventana de Metodología. |
| `src/story.js` | Botones de la tarjeta 8; `pausar()`/`reanudar()`; sin panel automático. |
| `src/explore.js` | `entrar()`/`salir()` del visualizador con estado guardado; ficha solo al explorar. |
| `src/map.js` | Gestos libres al explorar; `vista()`/`irA()`; cursor de mano solo al explorar. |
| `src/main.js` | Conecta navegación, recorrido y visualizador (también la entrada directa por link). |
| `src/metodologia.js` | Busca el contenido en la ventana (`#ventana-metodologia`). |
| `index.html` | Enlaces de la portada, encabezado del panel, Metodología dentro de `<dialog>`. |
| `src/styles.css` | `modo-explorar`, botones y enlaces nuevos, ventana. |

---

### Tarea 1: Prueba de aceptación

**Archivos:** Crear `scripts/prueba_navegacion.mjs`.

**Interfaces:** Consume (del resto del plan): `body.modo-explorar`, `#ventana-metodologia` (`<dialog>`), botones
`[data-ir="explorar"]`, `[data-ir="inicio"]`, `[data-abrir="metodologia"]` en `.step[data-step="8"]`, `.accesos`
(portada) y `.explore-nav` (panel); `#explore.hidden`; `#ficha.hidden`; `body.listo`.

- [ ] **Paso 1: Escribir la prueba**

```js
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
```

- [ ] **Paso 2: Correrla contra el build actual y verla fallar**

```bash
npm run build
npx vite preview --port 4173
PUPPETEER_CORE_DIR="C:/Users/Mariano/AppData/Local/npm-cache/_npx/8003d8991b0d346b/node_modules" node scripts/prueba_navegacion.mjs
```
Esperado: `FALLA la metodología ya no es una sección de la página` y otras fallas (la tarjeta 8 no tiene esos botones).

- [ ] **Paso 3: Commit**

```bash
git add scripts/prueba_navegacion.mjs
git commit -m "Prueba de aceptación de la navegación (cierre, visualizador, Metodología)"
```

---

### Tarea 2: Visualizador (`#explorar`) y tarjeta 8 como cierre

**Archivos:** Crear `src/navegacion.js`. Modificar `src/map.js`, `src/story.js`, `src/explore.js`, `src/main.js`,
`index.html`, `src/styles.css`.

**Interfaces:**
- Produce `iniciarNavegacion({ alEntrar, alSalir }) → { get explorando(): boolean }` (en `src/navegacion.js`).
- Produce en `montarRecorrido(...)` el retorno `{ pausar(): void, reanudar(): void }` (antes devolvía el scroller).
- Produce en `montarExploracion(...)` el retorno `{ alClickPozo(idpozo), tooltipPozo(idpozo, fila), entrar(), salir() }`
  (reemplaza a `mostrarPanel`).
- Produce en la API del mapa `vista() → { center: [lng, lat], zoom }` e `irA(vista)`.

- [ ] **Paso 1: `src/navegacion.js` (visualizador)**

```js
// Estados de la página (docs/specs/2026-09-27-cierre-y-visualizador-design.md): el recorrido (…/) y el
// visualizador (…/#explorar). La dirección y el historial del navegador mandan: los botones cambian el historial
// y la página reacciona, así "Atrás" y los links directos hacen lo mismo que los botones.
// Los disparadores llevan data-ir="explorar" | "inicio" (un solo escuchador en document: sirve también para las
// tarjetas que se crean después).

const EXPLORAR = '#explorar';
const sinHash = () => location.pathname + location.search;

/** alEntrar / alSalir se llaman al entrar al visualizador y al salir, con la página ya en su lugar. */
export function iniciarNavegacion({ alEntrar, alSalir }) {
  let explorando = false;
  let scrollAntes = 0;  // desplazamiento del recorrido al entrar ("Atrás" vuelve ahí)
  let origen = null;    // botón o enlace que abrió el visualizador (recupera el foco al volver con "Atrás")
  let alInicio = false; // la salida es por "Volver al inicio" (arriba de todo) y no por "Atrás"

  // El desplazamiento lo maneja esta función: mientras se explora el recorrido está oculto y el navegador no
  // podría restaurarlo solo.
  history.scrollRestoration = 'manual';

  function aplicar() {
    const exp = location.hash === EXPLORAR;
    if (exp && !explorando) entrar();
    else if (!exp && explorando) salir();
  }

  function entrar() {
    explorando = true;
    document.body.classList.add('modo-explorar');
    alEntrar();
  }

  function salir() {
    explorando = false;
    document.body.classList.remove('modo-explorar');
    window.scrollTo({ top: alInicio ? 0 : scrollAntes, behavior: 'instant' });
    alSalir();
    const foco = alInicio ? document.getElementById('btn-empezar') : origen;
    if (foco && document.contains(foco)) foco.focus({ preventScroll: true });
    alInicio = false;
    origen = null;
  }

  function irAlVisualizador(disparador) {
    if (explorando) return;
    origen = disparador;
    scrollAntes = window.scrollY;
    history.pushState(null, '', EXPLORAR);
    aplicar();
  }

  function irAlInicio() {
    if (!explorando) return;
    alInicio = true;
    history.pushState(null, '', sinHash());
    aplicar();
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ir]');
    if (!el) return;
    ev.preventDefault();
    if (el.dataset.ir === 'explorar') irAlVisualizador(el);
    else if (el.dataset.ir === 'inicio') irAlInicio();
  });
  window.addEventListener('popstate', aplicar);
  window.addEventListener('hashchange', aplicar);
  aplicar(); // la dirección con la que se abrió la página

  return { get explorando() { return explorando; } };
}
```

- [ ] **Paso 2: `src/map.js` — gestos libres, vista, cursor**

En `LOCALE`, borrar las tres claves `'CooperativeGesturesHandler.*'` (ya no se usan gestos cooperativos).

En `onHover` del `MapboxOverlay` (dentro de `cargarCapas`), reemplazar la línea del cursor por:

```js
          map.getCanvas().style.cursor = explorando && layer?.id === 'pozos' && index >= 0 ? 'pointer' : '';
```

Reemplazar `habilitarExploracion` y agregar `vista`/`irA` en la API devuelta:

```js
    /** Centro y zoom actuales (para volver al visualizador como se lo dejó). */
    vista() {
      const c = map.getCenter();
      return { center: [c.lng, c.lat], zoom: map.getZoom() };
    },
    /** Salta a una vista sin animación. */
    irA(vista) { map.jumpTo({ ...vista, padding: { top: 0, bottom: 0, left: 0, right: 0 } }); },
    habilitarExploracion(on) {
      // En el visualizador el mapa es libre: la rueda acerca, el mouse o un dedo lo mueven, anda el teclado.
      // En el recorrido no toma gestos: la rueda y el dedo desplazan el texto.
      for (const h of GESTOS) on ? map[h].enable() : map[h].disable();
      if (on) map.touchZoomRotate.disableRotation();
      explorando = on;
      document.body.classList.toggle('explorando', on);
      ajustarFoco();
    },
```

(El comentario de `crearMapa` que dice "Al explorar se prenden con gestos cooperativos" pasa a decir
"Al explorar se prenden todos (ver habilitarExploracion)".)

- [ ] **Paso 3: `src/story.js` — tarjeta 8 y pausa del recorrido**

Firma y retorno: `export function montarRecorrido({ pasos, mapa, produccion })`. En la plantilla de la tarjeta,
reemplazar la línea del botón `btn-explorar` por:

```js
        ${s.final ? `<div class="acciones-cierre">
          <button type="button" class="empezar" data-ir="explorar">Explorá el mapa</button>
          <button type="button" class="empezar" data-abrir="metodologia">Metodología</button>
        </div>` : ''}
```

Borrar `cont.querySelector('.btn-explorar')?.addEventListener(...)` y, dentro de `entrar()`, las dos líneas del final
(`// En celular el panel taparía…` y `if (paso.final && !MOVIL.matches) alTerminar?.();`).

Reemplazar desde `let scroller;` hasta el final de la función por:

```js
  const disparador = () => (MOVIL.matches ? { step: '#story .step > .card', offset: 0.85 } : { step: '#story .step', offset: 0.55 });
  let scroller;
  let pausado = false;
  function configurar() {
    scroller?.destroy();
    scroller = scrollama();
    scroller.setup({ ...disparador(), progress: false }).onStepEnter(({ element }) => entrar(element.closest('.step')));
    if (pausado) scroller.disable();
  }
  configurar();
  MOVIL.addEventListener('change', configurar); // p. ej., un celular que se gira y pasa a la vista de escritorio
  window.addEventListener('resize', () => scroller.resize());

  // Paso en pantalla con el mismo criterio que scrollama (para retomar al volver del visualizador).
  function pasoEnPantalla() {
    const { step, offset } = disparador();
    const linea = window.innerHeight * offset;
    let actual = null;
    for (const el of document.querySelectorAll(step)) if (!actual || el.getBoundingClientRect().top <= linea) actual = el;
    return actual.closest('.step');
  }

  return {
    /** Mientras se explora, el recorrido no reacciona al desplazamiento. */
    pausar() { pausado = true; scroller.disable(); },
    /** Al volver del visualizador: vuelve a escuchar y reaplica el paso que quedó en pantalla. */
    reanudar() { pausado = false; scroller.enable(); entrar(pasoEnPantalla()); },
  };
}
```

- [ ] **Paso 4: `src/explore.js` — entrar y salir con estado guardado; ficha solo al explorar**

Import: quitar `reducirMovimiento`. Después de `const MAX_RESULTADOS = 12;`:

```js
// Vista de la cuenca (la del paso 8) y filtros de fábrica: así arranca el visualizador la primera vez.
const VISTA_CUENCA = { center: [-68.3, -46.2], zoom: 7 };
const estadoInicial = () => ({
  estadosVisibles: new Set([0, 1, 2, 3, 4]), empresa: null, yacimiento: null, provincia: null, sinProducir: null,
  soloEjido: false, enfocarEjido: false, poblacion: false, limites: false, pozos: true, pais: false,
  concesiones: false, barrios: false, soloId: null, resaltado: null,
});
```

Ficha: `abrirPozo(idpozo, { volar = false, foco = true } = {})` guarda `fichaAbierta = idpozo;` y llama
`mostrarFicha(f, foco)`; `mostrarFicha(f, foco = true)` enfoca el botón de cerrar solo si `foco`;
`cerrarFicha({ devolverFoco = true } = {})` pone `fichaAbierta = null` y devuelve el foco solo si `devolverFoco`.
Declarar `let fichaAbierta = null;` junto a `pedido`. El Escape queda:

```js
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !document.querySelector('.ventana[open]')) cerrarFicha(); });
```

Reemplazar `mostrarPanel` y el escuchador de `btn-recorrido` por:

```js
  // ---- entrar y salir del visualizador (avisa src/navegacion.js) ----
  // Al salir se guarda cómo quedó (filtros, vista y ficha) para recuperarlo al volver en la misma visita.
  let guardado = null;
  function entrar() {
    panel.classList.remove('hidden', 'cargando');
    plegarPanel(false);
    mapa.habilitarExploracion(true);
    mapa.marcador(null);
    if (guardado) {
      mapa.aplicar(guardado.estado);
      mapa.irA(guardado.vista);
      if (guardado.ficha !== null) abrirPozo(guardado.ficha, { foco: false });
    } else {
      mapa.aplicar(estadoInicial());
      mapa.volar(VISTA_CUENCA);
    }
    $('explore-titulo').focus({ preventScroll: true });
    cargarSiglas().then((S) => { indiceSiglas = S; }).catch(() => {}); // para el tooltip y el buscador
  }
  function salir() {
    guardado = { estado: { ...mapa.estado, estadosVisibles: new Set(mapa.estado.estadosVisibles) }, vista: mapa.vista(), ficha: fichaAbierta };
    cerrarFicha({ devolverFoco: false });
    panel.classList.add('hidden');
    mapa.habilitarExploracion(false);
  }

  return { alClickPozo: (idpozo) => abrirPozo(idpozo), tooltipPozo, entrar, salir };
```

- [ ] **Paso 5: `src/main.js` — conectar**

Import `iniciarNavegacion` de `./navegacion.js`. Al principio de `iniciar()`, después de `avisarCarga(empezar, true);`:

```js
  const panel = document.getElementById('explore');
  let exploracion = null;
  let recorrido = null;
  // Estados de la página: si se entra al visualizador antes de que lleguen los pozos (p. ej., por el link
  // …/#explorar), el panel avisa que está cargando y el visualizador se arma cuando llegan.
  const nav = iniciarNavegacion({
    alEntrar: () => {
      recorrido?.pausar();
      if (exploracion) exploracion.entrar();
      else panel.classList.remove('hidden');
      if (!exploracion) panel.classList.add('cargando');
    },
    alSalir: () => {
      if (exploracion) exploracion.salir();
      else panel.classList.add('hidden');
      recorrido?.reanudar();
    },
  });
```

`crearMapa`: `onClickPozo: (idpozo) => nav.explorando && exploracion?.alClickPozo(idpozo)` (la ficha es del
visualizador). Quitar `let exploracion`/`panelPedido` de más abajo. `montarRecorrido`:

```js
  recorrido = montarRecorrido({ pasos, mapa, produccion: await produccion });
  if (nav.explorando) recorrido.pausar();
```

Después de `exploracion = montarExploracion(...)`: `if (nav.explorando) exploracion.entrar();`.

- [ ] **Paso 6: `index.html` — portada y encabezado del panel**

Después del botón `#btn-empezar`:

```html
      <p class="accesos">
        <a href="#explorar" class="enlace-chico" data-ir="explorar">Ir directo al mapa</a>
        <span aria-hidden="true">·</span>
        <a href="#metodologia" class="enlace-chico" data-abrir="metodologia">Metodología</a>
      </p>
```

Encabezado del panel (reemplaza `.explore-head` y borra el botón `#btn-recorrido`):

```html
  <!-- Panel del visualizador (…/#explorar) -->
  <aside id="explore" class="hidden" aria-label="Filtros del visualizador">
    <div class="explore-head">
      <nav class="explore-nav" aria-label="Salir del visualizador">
        <a href="./" class="enlace-chico" data-ir="inicio"><span aria-hidden="true">←</span> Volver al inicio</a>
        <a href="#metodologia" class="enlace-chico" data-abrir="metodologia">Metodología</a>
      </nav>
      <h2 id="explore-titulo" tabindex="-1">Explorá los <span id="n-total"></span> pozos</h2>
      <p class="muted" aria-live="polite"><span class="panel-cargando">Cargando el mapa…</span><span class="panel-conteo">Mostrando <strong id="n-visible"></strong></span></p>
      <!-- Solo en celular: el panel es una hoja inferior que se pliega para ver el mapa entero -->
      <button type="button" id="btn-plegar" class="plegar" aria-expanded="true" aria-controls="explore-cuerpo">Ocultar filtros</button>
    </div>
```

En el pie del panel: `<a href="#metodologia" data-abrir="metodologia">Metodología</a>`.

- [ ] **Paso 7: `src/styles.css`**

Borrar `.btn-explorar { … }`, `.link-btn { … }` y `.link-btn:hover { … }`. Agregar después de las reglas de
`.empezar`:

```css
/* tarjeta final: "Explorá el mapa" y "Metodología", con el estilo del botón de la portada */
.acciones-cierre { display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 14px; }
/* enlaces chicos: portada ("Ir directo al mapa · Metodología") y encabezado del panel */
.accesos { margin: 12px 0 0; font-size: 14px; color: var(--texto-sec); }
.enlace-chico { font-size: 14px; color: var(--texto); text-underline-offset: 2px; }
.enlace-chico:hover { text-decoration-thickness: 2px; }

/* ---- estados de la página (src/navegacion.js) ---- */
body.modo-explorar #story, body.modo-explorar #leyenda { display: none; }
```

Junto a las reglas de `.explore-head`:

```css
.explore-nav { display: flex; flex-wrap: wrap; gap: 0 16px; margin: -6px 0 6px; }
.explore-nav .enlace-chico { display: inline-flex; align-items: center; min-height: 32px; }
.panel-cargando { display: none; }
#explore.cargando .panel-cargando { display: inline; }
#explore.cargando .panel-conteo, #explore.cargando #explore-cuerpo, #explore.cargando .plegar { display: none; }
```

En la media query de celular: `.explore-nav { flex-basis: 100%; }`.

- [ ] **Paso 8: Compilar y correr la prueba**

```bash
npm run build
node scripts/prueba_navegacion.mjs
```
Esperado: pasan las de la tarjeta 8, visualizador, volver al inicio, reentrada, "Atrás" y celular; fallan solo las de
la Metodología (`section#metodologia` todavía existe; la ventana todavía no).

- [ ] **Paso 9: Commit**

```bash
git add src/navegacion.js src/map.js src/story.js src/explore.js src/main.js index.html src/styles.css
git commit -m "Visualizador en #explorar y tarjeta 8 como cierre del recorrido"
```

---

### Tarea 3: Ventana de Metodología (`#metodologia`)

**Archivos:** Modificar `src/navegacion.js`, `index.html`, `src/metodologia.js`, `src/styles.css`.

**Interfaces:** Consume `iniciarNavegacion` (Tarea 2). Produce el `<dialog id="ventana-metodologia" class="ventana">`
y los disparadores `[data-abrir="metodologia"]` y `[data-cerrar-metodologia]`.

- [ ] **Paso 1: `src/navegacion.js` completo (visualizador + ventana)**

```js
// Estados de la página (docs/specs/2026-09-27-cierre-y-visualizador-design.md): el recorrido (…/), el
// visualizador (…/#explorar) y la ventana de Metodología (…/#metodologia, o encima del visualizador sin cambiar la
// dirección). La dirección y el historial del navegador mandan: los botones cambian el historial y la página
// reacciona, así "Atrás" y los links directos hacen lo mismo que los botones.
// Disparadores: data-ir="explorar" | "inicio", data-abrir="metodologia" y data-cerrar-metodologia (un solo
// escuchador en document: sirve también para las tarjetas que se crean después).

const EXPLORAR = '#explorar';
const METODOLOGIA = '#metodologia';
const sinHash = () => location.pathname + location.search;

/** alEntrar / alSalir se llaman al entrar al visualizador y al salir, con la página ya en su lugar. */
export function iniciarNavegacion({ alEntrar, alSalir }) {
  const ventana = document.getElementById('ventana-metodologia');
  let explorando = false;
  let scrollAntes = 0;       // desplazamiento del recorrido al entrar ("Atrás" vuelve ahí)
  let origen = null;         // botón o enlace que abrió el visualizador (recupera el foco al volver con "Atrás")
  let alInicio = false;      // la salida es por "Volver al inicio" (arriba de todo) y no por "Atrás"
  let origenVentana = null;  // botón o enlace que abrió la ventana (recupera el foco al cerrarla)

  // El desplazamiento lo maneja esta función: mientras se explora el recorrido está oculto y el navegador no
  // podría restaurarlo solo.
  history.scrollRestoration = 'manual';

  function aplicar() {
    const exp = location.hash === EXPLORAR;
    // La ventana va en la dirección (#metodologia) sobre el recorrido; sobre el visualizador, como marca en la
    // entrada del historial (la dirección sigue siendo #explorar).
    const met = location.hash === METODOLOGIA || (exp && history.state?.metodologia === true);
    if (exp && !explorando) entrar();
    else if (!exp && explorando) salir();
    if (met && !ventana.open) ventana.showModal();
    else if (!met && ventana.open) {
      ventana.close();
      if (origenVentana && document.contains(origenVentana)) origenVentana.focus({ preventScroll: true });
      origenVentana = null;
    }
  }

  function entrar() {
    explorando = true;
    document.body.classList.add('modo-explorar');
    alEntrar();
  }

  function salir() {
    explorando = false;
    document.body.classList.remove('modo-explorar');
    window.scrollTo({ top: alInicio ? 0 : scrollAntes, behavior: 'instant' });
    alSalir();
    const foco = alInicio ? document.getElementById('btn-empezar') : origen;
    if (foco && document.contains(foco)) foco.focus({ preventScroll: true });
    alInicio = false;
    origen = null;
  }

  function irAlVisualizador(disparador) {
    if (explorando) return;
    origen = disparador;
    scrollAntes = window.scrollY;
    history.pushState(null, '', EXPLORAR);
    aplicar();
  }

  function irAlInicio() {
    if (!explorando) return;
    alInicio = true;
    history.pushState(null, '', sinHash());
    aplicar();
  }

  function abrirMetodologia(disparador) {
    if (ventana.open) return;
    origenVentana = disparador;
    history.pushState({ metodologia: true }, '', explorando ? EXPLORAR : METODOLOGIA);
    aplicar();
  }

  function cerrarMetodologia() {
    if (!ventana.open) return;
    if (history.state?.metodologia) history.back(); // el "popstate" la cierra
    else { history.replaceState(null, '', explorando ? EXPLORAR : sinHash()); aplicar(); } // se abrió por link
  }

  ventana.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrarMetodologia(); }); // Escape
  ventana.addEventListener('click', (ev) => { if (ev.target === ventana) cerrarMetodologia(); }); // clic afuera
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ir], [data-abrir="metodologia"], [data-cerrar-metodologia]');
    if (!el) return;
    ev.preventDefault();
    if (el.dataset.ir === 'explorar') irAlVisualizador(el);
    else if (el.dataset.ir === 'inicio') irAlInicio();
    else if (el.dataset.abrir === 'metodologia') abrirMetodologia(el);
    else cerrarMetodologia();
  });
  window.addEventListener('popstate', aplicar);
  window.addEventListener('hashchange', aplicar);
  aplicar(); // la dirección con la que se abrió la página

  return { get explorando() { return explorando; } };
}
```

- [ ] **Paso 2: `index.html` — la Metodología dentro de `<dialog>`**

Reemplazar la apertura `<section id="metodologia" class="metodologia" aria-labelledby="metodologia-titulo">` +
`<div class="card">` por:

```html
  <dialog id="ventana-metodologia" class="ventana" aria-labelledby="metodologia-titulo">
    <button type="button" class="cerrar" data-cerrar-metodologia aria-label="Cerrar la metodología">×</button>
    <div class="ventana-cuerpo metodologia">
```

y el cierre `</div>` + `</section>` por `</div>` + `</dialog>`. El comentario de arriba agrega: "Ventana de
Metodología (…/#metodologia): la abre y la cierra src/navegacion.js." El contenido no cambia.

- [ ] **Paso 3: `src/metodologia.js`**

`const sec = document.getElementById('ventana-metodologia');`

- [ ] **Paso 4: `src/styles.css`**

Borrar `.metodologia { position: relative; … }`, `.metodologia .card { … }` y, en la media query,
`.metodologia { padding: 6vh 16px; }`. Agregar `--tarjeta-solida: #fffcf6;` en `:root` y:

```css
/* ---- ventana de Metodología (<dialog>, src/navegacion.js) ---- */
.ventana { width: min(800px, calc(100vw - 32px)); max-width: none; height: 80vh; height: 80svh; max-height: none; padding: 0; border: 0; border-radius: 8px; background: var(--tarjeta-solida); color: var(--texto); box-shadow: 0 20px 60px rgba(0, 0, 0, .28); }
.ventana::backdrop { background: rgba(23, 24, 27, .5); }
.ventana-cuerpo { height: 100%; overflow: auto; overscroll-behavior: contain; padding: 32px 40px 28px; }
.ventana .cerrar { position: absolute; top: 6px; right: 8px; z-index: 1; width: 44px; height: 44px; border: 0; background: none; font-size: 26px; line-height: 1; cursor: pointer; color: var(--texto-sec); }
.ventana .cerrar:hover { color: var(--texto); }
.metodologia h2 { margin-right: 40px; }
html:has(.ventana[open]) { overflow: hidden; } /* la página de atrás no se desplaza */
```

En la media query de celular:

```css
  .ventana { width: 100vw; max-width: 100vw; height: 100vh; height: 100dvh; max-height: 100dvh; margin: 0; border-radius: 0; }
  .ventana-cuerpo { padding: 24px 18px; }
```

- [ ] **Paso 5: Compilar y correr la prueba**

```bash
npm run build
node scripts/prueba_navegacion.mjs
```
Esperado: `Todo OK`.

- [ ] **Paso 6: Commit**

```bash
git add src/navegacion.js index.html src/metodologia.js src/styles.css
git commit -m "Metodología en una ventana (#metodologia)"
```

---

### Tarea 4: Documentación, publicación y verificación

**Archivos:** Modificar `docs/plans/2026-09-18-plan-implementacion.md`, `CLAUDE.md`,
`docs/specs/2026-09-27-cierre-y-visualizador-design.md` (estado).

- [ ] **Paso 1:** En el plan general, agregar en la semana 2 la tarea `2.17 (27/09) Cierre, visualizador y
  Metodología` marcada `[x]`, con un renglón que remita a este plan y al spec. En `CLAUDE.md`, agregar
  `src/navegacion.js` a la estructura ("estados de la página: recorrido, visualizador #explorar, ventana
  #metodologia") y un renglón en "Estado actual". En el spec, "Estado: implementado el 27/09".
- [ ] **Paso 2:** `npm run build` sin errores; `node scripts/prueba_navegacion.mjs` → `Todo OK`.
- [ ] **Paso 3:** Commit y push; esperar el deploy de Pages en verde; correr la prueba contra
  `https://marianoarielperez.github.io/lo-que-queda/` → `Todo OK`.
