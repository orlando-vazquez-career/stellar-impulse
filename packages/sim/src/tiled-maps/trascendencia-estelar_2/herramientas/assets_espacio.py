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
EXTERNOS = KIT / 'assets-externos' / 'sprites'
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


def gigante_anillado(planeta: str = 'planeta_05', width=640, height=400) -> Image.Image:
    """Gigante gaseoso con anillos: medio anillo pasa por detrás del planeta y medio por delante."""
    globe = Image.open(IMG / f'{planeta}.png').convert('RGBA').resize((250, 250), Image.LANCZOS)
    ring = Image.new('RGBA', (width * 2, height * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ring)
    cx, cy = width, height
    for step in range(46):  # bandas concéntricas, con un hueco oscuro a media anchura
        rx = 330 + step * 6.2
        gap = 20 <= step <= 23
        tone = (232 - step * 2, 206 - step, 170 + step, 0 if gap else 150 - abs(step - 16) * 3)
        draw.ellipse([cx - rx, cy - rx * 0.26, cx + rx, cy + rx * 0.26], outline=tone, width=7)
    ring = ring.resize((width, height), Image.LANCZOS)
    half = Image.new('L', (width, height), 0)
    ImageDraw.Draw(half).rectangle([0, 0, width, height // 2], fill=255)
    back, front = ring.copy(), ring.copy()
    back.putalpha(Image.composite(ring.getchannel('A'), Image.new('L', ring.size, 0), half))
    front.putalpha(Image.composite(Image.new('L', ring.size, 0), ring.getchannel('A'), half))
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(back)
    canvas.alpha_composite(globe, ((width - globe.width) // 2, (height - globe.height) // 2))
    canvas.alpha_composite(front)
    return apagar_bordes(canvas.rotate(-16, Image.BICUBIC))


def sol_lejano(size=288) -> Image.Image:
    """Estrella gigante: núcleo blanco, corona anaranjada y rayos desiguales."""
    rng = np.random.default_rng(21)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    dx, dy = xs - size / 2, ys - size / 2
    radius, angle = np.hypot(dx, dy) / (size / 2), np.arctan2(dy, dx)
    rays = sum(rng.uniform(0.2, 0.5) * np.cos(angle * count + rng.uniform(0, math.tau)) for count in (5, 9, 14, 23))
    corona = np.clip(1 - radius / (0.62 + 0.1 * rays), 0, 1) ** 1.6
    core = np.clip(1 - radius / 0.2, 0, 1) ** 0.5
    rgb = np.stack([255 * np.ones_like(core), 150 + 105 * np.maximum(core, corona ** 2), 60 + 195 * core], axis=2)
    alpha = np.clip(corona * 0.85 + core, 0, 1) * 250
    return apagar_bordes(Image.fromarray(np.concatenate([rgb, alpha[..., None]], axis=2).astype(np.uint8), 'RGBA'))


def cinturon_lejano(width=720, height=240) -> Image.Image:
    """Cinturón de asteroides visto de lejos: un arco de piedras pequeñas sobre una bruma de polvo."""
    rng = random.Random(33)
    image, draw = lienzo(width, height)
    haze = Image.new('RGBA', image.size, (0, 0, 0, 0))
    mist = ImageDraw.Draw(haze)
    for _ in range(420):
        t = rng.uniform(0.04, 0.96)
        x = width * t + rng.gauss(0, 5)
        y = height * (0.78 - 0.5 * math.sin(t * math.pi)) + rng.gauss(0, 9 + 9 * math.sin(t * math.pi))
        size = rng.choice([1.2, 1.5, 1.8, 2.4, 3.2, 4.6])
        if rng.random() < 0.3:
            mist.ellipse([(x - 14) * SS, (y - 7) * SS, (x + 14) * SS, (y + 7) * SS], fill=(120, 132, 170, 16))
        shade = rng.randint(96, 168)
        rock = [(x + math.cos(a) * size * rng.uniform(0.6, 1.1), y + math.sin(a) * size * 0.8 * rng.uniform(0.6, 1.1))
                for a in [side / 6 * math.tau for side in range(6)]]
        draw.polygon([(px * SS, py * SS) for px, py in rock], fill=(shade, shade - 8, shade + 14, 205))
        draw.line([(rock[4][0] * SS, rock[4][1] * SS), (rock[5][0] * SS, rock[5][1] * SS)], fill=(225, 228, 240, 170), width=max(1, SS // 2))
    return apagar_bordes(reducir(Image.alpha_composite(haze.filter(ImageFilter.GaussianBlur(SS * 5)), image)))


def luna_rota(size=256) -> Image.Image:
    """Luna partida: dos mitades que se separan, con el interior al rojo y esquirlas entre ellas."""
    rng = random.Random(57)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    r = 86
    dx, dy = (xs - size / 2) / r, (ys - size / 2) / r
    inside = dx * dx + dy * dy <= 1
    light = np.clip(0.34 + 0.66 * (-0.55 * dx - 0.6 * dy + 0.58 * np.sqrt(np.clip(1 - dx * dx - dy * dy, 0, 1))), 0.14, 1)
    for _ in range(16):  # cráteres: un hoyo oscuro con el borde claro hacia la luz
        cx, cy, cr = rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), rng.uniform(0.06, 0.2)
        d = np.hypot(dx - cx, dy - cy) / cr
        light = light * np.where(d < 1, 0.78, 1) + np.where((d >= 0.85) & (d < 1.15), 0.07, 0)
    rgb = np.stack([150 * light, 156 * light, 176 * light], axis=2)
    moon = Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), (inside * 255)[..., None]], axis=2).astype(np.uint8), 'RGBA')
    # Grieta en zigzag de arriba abajo: a su izquierda una mitad, a su derecha la otra.
    crack = [(size * 0.5 + rng.uniform(-16, 16) + (y - size / 2) * 0.22, y) for y in range(0, size + 1, 16)]
    left = Image.new('L', (size, size), 0)
    ImageDraw.Draw(left).polygon([(0, 0), *crack, (0, size)], fill=255)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow = ImageDraw.Draw(canvas)
    for x, y in crack[3:-3]:  # el interior fundido asoma por la grieta
        glow.ellipse([x - 15, y - 13, x + 15, y + 13], fill=(255, 120, 40, 150))
    canvas = canvas.filter(ImageFilter.GaussianBlur(7))
    for mask, shift, turn in ((left, (-13, 5), 4), (Image.eval(left, lambda v: 255 - v), (15, -7), -5)):
        half = moon.copy()
        half.putalpha(Image.composite(moon.getchannel('A'), Image.new('L', moon.size, 0), mask))
        canvas.alpha_composite(half.rotate(turn, Image.BICUBIC, translate=shift))
    draw = ImageDraw.Draw(canvas)
    for _ in range(22):  # esquirlas que se alejan de la grieta
        x, y = rng.choice(crack[2:-2])
        x, y, s = x + rng.uniform(-30, 30), y + rng.uniform(-10, 10), rng.uniform(1.5, 6)
        shade = rng.randint(90, 170)
        draw.polygon([(x - s, y), (x, y - s * 0.8), (x + s, y + s * 0.3), (x + s * 0.2, y + s)], fill=(shade, shade + 4, shade + 22, 255))
    return apagar_bordes(canvas)


# ---------------------------------------------------------------- ruinas sobre la plataforma
def satelite_destruido(source: str, seed: int, width=176, height=128) -> Image.Image:
    """Satélite estrellado contra la plataforma: partido en dos, quemado y con sus restos alrededor."""
    rng = random.Random(seed)
    art = Image.open(EXTERNOS / f'{source}.png').convert('RGBA')
    art.thumbnail((150, 104), Image.LANCZOS)
    alpha = art.getchannel('A')
    burnt = ImageEnhance.Brightness(ImageEnhance.Color(art.convert('RGB')).enhance(0.5)).enhance(0.6)
    art = Image.merge('RGBA', (*burnt.split(), alpha))
    cut = art.width * rng.uniform(0.44, 0.56)
    edge = [(cut + rng.uniform(-9, 9), y) for y in range(0, art.height + 8, 8)]
    left = Image.new('L', art.size, 0)
    ImageDraw.Draw(left).polygon([(0, 0), *edge, (0, art.height)], fill=255)
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse([14, height - 44, width - 14, height - 4], fill=(4, 6, 12, 150))
    canvas = canvas.filter(ImageFilter.GaussianBlur(5))
    draw = ImageDraw.Draw(canvas)
    for _ in range(5):  # manchas de quemado en el suelo
        x, y, s = rng.uniform(30, width - 30), rng.uniform(height - 40, height - 12), rng.uniform(8, 18)
        draw.ellipse([x - s, y - s * 0.45, x + s, y + s * 0.45], fill=(8, 8, 12, 120))
    # Cada mitad cae hacia su lado; aplastadas, quedan tumbadas sobre la plataforma.
    for mask, turn, at in ((left, rng.uniform(10, 18), (4, 22)), (Image.eval(left, lambda v: 255 - v), -rng.uniform(16, 26), (30, 34))):
        piece = art.copy()
        piece.putalpha(Image.composite(alpha, Image.new('L', art.size, 0), mask))
        piece = piece.rotate(turn, Image.BICUBIC, expand=True)
        piece = piece.resize((piece.width, round(piece.height * 0.8)), Image.LANCZOS)
        canvas.alpha_composite(piece, (at[0], min(at[1], height - piece.height - 2)))
    draw = ImageDraw.Draw(canvas)
    for _ in range(11):  # planchas sueltas
        x, y, s = rng.uniform(16, width - 16), rng.uniform(height - 44, height - 8), rng.uniform(2.5, 6)
        shade = rng.randint(46, 104)
        draw.polygon([(x - s, y), (x - s * 0.2, y - s * 0.6), (x + s, y - s * 0.1), (x + s * 0.3, y + s * 0.5)],
                     fill=(shade, shade + 8, shade + 26, 255), outline=(14, 18, 28, 255))
    for _ in range(7):  # brasas
        x, y = rng.uniform(40, width - 40), rng.uniform(height - 70, height - 20)
        draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 120, 30, 70))
        draw.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(255, 214, 120, 255))
    return canvas


def reactor_averiado(frame: int, frames=4, width=128, height=144) -> Image.Image:
    """Reactor de plataforma reventado: la carcasa abierta deja ver el núcleo, que late de un cuadro a otro."""
    rng = random.Random(77)
    pulse = 0.55 + 0.45 * math.sin(frame / frames * math.tau)
    image, draw = lienzo(width, height)
    acero, sombra, trazo = (92, 104, 128), (52, 60, 80), (14, 18, 30)
    ellipse = lambda cx, cy, rx, ry, **style: draw.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], **style)
    ellipse(64, 118, 54, 22, fill=(6, 8, 14, 150))
    ellipse(64, 112, 46, 19, fill=sombra, outline=trazo, width=SS)
    ellipse(64, 108, 38, 15, fill=acero, outline=trazo, width=SS)
    for angle in (0.5, 2.6, 4.4):  # tres contrafuertes alrededor de la base
        x, y = 64 + math.cos(angle) * 40, 110 + math.sin(angle) * 16
        poly(draw, [(x - 6, y), (x + 6, y), (x + 4, y - 20), (x - 4, y - 20)], sombra, trazo)
        poly(draw, [(x - 4, y - 20), (x + 4, y - 20), (x, y - 26)], (236, 168, 36), trazo)
    # Carcasa: un cilindro inclinado, con la mitad de arriba arrancada en dientes.
    lean = 9
    left = [(42, 106), (42 + lean * 0.5, 72), (47 + lean * 0.5, 62), (44 + lean, 50), (52 + lean, 44)]
    right = [(86 + lean, 40), (82 + lean, 54), (88 + lean * 0.6, 66), (86, 106)]
    poly(draw, [*left, (64 + lean, 52), *right, (64, 112)], sombra, trazo)
    poly(draw, [(64, 112), (64 + lean, 52), *right], acero, trazo)
    poly(draw, [(44, 96), (64, 102), (64, 94), (44.5, 88)], (236, 168, 36), trazo)
    for _ in range(9):
        x, y = rng.uniform(46, 84), rng.uniform(70, 104)
        ellipse(x, y, 1, 1, fill=(190, 198, 214))
    # Núcleo: una barra de plasma que asoma por la brecha, y su resplandor.
    core, glow = (120, 240, 255), Image.new('RGBA', image.size, (0, 0, 0, 0))
    halo = ImageDraw.Draw(glow)
    halo.ellipse([(72 - 30) * SS, (40 - 30) * SS, (72 + 30) * SS, (40 + 30) * SS], fill=core + (int(120 * pulse),))
    halo.polygon([(p[0] * SS, p[1] * SS) for p in [(58, 76), (70, 64), (66, 84), (76, 78), (68, 98)]], fill=core + (int(200 * pulse),))
    image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(SS * 6)))
    draw = ImageDraw.Draw(image)
    poly(draw, [(66, 58), (78, 56), (76, 30), (70, 24), (66, 32)], core + (255,), (20, 80, 120))
    poly(draw, [(70, 54), (74, 53), (73, 34), (70, 30)], (236, 254, 255, 255))
    draw.line([(p[0] * SS, p[1] * SS) for p in [(58, 78), (66, 70), (63, 84), (72, 80), (67, 96)]], fill=core + (int(140 + 115 * pulse),), width=SS * 2)
    for bolt in range(2):  # arcos que saltan del núcleo a la carcasa
        spark = random.Random(frame * 7 + bolt)
        x, y, points = 72, 36, [(72, 36)]
        for _ in range(4):
            x, y = x + spark.uniform(-12, 12), y + spark.uniform(-3, 9)
            points.append((x, y))
        draw.line([(px * SS, py * SS) for px, py in points], fill=(226, 252, 255, 230), width=SS)
    return reducir(image)


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
    gigante_anillado().save(IMG / 'gigante_anillado.png')
    sol_lejano().save(IMG / 'sol_lejano.png')
    cinturon_lejano().save(IMG / 'cinturon_lejano.png')
    luna_rota().save(IMG / 'luna_rota.png')
    names = [*planets, *far, 'nube_violeta', 'nube_azul', 'nube_rosa', 'galaxia', 'gigante_anillado', 'sol_lejano', 'cinturon_lejano', 'luna_rota']
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
    satelite_destruido('deco_satelite_2', 5).save(IMG / 'satelite_destruido_1.png')
    satelite_destruido('deco_satelite_frontal', 12).save(IMG / 'satelite_destruido_2.png')
    for frame in range(4):
        reactor_averiado(frame).save(IMG / f'reactor_averiado_{frame + 1}.png')
    breakable = '<property name="destruible" type="bool" value="true"/>'
    ruins = [
        tile(0, 'barrera_hielo', props=breakable), tile(1, 'barrera_hielo_rota'), tile(2, 'barrera_chatarra', props=breakable),
        tile(3, 'cristal_gigante_1'), tile(4, 'cristal_gigante_2'), tile(5, 'satelite_destruido_1'), tile(6, 'satelite_destruido_2'),
    ]
    ruins += [tile(7 + step, f'reactor_averiado_{step + 1}', animation(7, 4, 140) if step == 0 else '') for step in range(4)]
    collection('destruibles', ruins, 'bottom')
    print(f'espacio.tsx: {len(tiles)} tiles ({len(planets)} planetas), hielo.tsx: {len(ROCAS)}, estrellas.tsx: {total}, destruibles.tsx: {len(ruins)}')


if __name__ == '__main__':
    main()
