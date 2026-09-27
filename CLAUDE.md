# Lo que queda — instrucciones para Claude Code

Pieza de visualización interactiva para el Concurso Nacional de Visualización de Datos
"Contar con Datos" 2026 (UdeSA + Subsecretaría de Ciencia y Tecnología). Categoría: **Exploración
interactiva**. Cierre de inscripción: **15 de octubre de 2026**. Se entrega el 13 o 14.

Tesis: *lo que queda cuando el petróleo se va*. La Cuenca del Golfo San Jorge, la más vieja del país,
pierde producción; YPF se retiró; quedan 28.499 pozos sin producir, 6.205 de ellos dentro del ejido
de Comodoro Rivadavia, donde 84.796 personas viven en radios censales con al menos un pozo.

Documento de diseño completo: `docs/specs/2026-09-18-lo-que-queda-design.md`. Plan por semanas:
`docs/plans/`. Reparto de tareas: `docs/para-aldana.md`, `docs/para-mariano.md`. Leer el spec y el
plan antes de tocar código.

## Reglas que no se negocian

1. **Ninguna cifra se tipea a mano.** Todo número visible sale de `public/data/resumen.json`,
   que genera `data-pipeline/procesar.py`. Si falta una cifra, se agrega al script y se regenera.
2. **Vocabulario fiel al dato.** "Estado declarado por la operadora ante la Secretaría de Energía".
   Nunca "contaminado", "peligroso", "sin tapar" ni "mal abandonado" como afirmación propia.
   "Abandonado" = dado de baja por la operadora según la Resolución SE 5/96; no describe el estado físico.
3. **Toda afirmación de contexto lleva fuente oficial** (InfoLeg, SEC/20-F de YPF, Boletín Oficial,
   comunicado municipal). Sin fuente oficial, la frase no va. Las fuentes verificadas están en
   `docs/specs/…` §5 y en `docs/investigacion-contexto.md`.
4. **La paleta está validada; no se cambia sin revalidar** (`src/paleta.js`). Estado → color en orden
   fijo. El gris de "abandonado" es deliberado.
5. **Uso de IA declarado.** La IA (Claude) asiste en datos y código bajo supervisión. Las decisiones
   visuales, los textos finales y la composición son de las autoras/es. No generar imágenes ni
   gráficos "finales" con IA generativa. No agregar librerías ni servicios que requieran clave o pago.
6. **Sin scraping ni fuerza bruta** contra portales (lo prohíben las bases). Los datos ya están
   descargados en `data-pipeline/raw/`.
7. **Español rioplatense en todo lo que ve el usuario** (voseo: "desplazá", "explorá"). Miles con
   punto (`fmt()` en `src/data.js`).
8. Antes de cerrar una tarea: `npm run build` sin errores, abrir en navegador, y cotejar cualquier
   cifra nueva con `public/data/conciliacion.md`.

## Comandos

```bash
npm install                 # una vez
npm run dev                 # http://localhost:5173
npm run build               # dist/
npm run preview             # sirve dist/ en :4173
npm run data                # regenera public/data/* desde data-pipeline/raw/ (necesita geopandas)
```

Python del pipeline: `pip install pandas numpy geopandas shapely pyogrio`.

## Estructura

```
data-pipeline/procesar.py   pipeline reproducible; GRUPOS = tabla de equivalencias de 17 estados → 4
data-pipeline/raw/          insumos descargados (18/09/2026); ver data-pipeline/README.md
public/data/                salidas: pozos_gsj.bin(+meta), fichas/, siglas.json, radios.geojson, limites.geojson,
                            produccion_cuencas.json, operadores.json, resumen.json, conciliacion.md
src/main.js                 arranque en dos tiempos: portada con resumen.json; después MapLibre, deck.gl y datos
src/data.js                 carga de binario/JSON, fmt()
src/map.js                  MapLibre + deck.gl (deck se importa a demanda); filtros en GPU (DataFilterExtension);
                            API: aplicar(), volar(), alCambiar(), cargarCapas(), agregarPais()
                            Mapa base: OpenFreeMap con rótulos `name:es` ("Islas Malvinas") y sin la capa `park`; IGN opcional
src/story.js                pasos del recorrido (textos + vista + capas) y scrollama
src/explore.js              panel de filtros, leyenda con conteos, buscador, ficha
src/chart.js                gráfico D3 de producción por cuenca (paso 2)
src/paleta.js               colores validados
src/styles.css              estilos; media query móvil al final
src/metodologia.js          completa la metodología de index.html (cifras data-cifra, datasets, tabla de estados)
index.html                  esqueleto + panel + ficha + sección metodología
public/fonts/               Fraunces y Source Sans 3 (woff2, OFL): servidas desde el sitio, sin Google Fonts
public/img/                 fotos a 1000 px, WebP + JPEG; se generan con scripts/optimizar_fotos.py desde fotos-originales/
.github/workflows/deploy.yml  publica dist/ en GitHub Pages en cada push a main
```

## Convenciones de código

- JavaScript moderno sin framework, módulos ES, sin TypeScript. Comentarios en castellano.
- Un módulo por responsabilidad (ver estructura). `map.js` expone una API pequeña; `story.js` y
  `explore.js` la usan, no tocan MapLibre/deck directamente.
- Los textos de las tarjetas viven SOLO en `definirPasos()` de `src/story.js`.
- Los datos pesados se cargan una vez (`pozos_gsj.bin`, ~0,9 MB); las fichas por lote a demanda.
- Sin `localStorage`, sin analytics, sin cookies.
- Accesibilidad: controles reales (`button`, `label`+`input`), foco visible, `aria-label` en íconos,
  contraste ≥ 4,5:1 en texto. Todo debe funcionar con teclado.
- Móvil: probar a 390 px de ancho. Las tarjetas se apilan; el mapa queda arriba.

## Datasets integrados el 20/09/2026

- Capítulo IV país entero (con coordenadas) → `pozos_pais.bin`, capa "país" en el paso 2 (la portada va sin pozos).
- Padrón de primera producción → `primera_cod` en el binario, `pp`/`pp06` en la ficha, `resumen.antiguedad`.
  OJO: la serie arranca en 2006-01; "ya en 2006" no es una fecha de perforación.
- Concesiones de explotación (SHP) → `concesiones.geojson`, capa en paso 3 y en el panel; `conc` en la ficha;
  `resumen.concesiones` (2.207 pozos en áreas que no figuran como concesión vigente).
- Mensual por pozo 2017-01 → 2026-08 (`raw/produccion-mensual_gsj.zip`, 41 MB; el pipeline lo lee
  comprimido) → `meses_cod` en el binario (65535 = sin ningún mes de producción en la serie), `up`/`msp`/`pab`
  en la ficha, `resumen.trayectoria`. Hallazgos: 11.243 pozos no abandonados sin un mes de producción desde
  2017; 13.175 inactivos hace más de 5 años; ~169 declaraciones de abandono por año entre 2018 y 2025 (los
  9.895 de "2017" ya estaban abandonados al inicio de la serie: no usar ese año como "declarados en 2017").

- Barrios de Comodoro (`raw/limites-barrios-2026.gpkg`, 77 polígonos) → `barrios.geojson`, `b` en la ficha,
  capa en pasos 5 y 6 y en el panel, `resumen.barrios` (2.507 pozos en 52 barrios; Astra 492, Don Bosco 364,
  Pte. Ortiz 252, Gral. Mosconi 195 sin ninguno activo).

## Estado actual (20/09/2026)

Semana 1 terminada: pipeline ejecutado y verificado con todos los datasets; web compila y funciona
(recorrido de 7 pasos con cifras de trayectoria, filtros, ficha, gráfico, capa país, concesiones).
26/09: el recorrido pasa a 8 pasos; el 1 es "El primer pozo" (Pozo N° 2, idpozo 121014, solo ese pozo con
marcador y foto de la Fototeca). Sus fechas y cifras históricas (1907, 540 m, 1916) son citas de contexto con
fuente en `docs/investigacion-contexto.md`, como la Resolución 5/96 o los US$ 915 millones de YPF.
La copia con los datos reales procesados está en la PC de Mariano; `public/data/` de esa copia es la buena. Pendientes por semana en `docs/plans/2026-09-18-plan-implementacion.md`.

- Portada: texto de `textoPortada()` (story.js) con `resumen.eph` (EPH del INDEC, Comodoro–Rada Tilly). Por el
  error muestral de la EPH, nunca decir cuánto subió la desocupación ni atribuirla al petróleo; ver
  `docs/investigacion-contexto.md`.
- Fechas en la ficha: `pab` sale de la serie mensual, así que "2017-01" = ya abandonado al inicio de la serie.
  `fab` = fecha de abandono del listado de operadoras (solo ~1.200 pozos). Fechas de perforación anteriores al
  1/1/1907 se descartan como relleno (el Pozo N° 2, idpozo 121014, se perforó desde marzo de 1907).

- 26/09 (noche): revisión con cinco agentes → `docs/revision-2026-09-26.md` (errores arreglados, decisiones de texto
  pendientes para los autores). "Activo" ≠ "producen": usar `extraccion_efectiva` de `resumen.json` para decir que
  un pozo produce. El mapa no toma gestos durante el recorrido; al explorar usa gestos cooperativos (Ctrl + rueda,
  dos dedos). El panel se resincroniza con `mapa.alCambiar()`: los controles no guardan estado propio.

## Qué NO hacer

- No reemplazar el Capítulo IV base por una descarga posterior al 18/09/2026 sin avisar: las cifras
  citadas se congelaron con esa versión. Agregar datasets nuevos (los de la sección anterior) sí está bien.
- No usar `primera_prod == 2006-01` como "perforado en 2006": significa que el pozo ya figuraba al inicio de la serie.
- No agregar la comparación internacional de pozos huérfanos (decisión de los autores).
- No incluir nombres reales de los autores en la web hasta después del fallo del jurado (seudónimo).
