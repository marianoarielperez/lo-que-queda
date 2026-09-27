# Lo que queda — documento de diseño

Fecha: 18 de septiembre de 2026. Estado: aprobado por Mariano y Aldana.
Concurso: "Contar con Datos" 2026, categoría Exploración interactiva. Cierre: 15/10/2026.

## 0. Decisiones tomadas

| Decisión | Elección |
|---|---|
| Construcción | Web propia con código (MapLibre + deck.gl), publicada en GitHub Pages |
| Tesis | *Lo que queda cuando el petróleo se va* |
| Alcance | La cuenca del Golfo San Jorge como objeto; Comodoro Rivadavia como caso |
| Interacciones obligatorias | Mapa con filtros (estado, operadora, yacimiento, provincia); capa de población; recorrido guiado |
| Deseable | Línea de tiempo por año de perforación |
| Autoría | Personal, con seudónimo; equipo Aldana + Mariano (a confirmar en el formulario) |
| Uso de IA | Declarado: datos, código, búsqueda de fuentes, bajo supervisión. Diseño y textos, humanos |
| Paleta | Sobria · papel (validada) |
| Sin | Comparación internacional; afirmaciones sin fuente oficial |
| Pendientes | Nombre definitivo de la pieza; cuenta de GitHub; seudónimo; campo "Institución" del formulario |

## 1. Recorrido guiado

Opción A: relato primero, mapa después. Una página; el mapa ocupa la pantalla; siete tarjetas
(60–90 palabras) mueven el mapa; al final se libera el panel de exploración.

| Paso | Escala | Qué se ve | Cifra ancla (de `resumen.json`) |
|---|---|---|---|
| 0 | Portada | Mapa papel; título | — |
| 1 | País | Gráfico de producción por cuenca 2006–último año completo | GSJ: 44 % → 23 % del petróleo nacional; produce el 65 % de 2006 y cae todos los años desde 2019; Neuquina 218 % de 2006 y 73,7 % del total (Vaca Muerta) |
| 2 | Cuenca | Puntos por estado | 44.390 pozos; 15.880 activos, 15.894 inactivos, 1.444 a abandonar, 11.161 abandonados; de los 36.507 que ya figuraban en 2006 producen 7.459 (extracción efectiva); 11.243 no abandonados sin un mes de producción desde 2017 |
| 3 | Operadoras | Puntos por operadora, antes/después | 21.509 pozos de YPF → 0; 251 sin empresa (179 abandonados) |
| 4 | Ejido | Límite del ejido + radios urbanos + población | 6.205 pozos; 817 activos, 574 producen; 84.519 personas (42,0 % de Comodoro) en radios con pozo |
| 5 | Km 3 | Zoom a Campamento Central – Bella Vista Este | 2.229 pozos en el ejido; 1.812 abandonados; 77 activos, 56 producen |
| 6 | Un radio | Radio urbano 260211203 (Km 3) | 408 pozos, 936 habitantes, 303 abandonados, 3 activos; surgencia CH-679 (27/8/2024) |
| 7 | Cierre | Mapa liberado | 28.499 pozos sin producir; 13.175 inactivos hace más de 5 años; 169 declaraciones de abandono por año (2018–2025); provisión YPF US$ 915 M |

Exploración: filtros por estado (4 grupos, con detalle de los 17 originales en la ficha), operadora,
yacimiento, provincia; capa de población; buscador por sigla; ficha al clic; contadores.

## 2. Datos y procesamiento

Fuentes: ver `data-pipeline/README.md`. Pipeline: `data-pipeline/procesar.py`, reproducible.
Integrados el 20/09: Capítulo IV país con coordenadas, padrón de primera producción (serie desde
2006-01), concesiones de explotación (SHP) y mensual por pozo 2017-01 a 2026-08 (4.873.490 filas).
Salidas en `public/data/`. Tabla de equivalencias de estados en `GRUPOS` (procesar.py) y en la
página de metodología. Controles de calidad en `conciliacion.md` y `resumen.calidad`.

Límites del dato (se declaran en la pieza):
- El estado es **declarado por la operadora**; no describe el estado físico del pozo.
- 53,6 % de los pozos de la cuenca no tiene fecha de perforación; 376 fechas de relleno descartadas.
- Los 251 "sin empresa" pueden ser vacíos de carga; se muestran como "sin empresa asignada".
- Las coordenadas del Capítulo IV vienen limpias (0 corregidas); la corrección de punto decimal
  aplicó al listado anterior, que solo se usa para el operador previo.
- No se calculan distancias a viviendas ni se afirma contaminación.

## 3. Técnica

Vite + MapLibre GL JS + deck.gl (`MapboxOverlay`, `ScatterplotLayer` con `DataFilterExtension`,
`GeoJsonLayer`) + Scrollama + D3 (solo el gráfico). Mapa base: OpenFreeMap "positron" cargado por
`fetch`; estilo local de respaldo (fondo papel) si falla. GitHub Pages con workflow. Estructura y
API en `CLAUDE.md`. Compatibilidad: Chrome, Firefox, Safari, Edge actuales; móvil vertical.
Entrega: link + video de 1 minuto (YouTube/Vimeo) + PNG de portada.

## 4. Diseño visual

Restricciones: estado → color en orden fijo (vivo → apagándose → muerto); paleta validada por
daltonismo; operadoras con máximo 6 colores; población en un solo tono; leyenda siempre visible con
conteos; nada que dependa del color solo; cuerpo ≥ 16 px; una cifra grande por tarjeta.

Paleta "Sobria · papel" (validada 18/09/2026; ver `src/paleta.js`): fondo `#f3efe7`; urbano
`#e7e1d4`/`#d9d2c3`; límite `#5a5751`; Activo `#1f5fa8`; Inactivo `#b97a00`; A abandonar `#a3391e`;
Abandonado `#7b7f88`; texto `#17181b`/`#5a5b5e`; tarjetas `#fffcf6` al 94 %.
Tipografía propuesta: Fraunces (cifras, títulos) + Source Sans 3 (texto). Decide Aldana.

## 5. Textos y fuentes

- Tarjetas: cifras desde `resumen.json`; fuente al pie; afirmaciones de contexto con enlace oficial.
- Ficha y leyenda: "estado declarado ante la Secretaría de Energía"; tooltip que explica "Abandonado".
- Página de metodología: datasets con enlace y fecha; tabla de equivalencias; correcciones; límites;
  declaración de IA; créditos y licencias (código MIT, datos derivados CC-BY 4.0).
- Borradores de descripción metodológica (≤ 200 palabras) y declaración de IA: en
  `docs/formulario.md`.

Fuentes oficiales verificadas para el contexto (detalle en `docs/investigacion-contexto.md`):
Resolución SE 5/96 (InfoLeg); Ley 17.319; Ley 26.197; Ley 27.007; Ley 27.742 y Decreto 1057/2024;
Ley XVII N° 102 (Chubut); Decreto Chubut 1509/2024 (cesión Escalante–El Trébol a PECOM); YPF Form
20-F 2024 Nota 17 (provisión de abandono US$ 915 M; reclasificación US$ 2.023 M); YPF Form 6-K
(Manantiales Behr a PECOM/San Benito, US$ 410 M + 40 M); Decreto Santa Cruz 0376/2025 y Resolución
FoMiCruz 542/2025; Municipalidad de Comodoro Rivadavia, 27/8/2024 (surgencia CH-679) y 20/3/2024
(ordenanza de pasivos); Censo 2022 (201.854 habitantes Comodoro; 215.453 depto. Escalante); OPC
(regalías = 16 % de ingresos de Chubut en 2025).

## 6. Plan de trabajo

Ver `docs/plans/2026-09-18-plan-implementacion.md`. Semana 1 (datos y esqueleto) terminada el
18/09. Semana 2: recorrido y diseño. Semana 3: pulido, metodología, móvil, prueba con usuarios.
Semana 4: congelar el 12/10, video, formulario, envío el 13 o 14.

Definición de terminado: abre en los cuatro navegadores y en un celular; recorrido en < 3 min;
cada cifra coincide con `resumen.json`; cada afirmación de contexto tiene enlace oficial; video
≤ 60 s; formulario enviado con acuse.
