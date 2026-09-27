"""
Filtra los CSV pesados de la Secretaría de Energía (Capítulo IV) sin cargarlos
enteros en memoria. Anda en cualquier PC: lee de a 100.000 filas.

Uso (desde la carpeta donde está el CSV):
    python filtrar_capitulo_iv.py capitulo-iv-pozos.csv

Genera dos archivos al lado del original:
    <nombre>_gsj.csv       -> solo cuenca GOLFO SAN JORGE, todas las columnas
    <nombre>_pais_min.csv  -> todo el país, solo columnas livianas (sin geometría)
"""
import sys
import os
import pandas as pd

if len(sys.argv) < 2:
    sys.exit("Falta el archivo. Ej: python filtrar_capitulo_iv.py capitulo-iv-pozos.csv")

origen = sys.argv[1]
base, _ = os.path.splitext(origen)
salida_gsj = base + "_gsj.csv"
salida_pais = base + "_pais_min.csv"

# Columnas livianas para la comparación entre cuencas (se ignoran las que no existan)
cols_min = ["idpozo", "sigla", "empresa", "idempresa", "area", "areapermisoconcesion",
            "yacimiento", "areayacimiento", "cuenca", "provincia", "clasificacion",
            "subclasificacion", "tipo_recurso", "tipopozo", "tipoestado",
            "adjiv_fecha_inicio_perf", "adjiv_fecha_fin_perf", "anio", "mes"]

primero = True
total = 0
gsj = 0
for chunk in pd.read_csv(origen, chunksize=100_000, low_memory=False):
    total += len(chunk)
    # Filtro por cuenca (tolerante a mayúsculas/espacios)
    if "cuenca" in chunk.columns:
        mask = chunk["cuenca"].astype(str).str.strip().str.upper() == "GOLFO SAN JORGE"
    else:
        mask = chunk["idcuenca"].astype(str).str.strip().str.upper() == "GSJ"
    parte = chunk[mask]
    gsj += len(parte)
    parte.to_csv(salida_gsj, mode="w" if primero else "a", header=primero, index=False)

    presentes = [c for c in cols_min if c in chunk.columns]
    chunk[presentes].to_csv(salida_pais, mode="w" if primero else "a", header=primero, index=False)
    primero = False
    print(f"  procesadas {total:,} filas, GSJ acumuladas {gsj:,}", end="\r")

print(f"\nListo. Filas totales: {total:,} | Golfo San Jorge: {gsj:,}")
print(f"  {salida_gsj}")
print(f"  {salida_pais}")
