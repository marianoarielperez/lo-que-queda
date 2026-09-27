# Para Mariano — tus tareas, en orden

## Ahora, con la PC buena (antes del 25/9): datasets que faltan

**Actualización 20/9:** el padrón (1), el país con coordenadas (3) y las concesiones (4) ya están
integrados en el pipeline y en la web. Queda solo el mensual (2), recortado a 2020–2026: ver abajo.

Bajar del dataset "Producción de petróleo y gas por pozo (Capítulo IV)" en datos.energia.gob.ar
estos recursos y dejarlos filtrados en `data-pipeline/raw/`. En orden de valor para la pieza:

| # | Recurso | Para qué | Cómo dejarlo |
|---|---|---|---|
| 1 | **Padrón de Pozos de Capítulo IV con fecha de primera producción** (CSV) | La antigüedad real de cada pozo. Hoy el 54 % no tiene fecha de perforación; con la primera producción cubrimos casi todos y habilitamos la línea de tiempo (tarea 3.7) | Guardar como `raw/padron-primera-produccion.csv` (no hace falta filtrar si pesa poco; si es grande, filtrar por cuenca con `filtrar_capitulo_iv.py`) |
| 2 | **Producción de Pozos de Gas y Petróleo – 2020 a 2026** (7 CSV anuales) | La trayectoria de cada pozo: último mes con producción y cuántos meses lleva parado. Con 2020–2026 alcanza para decir "X pozos llevan más de cinco años sin producir". 2010–2019 solo si sobra tiempo | `python filtrar_mensuales.py *.csv` en la carpeta de descarga → `produccion-mensual_gsj.csv` → copiar a `raw/` reemplazando la muestra. Correr `npm run data` |
| 3 | **Capítulo IV – Pozos** país con coordenadas | Los 85.611 puntos para la portada y el paso 1 | Editar `filtrar_capitulo_iv.py`: agregar `"geojson"` a `cols_min` y volver a correr → reemplaza `raw/capitulo-iv-pozos_pais_min.csv` |
| 4 | **Producción de hidrocarburos – Concesiones de Explotación** (SHP) | Polígonos de las áreas: mostrar "Revertidas – Chubut", Escalante–El Trébol, Manantiales Behr, etc. en el paso 3 | Guardar el zip como `raw/concesiones-explotacion.zip` |
| 5 | Producción de Capítulo IV **por yacimiento y antigüedad de pozo productivo** (CSV) | Contexto: cuánto producen los pozos viejos vs. nuevos | Opcional. `raw/produccion-por-antiguedad.csv` |

Después me pasás los archivos (o los subís al repo) y yo extiendo `procesar.py` para que los use:
antigüedad por primera producción, meses sin producir, capa de concesiones. Cambian pocas cosas de
la web y suman mucho a "rigor" y "originalidad".

**Qué no vale la pena:** venteos satelitales (foco Neuquina, PDF), estudios ambientales (listado
sin geometría útil), regalías (contexto que ya tenemos de la OPC), RENABAP barrios populares
(cruzarlo con pozos es potente pero abre un tema sensible que no podemos sostener con fuentes).

**Del portal municipal, si existe:** capa de **barrios** de Comodoro (GeoJSON o SHP). Sirve para
nombrar el barrio en la ficha del pozo y en las tarjetas 5 y 6 ("Km 3", "Laprida") en vez de solo el
código de radio. Si está, `raw/barrios-comodoro.zip`.

## Esta semana además

- Recibir la invitación de colaborador del repo que crea Aldana (`docs/git-github.md`) y verificar
  que el link de Pages abre. Si Actions falla, mandame la captura.
- Correr en tu compu: `npm install`, `npm run dev`, y recorrer la web entera una vez. Anotar lo que
  no funcione.
- Con Aldana: mirar el formulario (campo Institución, equipo) y elegir seudónimo.

## Semana 2 (26/9–2/10)

- Cuando lleguen los datasets nuevos: correr `npm run data`, revisar `public/data/conciliacion.md`
  y avisarme si alguna cifra cambió respecto de la tabla del 18/9.
- Revisar el código que vaya saliendo (tareas 2.1–2.7). Prueba en Firefox y en un celular.
- Validar la paleta de operadoras para el paso 3 cuando esté (`validate_palette.js`; te paso el comando).

## Semana 3 (3–9/10)

- Rendimiento en una compu lenta (tarea 3.4). Accesibilidad con teclado (3.5).
- Revisar la página de metodología contra `docs/investigacion-contexto.md`: cada afirmación con su link.
- Revisión final de cifras: cada número de las tarjetas contra `resumen.json`.

## Semana 4 (10–15/10)

- Congelar el 12/10 (tag `v1.0`), descargar el zip de respaldo.
- Revisar el formulario antes de que Aldana lo envíe. Confirmar que el link y el video abren desde
  una compu que no sea la tuya (modo incógnito).
