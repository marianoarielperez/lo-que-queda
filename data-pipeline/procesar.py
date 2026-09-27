"""
Pipeline de datos de "Lo que queda" (Contar con Datos 2026).

Lee los archivos crudos de data-pipeline/raw/ y genera todo lo que consume la web
en public/data/. Es reproducible: correrlo dos veces da el mismo resultado.

    python procesar.py            # genera public/data/*
    python procesar.py --check    # además imprime la tabla de conciliación

Entradas (ver README.md para de dónde sale cada una):
  raw/capitulo-iv-pozos.csv              Capítulo IV – Pozos, país entero (85.611 pozos, con geojson)
  raw/padron-primera-produccion.csv      Padrón con año/mes de primera producción (serie desde 2006-01)
  raw/concesiones-explotacion.zip        Shapefile de concesiones de explotación (polígonos con operadora)
  raw/produccion-mensual_gsj.csv         (opcional) mensual por pozo de la cuenca, salida de filtrar_mensuales.py
  raw/listado-pozos-operadoras_gsj.csv   Listado de pozos cargados por empresas operadoras (versión anterior), GSJ
  raw/serie-produccion-petroleo-por-cuenca.csv
  raw/limites-administrativos-2025.zip   Shapefile: ejido Comodoro, Rada Tilly, depto. Escalante
  raw/radios-censales-2022.zip           Shapefile: radios censales del depto. Escalante (Censo 2022)
  raw/poblacion-radio-censal-2022.kmz    Polígonos de radio con población (Censo 2022)
  raw/limites-barrios-2026.gpkg          (opcional) Barrios de Comodoro Rivadavia (datos.comodoro.gov.ar)

Salidas (public/data/):
  pozos_gsj.bin + pozos_gsj.meta.json    arrays columnares para deck.gl (44.390 pozos)
  pozos_pais.bin + pozos_pais.meta.json  lon/lat/estado del país entero (portada y paso 1)
  concesiones.geojson                    polígonos de concesiones de la cuenca con operadora
  fichas/NNN.json                        detalle por pozo, en lotes de 1.000, por idpozo
  siglas.json                            índice idpozo → sigla (buscador y tooltip)
  radios.geojson                         radios censales con población y pozos por estado
  limites.geojson                        ejido, Rada Tilly, Escalante
  barrios.geojson                        barrios de Comodoro con pozos por estado (si hay capa de barrios)
  produccion_cuencas.json                serie anual y mensual por cuenca
  operadores.json                        matriz operador anterior -> actual
  resumen.json                           TODAS las cifras que aparecen en la pieza
  conciliacion.md                        tabla de control de calidad
"""
import argparse
import io
import json
import os
import struct
import sys
import zipfile
from datetime import date

import numpy as np
import pandas as pd

try:
    import geopandas as gpd
    from shapely import force_2d
    from shapely.geometry import Point
except ImportError:  # pragma: no cover
    sys.exit("Falta geopandas: pip install geopandas shapely pyogrio")

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(os.path.dirname(HERE), "public", "data")
os.makedirs(os.path.join(OUT, "fichas"), exist_ok=True)

# ---------------------------------------------------------------------------
# 1. Tabla de equivalencias de estados (queda publicada en la metodología)
# ---------------------------------------------------------------------------
GRUPOS = {
    "Extracción Efectiva": "Activo",
    "En Inyección Efectiva": "Activo",
    "Mantenimiento de Presión": "Activo",
    "Otras Situación Activo": "Activo",
    "En Reparación": "Activo",
    "En Estudio": "Inactivo",
    "En Reserva para Recup. Sec./Asist.": "Inactivo",
    "En Reserva de Gas": "Inactivo",
    "Parado Transitoriamente": "Inactivo",
    "En Espera de Reparación": "Inactivo",
    "Otras Situación Inactivo": "Inactivo",
    "Parado Alta Relación Agua/Petróleo": "Inactivo",
    "Parado Alta Relación Gas/Petróleo": "Inactivo",
    "Abandono Temporario": "Inactivo",
    "A Abandonar": "A abandonar",
    "Abandonado": "Abandonado",
    "No informado": "No informado",
}
# Conjuntos de datos usados, con enlace y fecha de descarga (la de cada archivo en raw/). La sección
# "Metodología y fuentes" de la web los lista desde resumen.json: si se agrega o reemplaza un insumo, actualizar acá.
# `clave` es la que usan las tarjetas del recorrido (story.js) para enlazar su fuente: no cambiarla.
CAP_IV = "http://datos.energia.gob.ar/dataset/c846e79c-026c-4040-897f-1ad3543b407c"
DATOS_COMODORO = "https://datos.comodoro.gov.ar/"
DATASETS = [
    {"clave": "capitulo_iv", "titulo": "Capítulo IV – Pozos", "organismo": "Secretaría de Energía", "url": CAP_IV, "descarga": "18/09/2026",
     "licencia": "CC-BY 4.0", "uso": "ubicación, operadora, yacimiento, área y estado declarado de cada pozo"},
    {"clave": "padron", "titulo": "Padrón de pozos de Capítulo IV con fecha de primera producción", "organismo": "Secretaría de Energía",
     "url": CAP_IV, "descarga": "20/09/2026", "licencia": "CC-BY 4.0",
     "uso": "mes de primera producción (la serie empieza en enero de 2006)"},
    {"clave": "mensual", "titulo": "Producción de pozos de gas y petróleo, mensual 2017–2026", "organismo": "Secretaría de Energía",
     "url": CAP_IV, "descarga": "20/09/2026", "licencia": "CC-BY 4.0",
     "uso": "último mes con producción y primer mes declarado como abandonado"},
    {"clave": "listado_operadoras", "titulo": "Listado de pozos cargados por empresas operadoras (actualizado el 20/10/2025)", "organismo": "Secretaría de Energía",
     "url": CAP_IV, "descarga": "18/09/2026", "licencia": "CC-BY 4.0",
     "uso": "operadora anterior de cada pozo y fecha de abandono cuando figura"},
    {"clave": "serie_cuencas", "titulo": "Serie histórica de producción de petróleo por cuenca y subtipo de recurso", "organismo": "Secretaría de Energía",
     "url": CAP_IV, "descarga": "18/09/2026", "licencia": "CC-BY 4.0", "uso": "producción anual por cuenca"},
    {"clave": "concesiones", "titulo": "Producción de hidrocarburos – Concesiones de explotación", "organismo": "Secretaría de Energía",
     "url": "http://datos.energia.gob.ar/dataset/produccion-hidrocarburos-concesiones-de-explotacion",
     "descarga": "20/09/2026", "licencia": "CC-BY 4.0", "uso": "áreas con concesión de explotación vigente"},
    {"clave": "limites", "titulo": "Límites administrativos 2025", "organismo": "Municipalidad de Comodoro Rivadavia", "url": DATOS_COMODORO,
     "descarga": "18/09/2026", "licencia": None, "uso": "ejido de Comodoro Rivadavia, Rada Tilly y departamento Escalante"},
    {"clave": "radios_censo", "titulo": "Radios censales y población por radio, Censo 2022 (INDEC)", "organismo": "Municipalidad de Comodoro Rivadavia",
     "url": DATOS_COMODORO, "descarga": "18/09/2026", "licencia": None, "uso": "población de cada radio censal"},
    {"clave": "barrios", "titulo": "Límites de barrios 2026", "organismo": "Municipalidad de Comodoro Rivadavia", "url": DATOS_COMODORO,
     "descarga": "20/09/2026", "licencia": None, "uso": "barrio de cada pozo"},
    {"clave": "eph_serie", "titulo": "EPH continua: tasa de desempleo, Comodoro Rivadavia (serie 45.2_ECTDTCR_0_T_52)", "organismo": "INDEC, vía datos.gob.ar",
     "url": "https://apis.datos.gob.ar/series/api/series/?ids=45.2_ECTDTCR_0_T_52", "descarga": "26/09/2026", "licencia": None,
     "uso": "desocupación del aglomerado Comodoro Rivadavia–Rada Tilly (portada)"},
    {"clave": "eph_indec", "titulo": "Mercado de trabajo. Tasas e indicadores socioeconómicos (EPH), 2.º trimestre de 2026", "organismo": "INDEC",
     "url": "https://www.indec.gob.ar/uploads/informesdeprensa/mercado_trabajo_eph_2trim26433FCBC5A8.pdf", "descarga": "26/09/2026",
     "licencia": None, "uso": "coeficiente de variación de esa estimación"},
]

GRUPO_ORDEN = ["Activo", "Inactivo", "A abandonar", "Abandonado", "No informado"]
GRUPO_COD = {g: i for i, g in enumerate(GRUPO_ORDEN)}
PROV_COD = {"Chubut": 1, "Santa Cruz": 2}
# claves cortas de las fichas (documentadas en public/data/pozos_gsj.meta.json)
CLAVES_FICHA = {"idpozo": "id", "sigla": "s", "empresa": "e", "operador_anterior": "ea", "area": "ar",
                "yacimiento": "y", "provincia": "p", "tipoestado": "est", "grupo": "g", "tipopozo": "tp",
                "tipoextraccion": "tx", "clasificacion": "c", "subclasificacion": "sc", "profundidad": "prof",
                "adjiv_fecha_inicio_perf": "fperf", "adjiv_fecha_fin_term": "fterm", "en_ejido": "ej",
                "radio": "r", "radio_pobl": "rp", "primera_prod": "pp", "ya_en_2006": "pp06", "ultima_prod": "up",
                "primer_abandono": "pab", "fecha_abandono_listado": "fab", "meses_sin_producir": "msp", "en_concesion": "conc", "barrio": "b"}

# Caja de Argentina para validar coordenadas
LON_MIN, LON_MAX, LAT_MIN, LAT_MAX = -74.0, -53.0, -56.0, -21.0


def log(msg):
    print(msg, flush=True)


# En Windows la consola y open() usan cp1252 por defecto; todo lo que escribimos es UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def fix_coord(v):
    """Coordenadas cargadas sin punto decimal (-67444 -> -67.444)."""
    v = float(v)
    while v < -180:
        v /= 10
    return v


# ---------------------------------------------------------------------------
# 2. Carga y limpieza
# ---------------------------------------------------------------------------
def cargar_pais_completo():
    p = pd.read_csv(os.path.join(RAW, "capitulo-iv-pozos.csv"), low_memory=False)
    p["grupo"] = p.tipoestado.map(GRUPOS).fillna("No informado")
    coords = p["geojson"].map(lambda s: json.loads(s)["coordinates"] if isinstance(s, str) else [np.nan, np.nan])
    p["lon"] = [fix_coord(c[0]) if c[0] == c[0] else np.nan for c in coords]
    p["lat"] = [fix_coord(c[1]) if c[1] == c[1] else np.nan for c in coords]
    return p


def cargar_gsj(p):
    g = p[p.cuenca.astype(str).str.strip().str.upper() == "GOLFO SAN JORGE"].copy().reset_index(drop=True)
    coords = g["geojson"].map(lambda s: json.loads(s)["coordinates"] if isinstance(s, str) else [np.nan, np.nan])
    g["lon"] = [c[0] for c in coords]
    g["lat"] = [c[1] for c in coords]
    g["coord_corregida"] = (g.lon < -180) | (g.lat < -90)
    g["lon"] = g.lon.map(fix_coord)
    g["lat"] = g.lat.map(fix_coord)
    g["coord_valida"] = g.lon.between(LON_MIN, LON_MAX) & g.lat.between(LAT_MIN, LAT_MAX)
    g["grupo"] = g.tipoestado.map(GRUPOS).fillna("No informado")
    g["fecha_perf"] = pd.to_datetime(g.adjiv_fecha_inicio_perf, errors="coerce")
    # fechas de relleno: 1 de enero de 1902 en masa (Tecpetrol/El Tordillo) y cualquier fecha anterior a 1907.
    # El corte es el 1/1/1907 y no el 13/12/1907: el Pozo N° 2 (YPF.Ch.-2, idpozo 121014) empezó a
    # perforarse en marzo de 1907 y encontró petróleo el 13 de diciembre; su fecha es real.
    relleno = (g.fecha_perf == pd.Timestamp("1902-01-01")) | (g.fecha_perf < pd.Timestamp("1907-01-01"))
    g["fecha_relleno"] = relleno & g.fecha_perf.notna()
    g.loc[g.fecha_relleno, "fecha_perf"] = pd.NaT
    g["anio_perf"] = g.fecha_perf.dt.year
    g["empresa"] = g.empresa.fillna("")
    return g


def cargar_padron():
    """Año y mes de primera producción. OJO: la serie arranca en 2006-01, así que ese valor significa
    'ya producía (o ya estaba en el registro) al inicio de la serie', no la fecha real."""
    f = os.path.join(RAW, "padron-primera-produccion.csv")
    if not os.path.exists(f):
        return None
    pad = pd.read_csv(f, encoding="utf-8-sig")
    pad["primera_prod"] = pad.anio.astype(str) + "-" + pad.mes.astype(int).astype(str).str.zfill(2)
    pad["ya_en_2006"] = (pad.anio == 2006) & (pad.mes == 1)
    return pad[["idpozo", "primera_prod", "ya_en_2006"]].rename(columns={"primera_prod": "primera_prod"})


def cargar_mensual():
    """Mensual por pozo (salida de filtrar_mensuales.py). Devuelve por pozo: último mes con producción,
    primer mes en estado Abandonado, y meses sin producir hasta el último mes disponible."""
    # Acepta .csv, .csv.gz o .zip (pandas descomprime solo). El .gz es el que va al repo (~40 MB).
    f = next((os.path.join(RAW, n) for n in ("produccion-mensual_gsj.csv.gz", "produccion-mensual_gsj.zip", "produccion-mensual_gsj.csv")
              if os.path.exists(os.path.join(RAW, n))), None)
    if f is None:
        return None, None
    partes = []
    for chunk in pd.read_csv(f, low_memory=False, chunksize=500_000,
                             usecols=lambda c: c in {"idpozo", "anio", "mes", "tipoestado", "prod_pet", "prod_gas"}):
        partes.append(chunk)
    m = pd.concat(partes, ignore_index=True)
    m["t"] = m.anio * 12 + m.mes - 1
    ultimo_t = int(m.t.max())
    prod = m[(m.prod_pet.fillna(0) > 0) | (m.prod_gas.fillna(0) > 0)]
    ult = prod.groupby("idpozo").t.max().rename("t_ultima_prod")
    ab = m[m.tipoestado == "Abandonado"].groupby("idpozo").t.min().rename("t_primer_abandono")
    r = pd.concat([ult, ab], axis=1).reset_index()
    r["ultima_prod"] = r.t_ultima_prod.map(lambda t: f"{int(t // 12)}-{int(t % 12) + 1:02d}" if t == t else None)
    r["primer_abandono"] = r.t_primer_abandono.map(lambda t: f"{int(t // 12)}-{int(t % 12) + 1:02d}" if t == t else None)
    r["meses_sin_producir"] = (ultimo_t - r.t_ultima_prod).where(r.t_ultima_prod.notna())
    cobertura = {"desde": f"{int(m.t.min() // 12)}-{int(m.t.min() % 12) + 1:02d}", "hasta": f"{ultimo_t // 12}-{ultimo_t % 12 + 1:02d}",
                 "pozos_con_registro": int(m.idpozo.nunique())}
    return r[["idpozo", "ultima_prod", "primer_abandono", "meses_sin_producir"]], cobertura


def barrio_de_punto(barrios, fila):
    """Nombre del barrio que contiene el punto (lon, lat) de una fila, o None."""
    from shapely.geometry import Point
    pt = Point(float(fila["lon"]), float(fila["lat"]))
    hit = barrios[barrios.contains(pt)]
    return str(hit.barrio.iat[0]) if len(hit) else None


def cargar_eph():
    """Desocupación del aglomerado Comodoro Rivadavia–Rada Tilly (EPH, INDEC). Solo contexto para la portada.
    - Serie larga: datos.gob.ar, serie 45.2_ECTDTCR_0_T_52 (trimestral desde 2003; proporciones 0-1).
      Define el último valor y hace cuánto no había uno más alto.
    - Precisión: informes de prensa del INDEC 2022-2026 (cuadro 3.4), para el CV y el intervalo al 90 %.
    En un aglomerado chico la EPH tiene mucho error muestral: se cita el valor puntual y "el más alto en N años",
    nunca cuánto subió."""
    f_larga = os.path.join(RAW, "eph-desempleo-comodoro-datosgobar.csv")
    f_cv = os.path.join(RAW, "eph-comodoro-2022-2026.csv")
    if not os.path.exists(f_larga):
        return None
    s = pd.read_csv(f_larga, parse_dates=["indice_tiempo"]).dropna()
    s["tasa"] = (s.iloc[:, 1] * 100).round(1)
    s["periodo"] = s.indice_tiempo.dt.year.astype(str) + "T" + ((s.indice_tiempo.dt.month - 1) // 3 + 1).astype(str)
    ult = s.iloc[-1]
    previos = s.iloc[:-1]
    mayores = previos[previos.tasa > ult.tasa]
    ultimo_mayor = mayores.iloc[-1] if len(mayores) else None
    r = {
        "aglomerado": "Comodoro Rivadavia-Rada Tilly",
        "periodo": ult.periodo, "anio": int(ult.periodo[:4]), "trimestre": int(ult.periodo[-1]),
        "desocupacion": float(ult.tasa),
        "serie_desde": s.periodo.iloc[0],
        "ultimo_valor_mayor": None if ultimo_mayor is None else {"periodo": ultimo_mayor.periodo, "tasa": float(ultimo_mayor.tasa)},
        "anios_sin_un_valor_mayor": None if ultimo_mayor is None else round((ult.indice_tiempo - ultimo_mayor.indice_tiempo).days / 365.25, 1),
        "serie": [{"periodo": p, "tasa": float(t)} for p, t in zip(s.periodo, s.tasa)],
        "fuente": "INDEC, EPH; datos.gob.ar, serie 45.2_ECTDTCR_0_T_52",
        "provisorio": None, "cv": None, "ic90": None, "total_31_aglomerados": None, "patagonia": None,
    }
    if os.path.exists(f_cv):
        d = pd.read_csv(f_cv, encoding="utf-8")
        d = d[(d.anio == r["anio"]) & (d.trimestre == r["trimestre"])]
        def val(aglo, ind):
            x = d[(d.aglomerado == aglo) & (d.indicador == ind)].valor
            return float(x.iloc[0]) if len(x) else None
        cr = "Comodoro Rivadavia-Rada Tilly"
        if len(d):
            r["provisorio"] = bool((d.provisorio == "si").any())
            r["cv"] = val(cr, "cv_desocupacion")
            r["ic90"] = [val(cr, "ic90_inf_desocupacion"), val(cr, "ic90_sup_desocupacion")]
            r["total_31_aglomerados"] = val("Total 31 aglomerados urbanos", "tasa_desocupacion")
            r["patagonia"] = val("Region Patagonia", "tasa_desocupacion")
    return r


def cargar_barrios():
    f = os.path.join(RAW, "limites-barrios-2026.gpkg")
    if not os.path.exists(f):
        return None
    b = gpd.read_file(f).to_crs(4326)
    b = b.rename(columns={"nombre": "barrio"})[["id", "barrio", "geometry"]]
    b["geometry"] = b.geometry.apply(force_2d)
    return b


def cargar_concesiones(codigos_gsj):
    f = os.path.join(RAW, "concesiones-explotacion.zip")
    if not os.path.exists(f):
        return None
    tmp = os.path.join(HERE, "_tmp_conc")
    os.makedirs(tmp, exist_ok=True)
    with zipfile.ZipFile(f) as z:
        for info in z.infolist():
            ext = info.filename.rsplit(".", 1)[-1]
            with z.open(info) as src, open(os.path.join(tmp, f"concesiones.{ext}"), "wb") as dst:
                dst.write(src.read())
    c = gpd.read_file(os.path.join(tmp, "concesiones.shp"), encoding="latin-1").to_crs(4326)
    c = c[c.CODIGO_DE_.isin(codigos_gsj)].copy()
    c = c.rename(columns={"NOMBRE_DE_": "nombre", "CODIGO_DE_": "codigo", "EMPRESA_OP": "operadora"})
    c["geometry"] = c.geometry.simplify(0.0005, preserve_topology=True)
    return c[["nombre", "codigo", "operadora", "geometry"]]


def cargar_listado_anterior():
    old = pd.read_csv(os.path.join(RAW, "listado-pozos-operadoras_gsj.csv"), low_memory=False,
                      usecols=["idpozo", "idempresa", "adjiv_fecha_abandono"])
    # fecha de abandono informada por la operadora (serial de Excel; solo la tiene ~3 % de los pozos).
    # Es la única fuente de fechas de abandono anteriores a 2017, cuando arranca la serie mensual.
    f = pd.Timestamp("1899-12-30") + pd.to_timedelta(old.adjiv_fecha_abandono, unit="D")
    f = f.where(f >= pd.Timestamp("1907-01-01"))
    old["fecha_abandono_listado"] = f.dt.strftime("%Y-%m-%d")
    return old.rename(columns={"idempresa": "operador_anterior"})[["idpozo", "operador_anterior", "fecha_abandono_listado"]]


def cargar_geo():
    def unzip(name, tmp):
        with zipfile.ZipFile(os.path.join(RAW, name)) as z:
            z.extractall(tmp)
        shp = [os.path.join(tmp, f) for f in os.listdir(tmp) if f.endswith(".shp")][0]
        return gpd.read_file(shp)

    tmp_l = os.path.join(HERE, "_tmp_limites")
    tmp_r = os.path.join(HERE, "_tmp_radios")
    tmp_p = os.path.join(HERE, "_tmp_pob")
    for t in (tmp_l, tmp_r, tmp_p):
        os.makedirs(t, exist_ok=True)
    lim = unzip("limites-administrativos-2025.zip", tmp_l)[["Name", "geometry"]].to_crs(4326)
    lim["geometry"] = lim.geometry.apply(force_2d)
    rad = unzip("radios-censales-2022.zip", tmp_r).to_crs(4326)
    with zipfile.ZipFile(os.path.join(RAW, "poblacion-radio-censal-2022.kmz")) as z:
        z.extractall(tmp_p)
    pob = gpd.read_file(os.path.join(tmp_p, "doc.kml"))
    pob["pobl"] = pd.to_numeric(pob["Poblaci__n"], errors="coerce")
    pob = pob[pob.pobl.notna()].copy()
    pob["geometry"] = pob.geometry.apply(force_2d)
    pob = pob.set_crs(4326, allow_override=True)
    pob["LINK"] = pob["Radio"].astype(str)
    return lim, rad, pob


# ---------------------------------------------------------------------------
# 3. Cruces
# ---------------------------------------------------------------------------
def cruzar(g, lim, pob):
    pts = gpd.GeoDataFrame(g, geometry=gpd.points_from_xy(g.lon, g.lat), crs=4326)
    for name in lim.Name:
        poly = lim.loc[lim.Name == name, "geometry"].iat[0]
        pts[f"en_{name}"] = pts.within(poly)
    pts = pts.rename(columns={"en_Comodoro Rivadavia": "en_ejido", "en_Rada Tilly": "en_radatilly",
                              "en_Escalante": "en_escalante"})
    j = gpd.sjoin(pts[["idpozo", "geometry"]], pob[["LINK", "pobl", "geometry"]], how="left", predicate="within")
    j = j[~j.index.duplicated(keep="first")]
    pts["radio"] = j["LINK"].values
    pts["radio_pobl"] = j["pobl"].values
    return pd.DataFrame(pts.drop(columns="geometry"))


# ---------------------------------------------------------------------------
# 4. Salidas binarias para deck.gl
# ---------------------------------------------------------------------------
def escribir_bin(df, nombre, columnas):
    """columnas: lista de (nombre, dtype). Escribe arrays concatenados + meta con offsets."""
    buf = io.BytesIO()
    meta = {"n": int(len(df)), "columns": []}
    for col, dtype in columnas:
        arr = np.ascontiguousarray(df[col].to_numpy(dtype=dtype))
        meta["columns"].append({"name": col, "dtype": dtype, "offset": buf.tell(), "bytes": arr.nbytes})
        buf.write(arr.tobytes())
    with open(os.path.join(OUT, f"{nombre}.bin"), "wb") as f:
        f.write(buf.getvalue())
    return meta


# ---------------------------------------------------------------------------
def main(check=False):
    log("1/7 cargando Capítulo IV (país y GSJ), padrón y mensual…")
    p = cargar_pais_completo()
    g = cargar_gsj(p)
    old = cargar_listado_anterior()
    pad = cargar_padron()
    mens, cobertura_mensual = cargar_mensual()
    log("2/7 cargando capas geográficas…")
    lim, rad, pob = cargar_geo()
    log("3/7 cruces espaciales…")
    g = cruzar(g, lim, pob)
    g = g.merge(old, on="idpozo", how="left")
    g["operador_anterior"] = g.operador_anterior.fillna("")
    if pad is not None:
        g = g.merge(pad, on="idpozo", how="left")
    else:
        g["primera_prod"] = None; g["ya_en_2006"] = np.nan
    if mens is not None:
        g = g.merge(mens, on="idpozo", how="left")
    else:
        g["ultima_prod"] = None; g["primer_abandono"] = None; g["meses_sin_producir"] = np.nan
    barrios = cargar_barrios()
    if barrios is not None:
        pts_b = gpd.GeoDataFrame(g[["idpozo"]], geometry=gpd.points_from_xy(g.lon, g.lat), crs=4326)
        jb = gpd.sjoin(pts_b, barrios[["barrio", "geometry"]], how="left", predicate="within")
        jb = jb[~jb.index.duplicated(keep="first")]
        g["barrio"] = jb["barrio"].values
    else:
        g["barrio"] = None
    conc = cargar_concesiones(set(g.cod_area.dropna()))
    g["en_concesion"] = g.cod_area.isin(conc.codigo) if conc is not None else np.nan

    # --- códigos para el binario
    empresas = sorted(g.empresa.unique().tolist())
    yacimientos = sorted(g.yacimiento.fillna("").unique().tolist())
    emp_cod = {e: i for i, e in enumerate(empresas)}
    yac_cod = {y: i for i, y in enumerate(yacimientos)}
    g["estado_cod"] = g.grupo.map(GRUPO_COD).astype("uint8")
    g["empresa_cod"] = g.empresa.map(emp_cod).astype("uint16")
    g["yac_cod"] = g.yacimiento.fillna("").map(yac_cod).astype("uint16")
    g["prov_cod"] = g.provincia.map(PROV_COD).fillna(0).astype("uint8")
    g["anio_cod"] = g.anio_perf.fillna(0).astype("uint16")
    g["ejido_cod"] = g.en_ejido.astype("uint8")
    g["primera_cod"] = pd.to_numeric(g.primera_prod.str[:4], errors="coerce").fillna(0).astype("uint16")
    g["meses_cod"] = g.meses_sin_producir.fillna(65535).clip(0, 65535).astype("uint16")  # 65535 = sin dato
    g["conc_cod"] = (g.en_concesion.map({True: 1, False: 0}) if conc is not None else pd.Series(np.nan, index=g.index)).fillna(255).astype("uint8")

    log("4/7 escribiendo binarios…")
    meta = escribir_bin(g, "pozos_gsj", [
        ("idpozo", "uint32"), ("lon", "float32"), ("lat", "float32"), ("estado_cod", "uint8"),
        ("empresa_cod", "uint16"), ("yac_cod", "uint16"), ("prov_cod", "uint8"), ("anio_cod", "uint16"),
        ("ejido_cod", "uint8"), ("primera_cod", "uint16"), ("meses_cod", "uint16"), ("conc_cod", "uint8"),
    ])
    meta.update({"claves_ficha": CLAVES_FICHA, "estados": GRUPO_ORDEN, "empresas": empresas, "yacimientos": yacimientos,
                 "provincias": {v: k for k, v in PROV_COD.items()}})
    json.dump(meta, open(os.path.join(OUT, "pozos_gsj.meta.json"), "w", encoding="utf-8"), ensure_ascii=False)

    pp = p[p.lon.between(LON_MIN, LON_MAX) & p.lat.between(LAT_MIN, LAT_MAX)].copy()
    pp["estado_cod"] = pp.grupo.map(GRUPO_COD).astype("uint8")
    pp["gsj_cod"] = (pp.cuenca.astype(str).str.upper() == "GOLFO SAN JORGE").astype("uint8")
    meta_p = escribir_bin(pp, "pozos_pais", [("lon", "float32"), ("lat", "float32"), ("estado_cod", "uint8"), ("gsj_cod", "uint8")])
    meta_p["estados"] = GRUPO_ORDEN
    json.dump(meta_p, open(os.path.join(OUT, "pozos_pais.meta.json"), "w", encoding="utf-8"))

    log("5/7 fichas por lote…")
    ficha_cols = ["idpozo", "sigla", "empresa", "operador_anterior", "area", "yacimiento", "provincia",
                  "tipoestado", "grupo", "tipopozo", "tipoextraccion", "clasificacion", "subclasificacion",
                  "profundidad", "adjiv_fecha_inicio_perf", "adjiv_fecha_fin_term", "en_ejido", "radio",
                  "radio_pobl", "primera_prod", "ya_en_2006", "ultima_prod", "primer_abandono", "fecha_abandono_listado",
                  "meses_sin_producir", "en_concesion", "barrio"]
    fichas = g[ficha_cols].copy()
    fichas["adjiv_fecha_inicio_perf"] = fichas.adjiv_fecha_inicio_perf.where(g.fecha_perf.notna())
    fichas["lote"] = (fichas.idpozo // 1000).astype(int)
    for lote, sub in fichas.groupby("lote"):
        recs = {}
        for r in sub.itertuples(index=False):
            d = r._asdict()
            d.pop("lote")
            d = {k: (None if (isinstance(v, float) and np.isnan(v)) else (v.item() if hasattr(v, "item") else v))
                 for k, v in d.items()}
            recs[str(d["idpozo"])] = {CLAVES_FICHA.get(k, k): v for k, v in d.items() if v not in (None, "")}
        json.dump(recs, open(os.path.join(OUT, "fichas", f"{lote}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    # Índice de siglas (buscador y tooltip): dos listas alineadas, ordenadas por idpozo. Evita bajar las 93 fichas.
    sig = g[["idpozo", "sigla"]].assign(sigla=g.sigla.fillna("").astype(str).str.strip()).sort_values("idpozo")
    json.dump({"id": sig.idpozo.astype(int).tolist(), "s": sig.sigla.tolist()},
              open(os.path.join(OUT, "siglas.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    log("6/7 geojson y series…")
    # radios con población y pozos
    por_radio = g[g.radio.notna()].groupby("radio").agg(
        pozos=("idpozo", "size"),
        activos=("grupo", lambda s: int((s == "Activo").sum())),
        inactivos=("grupo", lambda s: int(s.isin(["Inactivo", "A abandonar"]).sum())),
        abandonados=("grupo", lambda s: int((s == "Abandonado").sum())),
    )
    por_radio = por_radio.merge(rad[["LINK", "TIPO"]].drop_duplicates("LINK"), left_index=True, right_on="LINK", how="left").set_index("LINK")
    por_radio.index.name = "radio"
    cent = pob.set_index("LINK").geometry.to_crs(5344).centroid.to_crs(4326)  # centroide en proyección métrica
    por_radio["lon"] = cent.reindex(por_radio.index).x.round(5)
    por_radio["lat"] = cent.reindex(por_radio.index).y.round(5)
    por_radio["pobl"] = pob.set_index("LINK").pobl.reindex(por_radio.index).astype(int)
    pob2 = pob[["LINK", "pobl", "geometry"]].copy()
    pob2["geometry"] = pob2.geometry.simplify(0.00005, preserve_topology=True)
    pob2 = pob2.merge(por_radio[["pozos", "activos", "inactivos", "abandonados"]], left_on="LINK", right_index=True, how="left").fillna(
        {"pozos": 0, "activos": 0, "inactivos": 0, "abandonados": 0})
    for c in ["pozos", "activos", "inactivos", "abandonados"]:
        pob2[c] = pob2[c].astype(int)
    pob2["pobl"] = pob2.pobl.astype(int)
    pob2 = pob2.merge(rad[["LINK", "TIPO"]], on="LINK", how="left")
    pob2.to_file(os.path.join(OUT, "radios.geojson"), driver="GeoJSON")
    if conc is not None:
        conc.to_file(os.path.join(OUT, "concesiones.geojson"), driver="GeoJSON")
    if barrios is not None:
        por_barrio = g[g.barrio.notna()].groupby("barrio").agg(
            pozos=("idpozo", "size"),
            activos=("grupo", lambda s: int((s == "Activo").sum())),
            inactivos=("grupo", lambda s: int(s.isin(["Inactivo", "A abandonar"]).sum())),
            abandonados=("grupo", lambda s: int((s == "Abandonado").sum())),
        )
        b2 = barrios.merge(por_barrio, left_on="barrio", right_index=True, how="left").fillna({"pozos": 0, "activos": 0, "inactivos": 0, "abandonados": 0})
        for c in ["pozos", "activos", "inactivos", "abandonados"]:
            b2[c] = b2[c].astype(int)
        b2["geometry"] = b2.geometry.simplify(0.00005, preserve_topology=True)
        b2.to_file(os.path.join(OUT, "barrios.geojson"), driver="GeoJSON")
        # barrio del radio urbano con más pozos (para la tarjeta 6)
        cent_b = barrios.copy()
    lim2 = lim.copy()
    lim2["geometry"] = lim2.geometry.simplify(0.0002, preserve_topology=True)
    lim2.to_file(os.path.join(OUT, "limites.geojson"), driver="GeoJSON")

    s = pd.read_csv(os.path.join(RAW, "serie-produccion-petroleo-por-cuenca.csv"))
    s["anio"] = s.indice_tiempo.str[:4].astype(int)
    cuencas = ["cuenca_gsj", "cuenca_neuquina", "cuenca_cuyana", "cuenca_austral", "cuenca_noroeste"]
    anual = s.groupby("anio")[cuencas + ["total", "shale"]].sum().round(0)
    anual["gsj_pct"] = (anual.cuenca_gsj / anual.total * 100).round(1)
    anual["shale_pct"] = (anual.shale / anual.total * 100).round(1)
    ultimo_anio_completo = int(s[s.anio == s.anio.max()].shape[0] == 12 and s.anio.max() or s.anio.max() - 1)
    json.dump({
        "unidad": "m3 de petróleo",
        "fuente": "Secretaría de Energía, serie histórica de producción de petróleo por cuenca (Capítulo IV)",
        "mensual": s[["indice_tiempo"] + cuencas + ["total", "shale"]].round(0).to_dict(orient="records"),
        "anual": anual.reset_index().to_dict(orient="records"),
        "ultimo_anio_completo": ultimo_anio_completo,
    }, open(os.path.join(OUT, "produccion_cuencas.json"), "w", encoding="utf-8"), ensure_ascii=False)

    # operadores: anterior -> actual
    t = g.groupby(["operador_anterior", "empresa"]).size().reset_index(name="pozos")
    t = t[t.pozos >= 50].sort_values("pozos", ascending=False)
    por_emp = g.groupby("empresa").grupo.value_counts().unstack(fill_value=0)
    por_emp["TOTAL"] = por_emp.sum(axis=1)
    json.dump({
        "transferencias": t.to_dict(orient="records"),
        "por_empresa": por_emp.sort_values("TOTAL", ascending=False).reset_index().to_dict(orient="records"),
    }, open(os.path.join(OUT, "operadores.json"), "w", encoding="utf-8"), ensure_ascii=False)

    log("7/7 resumen.json…")
    ej = g[g.en_ejido]
    urb = g[g.radio.notna()]
    pob_total = int(pob.pobl.sum())
    radios_con_pozo = por_radio.index
    pob_con_pozo = int(pob[pob.LINK.isin(radios_con_pozo)].pobl.sum())
    pob_con_abandonado = int(pob[pob.LINK.isin(por_radio[por_radio.abandonados >= 1].index)].pobl.sum())
    pob_10 = int(pob[pob.LINK.isin(por_radio[por_radio.pozos >= 10].index)].pobl.sum())
    # Solo Comodoro (tarjeta 5): radios cuyo punto interior cae en el ejido; el resto es Rada Tilly
    en_cr = pob.geometry.representative_point().within(lim.loc[lim.Name == "Comodoro Rivadavia", "geometry"].iat[0])
    pob_cr = pob[en_cr]
    pob_cr_total = int(pob_cr.pobl.sum())
    pob_cr_con_pozo = int(pob_cr[pob_cr.LINK.isin(radios_con_pozo)].pobl.sum())
    km3 = g[g.yacimiento == "CAMPAMENTO CENTRAL - BELLA VISTA ESTE"]

    def conteo(df):
        # "Activo" agrupa extracción, inyección, mantenimiento de presión y reparación: no todos producen.
        # "extraccion_efectiva" es el subconjunto que declara estar extrayendo (el que sí se puede decir "produce").
        vc = df.grupo.value_counts()
        return {k: int(vc.get(k, 0)) for k in GRUPO_ORDEN} | {
            "total": int(len(df)), "extraccion_efectiva": int((df.tipoestado == "Extracción Efectiva").sum())}

    pais_cuenca = {c: conteo(p[p.cuenca == c]) for c in ["GOLFO SAN JORGE", "NEUQUINA", "CUYANA", "AUSTRAL", "NOROESTE"]}
    ypf_antes = int((g.operador_anterior == "YPF").sum())
    a1, a2 = anual.loc[2006], anual.loc[ultimo_anio_completo]
    # Desde qué año la producción del GSJ cae todos los años sin interrupción (hasta el último año completo)
    gsj_cae_desde = None
    for a in range(ultimo_anio_completo, int(anual.index.min()), -1):
        if anual.cuenca_gsj.loc[a] < anual.cuenca_gsj.loc[a - 1]:
            gsj_cae_desde = a
        else:
            break
    resumen = {
        "generado": date.today().isoformat(),
        "fuentes": {
            "pozos": "Secretaría de Energía, Capítulo IV – Pozos (datos.energia.gob.ar), descargado 18/09/2026, CC-BY 4.0",
            "listado_anterior": "Secretaría de Energía, Listado de pozos cargados por empresas operadoras (actualizado 20/10/2025)",
            "produccion": "Secretaría de Energía, serie histórica de producción de petróleo por cuenca",
            "geo": "Municipalidad de Comodoro Rivadavia, datos.comodoro.gov.ar: límites administrativos 2025 y radios censales 2022 (INDEC)",
        },
        "pais": {"pozos": int(len(p)), "por_cuenca": pais_cuenca, "sin_empresa": int(p.empresa.isna().sum())},
        "cuenca": conteo(g) | {
            "por_provincia": {pr: conteo(g[g.provincia == pr]) for pr in ["Chubut", "Santa Cruz"]},
            "sin_empresa": conteo(g[g.empresa == ""]),
            "sin_produccion": int(g.grupo.isin(["Inactivo", "A abandonar", "Abandonado"]).sum()),
            "ypf_pozos_listado_anterior": ypf_antes,
            "ypf_pozos_actual": int(g.empresa.str.contains("YPF").sum()),
            "con_fecha_perforacion_pct": round(float(g.fecha_perf.notna().mean() * 100), 1),
        },
        "produccion": {
            "anio_base": 2006, "anio_ref": ultimo_anio_completo,
            "gsj_pct_base": float(a1.gsj_pct), "gsj_pct_ref": float(a2.gsj_pct),
            "gsj_ref_sobre_base_pct": round(float(a2.cuenca_gsj / a1.cuenca_gsj * 100)),
            "neuquina_ref_sobre_base_pct": round(float(a2.cuenca_neuquina / a1.cuenca_neuquina * 100)),
            "neuquina_pct_ref": round(float(a2.cuenca_neuquina / a2.total * 100), 1),
            "shale_pct_ref": float(a2.shale_pct),
            "gsj_cae_desde": gsj_cae_desde,
        },
        "ejido": conteo(ej) | {
            "activos_pct": round(float((ej.grupo == "Activo").mean() * 100), 1),
            "abandonados_pct": round(float((ej.grupo == "Abandonado").mean() * 100), 1),
            "sin_empresa": int((ej.empresa == "").sum()),
            "por_yacimiento": {y: conteo(ej[ej.yacimiento == y]) for y in ej.yacimiento.value_counts().head(12).index},
            "por_empresa": {e or "(sin empresa)": conteo(ej[ej.empresa == e]) for e in ej.empresa.value_counts().head(8).index},
            "rada_tilly": conteo(g[g.en_radatilly]),
            "escalante": conteo(g[g.en_escalante]),
        },
        "km3": conteo(km3) | {"en_ejido": conteo(km3[km3.en_ejido])},
        "poblacion": {
            "total_radios": pob_total, "radios": int(len(pob)),
            "radios_con_pozo": int(len(radios_con_pozo)),
            "pobl_en_radios_con_pozo": pob_con_pozo,
            "pobl_en_radios_con_pozo_pct": round(pob_con_pozo / pob_total * 100, 1),
            "pobl_en_radios_con_abandonado": pob_con_abandonado,
            "pobl_en_radios_con_10_o_mas": pob_10,
            "comodoro": {
                "radios": int(en_cr.sum()), "total": pob_cr_total,
                "pobl_en_radios_con_pozo": pob_cr_con_pozo,
                "pobl_en_radios_con_pozo_pct": round(pob_cr_con_pozo / pob_cr_total * 100, 1),
            },
            "pozos_en_radios": conteo(urb),
            "radio_mas_pozos": por_radio.sort_values("pozos", ascending=False).head(3).reset_index().to_dict(orient="records"),
            "radio_urbano_mas_pozos": por_radio[por_radio.TIPO == "U"].sort_values("pozos", ascending=False).head(3).reset_index().to_dict(orient="records"),
            "radio_urbano_mas_abandonados": por_radio[por_radio.TIPO == "U"].sort_values("abandonados", ascending=False).head(3).reset_index().to_dict(orient="records"),
        },
        "antiguedad": {
            "nota": "primera_prod viene del padrón de la SE; la serie arranca en 2006-01, así que 'ya_en_2006' significa que el pozo ya figuraba al inicio de la serie",
            "con_primera_prod": int(g.primera_prod.notna().sum()),
            "ya_en_2006": int((g.ya_en_2006 == True).sum()),
            "iniciaron_despues_2006": int(((g.ya_en_2006 == False)).sum()),
            "ya_en_2006_por_grupo": {k: int(((g.ya_en_2006 == True) & (g.grupo == k)).sum()) for k in GRUPO_ORDEN[:4]},
            "ya_en_2006_extraccion_efectiva": int(((g.ya_en_2006 == True) & (g.tipoestado == "Extracción Efectiva")).sum()),
            "iniciaron_despues_2006_por_grupo": {k: int(((g.ya_en_2006 == False) & (g.grupo == k)).sum()) for k in GRUPO_ORDEN[:4]},
            "ejido_ya_en_2006": int(((g.ya_en_2006 == True) & g.en_ejido).sum()),
        },
        "trayectoria": None if mens is None else {
            "cobertura": cobertura_mensual,
            "nota": "ultima_prod = último mes con petróleo o gas > 0 dentro de la cobertura; 'nunca_en_serie' = ningún mes con producción en toda la cobertura",
            "con_ultima_prod": int(g.ultima_prod.notna().sum()),
            "nunca_en_serie": int(g.ultima_prod.isna().sum()),
            "nunca_en_serie_por_grupo": {k: int((g.ultima_prod.isna() & (g.grupo == k)).sum()) for k in GRUPO_ORDEN[:4]},
            "nunca_en_serie_no_abandonados": int((g.ultima_prod.isna() & g.grupo.isin(["Inactivo", "A abandonar"])).sum()),
            "produjeron_ultimos_12_meses": int((g.meses_sin_producir <= 12).sum()),
            "sin_producir_1_a_5_anios": int(((g.meses_sin_producir > 12) & (g.meses_sin_producir < 60)).sum()),
            "sin_producir_mas_de_5_anios": int((g.meses_sin_producir >= 60).sum()),
            "sin_producir_mas_de_5_anios_no_abandonados": int(((g.meses_sin_producir >= 60) & (g.grupo != "Abandonado")).sum()),
            "inactivos_por_tiempo_sin_producir": {
                "menos_de_1_anio": int((g.grupo.isin(["Inactivo", "A abandonar"]) & (g.meses_sin_producir <= 12)).sum()),
                "1_a_5_anios": int((g.grupo.isin(["Inactivo", "A abandonar"]) & (g.meses_sin_producir > 12) & (g.meses_sin_producir < 60)).sum()),
                "5_a_9_anios": int((g.grupo.isin(["Inactivo", "A abandonar"]) & (g.meses_sin_producir >= 60)).sum()),
                "nunca_en_serie": int((g.grupo.isin(["Inactivo", "A abandonar"]) & g.ultima_prod.isna()).sum()),
            },
            "ejido_nunca_en_serie": int((g.ultima_prod.isna() & g.en_ejido).sum()),
            "ejido_nunca_en_serie_no_abandonados": int((g.ultima_prod.isna() & g.en_ejido & g.grupo.isin(["Inactivo", "A abandonar"])).sum()),
            "con_primer_abandono": int(g.primer_abandono.notna().sum()),
            "abandonados_declarados_desde_2017": int(g.primer_abandono.notna().sum()),
            "abandonados_por_anio_de_declaracion": g.primer_abandono.dropna().str[:4].value_counts().sort_index().to_dict(),
        },
        "barrios": None if barrios is None else {
            "cantidad": int(len(barrios)),
            "pozos_en_barrios": int(g.barrio.notna().sum()),
            "barrios_con_pozo": int(g.barrio.nunique()),
            "por_barrio": por_barrio.sort_values("pozos", ascending=False).head(15).reset_index().to_dict(orient="records"),
            "barrio_del_radio_urbano_mas_pozos": barrio_de_punto(barrios, por_radio[por_radio.TIPO == "U"].sort_values("pozos", ascending=False).iloc[0]),
        },
        "concesiones": None if conc is None else {
            "poligonos": int(len(conc)),
            "pozos_en_area_con_concesion": int(g.en_concesion.sum()),
            "pozos_en_area_sin_concesion": int((~g.en_concesion).sum()),
            "areas_sin_concesion": g[~g.en_concesion].groupby("area").size().sort_values(ascending=False).head(12).to_dict(),
            "operadoras_en_concesiones": conc.operadora.value_counts().to_dict(),
        },
        "calidad": {
            "coordenadas_corregidas": int(g.coord_corregida.sum()),
            "coordenadas_invalidas": int((~g.coord_valida).sum()),
            "fechas_relleno_descartadas": int(g.fecha_relleno.sum()),
            "sin_fecha_perforacion": int(g.fecha_perf.isna().sum()),
            "duplicados_idpozo": int(g.idpozo.duplicated().sum()),
            "no_informado": int((g.grupo == "No informado").sum()),
        },
        "grupos_de_estado": GRUPOS,
        "cuenca_por_estado_original": {k: int(v) for k, v in g.tipoestado.fillna("No informado").value_counts().items()},
        "datasets": DATASETS,
        "eph": cargar_eph(),
    }
    json.dump(resumen, open(os.path.join(OUT, "resumen.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # conciliación
    fmt = lambda n: f"{n:,}".replace(",", ".")
    E = resumen["eph"]
    coma = lambda x: str(x).replace(".", ",")
    if E is None:
        eph_linea = "sin archivo"
    else:
        eph_linea = f"{E['periodo']}: {coma(E['desocupacion'])} %"
        if E["cv"] is not None:
            eph_linea += f" (IC 90 %: {coma(E['ic90'][0])}–{coma(E['ic90'][1])}; CV {coma(E['cv'])} %)"
        u = E["ultimo_valor_mayor"]
        eph_linea += f"; último valor mayor: {u['periodo']} ({coma(u['tasa'])} %, {coma(E['anios_sin_un_valor_mayor'])} años antes)" if u else f"; ninguno mayor desde {E['serie_desde']}"
    lines = ["# Conciliación de cifras", "", f"Generado: {date.today().isoformat()}", "",
             "| Cifra | Valor |", "|---|---|",
             f"| Pozos país | {fmt(resumen['pais']['pozos'])} |",
             f"| Pozos cuenca GSJ | {fmt(resumen['cuenca']['total'])} |",
             f"| GSJ activos / inactivos / a abandonar / abandonados | {fmt(resumen['cuenca']['Activo'])} / {fmt(resumen['cuenca']['Inactivo'])} / {fmt(resumen['cuenca']['A abandonar'])} / {fmt(resumen['cuenca']['Abandonado'])} |",
             f"| GSJ sin empresa | {fmt(resumen['cuenca']['sin_empresa']['total'])} |",
             f"| YPF en listado anterior → hoy | {fmt(ypf_antes)} → {resumen['cuenca']['ypf_pozos_actual']} |",
             f"| Ejido Comodoro | {fmt(resumen['ejido']['total'])} (activos {fmt(resumen['ejido']['Activo'])}, abandonados {fmt(resumen['ejido']['Abandonado'])}) |",
             f"| Km 3 | {fmt(resumen['km3']['total'])} (abandonados {fmt(resumen['km3']['Abandonado'])}, activos {fmt(resumen['km3']['Activo'])}) |",
             f"| Km 3 dentro del ejido | {fmt(resumen['km3']['en_ejido']['total'])} (abandonados {fmt(resumen['km3']['en_ejido']['Abandonado'])}, activos {fmt(resumen['km3']['en_ejido']['Activo'])}) |",
             f"| En extracción efectiva (parte de \"Activo\"): cuenca / ejido / Km 3 en ejido / ya en 2006 | {fmt(resumen['cuenca']['extraccion_efectiva'])} / {fmt(resumen['ejido']['extraccion_efectiva'])} / {fmt(resumen['km3']['en_ejido']['extraccion_efectiva'])} / {fmt(resumen['antiguedad']['ya_en_2006_extraccion_efectiva'])} |",
             f"| Población en radios con pozo | {fmt(pob_con_pozo)} de {fmt(pob_total)} ({resumen['poblacion']['pobl_en_radios_con_pozo_pct']} %) |",
             f"| Población de Comodoro (sin Rada Tilly) en radios con pozo | {fmt(pob_cr_con_pozo)} de {fmt(pob_cr_total)} ({resumen['poblacion']['comodoro']['pobl_en_radios_con_pozo_pct']} %) |",
             f"| Producción {ultimo_anio_completo}: GSJ / Neuquina / shale (% del total) | {resumen['produccion']['gsj_pct_ref']} / {resumen['produccion']['neuquina_pct_ref']} / {resumen['produccion']['shale_pct_ref']} |",
             f"| GSJ: {ultimo_anio_completo} sobre 2006; cae todos los años desde | {resumen['produccion']['gsj_ref_sobre_base_pct']} %; {gsj_cae_desde} |",
             f"| Pozos en radios censales | {fmt(resumen['poblacion']['pozos_en_radios']['total'])} |",
             f"| Coordenadas corregidas | {resumen['calidad']['coordenadas_corregidas']} |",
             f"| Fechas de relleno descartadas | {resumen['calidad']['fechas_relleno_descartadas']} |",
             f"| Sin fecha de perforación | {fmt(resumen['calidad']['sin_fecha_perforacion'])} |",
             f"| Con primera producción (padrón) | {fmt(resumen['antiguedad']['con_primera_prod'])}; ya en 2006-01: {fmt(resumen['antiguedad']['ya_en_2006'])} |",
             f"| Pozos país con coordenadas | {fmt(len(pp))} |",
             f"| Concesiones GSJ / pozos en área sin concesión | {resumen['concesiones']['poligonos'] if conc is not None else '-'} / {fmt(resumen['concesiones']['pozos_en_area_sin_concesion']) if conc is not None else '-'} |",
             f"| Mensual: cobertura | {cobertura_mensual if mens is not None else 'sin archivo'} |",
             f"| Pozos sin ningún mes de producción en la serie | {fmt(resumen['trayectoria']['nunca_en_serie']) if mens is not None else '-'} (no abandonados: {fmt(resumen['trayectoria']['nunca_en_serie_no_abandonados']) if mens is not None else '-'}) |",
             f"| Barrios con pozos | {fmt(resumen['barrios']['barrios_con_pozo']) + ' de ' + fmt(resumen['barrios']['cantidad']) + ' (' + fmt(resumen['barrios']['pozos_en_barrios']) + ' pozos)' if barrios is not None else '-'} |",
             f"| EPH Comodoro–Rada Tilly | {eph_linea} |",
             f"| Radio urbano con más pozos | {resumen['poblacion']['radio_urbano_mas_pozos'][0]['radio']} ({fmt(resumen['poblacion']['radio_urbano_mas_pozos'][0]['pozos'])} pozos, {fmt(resumen['poblacion']['radio_urbano_mas_pozos'][0]['pobl'])} hab.) |",
             ]
    open(os.path.join(OUT, "conciliacion.md"), "w", encoding="utf-8").write("\n".join(lines))
    if check:
        print("\n".join(lines))
    log("listo.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    main(check=ap.parse_args().check)
