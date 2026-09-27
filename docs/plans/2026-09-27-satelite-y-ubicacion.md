# Imagen satelital y ubicación en el visualizador — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** en el visualizador (`…/#explorar`), un botón "Satélite"/"Mapa" (Esri World Imagery híbrido) y un botón de
ubicación que sigue a la persona dentro de la cuenca, según `docs/specs/2026-09-27-satelite-y-ubicacion-design.md`.

**Arquitectura:** `map.js` suma el estado `satelite` (fuente raster de Esri insertada arriba del fondo; rellenos del
estilo apagados en ese modo), capas deck.gl del punto de ubicación y una API chica (`agregarControl`,
`mostrarUbicacion`, `limitesCuenca`, `alMoverConLaMano`). `src/ubicacion.js` (nuevo) maneja el botón y
`watchPosition` sin importar MapLibre. `explore.js` monta los dos botones y apaga la ubicación al salir.

**Tecnología:** MapLibre GL 5 (fuente raster, controles propios `IControl`), deck.gl 9 (`ScatterplotLayer`),
Geolocation API del navegador. Prueba con puppeteer-core 24 (permisos y ubicación simulados).

## Restricciones globales

- Sin librerías nuevas; sin `localStorage`, cookies ni analytics. La ubicación no se guarda ni se envía, y no se
  calcula nada con ella.
- Paleta sin cambios: sobre la imagen, los pozos llevan borde blanco (forma, no color).
- Textos nuevos exactos: "Satélite", "Mapa", "Mostrar mi ubicación", "Buscando tu ubicación…", "Dejar de mostrar mi
  ubicación", "Volver a centrar en mi ubicación", "Estás fuera de la cuenca del Golfo San Jorge.", "No se pudo obtener
  tu ubicación: el permiso está desactivado.", "No se pudo obtener tu ubicación.", "Este navegador no permite ubicarte."
- Atribución exacta: "Imagen satelital © Esri — Esri, Vantor, Earthstar Geographics y la comunidad de usuarios GIS".
- `npm run build` sin errores y `node scripts/prueba_navegacion.mjs` → `Todo OK` antes de cerrar.

---

### Tarea 1: Prueba de aceptación (se amplía)

**Archivos:** Modificar `scripts/prueba_navegacion.mjs`.

**Interfaces:** Consume `.boton-base` (texto "Satélite"/"Mapa"), `.boton-ubicacion` (clases `apagado`, `buscando`,
`siguiendo`, `quieto`), `#aviso-mapa` (`hidden` cuando no hay aviso), créditos `.maplibregl-ctrl-attrib`.

- [ ] **Paso 1:** Antes de `// ---- Celular ----`, agregar:

```js
// ---- Satélite y ubicación (visualizador) ----
{
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(new URL(BASE).origin, ['geolocation']);
  const page = await ctx.newPage();
  await page.setViewport({ width: 1366, height: 800 });
  await page.goto(`${BASE}#explorar`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('listo'), { timeout: 60000 });
  await espera(1500);
  const base = () => page.evaluate(() => ({
    boton: document.querySelector('.boton-base')?.textContent,
    esri: (document.querySelector('.maplibregl-ctrl-attrib')?.textContent || '').includes('Esri'),
  }));
  const ubic = () => page.evaluate(() => {
    const a = document.getElementById('aviso-mapa');
    return { clase: document.querySelector('.boton-ubicacion')?.className || '', aviso: a.hidden ? '' : a.textContent };
  });
  let b = await base();
  ok(b.boton === 'Satélite' && !b.esri, 'botón "Satélite" en el visualizador, sin Esri en los créditos');
  await page.click('.boton-base');
  await espera(2000);
  b = await base();
  ok(b.boton === 'Mapa' && b.esri, 'modo satélite: el botón dice "Mapa" y los créditos citan a Esri');
  await page.click('.explore-nav [data-ir="inicio"]');
  await espera(2000);
  ok(!(await base()).esri, 'el recorrido vuelve al mapa papel');
  await page.click('.accesos [data-ir="explorar"]');
  await espera(2000);
  b = await base();
  ok(b.boton === 'Mapa' && b.esri, 'al volver a entrar sigue en satélite');

  await page.setGeolocation({ latitude: -45.82, longitude: -67.49, accuracy: 30 }); // Km 3
  await page.click('.boton-ubicacion');
  await espera(2500);
  let u = await ubic();
  ok(u.clase.includes('siguiendo') && u.aviso === '', `en la cuenca te ubica y te sigue (${u.clase})`);
  await page.click('.boton-ubicacion'); // apaga
  await espera(300);
  ok((await ubic()).clase.includes('apagado'), 'otro toque apaga la ubicación');

  await page.setGeolocation({ latitude: -34.6, longitude: -58.38, accuracy: 30 }); // Buenos Aires
  await page.click('.boton-ubicacion');
  await espera(2500);
  u = await ubic();
  ok(u.clase.includes('quieto') && u.aviso === 'Estás fuera de la cuenca del Golfo San Jorge.', `fuera de la cuenca: aviso (${u.aviso})`);

  await page.click('.explore-nav [data-ir="inicio"]');
  await espera(800);
  ok((await ubic()).clase.includes('apagado'), 'al salir del visualizador la ubicación se apaga');
  await ctx.close();
}
```

- [ ] **Paso 2:** `npm run build`, `npx vite preview --port 4173`, `node scripts/prueba_navegacion.mjs` → fallan las
  comprobaciones nuevas (no existe `.boton-base`).

---

### Tarea 2: Satélite, ubicación y botones

**Archivos:** Crear `src/ubicacion.js`. Modificar `src/map.js`, `src/explore.js`, `src/story.js`, `index.html`,
`src/styles.css`.

**Interfaces:**
- Produce en la API del mapa: `agregarControl(elemento)`, `mostrarUbicacion({ lng, lat, precision } | null)`,
  `limitesCuenca() → [oeste, sur, este, norte]`, `alMoverConLaMano(fn)`; estado `satelite` (booleano) en `aplicar()`.
- Produce `montarUbicacion({ mapa, avisar }) → { apagar() }` en `src/ubicacion.js`.

- [ ] **Paso 1: `src/ubicacion.js`**

```js
// Botón de ubicación del visualizador (docs/specs/2026-09-27-satelite-y-ubicacion-design.md).
// La ubicación se usa solo en este dispositivo: no se guarda ni se envía, y no se calcula nada con ella (ni
// distancias ni "pozos cerca"). Dentro de la cuenca el mapa sigue a la persona; fuera, solo un aviso.
// No importa MapLibre (así no entra en el JavaScript inicial): dibuja con la API del mapa.

const RETICULA = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3"/></svg>';
const ETIQUETAS = {
  apagado: 'Mostrar mi ubicación',
  buscando: 'Buscando tu ubicación…',
  siguiendo: 'Dejar de mostrar mi ubicación',
  quieto: 'Volver a centrar en mi ubicación',
};
const ZOOM_MINIMO = 14;

/** Monta el botón sobre el mapa. `avisar(texto)` muestra un aviso breve. Devuelve { apagar } (al salir). */
export function montarUbicacion({ mapa, avisar }) {
  const grupo = document.createElement('div');
  grupo.className = 'maplibregl-ctrl maplibregl-ctrl-group botonera';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.innerHTML = RETICULA;
  grupo.append(boton);
  mapa.agregarControl(grupo);

  let estado = 'apagado';
  let vigilancia = null;
  let ultima = null;  // { lng, lat, precision } de la última lectura
  let primera = true; // la primera lectura decide si se vuela o se avisa

  function poner(nuevo) {
    estado = nuevo;
    boton.className = `boton-ubicacion ${nuevo}`;
    boton.setAttribute('aria-label', ETIQUETAS[nuevo]);
    boton.title = ETIQUETAS[nuevo];
  }
  poner('apagado');

  const dentro = ({ lng, lat }) => {
    const [oeste, sur, este, norte] = mapa.limitesCuenca();
    return lng >= oeste && lng <= este && lat >= sur && lat <= norte;
  };
  const centrar = (p, duracion) => mapa.volar({ center: [p.lng, p.lat], zoom: Math.max(mapa.vista().zoom, ZOOM_MINIMO) }, { duration: duracion });

  function recibir(pos) {
    ultima = { lng: pos.coords.longitude, lat: pos.coords.latitude, precision: pos.coords.accuracy };
    mapa.mostrarUbicacion(ultima);
    if (primera) {
      primera = false;
      if (dentro(ultima)) { poner('siguiendo'); centrar(ultima, 1600); }
      else { poner('quieto'); avisar('Estás fuera de la cuenca del Golfo San Jorge.'); }
    } else if (estado === 'siguiendo') centrar(ultima, 500);
  }

  function fallar(err) {
    avisar(err.code === 1 ? 'No se pudo obtener tu ubicación: el permiso está desactivado.' : 'No se pudo obtener tu ubicación.');
    apagar();
  }

  function encender() {
    if (!('geolocation' in navigator)) { avisar('Este navegador no permite ubicarte.'); return; }
    primera = true;
    poner('buscando');
    vigilancia = navigator.geolocation.watchPosition(recibir, fallar, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }

  function apagar() {
    if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
    vigilancia = null;
    ultima = null;
    mapa.mostrarUbicacion(null);
    poner('apagado');
  }

  boton.addEventListener('click', () => {
    if (estado === 'apagado') encender();
    else if (estado === 'quieto' && ultima && dentro(ultima)) { poner('siguiendo'); centrar(ultima, 800); }
    else apagar();
  });
  // Mover el mapa con la mano deja de seguir (el punto queda)
  mapa.alMoverConLaMano(() => { if (estado === 'siguiendo') poner('quieto'); });

  return { apagar };
}
```

- [ ] **Paso 2: `src/map.js`**

Después de `const ESTILO_RESPALDO = …;`:

```js
// Imagen satelital del visualizador: Esri World Imagery, sin clave, con la atribución que usan los autores en otras
// iniciativas (docs/specs/2026-09-27-satelite-y-ubicacion-design.md). Solo figura en los créditos mientras se ve.
const FUENTE_SATELITE = {
  type: 'raster',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  maxzoom: 19,
  attribution: 'Imagen satelital © Esri — Esri, Vantor, Earthstar Geographics y la comunidad de usuarios GIS',
};
// La ubicación cuenta como "dentro de la cuenca" si cae en el rectángulo de los pozos más este margen (grados).
const MARGEN_CUENCA = 0.25;
// Sobre la imagen satelital: borde blanco de los pozos y anillos claros (forma, no color).
const BLANCO = [255, 255, 255];
const ANILLO_CLARO = [255, 255, 255, 150];
```

En `estado`, después de `resaltado`: `satelite: false, // imagen satelital de fondo (solo en el visualizador)`.

En `capaPozos`: `stroked: estado.satelite, getLineColor: BLANCO, getLineWidth: 0.8, lineWidthUnits: 'pixels',`
(en lugar de `stroked: false,`). En `capaSinConcesion`: `getLineColor: estado.satelite ? ANILLO_CLARO : anilloSinConcesion,`.
En `capaResaltado`: `getLineColor: estado.satelite ? BLANCO : anilloTexto,`.

Después de `capaResaltado`:

```js
  // Ubicación de la persona (botón del visualizador): círculo de precisión tenue y punto negro con borde blanco
  // (no se confunde con el azul de "Activo").
  let datosUbicacion = [];
  function capasUbicacion() {
    if (!datosUbicacion.length) return [];
    return [
      new deck.ScatterplotLayer({
        id: 'ubicacion-precision', data: datosUbicacion, getPosition: (d) => [d.lng, d.lat], getRadius: (d) => d.precision,
        radiusUnits: 'meters', getFillColor: [23, 24, 27, 28], stroked: true, getLineColor: [23, 24, 27, 90],
        getLineWidth: 1, lineWidthUnits: 'pixels', pickable: false,
      }),
      new deck.ScatterplotLayer({
        id: 'ubicacion', data: datosUbicacion, getPosition: (d) => [d.lng, d.lat], getRadius: 7, radiusUnits: 'pixels',
        getFillColor: [23, 24, 27], stroked: true, getLineColor: BLANCO, getLineWidth: 2.5, lineWidthUnits: 'pixels', pickable: false,
      }),
    ];
  }

  // Rectángulo de la cuenca (pozos + margen), para saber si la ubicación cae adentro. Se calcula una vez.
  let rectanguloCuenca = null;
  function limitesCuenca() {
    if (!rectanguloCuenca && pozos) {
      let oeste = 180, sur = 90, este = -180, norte = -90;
      const p = pozos.positions;
      for (let i = 0; i < p.length; i += 2) {
        oeste = Math.min(oeste, p[i]); este = Math.max(este, p[i]);
        sur = Math.min(sur, p[i + 1]); norte = Math.max(norte, p[i + 1]);
      }
      rectanguloCuenca = [oeste - MARGEN_CUENCA, sur - MARGEN_CUENCA, este + MARGEN_CUENCA, norte + MARGEN_CUENCA];
    }
    return rectanguloCuenca ?? [-180, -90, 180, 90];
  }
```

En `render()`: agregar `...capasUbicacion()` al final de la lista de capas.

Después de `map.on('load', …)`:

```js
  // Mapa base papel o satélite. La imagen va apenas arriba del fondo del estilo; en satélite se apagan los rellenos
  // del mapa papel (agua, usos del suelo, edificios) y quedan calles, rutas, límites y nombres: un mapa híbrido.
  // Si el estilo todavía no terminó de cargar, se aplica cuando carga (y otra vez si se reemplaza por el remoto).
  function aplicarBase() {
    try {
      if (estado.satelite && !map.getLayer('satelite')) {
        if (!map.getSource('satelite')) map.addSource('satelite', FUENTE_SATELITE);
        const encima = map.getStyle().layers.find((c) => c.type !== 'background');
        map.addLayer({ id: 'satelite', type: 'raster', source: 'satelite' }, encima?.id);
      }
      if (map.getLayer('satelite')) map.setLayoutProperty('satelite', 'visibility', estado.satelite ? 'visible' : 'none');
      for (const c of map.getStyle().layers) {
        if (c.type === 'fill') map.setLayoutProperty(c.id, 'visibility', estado.satelite ? 'none' : 'visible');
      }
    } catch {
      map.once('style.load', aplicarBase);
    }
  }
  map.on('style.load', () => { if (estado.satelite) aplicarBase(); });
```

En `aplicar()`: guardar `const eraSatelite = estado.satelite;` antes de `Object.assign` y, después de la copia del
`Set`, `if (estado.satelite !== eraSatelite) aplicarBase();`.

En la API devuelta, antes de `habilitarExploracion`:

```js
    /** Agrega un grupo de botones propio (satélite, ubicación) junto a los de zoom. */
    agregarControl(elemento) { map.addControl({ onAdd: () => elemento, onRemove: () => elemento.remove() }, 'bottom-right'); },
    /** Dibuja (o borra, con null) la ubicación de la persona: { lng, lat, precision } (precisión en metros). */
    mostrarUbicacion(pos) { datosUbicacion = pos ? [pos] : []; render(); },
    limitesCuenca,
    /** fn se llama cuando la persona arrastra el mapa (el seguimiento de la ubicación se detiene). */
    alMoverConLaMano(fn) { map.on('dragstart', fn); },
```

- [ ] **Paso 3: `src/explore.js`**

Import: `import { montarUbicacion } from './ubicacion.js';`. En `estadoInicial()`: `satelite: false`. Antes de
`// ---- leyenda (recorrido) y controles del panel`:

```js
  // ---- botones sobre el mapa (solo en el visualizador): mapa base y ubicación ----
  const grupoBase = document.createElement('div');
  grupoBase.className = 'maplibregl-ctrl maplibregl-ctrl-group botonera';
  const botonBase = document.createElement('button');
  botonBase.type = 'button';
  botonBase.className = 'boton-base';
  grupoBase.append(botonBase);
  botonBase.addEventListener('click', () => mapa.aplicar({ satelite: !mapa.estado.satelite }));
  mapa.agregarControl(grupoBase);

  const aviso = $('aviso-mapa');
  let temporizadorAviso = null;
  function avisar(texto) {
    aviso.textContent = texto;
    aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 6000);
  }
  const ubicacion = montarUbicacion({ mapa, avisar });
```

En `sincronizar(e)`, al final:

```js
    botonBase.textContent = e.satelite ? 'Mapa' : 'Satélite';
    botonBase.title = e.satelite ? 'Volver al mapa' : 'Ver imagen satelital';
```

En `salir()`, antes de `cerrarFicha(...)`: `ubicacion.apagar();`.

- [ ] **Paso 4: `src/story.js`** — en `entrar()`, agregar `satelite: false` a los dos `mapa.aplicar({...})` (portada
  y pasos).

- [ ] **Paso 5: `index.html`** — después de `#leyenda`:
  `<p id="aviso-mapa" class="aviso-mapa" role="status" hidden></p>` (con un comentario). En "Créditos y licencias"
  de la metodología, después del mapa base:

```html
        <li>Imagen satelital (visualizador): © Esri — Esri, Vantor, Earthstar Geographics y la comunidad de usuarios GIS.</li>
        <li>Privacidad: si pedís tu ubicación en el visualizador, se usa solo en tu dispositivo para mostrarte en el mapa; no se guarda, no se envía y no se calcula nada con ella.</li>
```

- [ ] **Paso 6: `src/styles.css`**

```css
/* ---- botones propios sobre el mapa (visualizador): satélite y ubicación ---- */
.maplibregl-ctrl-group.botonera button { width: auto; min-width: 40px; height: 40px; padding: 0 10px; font: 600 14px/1 var(--sans); color: var(--texto); }
.botonera .boton-ubicacion svg { display: block; margin: 0 auto; }
/* activo: negro también con el mouse encima (el :hover de MapLibre lo aclararía) */
.maplibregl-ctrl-group.botonera .boton-ubicacion.siguiendo, .maplibregl-ctrl-group.botonera .boton-ubicacion.siguiendo:hover { background: var(--texto); color: #fff; }
.botonera .boton-ubicacion.buscando svg { animation: ubicando 1s ease-in-out infinite; }
@keyframes ubicando { 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { .botonera .boton-ubicacion.buscando svg { animation: none; } }
/* avisos del mapa ("Estás fuera de la cuenca…") */
.aviso-mapa { position: fixed; top: 16px; left: 50%; z-index: 6; transform: translateX(-50%); max-width: calc(100vw - 32px); margin: 0; padding: 8px 14px; font-size: 15px; color: var(--texto); background: var(--tarjeta-solida); border-radius: 6px; box-shadow: 0 4px 16px rgba(0, 0, 0, .18); }
```

En la media query de celular: `.maplibregl-ctrl-group { display: none; }` pasa a
`.maplibregl-ctrl-group:not(.botonera) { display: none; }`, y se agrega
`.aviso-mapa { left: 12px; right: 64px; transform: none; }` (deja libre la columna de botones de la derecha).

- [ ] **Paso 7:** `npm run build` sin errores; `node scripts/prueba_navegacion.mjs` → `Todo OK`; capturas en
  escritorio y celular del modo satélite y de la ubicación.

- [ ] **Paso 8:** Commit: `Imagen satelital y ubicación en el visualizador`.

---

### Tarea 3: Documentación y publicación

- [ ] Plan general: tarea `2.18 (27/09) Satélite y ubicación en el visualizador` marcada `[x]`, remitiendo a este plan y
  al spec. `CLAUDE.md`: `src/ubicacion.js` en la estructura y una línea en "Estado actual" (Esri con atribución; la
  ubicación no se guarda ni se usa para calcular). Spec: "implementado el 27/09".
- [ ] Commit, push, deploy en verde y `node scripts/prueba_navegacion.mjs https://marianoarielperez.github.io/lo-que-queda/` → `Todo OK`.
