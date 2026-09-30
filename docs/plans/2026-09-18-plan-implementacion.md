# Plan de implementación

Cada tarea es autónoma: se puede pedir a Claude Code "hacé la tarea 2.3" y tiene todo lo que necesita.
Marcar con [x] al terminar. Cada tarea termina con `npm run build` sin errores y una mirada en el navegador.

## Semana 1 · 18–25 sep · Datos y esqueleto — HECHA el 18/09

- [x] 1.1 Pipeline `data-pipeline/procesar.py` reproducible; salidas en `public/data/`; conciliación.
- [x] 1.2 Esqueleto Vite + MapLibre + deck.gl; 44.390 puntos por estado; filtros en GPU.
- [x] 1.3 Recorrido de 7 pasos con Scrollama; cifras desde `resumen.json`; gráfico D3 del paso 1.
- [x] 1.4 Panel de exploración: estado, operadora, yacimiento, provincia, población, buscador, ficha.
- [x] 1.5 Workflow de GitHub Pages; estilo de respaldo si falla el mapa base.
- [ ] 1.6 **Aldana:** crear el repo en GitHub (público, en una cuenta con el seudónimo), subir el
      proyecto y activar Pages (guía: `docs/git-github.md`). **Mariano:** aceptar la invitación y verificar el link.
- [x] 1.6b Integrados el 20/09: padrón de primera producción, país con coordenadas, concesiones SHP.
- [x] 1.6c Mensuales 2017–2026 filtrados (4.873.490 filas, `raw/produccion-mensual_gsj.zip`, 41 MB) y procesados el 20/09.
- [ ] 1.7 **Aldana:** boceto de tarjeta, leyenda y portada; primera pasada a los textos de
      `definirPasos()` en `src/story.js` (60–90 palabras por paso, voseo).
- [ ] 1.8 **Los dos:** abrir el formulario en udesa.edu.ar/contarcondatos y ver qué acepta el campo
      "Institución"/"Aval institucional" para presentación personal. Elegir seudónimo.

## Semana 2 · 26 sep – 2 oct · Recorrido y diseño

> Desde el 26/09 el recorrido tiene 8 pasos: donde una tarea dice "paso N" o "tarjeta N" con la numeración vieja,
> hoy es el N+1 (p. ej. la tarjeta del CH-679 es el paso 7). Revisión completa del código: `docs/revision-2026-09-26.md`.

- [x] 2.1 Paso 6 centrado en el centroide del radio urbano con más pozos (`resumen.poblacion.radio_urbano_mas_pozos`).
- [ ] 2.2 (PARCIAL 26/09: el anillo `resaltado` ya existe y se usa en la ficha y el buscador; el pozo es `YPF.Ch.-679`,
      idpozo 121621, pero cae ~1,8 km fuera de la vista del paso 7 → decisión de los autores) Resaltar el pozo de la tarjeta 6 (CH-679) si existe en el registro: buscar la sigla en las
      fichas; si está, agregar `resaltado` al estado del mapa y dibujarlo con anillo. Si no está, la
      tarjeta lo menciona sin marcarlo (y se dice en metodología).
- [x] 2.3 (26/09: paso 5 con `enfocarEjido`; cortes en `CORTES_POBLACION` de `paleta.js`, los usan mapa y leyenda) Paso 4: cuando `poblacion: true`, atenuar los pozos fuera del ejido (opacidad) para que la
      ciudad sea el foco. Leyenda de población con los cortes (< 400, 400–700, 700–1.000, 1.000–1.300, > 1.300 hab.).
- [ ] 2.4 (PARCIAL 26/09: etiqueta en minúsculas y conteos alineados, hechos; falta el diseño de Aldana) Aplicar el diseño de Aldana: tarjetas, portada, tipografías, tamaño de puntos por zoom.
      Ajustar `.filtro-inline label` (hoy la etiqueta de "Ver población" queda en mayúsculas) y los
      conteos entre paréntesis de los checkboxes de estado (alinearlos a la derecha como en la leyenda).
- [x] 2.5 (26/09: sigla + estado + yacimiento; siglas desde `siglas.json`, que genera el pipeline) Hover: tooltip liviano con sigla + estado al pasar por un pozo (deck.gl `getTooltip`).
- [ ] 2.6 (PARCIAL 27/09: el mapa no toma el dedo durante el recorrido; al explorar, un dedo desplaza y dos mueven
      el mapa. En celular: el paso cambia cuando asoma su tarjeta (no la sección), el panel se abre con el botón
      "Explorá los pozos" de la tarjeta 8 y se pliega a su encabezado; sin botones de zoom; alturas en `svh`.
      Falta: probar en un teléfono real (con el link de Pages)) Móvil (390 px): recorrido con tarjetas apiladas y mapa fijo arriba; panel de exploración
      como hoja inferior; probar en un teléfono real.
- [x] 2.7 Portada y paso 1 con los 85.609 pozos del país (capa `pais`), la cuenca coloreada.
- [x] 2.8 (26/09: `pct()` en `data.js`; GSJ y Neuquina etiquetadas, las otras tres con una sola etiqueta en gris) Gráfico del paso 1: las etiquetas de Cuyana/Austral/Noroeste se pisan; apilarlas o dejar solo
      GSJ y Neuquina etiquetadas. Porcentajes con coma decimal ("22,8 %") en vez de punto.
- [x] 2.9a Tarjetas 2 y 4 con la frase de trayectoria ("no registran ni un mes de producción desde 2017").
- [x] 2.9c (28/09: el ritmo salió de las tarjetas; 30/09: no vuelve) Tarjeta 7 con ritmo de declaraciones de abandono (calculado en `story.js` desde `abandonados_por_anio_de_declaracion`).
- [x] 2.9b (30/09: los tramos son botones con barra en el panel y la serie arranca en 2011, así que el último tramo es «nunca
      desde 2011». El gráfico chico de abandonos por año queda DESCARTADO por los autores: cargas administrativas como la de
      CAPSA en 2012 y 807 pozos con `pab` que hoy no están abandonados) Filtro "tiempo sin producir" en el panel (`meses_cod`: 65535 = nunca en la serie) con cuatro
      tramos: menos de 1 año / 1–5 / 5–9 / nunca desde 2017. Gráfico chico de `abandonados_por_anio_de_declaracion`.
- [ ] 2.11 Tarjeta 5 quedó larga (~110 palabras) con los barrios: Aldana decide qué sacar o si los barrios
      van en una tarjeta propia entre la 5 y la 6. Etiquetas de nombre de barrio al hacer zoom (`TextLayer`).
- [x] 2.12 Mapa base con toponimia argentina (20/09). OpenFreeMap con `text-field` de las capas `symbol`
      reemplazado por `['coalesce', ['get', 'name:es'], ['get', 'name']]`: probado en Chrome, muestra "Islas
      Malvinas". Argenmap (IGN) quedó como opción (`MAPA_BASE = 'ign'` en `src/map.js`) con prueba de un tile y
      respaldo automático a OpenFreeMap; ese día wms.ign.gob.ar no respondía. Pendiente: citar el mapa base en
      la metodología; opcional, rótulos propios (`TextLayer`) para Comodoro, Rada Tilly, Caleta Olivia y las cuencas.
- [x] 2.10 (26/09: columna `conc_cod` en el binario; con la capa de concesiones encendida, anillo fino en esos pozos y
      línea en la leyenda y en el panel con el conteo. La frase para la tarjeta del paso 4 queda para los autores) Paso 3: usar `resumen.concesiones.pozos_en_area_sin_concesion` (2.207 pozos en áreas que no
      figuran como concesión vigente: Km 8, Cañadón Minerales, Don Ernesto, Alberto, Bella Vista Oeste,
      Revertidas – Chubut) y resaltar esos pozos al encender la capa de concesiones.

- [x] 2.13 (26/09) Paso nuevo "El primer pozo" entre la portada y el paso País. La portada quedó como estaba
      (decisión de los autores). `flyTo` de 3 s a zoom 8 sobre el Pozo N° 2 (idpozo 121014); se ve solo ese pozo
      (`soloId` en `map.js`) con un marcador HTML (borde gris "Abandonado", torre en trazo, etiqueta "Pozo N° 2 ·
      1907"); la leyenda se oculta en ese paso; al pasar al paso País los puntos entran con un fundido de 0,6 s.
      Tarjeta con foto `public/img/pozo2-1907.jpg` (16:9) y crédito de la Fototeca; en celular va sin foto y el
      vuelo usa `padding` inferior para dejar el pozo arriba. Pasos renumerados 1–8; el de Km 3 ya no repite 1907.
      Ajustes del 26/09 (tarde): la portada muestra el mapa SIN pozos (tarjeta igual) y el mapa arranca en esa
      vista; la leyenda se oculta en portada y en el paso 1; texto definitivo de la tarjeta (sin "abandonado desde
      1916"); foto con la escena completa (carros y torre) en 16:9; el mapa base ya no dibuja áreas protegidas
      (capa `park` de OpenFreeMap). Pendiente: actualizar `docs/tarjetas-para-aldana.docx`.
- [x] 2.15 (26/09) Portada: texto debajo de la bajada generado en `textoPortada()` de `story.js`, con la
      desocupación del aglomerado leída de `resumen.eph` (nueva serie EPH 2022–2026 en `raw/`) y fuente con el CV.
      Pendiente opcional: confirmar el empleo petrolero de Chubut en el Excel del OEDE si se quiere sumar a algún paso.
- [x] 2.16 (26/09) Portada rediseñada con el formato de la tarjeta del paso 1: foto de hoy (El Patagónico,
      `public/img/comodoro-hoy.jpg`, también en celular), kicker "Exploración interactiva", texto narrativo de los
      autores (título en una línea, 48 px; bajada en óxido `--acento-portada`, solo en la portada), botón "Desplazá para empezar" (clickeable, lleva al paso 1, flecha animada salvo "reducir
      movimiento") y fuentes con el CV de la EPH. Serie de desocupación larga de datos.gob.ar.
- [x] 2.14 (26/09) Fichas: el corte de fechas de relleno pasó de 13/12/1907 a 1/1/1907 (el Pozo N° 2 recupera
      su fecha de perforación); la ficha muestra terminación y la fecha de abandono del listado de operadoras
      (`fab`) cuando existe; "2017-01" se muestra como "ya figuraba así al inicio de la serie". Correr
      `npm run data` para regenerar.

- [x] 2.17 (27/09) Cierre, visualizador y Metodología: la tarjeta 8 cierra el recorrido con "Explorá el mapa" y
      "Metodología"; el visualizador vive en `…/#explorar` (mapa libre, panel, "← Volver al inicio") y la Metodología
      en una ventana (`…/#metodologia`). Spec: `docs/specs/2026-09-27-cierre-y-visualizador-design.md`; plan:
      `docs/plans/2026-09-27-cierre-y-visualizador.md`; prueba: `scripts/prueba_navegacion.mjs`.

- [x] 2.18 (27/09) Satélite y ubicación en el visualizador: botón "Satélite"/"Mapa" (Esri World Imagery híbrido,
      pozos con borde blanco) y botón de ubicación (sigue dentro de la cuenca; fuera, un aviso). Spec:
      `docs/specs/2026-09-27-satelite-y-ubicacion-design.md`; plan: `docs/plans/2026-09-27-satelite-y-ubicacion.md`.

## Semana 3 · 3–9 oct · Pulido

- [ ] 3.1 Paso 3 (operadoras): colorear por operadora (5 destacadas + "otras", validar paleta con
      `validate_palette.js`), con un control "antes / después" que alterna operador anterior y actual
      usando `operadores.json` y la columna `ea` de las fichas. Si no da el tiempo: filtro simple por
      operadora y texto con las cifras.
- [ ] 3.2 (PARCIAL 26/09: esqueleto en `index.html` + `src/metodologia.js`; cifras con `data-cifra`, datasets y tabla
      de estados desde `resumen.json` (`datasets`, `cuenca_por_estado_original`). Falta: párrafo de apertura (autores),
      revisar la redacción, enlace del Decreto 1509/2024, enlace al repo (1.6)) Página "Metodología y fuentes" (`#metodologia` en `index.html`): datasets con enlace y
      fecha de descarga; tabla `GRUPOS`; correcciones; límites del dato; declaración de IA; créditos;
      licencias. Enlaces oficiales de `docs/investigacion-contexto.md`.
- [x] 3.3 (27/09: los nombres de la línea "Fuente" son enlaces, se abren en otra pestaña; datasets por su `clave` en
      `resumen.datasets`, contexto en `CONTEXTO` de `story.js`. Sin ícono: decide Aldana) Enlaces a fuentes oficiales desde las tarjetas (ícono al lado de "Fuente").
- [ ] 3.4 (PARCIAL 27/09: carga en dos tiempos — la portada con un JS de 92 KB (antes 2,1 MB), MapLibre y deck.gl
      en chunks aparte, datos pesados después de la foto de portada, el país al final; tipografías servidas desde el
      sitio; fotos a 1000 px en WebP con JPEG de respaldo (`scripts/optimizar_fotos.py`, originales en
      `fotos-originales/`). Lighthouse en Pages, celular con red y CPU frenadas de verdad: puntaje 48 → 60, primer
      contenido 2,7 → 2,3 s, mayor contenido 4,8 → 3,1 s, bloqueo 4,8 → 3,5 s (antes el texto de la portada no llegaba a
      verse en 7 s). El bloqueo que queda es el arranque de MapLibre y deck.gl (en Chrome sin GPU, exagerado).
      Falta: probar en compu lenta, en Firefox/Safari y en un teléfono) Rendimiento: probar en una compu lenta y en Firefox/Safari; si hace falta, bajar
      `radiusMaxPixels` y agrupar en hexágonos por debajo de zoom 8 (`HexagonLayer`).
- [ ] 3.5 (PARCIAL 26/09: vuelos y fundido respetan "reducir movimiento"; ficha con foco, Escape y nombre; controles del
      mapa en castellano; el mapa fuera del orden de tabulación durante el recorrido. Falta: contraste de tarjetas
      inactivas y de puntos sobre la población, cifra dentro del encabezado) Accesibilidad: recorrido completo con teclado; foco visible; `prefers-reduced-motion`
      desactiva las animaciones de cámara; contraste de textos ≥ 4,5:1.
- [ ] 3.6 Prueba con 2–3 personas ajenas al proyecto: ¿entienden qué es "abandonado"? ¿encuentran
      los filtros? ¿la ficha les dice lo que esperan? Ajustar textos.
- [x] 3.7 DESCARTADA (29/09, autores): solo el 46 % de los pozos tiene fecha de perforación (24 % de los abandonados, 27 % en el ejido) y faltan justo los viejos; la animación mostraría la historia al revés. Idea original: línea de tiempo por año de perforación (`anio_cod` ya está en el binario; 46 %
      con fecha). Solo si 3.1–3.6 están cerradas.

## Semana 4 · 10–15 oct · Entrega

- [ ] 4.1 Congelar código el 12/10 (tag `v1.0`). Solo correcciones de errores después.
- [ ] 4.2 Video de 60 s: recorrido completo + 15 s de exploración (filtro por estado, clic en un
      pozo). Grabar a 1920×1080. Subir a YouTube o Vimeo (no listado).
- [ ] 4.3 PNG de portada 1920×1080 por si el formulario exige archivo.
- [ ] 4.4 Formulario: categoría Exploración interactiva; título; descripción metodológica (≤ 200
      palabras, `docs/formulario.md`); fuentes con links; declaración de IA; seudónimo; link a la web
      y al video. Enviar el 13 o 14. Guardar el acuse.
- [ ] 4.5 Respaldo: exportar `dist/` como zip y guardar junto al repo.

## Riesgos y respuesta

| Riesgo | Respuesta |
|---|---|
| Scroll flojo en móvil | Tarjetas apiladas con mapa fijo arriba (2.6) |
| Máquinas lentas | Hexágonos por debajo de zoom 8 (3.4); paso 0 sin puntos |
| Paso 3 se atrasa | Filtro simple por operadora + texto |
| Cambia el dato de la SE | Datos congelados al 18/09/2026, citados con fecha |
| Duda de autoría/aval | Resolver en 1.8 esta semana |
| OpenFreeMap caído o lento | Fondo papel de respaldo ya implementado; alternativa: Argenmap (IGN) si vuelve a responder, o PMTiles en el repo |
