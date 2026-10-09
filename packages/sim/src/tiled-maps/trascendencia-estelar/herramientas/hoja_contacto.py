#!/usr/bin/env python3
"""Hoja de contacto: junta imágenes en una sola para revisarlas de un vistazo.

Uso:  python herramientas/hoja_contacto.py salida.png carpeta_o_imagen [carpeta_o_imagen ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

CELDA, COLUMNAS, FONDO = 170, 8, (12, 14, 28)


def main() -> None:
    salida, *origenes = sys.argv[1:]
    archivos: list[Path] = []
    for origen in map(Path, origenes):
        archivos += sorted(origen.glob('*.png')) if origen.is_dir() else [origen]
    filas = (len(archivos) + COLUMNAS - 1) // COLUMNAS
    hoja = Image.new('RGB', (COLUMNAS * CELDA, filas * (CELDA + 14)), FONDO)
    lapiz = ImageDraw.Draw(hoja)
    for indice, archivo in enumerate(archivos):
        imagen = Image.open(archivo).convert('RGBA')
        original = imagen.size
        imagen.thumbnail((CELDA - 10, CELDA - 10))
        x, y = (indice % COLUMNAS) * CELDA, (indice // COLUMNAS) * (CELDA + 14)
        hoja.paste(imagen, (x + (CELDA - imagen.width) // 2, y + (CELDA - imagen.height) // 2), imagen)
        lapiz.text((x + 3, y + CELDA), f'{archivo.stem[:18]} {original[0]}x{original[1]}', fill=(190, 200, 220))
    hoja.save(salida)
    print(f'{len(archivos)} imágenes → {salida}')


if __name__ == '__main__':
    main()
