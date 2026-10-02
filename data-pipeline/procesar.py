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
  raw/produccion-mensual_gsj*.zip        (opcional) mensual por pozo de la cuenca, salida de filtrar_mensuales.py; se leen
                                         todos (hoy 2006–2010, 2011–2016, 2017–2025 y 2026)
  raw/listado-pozos-operadoras_gsj.csv   Listado de pozos cargados por empresas operadoras (versión anterior), GSJ
  raw/serie-produccion-petroleo-por-cuenca.csv
  raw/limites-administrativos-2025.zip   Shapefile: ejido Comodoro, Rada Tilly, depto. Escalante
  raw/radios-censales-2022.zip           Shapefile: radios censales del depto. Escalante (Censo 2022)
  raw/poblacion-radio-censal-2022.kmz    Polígonos de radio con población (Censo 2022)
  raw/limites-barrios-2026.gpkg          (opcional) Barrios de Comodoro Rivadavia (datos.comodoro.gov.ar)
  raw/poblacion-viviendas-barrios-2022.csv  (opcional) Población y viviendas por barrio, Censo 2022 (datos.comodoro.gov.ar)

Salidas (public/data/):
  pozos_gsj.bin + pozos_gsj.meta.json    arrays columnares para deck.gl (44.390 pozos)
  pozos_pais.bin + pozos_pais.meta.json  lon/lat/estado del país entero (portada y paso 1)
  concesiones.geojson                    polígonos de concesiones de la cuenca con operadora y pozos del área
  fichas/NNN.json                        detalle por pozo, en lotes de 1.000, por idpozo
  siglas.json                            índice idpozo → sigla (buscador y tooltip)
  radios.geojson                         radios censales con población y pozos por estado
  limites.geojson                        límite del ejido de Comodoro Rivadavia (Rada Tilly y Escalante solo se usan para contar)
  barrios.geojson                        barrios de Comodoro con pozos por estado y zn = 1 en zona norte (si hay capa de barrios)
  produccion_cuencas.json                serie anual y mensual por cuenca
  operadores.json                        matriz operador anterior -> actual
  resumen.json                           TODAS las cifras que aparecen en la pieza
  conciliacion.md                        tabla de control de calidad
"""
import argparse
import glob
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
    {"clave": "mensual", "titulo": "Producción de pozos de gas y petróleo, mensual 2006–2026", "organismo": "Secretaría de Energía",
     "url": CAP_IV, "descarga": "20/09/2026 (2017–2025), 30/09/2026 (2011–2016) y 02/10/2026 (2006–2010 y 2026)", "licencia": "CC-BY 4.0",
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
    {"clave": "barrios", "titulo": "Barrios de Comodoro Rivadavia (límites 2026)", "organismo": "Municipalidad de Comodoro Rivadavia",
     "url": "https://datos.comodoro.gov.ar/dataset/barrios-de-comodoro-rivadavia", "descarga": "20/09/2026", "licencia": "CC BY-SA 4.0",
     "uso": "barrio de cada pozo"},
    {"clave": "poblacion_barrios", "titulo": "Población y viviendas por barrio, Censo 2022", "organismo": "Municipalidad de Comodoro Rivadavia (datos del INDEC)",
     "url": "https://datos.comodoro.gov.ar/dataset/poblacion-y-viviendas-por-barrio-censo-2022", "descarga": "27/09/2026",
     "licencia": "CC BY-SA 4.0", "uso": "población de los barrios (zona norte y cartel de barrio del visualizador)"},
    {"clave": "eph_serie", "titulo": "EPH continua: tasa de desempleo, Comodoro Rivadavia (serie 45.2_ECTDTCR_0_T_52)", "organismo": "INDEC, vía datos.gob.ar",
     "url": "https://apis.datos.gob.ar/series/api/series/?ids=45.2_ECTDTCR_0_T_52", "descarga": "26/09/2026", "licencia": None,
     "uso": "desocupación del aglomerado Comodoro Rivadavia–Rada Tilly (portada)"},
    {"clave": "eph_indec", "titulo": "Mercado de trabajo. Tasas e indicadores socioeconómicos (EPH), 2.º trimestre de 2026", "organismo": "INDEC",
     "url": "https://www.indec.gob.ar/uploads/informesdeprensa/mercado_trabajo_eph_2trim26433FCBC5A8.pdf", "descarga": "26/09/2026",
     "licencia": None, "uso": "coeficiente de variación de esa estimación"},
]

# Zona Norte: los barrios al norte del cerro Chenque según el "Relevamiento de barrios" de la Municipalidad (DGMIT, 2025):
# https://www.comodoro.gov.ar/miciudad/relevamiento-de-barrios/zona-norte/ (35 barrios) más Franja Forestal Cerro de la Cruz,
# "nuevo barrio de Zona Norte desde el año 2025" según la página del relevamiento. Nombres como en limites-barrios-2026.gpkg.
ZONA_NORTE = [
    "25 de Mayo", "Acceso Noroeste", "ARA San Juan", "Astra", "Bella Vista Norte", "Caleta Córdova", "Centenario",
    "Chacras El Faro", "Chacras Km 17", "Chacras Km 18", "Ciudadela", "Cuarteles Chacabuco", "Diadema Argentina",
    "Dr. René Gerónimo Favaloro", "Don Bosco", "Gasoducto", "General Enrique Mosconi", "Gesta de Malvinas",
    "Gobernador Fontana", "Güemes", "Juan José Castelli", "Laprida", "Las Orquídeas", "Manantial Rosales",
    "Nicolás Rodríguez Peña", "Nuestra Señora de la Divina Providencia", "Padre Juan Corti", "Presidente Roberto M. Ortiz",
    "Próspero Palazzo", "Restinga Alí", "Saavedra", "Sarmiento", "Standard Norte", "Standard Sur", "Zona de Aeropuerto",
    "Franja Forestal Cerro de la Cruz",
]
# Población por barrio (Censo 2022): nombres del CSV que no coinciden con los polígonos 2026 (los demás se cruzan por
# nombre). Un renglón puede abarcar varios polígonos; [] = sin polígono claro (no se asigna a ninguno).
POBLACION_A_POLIGONOS = {
    "Bellavista Norte": ["Bella Vista Norte"],
    "Bellavista Sur": ["Bella Vista Sur"],
    "Doctor René Gerónimo Favaloro": ["Dr. René Gerónimo Favaloro"],
    "Ex Radio Estación YPF": ["Ex Radio Estación"],
    "Guemes": ["Güemes"],
    "Km 17 y km 18": ["Chacras Km 17", "Chacras Km 18"],
    "Nicolás Rodriguez Peña": ["Nicolás Rodríguez Peña"],
    "Padre Corti": ["Padre Juan Corti"],
    "Pietrobelli y Balcón del Paraíso": ["Pietrobelli", "Balcón del Paraíso"],
    "Presidente Ortiz": ["Presidente Roberto M. Ortiz"],
    "Quirno Costa": ["Dr. Quirno Costa"],
    "Aeropuerto": ["Zona de Aeropuerto"],
    # dudosos o sin polígono en 2026
    "Chacras La Herradura, Refugio Lobos": ["Chacras La Herradura"],  # confirmado por los autores (28/09)
    "Acceso Sur Industrial": [], "Chacras Tres Pinos, Cañadones": [],
    "Chacras Minas George Stephenson, Sol de Mayo y San Jorge": [], "Chacras Oeste": [], "Médanos": [],
    "Lotes Pastoriles Noroeste": [],
}

GRUPO_ORDEN = ["Activo", "Inactivo", "A abandonar", "Abandonado", "No informado"]
GRUPO_COD = {g: i for i, g in enumerate(GRUPO_ORDEN)}
PROV_COD = {"Chubut": 1, "Santa Cruz": 2}
# claves cortas de las fichas (documentadas en public/data/pozos_gsj.meta.json)
CLAVES_FICHA = {"idpozo": "id", "sigla": "s", "empresa": "e", "operador_anterior": "ea", "area": "ar",
                "yacimiento": "y", "provincia": "p", "tipoestado": "est", "grupo": "g", "tipopozo": "tp",
                "tipoextraccion": "tx", "clasificacion": "c", "subclasificacion": "sc", "profundidad": "prof",
                "adjiv_fecha_inicio_perf": "fperf", "adjiv_fecha_fin_term": "fterm", "en_ejido": "ej",
                "radio": "r", "radio_pobl": "rp", "primera_prod": "pp", "ya_en_2006": "pp06", "ultima_prod": "up",
                "primer_abandono": "pab", "fecha_abandono_listado": "fab", "meses_sin_producir": "msp", "ultima_declaracion": "ud", "en_concesion": "conc", "barrio": "b"}

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


# Fecha en que se bajó el archivo mensual más reciente (2026). La Res. SE 319/93 (Anexo I, punto 2) pide entregar el
# Capítulo IV "mensualmente y antes del día 20 de cada mes": la producción de un mes vence el día 20 del siguiente. La serie
# llega hasta el último mes vencido a esta fecha; los posteriores están incompletos por definición (al 02/10/2026,
# septiembre tenía 106 pozos declarados de unos 43.000) y se descartan.
DESCARGA_MENSUAL = date(2026, 10, 2)
# Un pozo "dejó de declararse" si le faltan los últimos 3 meses de la serie o más. Con menos, es atraso: Brest S.A. declaró
# junio de 2026 recién en la descarga del 02/10 y todavía no julio ni agosto (3.012 pozos).
MESES_SIN_DECLARAR = 3


def cargar_mensual():
    """Mensual por pozo (salida de filtrar_mensuales.py). Devuelve por pozo: último mes con producción, primer mes en
    estado Abandonado, último mes declarado y meses sin producir.
    Algunas operadoras dejan de declarar sus pozos antes del final de la serie (CRI desde 2023, CPAT desde 2019-11,
    INER desde 2020-02): esos meses no se cuentan como "sin producir". Por eso hay dos medidas:
      meses_desde_ultima_prod        calendario, del último mes con producción al último de la serie ("produjo en el último año")
      meses_declarados_sin_producir  meses con declaración y sin producción después del último con producción (o todos, si
                                     nunca produjo en la serie): lo que se puede afirmar ("más de cinco años sin producir")."""
    # Uno o más archivos por períodos que no se pisan (hoy 2006–2010, 2011–2016, 2017–2025 y 2026, cada uno menor a 50 MB para el repo;
    # el 2026 va aparte para que actualizarlo no reescriba los años cerrados).
    # Acepta .csv, .csv.gz o .zip (pandas descomprime solo); si un período está en dos formatos, se lee uno.
    archivos = {}
    for ext in (".csv", ".csv.gz", ".zip"):  # el último que aparece gana
        for f in glob.glob(os.path.join(RAW, f"produccion-mensual_gsj*{ext}")):
            archivos[os.path.basename(f)[: -len(ext)]] = f
    if not archivos:
        return None, None
    partes, anios_vistos = [], set()
    for f in sorted(archivos.values()):
        p = pd.concat(pd.read_csv(f, low_memory=False, chunksize=500_000,
                                  usecols=lambda c: c in {"idpozo", "anio", "mes", "tipoestado", "prod_pet", "prod_gas"}),
                      ignore_index=True)
        anios = set(p.anio.unique())
        assert not anios & anios_vistos, f"{os.path.basename(f)} repite años de otro archivo mensual: {sorted(anios & anios_vistos)}"
        anios_vistos |= anios
        partes.append(p)
    m = pd.concat(partes, ignore_index=True)
    m["t"] = m.anio * 12 + m.mes - 1
    # Corte legal (ver DESCARGA_MENSUAL): último mes cuyo plazo de declaración (día 20 del mes siguiente) ya venció.
    d = DESCARGA_MENSUAL
    t_corte = d.year * 12 + d.month - 1 - (1 if d.day >= 20 else 2)
    fuera = m.t > t_corte
    if fuera.any():
        log(f"   mensual: se descartan {int(fuera.sum()):,} filas de meses con el plazo sin vencer al {d:%d/%m/%Y} "
            f"(después de {t_corte // 12}-{t_corte % 12 + 1:02d})")
        m = m[~fuera]
    ultimo_t = int(m.t.max())
    m["con_prod"] = (m.prod_pet.fillna(0) > 0) | (m.prod_gas.fillna(0) > 0)
    mes = m.groupby(["idpozo", "t"], as_index=False).con_prod.max()  # un renglón por pozo y mes declarado
    ult = mes[mes.con_prod].groupby("idpozo").t.max().rename("t_ultima_prod")
    decl = mes.groupby("idpozo").t.max().rename("t_ultima_declaracion")
    ab = m[m.tipoestado == "Abandonado"].groupby("idpozo").t.min().rename("t_primer_abandono")
    mes = mes.merge(ult, on="idpozo", how="left")
    sin = mes[mes.t_ultima_prod.isna() | (mes.t > mes.t_ultima_prod)].groupby("idpozo").size().rename("meses_declarados_sin_producir")
    # Años con producción: bit k = el pozo tuvo al menos un mes con petróleo o gas en el año (primer año de la serie + k).
    # Solo para resumen.trayectoria (produjeron_por_anio). Entra en un uint32 mientras la serie tenga 32 años o menos.
    anio0 = int(m.t.min() // 12)
    con = mes[mes.con_prod].assign(a=lambda d: d.t // 12 - anio0).drop_duplicates(["idpozo", "a"])
    assert con.a.max() < 32, "anios_prod es uint32: la serie mensual no puede pasar de 32 años"
    anios_prod = pd.Series(np.left_shift(1, con.a.to_numpy(dtype="int64")), index=con.idpozo).groupby(level=0).sum().rename("anios_prod")
    r = pd.concat([ult, decl, ab, sin, anios_prod], axis=1).reset_index()
    r["meses_declarados_sin_producir"] = r.meses_declarados_sin_producir.fillna(0)
    r["anios_prod"] = r.anios_prod.fillna(0)
    am = lambda t: f"{int(t // 12)}-{int(t % 12) + 1:02d}" if t == t else None
    r["ultima_prod"] = r.t_ultima_prod.map(am)
    r["primer_abandono"] = r.t_primer_abandono.map(am)
    # último mes declarado, solo si al pozo le faltan los últimos MESES_SIN_DECLARAR meses o más (la ficha avisa que después
    # no hay datos). Un atraso menor no cuenta: se informa aparte (declaracion_atrasada).
    r["ultima_declaracion"] = r.t_ultima_declaracion.where(r.t_ultima_declaracion <= ultimo_t - MESES_SIN_DECLARAR).map(am)
    r["declaracion_atrasada"] = (r.t_ultima_declaracion < ultimo_t) & (r.t_ultima_declaracion > ultimo_t - MESES_SIN_DECLARAR)
    r["meses_desde_ultima_prod"] = (ultimo_t - r.t_ultima_prod).where(r.t_ultima_prod.notna())
    r["meses_sin_producir"] = r.meses_declarados_sin_producir.where(r.t_ultima_prod.notna())  # la ficha: lo que se puede afirmar
    cobertura = {"desde": f"{int(m.t.min() // 12)}-{int(m.t.min() % 12) + 1:02d}", "hasta": f"{ultimo_t // 12}-{ultimo_t % 12 + 1:02d}",
                 "pozos_con_registro": int(m.idpozo.nunique())}
    return r[["idpozo", "ultima_prod", "primer_abandono", "ultima_declaracion", "declaracion_atrasada", "meses_desde_ultima_prod",
              "meses_declarados_sin_producir", "meses_sin_producir", "anios_prod"]], cobertura


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


def poblacion_por_poligono(barrios):
    """Polígono de barrio -> (habitantes del Censo 2022, polígonos con los que comparte el renglón o None). Para el cartel
    del visualizador. Si un renglón abarca dos polígonos, los dos llevan la población del renglón y el nombre del otro."""
    f = os.path.join(RAW, "poblacion-viviendas-barrios-2022.csv")
    if barrios is None or not os.path.exists(f):
        return {}
    r = {}
    for fila in pd.read_csv(f, encoding="utf-8").itertuples():
        pols = [x for x in POBLACION_A_POLIGONOS.get(fila.nombre_barrio, [fila.nombre_barrio]) if x in set(barrios.barrio)]
        for x in pols:
            otros = [y for y in pols if y != x]
            r[x] = (int(fila.poblacion), " y ".join(otros) or None)
    return r


def resumir_zona_norte(g, barrios, conteo):
    """Pozos y población de los barrios de zona norte (tarjeta 6). La población sale del CSV municipal por barrio
    (Censo 2022): cada renglón se asigna a sus polígonos 2026 (POBLACION_A_POLIGONOS o el mismo nombre). Los barrios
    sin renglón (p. ej. Franja Forestal, de 2025) quedan fuera de las cifras de población."""
    f = os.path.join(RAW, "poblacion-viviendas-barrios-2022.csv")
    if barrios is None or not os.path.exists(f):
        return None
    faltan = set(ZONA_NORTE) - set(barrios.barrio)
    assert not faltan, f"barrios de ZONA_NORTE que no están en la capa: {faltan}"
    pob = pd.read_csv(f, encoding="utf-8")
    pozos_barrio = g.barrio.value_counts()
    filas = []
    for r in pob.itertuples():
        pols = POBLACION_A_POLIGONOS.get(r.nombre_barrio, [r.nombre_barrio])
        if pols and all(p in ZONA_NORTE for p in pols):
            filas.append({"pols": pols, "poblacion": int(r.poblacion), "viviendas": int(r.viviendas),
                          "pozos": int(sum(pozos_barrio.get(p, 0) for p in pols))})
    zn = pd.DataFrame(filas)
    cubiertos = {p for ps in zn.pols for p in ps}
    pobl = int(zn.poblacion.sum())
    con1, con10 = zn[zn.pozos >= 1], zn[zn.pozos >= 10]
    en_zn = g[g.barrio.isin(ZONA_NORTE)]
    nb = en_zn[en_zn.grupo.isin(["Inactivo", "A abandonar"])]
    por_barrio = {b: conteo(en_zn[en_zn.barrio == b]) for b in ZONA_NORTE}
    for fila in zn.itertuples():  # población solo en los renglones de un único polígono
        if len(fila.pols) == 1:
            por_barrio[fila.pols[0]] |= {"poblacion": fila.poblacion, "viviendas": fila.viviendas}
    pozo2 = g.loc[g.idpozo == 121014, "barrio"]
    return {
        "fuente": "https://www.comodoro.gov.ar/miciudad/relevamiento-de-barrios/zona-norte/",
        "barrios": len(ZONA_NORTE),
        "barrios_con_pozos": int(sum(pozos_barrio.get(b, 0) > 0 for b in ZONA_NORTE)),
        "barrios_sin_pozos": [b for b in ZONA_NORTE if pozos_barrio.get(b, 0) == 0],
        "pozos": conteo(en_zn),
        "pozos_en_barrios_pct": round(len(en_zn) / int(g.barrio.notna().sum()) * 100, 1),
        "poblacion": pobl, "viviendas": int(zn.viviendas.sum()),
        "barrios_sin_poblacion": sorted(set(ZONA_NORTE) - cubiertos),
        "pobl_en_barrios_con_pozo": int(con1.poblacion.sum()),
        "pobl_en_barrios_con_pozo_pct": round(con1.poblacion.sum() / pobl * 100, 1),
        "pobl_en_barrios_con_10_o_mas": int(con10.poblacion.sum()),
        "pobl_en_barrios_con_10_o_mas_pct": round(con10.poblacion.sum() / pobl * 100, 1),
        "barrio_pozo_2": None if pozo2.isna().all() else str(pozo2.iat[0]),
        # tarjeta 7: pozos que la operadora no dio de baja (Inactivo o A abandonar) y cuántos llevan 60 meses declarados sin producir
        "no_dados_de_baja": int(nb.shape[0]),
        "no_dados_de_baja_5_anios": int((nb.meses_declarados_sin_producir >= 60).sum()),
        "no_dados_de_baja_por_estado": {k: int(v) for k, v in nb.tipoestado.value_counts().items()},
        "por_barrio": dict(sorted(por_barrio.items(), key=lambda kv: -kv[1]["total"])),
    }


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
    # Es la única fuente de fechas de abandono anteriores al comienzo de la serie mensual (enero de 2006).
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
def produjeron_por_anio(df, cobertura):
    """{año: pozos con al menos un mes de petróleo o gas ese año} a partir de anios_prod (bits, ver cargar_mensual)."""
    desde, hasta = int(cobertura["desde"][:4]), int(cobertura["hasta"][:4])
    bits = df.anios_prod.to_numpy()
    return {str(desde + k): int((np.right_shift(bits, k) & 1).sum()) for k in range(hasta - desde + 1)}


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
        g["ultima_prod"] = None; g["primer_abandono"] = None; g["ultima_declaracion"] = None; g["declaracion_atrasada"] = False
        g["meses_desde_ultima_prod"] = np.nan; g["meses_declarados_sin_producir"] = np.nan; g["meses_sin_producir"] = np.nan
        g["anios_prod"] = 0
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
    g["zn_cod"] = g.barrio.isin(ZONA_NORTE).astype("uint8")  # dentro de un barrio de zona norte (tarjeta 6)
    # Barrio de cada pozo para el filtro del panel: 0 = fuera de los barrios; k = meta.barrios[k - 1] (los 77, con o sin pozos)
    nombres_barrios = sorted(barrios.barrio) if barrios is not None else []
    g["barrio_cod"] = g.barrio.map({b: i + 1 for i, b in enumerate(nombres_barrios)}).fillna(0).astype("uint8")
    g["anios_prod"] = g.anios_prod.fillna(0).astype("uint32")  # no va al binario: solo para resumen.trayectoria
    g["primera_cod"] = pd.to_numeric(g.primera_prod.str[:4], errors="coerce").fillna(0).astype("uint16")
    # Tramo de tiempo sin producir (filtro del panel, ver data.js): "último año" por calendario; "más de 5 años" solo con
    # 60 meses declarados sin producir; el resto, 1 a 5 años (mínimo 13). 65535 = ningún mes con producción en la serie.
    mc = g.meses_declarados_sin_producir.where(g.meses_desde_ultima_prod > 12, g.meses_desde_ultima_prod)
    mc = mc.where(~((g.meses_desde_ultima_prod > 12) & (mc <= 12)), 13)
    g["meses_cod"] = mc.where(g.ultima_prod.notna()).fillna(65535).clip(0, 65535).astype("uint16")
    g["conc_cod"] = (g.en_concesion.map({True: 1, False: 0}) if conc is not None else pd.Series(np.nan, index=g.index)).fillna(255).astype("uint8")

    log("4/7 escribiendo binarios…")
    meta = escribir_bin(g, "pozos_gsj", [
        ("idpozo", "uint32"), ("lon", "float32"), ("lat", "float32"), ("estado_cod", "uint8"),
        ("empresa_cod", "uint16"), ("yac_cod", "uint16"), ("prov_cod", "uint8"), ("anio_cod", "uint16"),
        ("ejido_cod", "uint8"), ("primera_cod", "uint16"), ("meses_cod", "uint16"), ("conc_cod", "uint8"),
        ("zn_cod", "uint8"), ("barrio_cod", "uint8"),
    ])
    meta.update({"claves_ficha": CLAVES_FICHA, "estados": GRUPO_ORDEN, "empresas": empresas, "yacimientos": yacimientos,
                 "provincias": {v: k for k, v in PROV_COD.items()}, "barrios": nombres_barrios})
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
                  "meses_sin_producir", "ultima_declaracion", "en_concesion", "barrio"]
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
        # pozos de cada concesión por su código de área (cartel del visualizador); sin producir = inactivo, a abandonar o abandonado
        por_area = g.groupby("cod_area").agg(pozos=("idpozo", "size"),
                                             sin_producir=("grupo", lambda x: int(x.isin(["Inactivo", "A abandonar", "Abandonado"]).sum())))
        c2 = conc.merge(por_area, left_on="codigo", right_index=True, how="left").fillna({"pozos": 0, "sin_producir": 0})
        c2[["pozos", "sin_producir"]] = c2[["pozos", "sin_producir"]].astype(int)
        c2.to_file(os.path.join(OUT, "concesiones.geojson"), driver="GeoJSON")
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
        b2["zn"] = b2.barrio.isin(ZONA_NORTE).astype(int)  # zona norte (tarjeta 6)
        pb = poblacion_por_poligono(barrios)  # cartel del visualizador
        b2["pobl"] = b2.barrio.map(lambda b: pb[b][0] if b in pb else None).astype("Int64")
        b2["pobl_con"] = b2.barrio.map(lambda b: pb[b][1] if b in pb else None)
        b2.to_file(os.path.join(OUT, "barrios.geojson"), driver="GeoJSON")
        # barrio del radio urbano con más pozos (para la tarjeta 6)
        cent_b = barrios.copy()
    lim2 = lim[lim.Name == "Comodoro Rivadavia"].copy()  # el mapa dibuja solo el ejido (decisión de los autores, 27/09)
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
    no_baja = g.grupo.isin(["Inactivo", "A abandonar"])  # no declarados abandonados ni activos
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
            "nota": "ultima_prod = último mes con petróleo o gas > 0 dentro de la cobertura; 'nunca_en_serie' = ningún mes con producción en toda la cobertura; 'más de 5 años' = 60 meses o más declarados sin producir (no cuentan los meses en que la operadora ya no declara el pozo)",
            # sin declarar los últimos MESES_SIN_DECLARAR meses o más; con menos, atraso (declaraciones_atrasadas)
            "dejaron_de_declararse": int(g.ultima_declaracion.notna().sum()),
            "meses_sin_declarar_minimo": MESES_SIN_DECLARAR,
            "declaraciones_atrasadas": int(g.declaracion_atrasada.fillna(False).astype(bool).sum()),
            "con_ultima_prod": int(g.ultima_prod.notna().sum()),
            "nunca_en_serie": int(g.ultima_prod.isna().sum()),
            "nunca_en_serie_por_grupo": {k: int((g.ultima_prod.isna() & (g.grupo == k)).sum()) for k in GRUPO_ORDEN[:4]},
            "nunca_en_serie_no_abandonados": int((g.ultima_prod.isna() & g.grupo.isin(["Inactivo", "A abandonar"])).sum()),
            # tarjeta 3 (30/09): solo pozos hechos para producir; los inyectores, acuíferos y sumideros no producen por diseño
            "nunca_en_serie_no_abandonados_petroleo_gas": int((g.ultima_prod.isna() & g.grupo.isin(["Inactivo", "A abandonar"])
                                                              & g.tipopozo.isin(["Petrolífero", "Gasífero"])).sum()),
            "produjeron_ultimos_12_meses": int((g.meses_desde_ultima_prod <= 12).sum()),
            "sin_producir_1_a_5_anios": int(((g.meses_desde_ultima_prod > 12) & (g.meses_sin_producir < 60)).sum()),
            "sin_producir_mas_de_5_anios": int((g.meses_sin_producir >= 60).sum()),
            "sin_producir_mas_de_5_anios_no_abandonados": int(((g.meses_sin_producir >= 60) & (g.grupo != "Abandonado")).sum()),
            "inactivos_por_tiempo_sin_producir": {
                "menos_de_1_anio": int((no_baja & (g.meses_desde_ultima_prod <= 12)).sum()),
                "1_a_5_anios": int((no_baja & (g.meses_desde_ultima_prod > 12) & (g.meses_sin_producir < 60)).sum()),
                "5_a_9_anios": int((no_baja & (g.meses_sin_producir >= 60)).sum()),
                "nunca_en_serie": int((no_baja & g.ultima_prod.isna()).sum()),
                "nunca_en_serie_60_meses_declarados": int((no_baja & g.ultima_prod.isna() & (g.meses_declarados_sin_producir >= 60)).sum()),
                # tarjeta 8: más de cinco años sin producir (con producción antes o sin ninguna en la serie), solo meses declarados
                "mas_de_5_anios": int((no_baja & (g.meses_declarados_sin_producir >= 60)).sum()),
            },
            "ejido_nunca_en_serie": int((g.ultima_prod.isna() & g.en_ejido).sum()),
            "ejido_nunca_en_serie_no_abandonados": int((g.ultima_prod.isna() & g.en_ejido & g.grupo.isin(["Inactivo", "A abandonar"])).sum()),
            "con_primer_abandono": int(g.primer_abandono.notna().sum()),
            # los que ya figuraban abandonados el primer mes de la serie: no es su fecha de abandono, es "ya estaban"
            "ya_abandonados_al_inicio": int((g.primer_abandono == cobertura_mensual["desde"]).sum()),
            "abandonados_por_anio_de_declaracion": g.primer_abandono.dropna().str[:4].value_counts().sort_index().to_dict(),
            # Pozos con al menos un mes de petróleo o gas en cada año (el último, solo hasta cobertura.hasta). En la cuenca la
            # cantidad casi no cambia (cae el volumen, no los pozos que producen); en el ejido sí baja (30/09).
            "produjeron_por_anio": produjeron_por_anio(g, cobertura_mensual),
            "ejido_produjeron_por_anio": produjeron_por_anio(g[g.en_ejido], cobertura_mensual),
        },
        "barrios": None if barrios is None else {
            "cantidad": int(len(barrios)),
            "pozos_en_barrios": int(g.barrio.notna().sum()),
            "barrios_con_pozo": int(g.barrio.nunique()),
            "por_barrio": por_barrio.sort_values("pozos", ascending=False).head(15).reset_index().to_dict(orient="records"),
            "barrio_del_radio_urbano_mas_pozos": barrio_de_punto(barrios, por_radio[por_radio.TIPO == "U"].sort_values("pozos", ascending=False).iloc[0]),
        },
        "zona_norte": resumir_zona_norte(g, barrios, conteo),
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
    Z = resumen["zona_norte"]
    zn_linea = "-" if Z is None else f"{Z['barrios_con_pozos']} de {Z['barrios']} / {fmt(Z['pozos']['total'])} ({fmt(Z['pozos']['Abandonado'])}, {fmt(Z['pozos']['Activo'])})"
    zn_pobl = "-" if Z is None else f"{fmt(Z['poblacion'])} / {fmt(Z['pobl_en_barrios_con_10_o_mas'])} ({Z['pobl_en_barrios_con_10_o_mas_pct']} %); sin población: {', '.join(Z['barrios_sin_poblacion'])}"
    zn_nb = "-" if Z is None else f"{fmt(Z['no_dados_de_baja'])} / {fmt(Z['no_dados_de_baja_5_anios'])}"
    T = resumen["trayectoria"]
    t_mas5 = "-" if T is None else f"{fmt(T['inactivos_por_tiempo_sin_producir']['mas_de_5_anios'])} / {fmt(T['dejaron_de_declararse'])}"
    if barrios is not None and os.path.exists(os.path.join(RAW, "poblacion-viviendas-barrios-2022.csv")):
        cb = pd.read_csv(os.path.join(RAW, "poblacion-viviendas-barrios-2022.csv"), encoding="utf-8")
        pols = cb.nombre_barrio.map(lambda n: [x for x in POBLACION_A_POLIGONOS.get(n, [n]) if x in set(barrios.barrio)])
        sin = cb[pols.str.len() == 0]
        censo_barrios = (f"{len(sin)} ({fmt(int(sin.poblacion.sum()))} hab.: {', '.join(sin.nombre_barrio)}) / "
                         f"{int((pols.str.len() > 1).sum())}")
    else:
        censo_barrios = "-"
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
             f"| Pozos sin ningún mes de producción en la serie | {fmt(resumen['trayectoria']['nunca_en_serie']) if mens is not None else '-'} (no abandonados: {fmt(resumen['trayectoria']['nunca_en_serie_no_abandonados']) if mens is not None else '-'}; de esos, petrolíferos o gasíferos, tarjeta 3: {fmt(resumen['trayectoria']['nunca_en_serie_no_abandonados_petroleo_gas']) if mens is not None else '-'}) |",
             f"| Barrios con pozos | {fmt(resumen['barrios']['barrios_con_pozo']) + ' de ' + fmt(resumen['barrios']['cantidad']) + ' (' + fmt(resumen['barrios']['pozos_en_barrios']) + ' pozos)' if barrios is not None else '-'} |",
             f"| EPH Comodoro–Rada Tilly | {eph_linea} |",
             f"| Zona norte: barrios con pozos / pozos (abandonados, activos) | {zn_linea} |",
             f"| Zona norte: población (CSV por barrio) / en barrios con 10 o más pozos | {zn_pobl} |",
             f"| Zona norte: no dados de baja / con 60+ meses declarados sin producir | {zn_nb} |",
             f"| Censo por barrio: renglones sin polígono / renglones repartidos en 2 polígonos (su pobl no se suma dos veces) | {censo_barrios} |",
             f"| No abandonados con 60+ meses declarados sin producir (tarjeta 8) / pozos que dejaron de declararse | {t_mas5} |",
             f"| Pozos con al menos un mes de producción, por año: cuenca | {'; '.join(f'{a}: {fmt(n)}' for a, n in resumen['trayectoria']['produjeron_por_anio'].items()) if mens is not None else '-'} |",
             f"| Pozos con al menos un mes de producción, por año: ejido | {'; '.join(f'{a}: {fmt(n)}' for a, n in resumen['trayectoria']['ejido_produjeron_por_anio'].items()) if mens is not None else '-'} |",
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
