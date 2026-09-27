"""
Filtra los archivos mensuales "Producción de Pozos de Gas y Petróleo - AAAA" (uno por año,
cientos de MB cada uno) y los reduce a un solo CSV liviano de la Cuenca del Golfo San Jorge
con las columnas que necesita el proyecto. Lee de a 200.000 filas: nunca carga un archivo entero.

Uso (desde la carpeta donde están los CSV anuales):
    python filtrar_mensuales.py
        -> toma todos los archivos que empiecen con "produccin-de-pozos-de-gas-y-petrleo" de esta carpeta
    python filtrar_mensuales.py archivo1.csv archivo2.csv
        -> solo esos (también acepta comodines: python filtrar_mensuales.py *.csv)

Genera:  produccion-mensual_gsj.csv   (una fila por pozo y mes de la cuenca)
         Copiarlo a data-pipeline/raw/ (reemplaza la muestra) y correr: python procesar.py --check
"""
import glob
import os
import sys
import pandas as pd

SALIDA = "produccion-mensual_gsj.csv"
PATRON = "produccin-de-pozos-de-gas-y-petrleo*.csv"
COLS = ["idpozo", "anio", "mes", "idempresa", "tipoestado", "tipopozo", "prod_pet", "prod_gas", "prod_agua", "tef"]

# Archivos a procesar: los argumentos (expandiendo comodines) o el patrón por defecto
archivos = []
for arg in sys.argv[1:]:
    archivos.extend(glob.glob(arg) or [arg])
if not archivos:
    archivos = glob.glob(PATRON)
archivos = sorted(a for a in archivos if os.path.basename(a) != SALIDA)
if not archivos:
    sys.exit(f"No encontré archivos. Poné este script en la carpeta de los CSV, o pasá los nombres como argumentos.")

print(f"Voy a procesar {len(archivos)} archivos:")
for a in archivos:
    print("  ", os.path.basename(a), f"({os.path.getsize(a) / 1e6:.0f} MB)")

primero = True
total = 0
for archivo in archivos:
    filas = 0
    for chunk in pd.read_csv(archivo, chunksize=200_000, low_memory=False, encoding="utf-8", encoding_errors="replace"):
        if "cuenca" in chunk.columns:
            mask = chunk["cuenca"].astype(str).str.strip().str.upper() == "GOLFO SAN JORGE"
        elif "idcuenca" in chunk.columns:
            mask = chunk["idcuenca"].astype(str).str.strip().str.upper() == "GSJ"
        else:
            sys.exit(f"{archivo}: no tiene columna 'cuenca' ni 'idcuenca'. Columnas: {list(chunk.columns)[:10]}…")
        parte = chunk.loc[mask, [c for c in COLS if c in chunk.columns]]
        parte.to_csv(SALIDA, mode="w" if primero else "a", header=primero, index=False)
        primero = False
        filas += len(parte)
        total += len(parte)
        print(f"  {os.path.basename(archivo)}: {filas:,} filas GSJ", end="\r")
    print(f"  {os.path.basename(archivo)}: {filas:,} filas GSJ          ")

print(f"\nListo: {total:,} filas en {SALIDA} ({os.path.getsize(SALIDA) / 1e6:.0f} MB)")
print("Siguiente paso: copiar ese archivo a data-pipeline/raw/ y correr  python procesar.py --check")
