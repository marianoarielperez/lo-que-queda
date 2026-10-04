"""Arma public/favicon.ico (16, 32 y 48 px) desde public/favicon-64.png, que genera scripts/favicon.mjs.

El .ico es para los navegadores que no toman el SVG en la pestaña (Safari y los viejos). Después borra el PNG
intermedio. Necesita Pillow: pip install pillow
"""
from pathlib import Path

from PIL import Image

PUBLIC = Path(__file__).resolve().parent.parent / "public"
origen = PUBLIC / "favicon-64.png"
Image.open(origen).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
origen.unlink()
print("Listo: public/favicon.ico")
