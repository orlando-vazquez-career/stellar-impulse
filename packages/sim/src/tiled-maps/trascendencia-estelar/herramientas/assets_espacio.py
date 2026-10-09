#!/usr/bin/env python3
"""Fabrica el decorado espacial de Trascendencia Estelar y sus tilesets.

Escribe en `tilesets/img/`:
- hielo.png: ocho rocas de hielo para la capa `decoracion` (misma rejilla que asteroides.png).
- estrellas.png: cuatro estrellas que titilan (cuatro cuadros cada una) para la capa `fondo`.
- nube_*.png, galaxia.png, cometa_*.png, pulsar_*.png: fondo lejano, como objetos.
- barrera_*.png y cristal_gigante_*.png: obstáculos destruibles y nodos de las constelaciones de hielo.
- planeta_*.png y estacion_lejana_*.png: reescalados de los paquetes CC0 de Kenney (ver CREDITOS.md). Solo
  se rehacen si los originales están en `herramientas/fuentes/descargas/`; si no, se conservan los que hay.

Y los tilesets `hielo.tsx`, `estrellas.tsx`, `espacio.tsx` y `destruibles.tsx`.
Uso:  python herramientas/assets_espacio.py
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

KIT = Path(__file__).resolve().parent.parent
IMG = KIT / 'tilesets' / 'img'
DESCARGAS = Path(__file__).resolve().parent / 'fuentes' / 'descargas'
SS = 4  # se dibuja a 4× y se reduce: bordes suaves sin perder el trazo

# Paleta del hielo: de la cara en sombra a la arista más clara.
HIELO = {'sombra': (38, 84, 150), 'media': (92, 164, 222), 'luz': (160, 220, 250), 'brillo': (232, 250, 255),
         'trazo': (16, 36, 82), 'base': (44, 70, 116), 'nieve': (176, 214, 240)}
ROTO = {**HIELO, 'sombra': (52, 78, 120), 'media': (96, 132, 172), 'luz': (140, 172, 204), 'brillo': (190, 210, 228)}


def lienzo(width: int, height: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new('RGBA', (width * SS, height * SS), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def reducir(image: Image.Image) -> Image.Image:
    return image.resize((image.width // SS, image.height // SS), Image.LANCZOS)


def apagar_bordes(image: Image.Image) -> Image.Image:
    """Oscurece el color donde la imagen es transparente.

    Tiled, al escalar un objeto, pinta el color entero aunque el alfa sea bajo: un halo claro y casi
    transparente saldría como una mancha sólida. Con el color ya apagado, el halo se funde igual en cualquier motor.
    """
    pixels = np.asarray(image.convert('RGBA'), np.float32)
    pixels[..., :3] *= pixels[..., 3:4] / 255
    return Image.fromarray(pixels.astype(np.uint8), 'RGBA')


def poly(draw, points, fill, outline=None):
    draw.polygon([(x * SS, y * SS) for x, y in points], fill=fill)
    if outline:
        draw.line([(x * SS, y * SS) for x, y in [*points, points[0]]], fill=outline, width=SS, joint='curve')


def esquirla(draw, bx, by, alto, ancho, inclinacion, paleta=HIELO):
    """Un cristal: prisma de dos caras con punta facetada, apoyado en (bx, by)."""
    hx, hy = bx + inclinacion * 0.8, by - alto
    tip = (bx + inclinacion, by - alto - ancho * 1.5)
    bl, bm, br = (bx - ancho, by - ancho * 0.3), (bx, by), (bx + ancho, by - ancho * 0.3)
    sl, sm, sr = (hx - ancho, hy - ancho * 0.3), (hx, hy + ancho * 0.1), (hx + ancho, hy - ancho * 0.3)
    poly(draw, [bl, bm, sm, sl], paleta['sombra'], paleta['trazo'])
    poly(draw, [bm, br, sr, sm], paleta['media'], paleta['trazo'])
    poly(draw, [sl, sm, tip], paleta['luz'], paleta['trazo'])
    poly(draw, [sm, sr, tip], paleta['brillo'], paleta['trazo'])
    # Reflejo: una raya clara que baja por la cara iluminada.
    draw.line([((hx + ancho * 0.45) * SS, (hy + ancho * 0.5) * SS), ((bx + ancho * 0.45) * SS, (by - ancho * 1.2) * SS)],
              fill=paleta['brillo'] + (150,), width=max(1, SS // 2))


def base_helada(draw, cx, cy, rx, paleta=HIELO):
    ry = rx * 0.42
    draw.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=paleta['base'], outline=paleta['trazo'], width=SS)
    draw.ellipse([(cx - rx * 0.8) * SS, (cy - ry * 1.0) * SS, (cx + rx * 0.7) * SS, (cy + ry * 0.35) * SS], fill=paleta['nieve'])


def roca_de_hielo(esquirlas, rx, width=96, height=96, centro=(48, 84), paleta=HIELO, escala=1.0):
    image, draw = lienzo(width, height)
    base_helada(draw, centro[0], centro[1], rx * escala, paleta)
    for dx, dy, alto, ancho, inclinacion in sorted(esquirlas, key=lambda item: item[1]):
        esquirla(draw, centro[0] + dx * escala, centro[1] + dy * escala, alto * escala, ancho * escala, inclinacion * escala, paleta)
    return reducir(image)


# (dx, dy, alto, ancho, inclinación) respecto del punto de apoyo de la roca.
ROCAS = {
    'hielo_grande_1': ([(0, 0, 44, 10, 4), (-15, -2, 30, 8, -8), (15, -1, 33, 8, 9), (-6, 4, 18, 6, -3), (8, 5, 15, 5, 5)], 30),
    'hielo_grande_2': ([(-3, 0, 48, 9, -5), (12, 0, 38, 9, 8), (-17, 2, 22, 7, -10), (4, 5, 16, 6, 2)], 29),
    'hielo_grande_3': ([(2, 0, 40, 11, 0), (-13, 1, 33, 8, -6), (16, 2, 26, 7, 10), (-4, 6, 13, 5, -2), (10, 6, 12, 5, 4)], 30),
    'hielo_mediano_1': ([(0, 0, 26, 8, 2), (-10, 2, 17, 6, -6), (10, 2, 16, 6, 7)], 21),
    'hielo_mediano_2': ([(-3, 0, 23, 7, -4), (8, 1, 20, 7, 6)], 19),
    'hielo_mediano_3': ([(2, 1, 22, 8, 3), (-9, 3, 14, 5, -5), (11, 4, 11, 4, 6)], 20),
    'hielo_chico_1': ([(0, 2, 12, 5, 1), (-7, 4, 8, 4, -4), (7, 4, 7, 3, 4)], 13),
    'hielo_chico_2': ([(-1, 3, 10, 4, -2), (7, 4, 8, 3, 3)], 11),
}
GIGANTE_1 = [(0, 0, 44, 10, 3), (-16, -3, 34, 9, -9), (17, -2, 36, 9, 10), (-28, 2, 20, 7, -12), (29, 3, 18, 6, 12),
             (-8, 6, 20, 7, -3), (10, 7, 17, 6, 5), (-2, -8, 30, 8, 0)]
GIGANTE_2 = [(-4, 0, 50, 9, -6), (13, -1, 40, 10, 9), (-20, 2, 28, 8, -11), (25, 4, 22, 7, 11), (2, 7, 18, 7, 1),
             (-12, 8, 12, 5, -5), (16, 9, 10, 4, 6)]
MURO = [(-46, 0, 26, 8, -6), (-32, -3, 38, 9, -3), (-18, 2, 30, 8, 2), (-4, -2, 46, 10, 0), (11, 2, 34, 9, 3),
        (25, -3, 40, 9, 5), (40, 1, 26, 8, 8), (-26, 8, 14, 6, -4), (-8, 9, 16, 6, 1), (18, 9, 13, 5, 4), (34, 8, 12, 5, 6)]
MURO_ROTO = [(-44, 1, 12, 8, -8), (-30, -2, 16, 9, -2), (-14, 3, 10, 8, 4), (2, -1, 20, 10, -3), (18, 3, 12, 8, 6),
             (34, -1, 15, 8, 3), (-22, 9, 7, 5, -5), (10, 9, 8, 5, 3)]


def hoja_de_hielo() -> Image.Image:
    sheet = Image.new('RGBA', (96 * len(ROCAS), 96), (0, 0, 0, 0))
    for index, (shards, rx) in enumerate(ROCAS.values()):
        sheet.paste(roca_de_hielo(shards, rx), (index * 96, 0))
    return sheet


def barrera_chatarra() -> Image.Image:
    """Montón de planchas y vigas soldadas: se puede derribar a tiros."""
    rng = random.Random(41)
    image, draw = lienzo(176, 136)
    draw.ellipse([14 * SS, 96 * SS, 162 * SS, 132 * SS], fill=(30, 34, 46), outline=(12, 14, 22), width=SS)
    acero = [(72, 82, 100), (98, 110, 130), (126, 138, 156), (54, 62, 78)]
    for step in range(9):
        cx = 30 + step * 14 + rng.uniform(-4, 4)
        top = 52 + rng.uniform(-20, 12)
        width, lean = rng.uniform(16, 26), rng.uniform(-9, 9)
        foot = 108 + rng.uniform(-6, 8)
        plate = [(cx - width / 2, foot), (cx + width / 2, foot - width * 0.25), (cx + width / 2 + lean, top - width * 0.25), (cx - width / 2 + lean, top)]
        poly(draw, plate, acero[step % len(acero)], (16, 20, 30))
        if step % 3 == 0:  # franja de aviso
            band = [(plate[3][0], plate[3][1] + 10), (plate[2][0], plate[2][1] + 10), (plate[2][0], plate[2][1] + 17), (plate[3][0], plate[3][1] + 17)]
            poly(draw, band, (236, 168, 36), (16, 20, 30))
        for _ in range(3):
            rx, ry = cx + rng.uniform(-width / 3, width / 3), rng.uniform(top + 8, foot - 8)
            draw.ellipse([(rx - 1) * SS, (ry - 1) * SS, (rx + 1) * SS, (ry + 1) * SS], fill=(190, 198, 210))
    for (x1, y1), (x2, y2) in [((22, 104), (150, 58)), ((30, 60), (154, 106))]:  # dos vigas cruzadas
        draw.line([(x1 * SS, y1 * SS), (x2 * SS, y2 * SS)], fill=(16, 20, 30), width=9 * SS)
        draw.line([(x1 * SS, y1 * SS), (x2 * SS, y2 * SS)], fill=(150, 108, 60), width=6 * SS)
    draw.ellipse([82 * SS, 74 * SS, 94 * SS, 86 * SS], fill=(255, 70, 60), outline=(60, 10, 10), width=SS)
    draw.ellipse([85 * SS, 76 * SS, 89 * SS, 80 * SS], fill=(255, 210, 200))
    return reducir(image)


# ---------------------------------------------------------------- estrellas
ESTRELLAS = [((255, 255, 255), (20, 9), 1.0), ((170, 214, 255), (44, 21), 1.5), ((255, 232, 150), (30, 17), 1.25), ((255, 176, 224), (12, 22), 0.9)]
BRILLOS = [0.45, 0.75, 1.0, 0.7]


def hoja_de_estrellas() -> Image.Image:
    sheet = Image.new('RGBA', (64 * len(ESTRELLAS) * len(BRILLOS), 32), (0, 0, 0, 0))
    for star, (color, (cx, cy), size) in enumerate(ESTRELLAS):
        for frame, glow in enumerate(BRILLOS):
            image, draw = lienzo(64, 32)
            arm = (2.5 + 4.5 * glow) * size
            for dx, dy in ((arm, 0), (0, arm * 0.8)):
                draw.line([((cx - dx) * SS, (cy - dy) * SS), ((cx + dx) * SS, (cy + dy) * SS)], fill=color + (int(170 * glow),), width=SS)
            radius = (0.9 + 0.9 * glow) * size
            draw.ellipse([(cx - radius) * SS, (cy - radius) * SS, (cx + radius) * SS, (cy + radius) * SS], fill=color + (int(120 + 135 * glow),))
            halo = image.filter(ImageFilter.GaussianBlur(SS * 1.6))
            sheet.paste(reducir(Image.alpha_composite(halo, image)), ((star * len(BRILLOS) + frame) * 64, 0))
    return sheet


# ---------------------------------------------------------------- fondo lejano
def nube(seed: int, inner: tuple[int, int, int], outer: tuple[int, int, int], width=640, height=360) -> Image.Image:
    """Nube de gas: manchas gaussianas sumadas, casi transparente para no tapar el mapa."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    density = np.zeros((height, width), np.float32)
    for _ in range(22):
        cx, cy = rng.normal(width / 2, width / 5.5), rng.normal(height / 2, height / 6.5)
        sx, sy = rng.uniform(width / 14, width / 5), rng.uniform(height / 12, height / 5)
        density += rng.uniform(0.3, 1.0) * np.exp(-(((xs - cx) / sx) ** 2 + ((ys - cy) / sy) ** 2))
    density /= density.max()
    edge = np.clip(1 - (((xs - width / 2) / (width / 2)) ** 2 + ((ys - height / 2) / (height / 2)) ** 2), 0, 1)
    density *= edge
    mix = np.clip(density * 1.3, 0, 1)[..., None]
    rgb = np.array(outer, np.float32) * (1 - mix) + np.array(inner, np.float32) * mix
    alpha = (np.clip(density, 0, 1) ** 0.75 * 205)[..., None]
    return apagar_bordes(Image.fromarray(np.concatenate([rgb, alpha], axis=2).astype(np.uint8), 'RGBA'))


def galaxia(width=320, height=200) -> Image.Image:
    rng = np.random.default_rng(9)
    canvas = np.zeros((height * 2, width * 2), np.float32)
    for arm in range(2):
        for _ in range(9000):
            t = rng.uniform(0, 1) ** 0.7
            angle = arm * math.pi + t * 4.2 + rng.normal(0, 0.16)
            radius = 8 + t * width * 0.86 + rng.normal(0, 7)
            x, y = int(width + radius * math.cos(angle)), int(height + radius * math.sin(angle) * 0.55)
            if 0 <= x < width * 2 and 0 <= y < height * 2:
                canvas[y, x] += 1 - t * 0.6
    arms = Image.fromarray(np.clip(canvas * 60, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3.2)).resize((width, height), Image.LANCZOS)
    glow = np.asarray(arms, np.float32) / 255
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    core = np.exp(-(((xs - width / 2) / 22) ** 2 + ((ys - height / 2) / 13) ** 2))
    light = np.clip(glow * 1.6 + core * 1.3, 0, 1)
    rgb = np.stack([120 + 135 * core + 60 * light, 150 + 70 * core + 70 * light, 255 - 60 * core], axis=2)
    return apagar_bordes(Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), (light ** 0.7 * 245)[..., None]], axis=2).astype(np.uint8), 'RGBA'))


def cometa(frame: int, frames=6, width=192, height=96) -> Image.Image:
    """Cometa que cruza hacia abajo a la izquierda; la cola respira de un cuadro a otro."""
    rng = random.Random(100 + frame)
    image, draw = lienzo(width, height)
    head = (38, 70)
    length = 132 + 10 * math.sin(frame / frames * math.tau)
    for step in range(60, 0, -1):
        t = step / 60
        x, y = head[0] + length * t, head[1] - length * 0.42 * t
        spread = 2 + 15 * t + rng.uniform(-1, 1)
        shade = int(210 * (1 - t) ** 1.5)
        draw.ellipse([(x - spread) * SS, (y - spread * 0.55) * SS, (x + spread) * SS, (y + spread * 0.55) * SS], fill=(120 + int(90 * (1 - t)), 200, 255, shade // 3))
    image = image.filter(ImageFilter.GaussianBlur(SS * 1.5))
    draw = ImageDraw.Draw(image)
    for _ in range(14):  # chispas sueltas en la cola
        t = rng.uniform(0.1, 0.9)
        x, y = head[0] + length * t + rng.uniform(-6, 6), head[1] - length * 0.42 * t + rng.uniform(-7, 7)
        draw.ellipse([(x - 0.8) * SS, (y - 0.8) * SS, (x + 0.8) * SS, (y + 0.8) * SS], fill=(230, 245, 255, 210))
    pulse = 1 + 0.18 * math.sin(frame / frames * math.tau)
    for radius, color in ((11 * pulse, (120, 200, 255, 90)), (6.5 * pulse, (200, 235, 255, 200)), (3.4, (255, 255, 255, 255))):
        draw.ellipse([(head[0] - radius) * SS, (head[1] - radius) * SS, (head[0] + radius) * SS, (head[1] + radius) * SS], fill=color)
    return apagar_bordes(reducir(image.filter(ImageFilter.GaussianBlur(SS * 0.5))))


def pulsar(frame: int, frames=6, size=128) -> Image.Image:
    """Estrella de neutrones: dos haces que giran y un anillo que late."""
    image, draw = lienzo(size, size)
    c = size / 2
    angle = frame / frames * math.pi
    for sign in (1, -1):
        dx, dy = math.cos(angle) * sign, math.sin(angle) * 0.5 * sign
        for width, color in ((9, (120, 150, 255, 70)), (4, (190, 215, 255, 170)), (1.5, (255, 255, 255, 235))):
            draw.line([(c * SS, c * SS), ((c + dx * 58) * SS, (c + dy * 58) * SS)], fill=color, width=int(width * SS))
    ring = 16 + 9 * (frame / frames)
    draw.ellipse([(c - ring) * SS, (c - ring * 0.5) * SS, (c + ring) * SS, (c + ring * 0.5) * SS], outline=(170, 200, 255, int(200 * (1 - frame / frames))), width=SS)
    image = Image.alpha_composite(image.filter(ImageFilter.GaussianBlur(SS * 2.2)), image)
    draw = ImageDraw.Draw(image)
    for radius, color in ((9, (150, 180, 255, 120)), (5, (220, 235, 255, 230)), (2.6, (255, 255, 255, 255))):
        draw.ellipse([(c - radius) * SS, (c - radius) * SS, (c + radius) * SS, (c + radius) * SS], fill=color)
    return apagar_bordes(reducir(image))


# ---------------------------------------------------------------- reescalados de Kenney (CC0)
def reescalar_kenney() -> None:
    planets = DESCARGAS / 'planets' / 'x' / 'Planets'
    if planets.is_dir():
        for index, source in enumerate(sorted(planets.glob('planet*.png'))):
            Image.open(source).convert('RGBA').resize((384, 384), Image.LANCZOS).save(IMG / f'planeta_{index:02d}.png')
    stations = DESCARGAS / 'extension' / 'x' / 'PNG' / 'Sprites X2' / 'Station'
    for index, name in enumerate(['spaceStation_017.png', 'spaceStation_026.png'], start=1):
        if not (stations / name).is_file():
            continue
        image = Image.open(stations / name).convert('RGBA')
        image = image.resize((round(image.width * 0.42), round(image.height * 0.42)), Image.LANCZOS)
        red, green, blue, alpha = ImageEnhance.Brightness(image).enhance(0.55).split()
        # Lejana: apagada, azulada y algo transparente, para que no compita con las islas.
        Image.merge('RGBA', (red.point(lambda v: v * 0.8), green.point(lambda v: v * 0.92), blue.point(lambda v: min(255, v * 1.25 + 14)),
                             alpha.point(lambda v: v * 0.86))).save(IMG / f'estacion_lejana_{index}.png')


# ---------------------------------------------------------------- tilesets
def tile(index: int, name: str, extra: str = '', props: str = '') -> str:
    width, height = Image.open(IMG / f'{name}.png').size
    return (f' <tile id="{index}"><properties><property name="nombre" type="string" value="{name}"/>{props}</properties>\n'
            f'  <image source="img/{name}.png" width="{width}" height="{height}"/>{extra}\n </tile>')


def animation(first: int, count: int, duration: int) -> str:
    frames = ''.join(f'<frame tileid="{first + step}" duration="{duration}"/>' for step in range(count))
    return f'\n  <animation>{frames}</animation>'


def collection(name: str, tiles: list[str], alignment: str) -> None:
    sizes = [Image.open(IMG / f'{line.split("img/")[1].split(".png")[0]}.png').size for line in tiles]
    (KIT / 'tilesets' / f'{name}.tsx').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<tileset version="1.10" tiledversion="1.12.2" name="{name}" tilewidth="{max(w for w, _ in sizes)}" '
        f'tileheight="{max(h for _, h in sizes)}" tilecount="{len(tiles)}" columns="0" objectalignment="{alignment}">\n'
        ' <grid orientation="orthogonal" width="1" height="1"/>\n' + '\n'.join(tiles) + '\n</tileset>\n', encoding='utf-8')


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    hoja_de_hielo().save(IMG / 'hielo.png')
    names = ''.join(f' <tile id="{i}"><properties><property name="nombre" type="string" value="{name}"/></properties></tile>\n' for i, name in enumerate(ROCAS))
    (KIT / 'tilesets' / 'hielo.tsx').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<tileset version="1.10" tiledversion="1.12.2" name="hielo" tilewidth="96" tileheight="96" tilecount="{len(ROCAS)}" columns="{len(ROCAS)}">\n'
        f' <tileoffset x="-16" y="0"/>\n <image source="img/hielo.png" width="{96 * len(ROCAS)}" height="96"/>\n{names}</tileset>\n', encoding='utf-8')

    hoja_de_estrellas().save(IMG / 'estrellas.png')
    frames = len(BRILLOS)
    twinkle = ''.join(
        f' <tile id="{star * frames}">\n  <animation>'
        + ''.join(f'<frame tileid="{star * frames + step}" duration="{260 + 70 * star}"/>' for step in [*range(frames), *range(frames - 2, 0, -1)])
        + '</animation>\n </tile>\n' for star in range(len(ESTRELLAS)))
    total = len(ESTRELLAS) * frames
    (KIT / 'tilesets' / 'estrellas.tsx').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<tileset version="1.10" tiledversion="1.12.2" name="estrellas" tilewidth="64" tileheight="32" tilecount="{total}" columns="{total}">\n'
        f' <image source="img/estrellas.png" width="{64 * total}" height="32"/>\n{twinkle}</tileset>\n', encoding='utf-8')

    nube(3, (196, 120, 255), (70, 60, 190)).save(IMG / 'nube_violeta.png')
    nube(5, (110, 220, 255), (30, 80, 170)).save(IMG / 'nube_azul.png')
    nube(8, (255, 150, 190), (150, 50, 150)).save(IMG / 'nube_rosa.png')
    galaxia().save(IMG / 'galaxia.png')
    for frame in range(6):
        cometa(frame).save(IMG / f'cometa_{frame + 1}.png')
        pulsar(frame).save(IMG / f'pulsar_{frame + 1}.png')
    reescalar_kenney()
    planets = sorted(path.stem for path in IMG.glob('planeta_*.png'))
    far = sorted(path.stem for path in IMG.glob('estacion_lejana_*.png'))
    names = [*planets, *far, 'nube_violeta', 'nube_azul', 'nube_rosa', 'galaxia']
    tiles = [tile(index, name) for index, name in enumerate(names)]
    for prefix, duration in (('cometa', 110), ('pulsar', 90)):
        first = len(tiles)
        tiles += [tile(first + step, f'{prefix}_{step + 1}', animation(first, 6, duration) if step == 0 else '') for step in range(6)]
    collection('espacio', tiles, 'center')

    roca_de_hielo(MURO, 60, 176, 136, (88, 114)).save(IMG / 'barrera_hielo.png')
    roca_de_hielo(MURO_ROTO, 60, 176, 136, (88, 114), ROTO).save(IMG / 'barrera_hielo_rota.png')
    barrera_chatarra().save(IMG / 'barrera_chatarra.png')
    roca_de_hielo(GIGANTE_1, 40, 208, 216, (104, 184), escala=2.1).save(IMG / 'cristal_gigante_1.png')
    roca_de_hielo(GIGANTE_2, 38, 208, 216, (104, 184), escala=2.1).save(IMG / 'cristal_gigante_2.png')
    breakable = '<property name="destruible" type="bool" value="true"/>'
    collection('destruibles', [
        tile(0, 'barrera_hielo', props=breakable), tile(1, 'barrera_hielo_rota'), tile(2, 'barrera_chatarra', props=breakable),
        tile(3, 'cristal_gigante_1'), tile(4, 'cristal_gigante_2'),
    ], 'bottom')
    print(f'espacio.tsx: {len(tiles)} tiles ({len(planets)} planetas), hielo.tsx: {len(ROCAS)}, estrellas.tsx: {total}, destruibles.tsx: 5')


if __name__ == '__main__':
    main()
