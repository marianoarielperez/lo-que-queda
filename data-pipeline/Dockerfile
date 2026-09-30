# Entorno del pipeline en Linux, con las mismas versiones que la PC de Mariano (30/09/2026). Sirve cuando Windows no deja
# cargar las DLL de pyogrio/pyproj (Smart App Control las bloquea desde el 30/09). Ver README.md, «Correr con Docker».
FROM python:3.14-slim
RUN pip install --no-cache-dir pandas==3.0.2 numpy==2.4.4 geopandas==1.1.4 shapely==2.1.2 pyogrio==0.13.0 pyproj==3.8.0
WORKDIR /repo
