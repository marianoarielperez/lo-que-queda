# Pipeline de datos

`procesar.py` toma los archivos de `raw/` y genera todo `public/data/`. Tarda unos segundos.

```bash
pip install pandas numpy geopandas shapely pyogrio
python procesar.py --check
```

## Insumos (`raw/`), descargados el 18/09/2026

| Archivo | Origen | Cómo se obtuvo |
|---|---|---|
| `capitulo-iv-pozos.csv` | Secretaría de Energía, dataset "Producción de petróleo y gas por pozo (Capítulo IV)", recurso "Capítulo IV – Pozos" (CSV, 34 MB, 85.611 pozos con geojson) | Descarga directa (20/09/2026). El script filtra la cuenca solo |
| `padron-primera-produccion.csv` | Mismo dataset, "Padrón de Pozos de Capítulo IV con fecha de primera producción" | Descarga directa (20/09/2026). La serie arranca en 2006-01: ese valor significa "ya figuraba al inicio de la serie" |
| `concesiones-explotacion.zip` | Dataset "Producción de hidrocarburos – Concesiones de Explotación" (SHP) | Descarga directa (20/09/2026); 297 polígonos país, 55 en la cuenca |
| `produccion-mensual_gsj.zip` | Mensuales "Producción de Pozos de Gas y Petróleo – AAAA", 2017 a 2026 | `python filtrar_mensuales.py` → 4.873.490 filas, comprimido (41 MB). El script lo lee comprimido |
| `listado-pozos-operadoras_gsj.csv` | Mismo dataset, recurso "Listado de pozos cargados por empresas operadoras" (actualizado 20/10/2025) | Filtrado por `idcuenca == GSJ` |
| `serie-produccion-petroleo-por-cuenca.csv` | Mismo dataset, "Serie histórica de producción de petróleo por cuenca y sub-tipo de recurso" | Descarga directa |
| `limites-administrativos-2025.zip` | datos.comodoro.gov.ar | Shapefile (ejido Comodoro Rivadavia, Rada Tilly, depto. Escalante) |
| `radios-censales-2022.zip` | datos.comodoro.gov.ar (Censo 2022, INDEC) | Shapefile, 325 radios del depto. Escalante |
| `poblacion-radio-censal-2022.kmz` | datos.comodoro.gov.ar (Censo 2022, INDEC) | Polígonos con población por radio |
| `limites-barrios-2026.gpkg` | datos.comodoro.gov.ar | 77 barrios de Comodoro Rivadavia (GeoPackage); 52 tienen pozos |
| `eph-desempleo-comodoro-datosgobar.csv` | datos.gob.ar, serie `45.2_ECTDTCR_0_T_52` (INDEC, EPH continua: tasa de desempleo, Comodoro Rivadavia), trimestral 2003–2026 | Descarga de la API de series (26/09/2026). Define el último valor y hace cuántos años no había uno más alto |
| `eph-comodoro-2022-2026.csv` | INDEC, EPH, informes "Mercado de trabajo. Tasas e indicadores socioeconómicos" 1T 2022 a 2T 2026 | Serie armada por Mariano (26/09/2026) con los cuadros 3.1 a 3.4 de cada informe: tasas, población y CV/IC 90 % de la desocupación para Comodoro Rivadavia–Rada Tilly, región Patagonia y total 31 aglomerados. 2T 2026 provisorio |

Licencias: Secretaría de Energía CC-BY 4.0; portal municipal según su licencia (Creative Commons).

## Qué hace el script

1. Lee el Capítulo IV país entero; filtra la cuenca; parsea coordenadas; agrupa los 17 estados en 4
   (`GRUPOS`); descarta fechas de relleno (1902-01-01 y anteriores al 1/1/1907).
2. Cruza con el listado anterior (operador previo), el padrón (primera producción), el mensual si
   existe (última producción, meses sin producir, primer mes abandonado) y las concesiones
   (pozo en área con/sin concesión vigente).
3. Cruce espacial con ejido, Rada Tilly, Escalante, radios censales con población y barrios.
4. Escribe `pozos_gsj.bin` (arrays columnares: idpozo, lon, lat, estado, empresa, yacimiento,
   provincia, año, en_ejido) y su `meta.json` con las tablas de códigos.
5. Escribe las fichas por lote de 1.000 `idpozo` (claves cortas documentadas en el meta) y `siglas.json`
   (índice idpozo → sigla para el buscador y el tooltip; así no hay que bajar las 93 fichas).
6. `radios.geojson` (población + pozos por estado), `barrios.geojson`, `limites.geojson`, `concesiones.geojson`,
   `pozos_pais.bin` (85.609 pozos con coordenadas), `produccion_cuencas.json`, `operadores.json`.
7. `resumen.json`: todas las cifras de la pieza. `conciliacion.md`: tabla de control. Cada conteo por estado
   trae además `extraccion_efectiva`: "Activo" incluye inyectores y pozos en reparación, así que solo esa
   cifra permite decir "producen" (26/09).

## Cifras de control (18/09/2026)

Ver `../public/data/conciliacion.md`. Si al reprocesar cambia alguna, revisar antes de publicar.
