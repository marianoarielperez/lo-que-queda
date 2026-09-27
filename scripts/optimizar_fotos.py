"""Genera las fotos de la web a partir de los originales (fotos-originales/, que no se publican).

Cada foto sale a 1000 px de ancho (se muestran a ~400 px; así alcanza para pantallas de alta densidad) en dos
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

for archivo in sorted(os.listdir(ORIG)):
    nombre, ext = os.path.splitext(archivo)
    if ext.lower() not in (".jpg", ".jpeg", ".png"):
        continue
    im = Image.open(os.path.join(ORIG, archivo))
    if im.width > ANCHO:
        im = im.resize((ANCHO, round(im.height * ANCHO / im.width)), Image.LANCZOS)
    im.save(os.path.join(DEST, f"{nombre}.webp"), "WEBP", quality=82, method=6)
    im.save(os.path.join(DEST, f"{nombre}.jpg"), "JPEG", quality=85, optimize=True, progressive=True)
    print(f"{nombre}: {im.size[0]}×{im.size[1]} → "
          f"webp {os.path.getsize(os.path.join(DEST, nombre + '.webp')) // 1024} KB, "
          f"jpg {os.path.getsize(os.path.join(DEST, nombre + '.jpg')) // 1024} KB")
