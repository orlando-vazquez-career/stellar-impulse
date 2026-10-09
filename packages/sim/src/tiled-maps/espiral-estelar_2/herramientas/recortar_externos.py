#!/usr/bin/env python3
"""Recorta las antenas y satélites de `Hoja_de_Sprites_Sci_Fi_Isométricos.png` en sprites limpios.

Los PNG sueltos de assets-externos/sprites venían mal cortados (con el texto de la etiqueta, trozos del
sprite vecino o cuadros desfasados). Este script vuelve a la hoja original: en cada caja se queda solo con
las piezas opacas grandes (el sprite), descarta el resto y recorta al borde.

Escribe en assets-externos/sprites/ los archivos `deco_*.png` y el tileset `tilesets/decorado_externo.tsx`.
Uso:  python herramientas/recortar_externos.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

KIT = Path(__file__).resolve().parent.parent
SPRITES = KIT / 'assets-externos' / 'sprites'
SHEET = SPRITES / 'Hoja_de_Sprites_Sci_Fi_Isométricos.png'
TSX = KIT / 'tilesets' / 'decorado_externo.tsx'
OPAQUE = 100      # alfa mínimo de un píxel del sprite
MIN_PIECE = 0.04  # una pieza menor que esta fracción del sprite es ruido y se descarta
PAD = 2

# Cajas en la hoja (izquierda, arriba, derecha, abajo), sin las etiquetas.
BOXES = {
    'deco_satelite_1': (15, 55, 425, 335),
    'deco_satelite_2': (455, 70, 800, 300),
    'deco_satelite_frontal': (815, 90, 1140, 310),
    'deco_satelite_dorsal': (1180, 90, 1515, 290),
    'deco_antena_larga_1': (20, 370, 130, 600),
    'deco_antena_larga_2': (155, 370, 250, 600),
    'deco_antena_larga_3': (290, 370, 390, 600),
    'deco_antena_larga_4': (420, 370, 525, 600),
    'deco_antena_plato_1': (565, 425, 665, 570),
    'deco_antena_plato_2': (700, 425, 805, 578),
    'deco_antena_plato_3': (855, 430, 950, 565),
    'deco_antena_multipolar_1': (1025, 380, 1280, 625),
    'deco_antena_multipolar_2': (1335, 400, 1500, 600),
}
# Secuencia de animación: rejilla de 4×2 cuadros.
GRID = (648, 668, 1517, 990)
FRAMES = 8
FRAME_MS = 125  # 8 fps, como indica atlas_externos.json


def clean(crop: Image.Image) -> Image.Image:
    """Solo las piezas opacas grandes, recortadas al borde y con el halo semitransparente borrado."""
    pixels = np.array(crop.convert('RGBA'))
    solid = pixels[:, :, 3] >= OPAQUE
    labels, count = ndimage.label(solid)
    if count == 0:
        raise SystemExit('Caja vacía: revisar BOXES')
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    keep = np.isin(labels, [index + 1 for index, size in enumerate(sizes) if size >= sizes.max() * MIN_PIECE])
    pixels[~keep] = 0
    rows, cols = np.where(keep)
    top, bottom = max(0, rows.min() - PAD), min(pixels.shape[0], rows.max() + PAD + 1)
    left, right = max(0, cols.min() - PAD), min(pixels.shape[1], cols.max() + PAD + 1)
    return Image.fromarray(pixels[top:bottom, left:right])


def frame_boxes():
    left, top, right, bottom = GRID
    width, height = (right - left) / 4, (bottom - top) / 2
    inset = 6  # fuera de las líneas de la rejilla
    for index in range(FRAMES):
        col, row = index % 4, index // 4
        yield (round(left + col * width + inset), round(top + row * height + inset),
               round(left + (col + 1) * width - inset), round(top + (row + 1) * height - inset))


def main():
    sheet = Image.open(SHEET)
    written: list[tuple[str, Image.Image]] = []
    for name, box in BOXES.items():
        written.append((name, clean(sheet.crop(box))))
    # Los cuadros comparten tamaño para que la animación no tiemble: se centran en el mayor.
    frames = [clean(sheet.crop(box)) for box in frame_boxes()]
    width, height = max(f.width for f in frames), max(f.height for f in frames)
    for index, frame in enumerate(frames):
        canvas = Image.new('RGBA', (width, height))
        canvas.alpha_composite(frame, ((width - frame.width) // 2, height - frame.height))
        written.append((f'deco_satelite_baliza_{index + 1}', canvas))
    for name, image in written:
        image.save(SPRITES / f'{name}.png')

    animated_first = len(BOXES)
    tiles = []
    for tile_id, (name, image) in enumerate(written):
        animation = ''
        if tile_id == animated_first:
            frames_xml = ''.join(f'\n   <frame tileid="{animated_first + i}" duration="{FRAME_MS}"/>' for i in range(FRAMES))
            animation = f'\n  <animation>{frames_xml}\n  </animation>'
        tiles.append(f' <tile id="{tile_id}">\n  <properties><property name="nombre" value="{name}"/></properties>\n'
                     f'  <image source="../assets-externos/sprites/{name}.png" width="{image.width}" height="{image.height}"/>{animation}\n </tile>')
    max_w = max(image.width for _, image in written)
    max_h = max(image.height for _, image in written)
    TSX.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<tileset version="1.10" tiledversion="1.12.2" name="decorado_externo" tilewidth="{max_w}" tileheight="{max_h}" '
        f'tilecount="{len(written)}" columns="0" objectalignment="bottom">\n <grid orientation="orthogonal" width="1" height="1"/>\n'
        + '\n'.join(tiles) + '\n</tileset>\n', encoding='utf-8')
    for name, image in written:
        print(f'{name}: {image.width}×{image.height}')


if __name__ == '__main__':
    main()
