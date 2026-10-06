# Lo que queda — instrucciones para Claude Code

Pieza de visualización interactiva para el Concurso Nacional de Visualización de Datos
"Contar con Datos" 2026 (UdeSA + Subsecretaría de Ciencia y Tecnología). Categoría: **Exploración
interactiva**. Cierre de inscripción: **15 de octubre de 2026**. Se entrega el 13 o 14.

Tesis: *lo que queda cuando el petróleo se va*. La Cuenca del Golfo San Jorge, la más vieja del país,
pierde producción; YPF se retiró; quedan 28.499 pozos sin producir, 6.205 de ellos dentro del ejido
de Comodoro Rivadavia, donde 84.519 personas (el 42 % de la ciudad) viven en radios censales con al menos un pozo.

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
node scripts/prueba_navegacion.mjs   # prueba de la navegación contra `npx vite preview --port 4173`
                                     # (PUPPETEER_CORE_DIR = carpeta con node_modules/puppeteer-core; ver el script)
```

Python del pipeline: `pip install pandas numpy geopandas shapely pyogrio`.

## Estructura

```
data-pipeline/procesar.py   pipeline reproducible; GRUPOS = tabla de equivalencias de 17 estados → 4
data-pipeline/raw/          insumos descargados (18/09/2026); ver data-pipeline/README.md
public/data/                salidas: pozos_gsj.bin(+meta), fichas/, siglas.json, radios.geojson, limites.geojson (solo el ejido),
                            produccion_cuencas.json, operadores.json, resumen.json, conciliacion.md
src/main.js                 arranque en dos tiempos: portada con resumen.json; después MapLibre, deck.gl y datos
src/data.js                 carga de binario/JSON, fmt()
src/map.js                  MapLibre + deck.gl (deck se importa a demanda); filtros en GPU (DataFilterExtension);
                            API: aplicar(), volar(), alCambiar(), cargarCapas(), agregarPais()
                            Mapa base: OpenFreeMap con rótulos `name:es` ("Islas Malvinas") y sin la capa `park`; IGN opcional
src/navegacion.js           estados de la página: recorrido (…/), visualizador (…/#explorar), ventana de
                            Metodología (…/#metodologia); la dirección y el historial mandan
src/story.js                pasos del recorrido (textos + vista + capas) y scrollama; pausar()/reanudar()
src/explore.js              panel del visualizador (entrar()/salir() con estado guardado), leyenda, buscador, ficha,
                            botón Satélite/Mapa
src/ubicacion.js            botón de ubicación del visualizador (watchPosition; no importa MapLibre)
src/chart.js                gráfico D3 de producción por cuenca (paso 2)
src/paleta.js               colores validados
src/styles.css              estilos; media query móvil al final
src/metodologia.js          completa la metodología de index.html (cifras data-cifra, datasets, tabla de estados)
index.html                  esqueleto + panel + ficha + sección metodología
public/fonts/               Fraunces y Source Sans 3 (woff2, OFL): servidas desde el sitio, sin Google Fonts
public/img/                 fotos a 1000 px, WebP + JPEG; se generan con scripts/optimizar_fotos.py desde fotos-originales/
                            (las subcarpetas se replican: fotos-originales/historias/ → public/img/historias/)
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
- Mensual por pozo 2006-01 → 2026-08 (desde el 02/10; el 30/09 arrancaba en 2011 y antes en 2017): `raw/produccion-mensual_gsj_2006-2010.zip`
  (16,8 MB) + `raw/produccion-mensual_gsj_2011-2016.zip`
  (22,5 MB) + `raw/produccion-mensual_gsj_2017-2025.zip` (38,5 MB) + `raw/produccion-mensual_gsj_2026.zip` (3 MB; aparte para que
  actualizarlo no reescriba los años cerrados; bajado de nuevo el 02/10: al cambiarlo, actualizar `DESCARGA_MENSUAL`);
  el pipeline lee todos los `produccion-mensual_gsj*` → `meses_cod` en el binario (65535 = sin ningún mes de producción en
  la serie), `up`/`msp`/`pab` en la ficha, `resumen.trayectoria`. Hallazgos (30/09): 9.099 pozos no abandonados sin un mes de
  producción desde 2011 (desde 2017 eran 11.243); 4.982 en el ejido (eran 5.256); 13.111 inactivos con 60 meses o más
  declarados sin producir. Abandonos por año de declaración: los 8.166 de enero de 2011 ya estaban abandonados al inicio de
  la serie (`ya_abandonados_al_inicio`: no usar como «declarados en 2011»); agosto de 2012 tiene 492 de una sola operadora
  (CAPSA), una carga administrativa; además 807 pozos tienen `pab` pero hoy no figuran abandonados. Por eso los abandonos
  por año NO van en la web (decisión de los autores, 30/09): quedan en `resumen.json` y la conciliación. Tarjeta 3 (30/09):
  solo petrolíferos y gasíferos inactivos o a abandonar (`nunca_en_serie_no_abandonados_petroleo_gas`, 3.643; de los 9.099,
  el resto son inyectores, «otro tipo», acuíferos y sumideros, que no producen por diseño).
  02/10 (serie desde 2006): 7.523 no abandonados sin un mes de producción; tarjeta 3, 2.713 («desde entonces», porque el
  padrón también empieza en 2006); tarjeta 5, 4.809 en el ejido. Corte legal: la Res. SE 319/93 (Anexo I, punto 2) pide el
  Capítulo IV «antes del día 20 de cada mes», así que la serie llega al último mes vencido a la fecha de descarga
  (`DESCARGA_MENSUAL` en procesar.py; al 02/10, agosto: septiembre tenía 106 pozos). «Dejaron de declararse» = sin
  declaración los últimos 3 meses o más (1.347, decisión de los autores); Brest S.A. (3.012 pozos) declara con atraso y queda
  en `declaraciones_atrasadas`.
  Decir «ni un mes de producción desde 2006», nunca «no producen hace 20 años»: incluye
  pozos perforados después de 2011 (decisión de los autores). Con la descarga del 20/09, 5.322 pozos de Clear, Roch, Azruge
  y Pilgrim figuraban «sin declarar después de julio de 2026» porque declararon agosto tarde; `dejaron_de_declararse`
  bajó de 9.598 a 4.359.

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
  `docs/investigacion-contexto.md`. «La desocupación es la más alta en décadas» se queda (decisión de los autores, 04/10,
  sabiendo que el 2T2026 es provisorio y tiene un coeficiente de variación de 35,5 %): no volver a plantearlo.
- Fechas en la ficha: `pab` sale de la serie mensual, así que el primer mes de la serie ("2011-01") = ya abandonado al
  inicio de la serie (`declaradoAbandonado()` lo toma de `trayectoria.cobertura.desde`).
  `fab` = fecha de abandono del listado de operadoras (solo ~1.200 pozos). Fechas de perforación anteriores al
  1/1/1907 se descartan como relleno (el Pozo N° 2, idpozo 121014, se perforó desde marzo de 1907).

- 26/09 (noche): revisión con cinco agentes → `docs/revision-2026-09-26.md` (errores arreglados, decisiones de texto
  pendientes para los autores). "Activo" ≠ "producen": usar `extraccion_efectiva` de `resumen.json` para decir que
  un pozo produce. El mapa no toma gestos durante el recorrido; al explorar usa gestos cooperativos (Ctrl + rueda,
  dos dedos). El panel se resincroniza con `mapa.alCambiar()`: los controles no guardan estado propio.

- 27/09: la tarjeta 8 cierra el recorrido; el visualizador se abre solo con "Explorá el mapa" (o "Ir directo al
  mapa" en la portada, o el link `#explorar`) y la Metodología es una ventana (`#metodologia`). En el recorrido el
  clic en un pozo no abre la ficha (solo el tooltip); la ficha es del visualizador.

- 27/09: en el visualizador, imagen satelital de Esri (atribución "Imagen satelital © Esri — Esri, Vantor, Earthstar
  Geographics y la comunidad de usuarios GIS"; el recorrido siempre en mapa papel) y botón de ubicación. La ubicación
  no se guarda, no se envía y no se usa para calcular nada (ni distancias ni "pozos cerca").

- 27/09: textos de las tarjetas 2, 3 y 5 revisados con los autores. "Producen" = extracción efectiva en los pasos 3, 5
  y 6 ("activos" es otra cosa). Paso 2: la Neuquina "gracias a Vaca Muerta" (fuentes en `docs/investigacion-contexto.md`),
  `produccion.neuquina_pct_ref` y `produccion.gsj_cae_desde`. Paso 5: población solo de Comodoro
  (`poblacion.comodoro`, 304 radios, 201.230 hab.); Rada Tilly queda afuera del porcentaje.

- 27/09: la tarjeta 6 pasa de "Km 3" a "Zona norte": los 36 barrios al norte del cerro Chenque según el relevamiento
  de barrios de la Municipalidad (`ZONA_NORTE` en `procesar.py`; fuentes en `docs/investigacion-contexto.md`). Población por
  barrio del Censo 2022 (`raw/poblacion-viviendas-barrios-2022.csv`) → `resumen.zona_norte`; `zn_cod` en el binario y `zn` en
  `barrios.geojson` para el enfoque del mapa (`enfocarZonaNorte`). Decir "pozos dentro del barrio", nunca "sobre casas":
  las viviendas no están georreferenciadas. La población por barrio sirve para totales; no comparar pozos por habitante
  entre barrios salvo donde coincide con los radios (Astra sí).

- 27/09: la tarjeta 7 pasa de "Un radio censal" a "Convivir con pozos": 474 pozos en barrios de zona norte que la operadora no
  dio de baja (`zona_norte.no_dados_de_baja`), 393 con 60 meses o más declarados sin producir, y hechos del municipio con fuente
  (radios de seguridad y gas, Res. 3404-19 de Don Bosco, relevamiento de pozos inactivos, CH-679). Las cifras del relevamiento
  municipal que circulan en medios (1.700, 150 sin localizar, 3.700, 6.000) no tienen fuente oficial: no usarlas.
- 28/09: la tarjeta 7 suma historias de pozos puntuales (ocho, de 2008 a 2026): el ícono del Pozo N° 2 marca cada pozo en el
  mapa y la lista de la tarjeta repite los títulos; los dos abren una ventana (`<dialog id="ventana-historia">`) con el texto,
  lo que dice el registro de ese pozo (de su ficha) y las fuentes. Textos en `historias` del paso 7 (story.js).
  EXCEPCIÓN a la regla 3, decidida por los autores: estas historias pueden salir de notas periodísticas, siempre citadas en
  la misma historia; la identificación de cada pozo la confirmaron los autores con la Secretaría de Ambiente municipal (no se
  dice en la web). La de Laprida es el YPF.Ch.-811 (03/10: lote 5 de la manzana 9 del plano de catastro; antes figuraba el CH-2228). Fotos solo con permiso escrito del medio (campo `foto`).
- 28/09 (noche): la tarjeta 7 se aliviana: la cifra pasa a los abandonados del ejido (`ejido.Abandonado`, la de la tarjeta 5) con
  «que la operadora declare un pozo como abandonado no garantiza que esté bien sellado»; 7 de las 8 historias son de pozos abandonados. El mapa muestra
  solo los abandonados, con el foco en el ejido. `zona_norte.no_dados_de_baja` (474) y el 393 siguen en resumen.json pero ya no
  se muestran. Fotos en cinco historias (44, BV-577(d), 679, 325, 724), crédito «Foto: <fuente>» y recorte 16:9 por CSS
  (`posicion` = object-position); el permiso de cada fuente lo gestionan los autores.
- 29/09: la tarjeta 7 suma dos historias (diez en total): Escuela 169 de Stella Maris (tres pozos: R-87, R-88 y S/L-564; `idpozo`
  puede ser una lista y la línea del registro los agrupa) e YPF.Ch.-182 en una rotonda de un loteo de Presidente Ortiz (Decreto Chubut
  135/2025, que rechaza el recurso de YPF contra la Res. 23-15-MH de 2015: radio de 60 m llevado a 5 m para un loteo de 600 lotes;
  la rotonda, del plano municipal y de Google Earth). La lista de la tarjeta se
  reemplazó por el botón «Leer las N historias» (la ventana dice «3 de 10» y tiene Anterior/Siguiente); el encuadre de la tarjeta 7
  abarca justo los pozos de las historias (`vistaDeHistorias()`), con `AIRE_ICONO` (44 px) de margen; en la computadora se le
  reserva a la leyenda su columna de la derecha.
- 30/09: el panel del visualizador suma dos gráficos atados a los filtros: una barra apilada de «Estado declarado» (con % en
  cada fila) y «Tiempo sin producir» como cuatro botones con barra (`aria-pressed`; tocar filtra, tocar de nuevo saca el filtro)
  en lugar del desplegable. La barra de cada tramo va en tinta y, en gris, los que la operadora ya declaró abandonados
  (`mapa.conteosTramo` y `mapa.tramoAbandonados`, que cuentan como `conteos`: todos los filtros salvo el propio). Los autores
  descartaron la «operadora en el listado anterior» (son códigos de la SE, a veces de la misma empresa de hoy).
- 30/09 (tarde): el panel suma «Barrio de Comodoro» (los 77 barrios; `barrio_cod` en el binario, `meta.barrios`): filtra los
  pozos del barrio, acerca el mapa a su contorno (`mapa.barrio(nombre)`, zoom máximo 15), prende la capa de barrios y muestra
  la población del Censo 2022 por barrio. Y «Descargar estos N pozos (CSV)»: los que se ven con los filtros (`mapa.filasVisibles()`),
  armado en el navegador (UTF-8 con BOM). Se descartó un selector de año «Así se apagó la cuenca»: la cantidad de pozos que
  producen casi no cambia en la cuenca (13.799 en 2011, 14.094 en 2025; cae el volumen, no los pozos); en el ejido sí baja
  (750 → 567). Las dos series quedan en `trayectoria.produjeron_por_anio` y `ejido_produjeron_por_anio` para una tarjeta.
- 30/09: portada con «Videotutorial (1 min)» (así desde el 01/10; antes «Ver el video») (junto a «Ir directo al mapa · Metodología»): ventana `#video` (`<dialog
  id="ventana-video" data-youtube="…">`) que maneja `navegacion.js` como la Metodología (dirección, «Atrás», Escape, foco;
  `data-abrir="video"`, `data-cerrar-ventana`). El reproductor de youtube-nocookie.com se crea al abrirla (autoplay con el
  clic) y se borra al cerrarla: sin abrirla no se carga nada de YouTube. Es la única excepción a «sin cookies», aclarada en
  la Metodología (Créditos y licencias). El video está en el canal anónimo «Lo que queda... cuando el petróleo se va»
  (@lo-que-queda-2026, youtu.be/lJ91vFpKvfM): para cambiarlo, solo `data-youtube`.
- 03/10: las diez historias del paso 7 llevan fotos nuevas (`fotos-originales/historias/historia-N-….jpg`, 16:9): de los autores
  (sin crédito, casi todas tomas aéreas) salvo la 7 y la 8, de gacetillas de la Municipalidad («Foto: Municipalidad de Comodoro
  Rivadavia»). Se borraron las de El Patagónico, ADNSUR, El Extremo Sur, el vecino y Google Earth. Ninguna foto marca una
  propiedad (privacidad; decisión de los autores); el epígrafe dice el lugar.
- 04/10: el paso 6 marca el pozo de su foto (PCR.Ch.B-41, idpozo 40066, Gobernador Fontana) con el ícono del Pozo N° 2 y la
  etiqueta «PCR.Ch.B-41 · en la foto», solo en la computadora (en el celular la foto se oculta); cae dentro de
  `NUCLEO_ZONA_NORTE`, así la vista no cambia. `mapa.marcadores()` toma una lista y pone el borde del color del estado declarado
  de cada pozo (el B-41 figura Activo, aunque CRI no lo declara desde 12/2022). Texto: «…el barrio donde se encontró el
  petróleo en el Pozo N° 2…».
- 04/10: textos de seis historias del paso 7 revisados por los autores y cotejados con sus notas. Lo que no sale de la nota y es
  decisión o análisis de ellos (Laprida: «era el YPF.Ch.-811», la vecinal dijo «2.811»; la esquina de Buque La Plata y Petrolero
  San Lorenzo; La Francesa «por encima de las viviendas» y «descendió»; el «antiguo» pozo del cerro Hermitte) queda anotado en
  story.js y en `docs/investigacion-contexto.md`. «Su sellado no quedó en condiciones óptimas» (Las Orquídeas) va atribuido a
  El Patagónico: es del periodista.
- 05/10: historias del paso 7 con ideas de la versión de Aldana (solo lo aprobado; su copia es anterior y no se copió entera):
  la ventana sigue centrada y arranca con el `copete` (el comienzo del texto, cortado donde aprobaron los autores, sin cambiar
  palabras); «Seguir leyendo · N pozo(s) · fuentes» abre el resto (`texto`), el recuadro «El pozo, según el registro» (punto del
  color del estado, sigla, estado declarado, operadora de hoy y años) y las fuentes. Operadora anterior (autores, 05/10): solo
  «antes, YPF», en el recuadro y en la ficha del visualizador (`eraDeYPF` en data.js); sale del listado de operadoras de la SE
  (2025), que usa códigos y a veces es la misma empresa de hoy (CAP = CAPSA, PAE = Pan American), y no dice quién estaba a
  cargo cuando pasó cada historia. Anterior/Siguiente
  mantienen lo que eligió el lector. Marcadores: `etiqueta` corta (qué pasó y dónde) siempre a la vista en la computadora y oculta
  en el celular (decisión de los autores frente a mostrarla solo con el mouse); map.js elige el lado de cada una para que no se
  pisen (`acomodarEtiquetas`); borde del color del estado. Íconos (`ICONOS_HISTORIA` en map.js): cinco de Aldana (escuela, gota,
  casa, brote, agua) y cinco de Tabler Icons (MIT, crédito en la Metodología: mudanza, cerco, edificio, viento, rotonda), elegidos
  por los autores. No dibujar íconos con IA: la Metodología dice que la IA no generó gráficos.
- 06/10: textos de los autores. Portada: «Los barrios se levantaron alrededor de los pozos y, a veces, encima de ellos» e «YPF se
  retiró de la zona». Paso 6: «…tienen pozos petroleros» (no «conviven con pozos», para no repetir el título del paso 7). Paso 8:
  «la ciudad se expandió alrededor de la actividad petrolera» y «muchos de aquellos pozos». Enlaces en otra pestaña: Mauro Esains a
  su Instagram (epígrafe del paso 8 y créditos de la Metodología) y la Resolución SE 5/96 en «Qué quiere decir cada estado».
- 30/09: fotos propias de los autores (sin crédito por foto, por el seudónimo; la Metodología dice «las fotos sin crédito son de
  los autores»): portada (restos oxidados de un aparato de bombeo en la entrada de Caleta Córdova; reemplaza la de El Patagónico)
  y pasos 3 a 6 (`fotoPropia()` en story.js: planta deshidratadora de PECOM en Km 9; letras de YPF en sus antiguos almacenes de
  Km 3; pozo CFP.Ch.SM-549 en Caleta Córdova; pozo PCR.Ch.B-41 en Gobernador Fontana). Los epígrafes solo dicen lugar y pozo:
  sin «ex YPF» (sin fuente) y sin decir que el SM-549 produzca (CRI no lo declara desde 12/2022). Exportarlas sin metadatos
  (GPS, modelo): los originales van al repo.
- 01/10: textos de las tarjetas revisados por los autores. Paso 1: el decreto del 14/12/1907 (S/N; radio de 5 leguas
  kilométricas = 25 km desde el pueblo, no desde el pozo) y la creación de YPF por Yrigoyen (fuentes en
  `docs/investigacion-contexto.md`; ya no se nombra el museo ni los 540 m). Paso 2: «produce cada vez menos: desde 2019, cae
  todos los años» (antes de 2019 hubo repuntes). Paso 3: «casi dos de cada tres» sale de `fraccionEnPalabras()`. Paso 6:
  «Varios de estos barrios nacieron como campamentos petroleros» (no «casi todos»; «campamentos» desde el 03/10). Paso 8: «entre las casas» es decisión
  de los autores para el cierre (el satélite y las historias del paso 7); en el resto, «dentro del barrio».
- 28/09 (noche): la tarjeta 8 se vuelve cierre: vuelve al Pozo N° 2 (zoom 14) y se aleja en 7 s hasta `VISTA_CUENCA`
  (`cierre` en el paso; `recorrerCierre()` en story.js), con foto de Mauro Esains y texto que cierra con «El petróleo se va.
  Los pozos se quedan.». Los autores descartaron apagar los activos. Salieron de la tarjeta 13.018, el ritmo de abandonos y los
  US$ 915 M (siguen en resumen.json / conciliación; el 20-F sigue en la metodología). `volar()` devuelve una promesa y lleva a
  cero el padding que dejó el vuelo anterior antes de `cameraForBounds` (MapLibre lo suma: el encuadre salía más lejos y en el
  celular no salía). Volver a entrar al mismo paso (resize, volver del visualizador) no repite el vuelo desde el Pozo N° 2.
  Al terminar el vuelo, la tarjeta queda con `data-cierre-listo` y el visualizador arranca desde esa cámara sin moverla (en el
  celular, con el panel plegado); desde la portada o con el vuelo sin terminar, arranca como siempre (`VISTA_CUENCA`).
- 27/09: "meses sin producir" cuenta solo meses declarados. CRI, CPAT e INER dejan de declarar sus pozos antes del final de la
  serie; esos meses no son "sin producir". `meses_desde_ultima_prod` (calendario) sirve para "produjo en el último año";
  `meses_declarados_sin_producir` para "más de cinco años". La ficha muestra "Declaración mensual: hasta …" (`ud`).
- 27/09: vistas por límites (`vista: { bounds }`): el mapa las ajusta a cada pantalla sin lo que tapan la tarjeta o el panel.
  `VISTA_CUENCA` (data.js) es la del arranque del visualizador; la tarjeta 8 usa el mismo encuadre en la computadora
  (`comoVisualizador`, con `paddingPanel()`), así el mapa no se mueve al tocar "Explorá el mapa". Las tarjetas 6 y 7 usan
  `NUCLEO_ZONA_NORTE` (story.js). La capa de límites dibuja solo el ejido de Comodoro.
- 27/09: visualizador: el ejido siempre a la vista; barrios y ejido en negro (color del texto, 1,5 px) para que se lean sobre el
  satélite. Clic con prioridad pozo → radio censal (si se ve la población) → barrio (map.js busca el polígono, punto en
  polígono; los polígonos no son pickables en deck). El cartel lo arma `cartelArea()` de explore.js: radio con habitantes y pozos;
  barrio con pozos y habitantes del Censo por barrio (`pobl` y `pobl_con` en barrios.geojson; 7 barrios sin renglón en el CSV).
  Concesiones: prioridad más baja; cartel con nombre y operadora tal cual la capa de la SE y pozos por código de área
  (`pozos`, `sin_producir` en concesiones.geojson). Un solo pick por clic: la capa de pozos devuelve true y el `onClick` del
  overlay atiende el resto. Teclado: mapa enfocado, flechas y Enter (consulta el centro visible; una mira lo marca).

## Qué NO hacer

- No reemplazar el Capítulo IV base por una descarga posterior al 18/09/2026 sin avisar: las cifras
  citadas se congelaron con esa versión. Agregar datasets nuevos (los de la sección anterior) sí está bien.
- No usar `primera_prod == 2006-01` como "perforado en 2006": significa que el pozo ya figuraba al inicio de la serie.
- No agregar la comparación internacional de pozos huérfanos (decisión de los autores).
- No incluir nombres reales de los autores en la web hasta después del fallo del jurado (seudónimo).
