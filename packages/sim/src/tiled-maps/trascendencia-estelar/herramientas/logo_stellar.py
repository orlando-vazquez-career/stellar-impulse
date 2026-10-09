#!/usr/bin/env python3
"""Convierte el logo de Stellar en emblemas de suelo para el mapa isométrico.

Lee `herramientas/fuentes/logo_stellar.png` (disco negro con el símbolo en blanco) y escribe en
`tilesets/img/` un emblema por color, aplastado 2:1 como cualquier círculo pintado en el suelo, y el
tileset `tilesets/logo_stellar.tsx`. Uso:  python herramientas/logo_stellar.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

KIT = Path(__file__).resolve().parent.parent
FUENTE = Path(__file__).resolve().parent / 'fuentes' / 'logo_stellar.png'
SALIDA = KIT / 'tilesets' / 'img'
ANCHO, ALTO = 512, 256
# nombre → (color del símbolo, color del disco)
COLORES = {
    'logo_stellar': ((214, 240, 255), (16, 34, 62)),
    'logo_stellar_oro': ((253, 218, 36), (48, 36, 8)),
}


def emblema(simbolo: tuple[int, int, int], disco: tuple[int, int, int]) -> Image.Image:
    fuente = Image.open(FUENTE).convert('L')
    lado = fuente.width
    dentro = Image.new('L', fuente.size, 0)
    ImageDraw.Draw(dentro).ellipse((lado * 0.055, lado * 0.055, lado * 0.945, lado * 0.945), fill=255)
    trazo = ImageChops.multiply(fuente, dentro)  # el símbolo: lo blanco que queda dentro del disco
    anillo = Image.new('L', fuente.size, 0)
    ImageDraw.Draw(anillo).ellipse((lado * 0.055, lado * 0.055, lado * 0.945, lado * 0.945), outline=255, width=round(lado * 0.016))
    brillo = ImageChops.lighter(trazo, anillo)
    halo = brillo.filter(ImageFilter.GaussianBlur(lado * 0.02)).point(lambda value: value * 0.45)
    alfa = ImageChops.lighter(ImageChops.lighter(dentro.point(lambda value: value * 0.42), halo), brillo)
    color = Image.composite(Image.new('RGB', fuente.size, simbolo), Image.new('RGB', fuente.size, disco), ImageChops.lighter(brillo, halo))
    color.putalpha(alfa)
    return color.resize((ANCHO, ALTO), Image.LANCZOS)


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    tiles = []
    for index, (nombre, (simbolo, disco)) in enumerate(COLORES.items()):
        emblema(simbolo, disco).save(SALIDA / f'{nombre}.png')
        tiles.append(f' <tile id="{index}"><properties><property name="nombre" type="string" value="{nombre}"/></properties>\n'
                     f'  <image source="img/{nombre}.png" width="{ANCHO}" height="{ALTO}"/>\n </tile>')
    (KIT / 'tilesets' / 'logo_stellar.tsx').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<tileset version="1.10" tiledversion="1.12.2" name="logo_stellar" tilewidth="{ANCHO}" tileheight="{ALTO}" '
        f'tilecount="{len(COLORES)}" columns="0" objectalignment="center">\n'
        ' <grid orientation="orthogonal" width="1" height="1"/>\n' + '\n'.join(tiles) + '\n</tileset>\n', encoding='utf-8')


if __name__ == '__main__':
    main()
