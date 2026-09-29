"""Genera las fotos de la web a partir de los originales (fotos-originales/, que no se publican).

Las subcarpetas se replican en public/img/ (fotos-originales/historias/ → public/img/historias/: las fotos de las
historias del paso 7). Cada foto sale a 1000 px de ancho (se muestran a ~400 px; así alcanza para pantallas de alta densidad) en dos
formatos: WebP (calidad 82) y JPEG (calidad 85) para navegadores sin WebP. Con fidelidad parecida, el WebP pesa
20–27 % menos que el JPEG (comparación del 27/09/2026). En la página van con <picture>.

    python scripts/optimizar_fotos.py
"""
import os
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(RAIZ, "fotos-originales")
DEST = os.path.join(RAIZ, "public", "img")
ANCHO = 1000

for carpeta, _, archivos in sorted(os.walk(ORIG)):
    destino = os.path.join(DEST, os.path.relpath(carpeta, ORIG))
    os.makedirs(destino, exist_ok=True)
    for archivo in sorted(archivos):
        nombre, ext = os.path.splitext(archivo)
        if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            continue
        im = Image.open(os.path.join(carpeta, archivo))
        if im.mode not in ("RGB", "L"):  # JPEG no admite transparencia ni paleta; las demás quedan como vienen
            im = im.convert("RGB")
        if im.width > ANCHO:  # las más chicas quedan como vienen: no se agrandan
            im = im.resize((ANCHO, round(im.height * ANCHO / im.width)), Image.LANCZOS)
        webp, jpg = os.path.join(destino, f"{nombre}.webp"), os.path.join(destino, f"{nombre}.jpg")
        im.save(webp, "WEBP", quality=82, method=6)
        im.save(jpg, "JPEG", quality=85, optimize=True, progressive=True)
        print(f"{os.path.relpath(os.path.join(carpeta, nombre), ORIG)}: {im.size[0]}×{im.size[1]} → "
              f"webp {os.path.getsize(webp) // 1024} KB, jpg {os.path.getsize(jpg) // 1024} KB")
