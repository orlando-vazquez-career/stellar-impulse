"""Plataformas elevadas, obstáculos espaciales, torre de vigilancia, dron y efectos del aviso de portales."""
import math
import random

import numpy as np
from PIL import Image

from assets import (
    SUPERSAMPLE, TILE_HEIGHT, TILE_WIDTH, color, finish_sprite, glow_layer, pixel_grid, radial_glow,
    smooth_noise, to_image,
)
from assets_bases import STEEL, STEEL_DARK, STEEL_LIGHT, Painter, prism

PLATFORM_HEIGHT = 16
DECK = (78, 90, 114)
LASER = (255, 70, 90)
CRYSTAL_LIGHT, CRYSTAL_DARK = (150, 240, 255), (40, 120, 200)


def new_canvas(width, height):
    return Image.new("RGBA", (width * SUPERSAMPLE, height * SUPERSAMPLE), (0, 0, 0, 0))


def with_glow(canvas, size, center, radius, rgb, strength):
    glow = glow_layer(size, center, radius, rgb, strength)
    glow.alpha_composite(finish_sprite(canvas))
    return glow


# ---------- suelo elevado ----------

def platform_tile(seed):
    """Cubierta metálica elevada: rombo arriba y caras laterales debajo, para que parezca un escalón."""
    width, height = TILE_WIDTH, TILE_HEIGHT + PLATFORM_HEIGHT
    canvas = new_canvas(width, height)
    painter = Painter(canvas)
    top = [(32, 0), (64, 16), (32, 32), (0, 16)]
    painter.polygon([(0, 16), (32, 32), (32, 48), (0, 32)], (58, 66, 84), outline=None)
    painter.polygon([(32, 32), (64, 16), (64, 32), (32, 48)], (40, 46, 60), outline=None)
    painter.polygon(top, DECK, outline=(30, 36, 48, 255))
    painter.polygon([(32, 5), (55, 16), (32, 27), (9, 16)], (86, 99, 124), outline=None)
    painter.line((0, 32), (32, 48), (90, 170, 255), 1)
    painter.line((32, 48), (64, 32), (90, 170, 255), 1)
    if seed % 3 == 0:
        painter.ellipse((30, 14, 34, 18), (120, 200, 255), outline=None)
    return finish_sprite(canvas)


def deep_space_tile(seed):
    """Espacio profundo: más oscuro y con menos estrellas, para dar sensación de altura distinta."""
    xs, ys = pixel_grid(TILE_WIDTH, TILE_HEIGHT)
    dust = smooth_noise(TILE_WIDTH, TILE_HEIGHT, 6, seed + 400)
    rgb = color(4, 5, 14) + dust[..., None] * color(10, 8, 26)
    rng = random.Random(seed)
    for _ in range(2):
        star = (rng.uniform(16, 48), rng.uniform(8, 24))
        rgb += radial_glow(xs, ys, star, 1.0)[..., None] * color(160, 170, 220)
    distance = np.abs(xs - 32) / 32 + np.abs(ys - 16) / 16
    return to_image(rgb, (distance <= 1.06).astype(float))


def elevation_tile(level):
    rgb = {0: (30, 40, 120), 1: (240, 220, 80)}[level]
    canvas = new_canvas(TILE_WIDTH, TILE_HEIGHT)
    Painter(canvas).polygon([(32, 0), (64, 16), (32, 32), (0, 16)], rgb, outline=(255, 255, 255, 120))
    return finish_sprite(canvas)


# ---------- obstáculos ----------

def station_ruin():
    """Anillo de estación partido con módulos sueltos."""
    size = (224, 176)
    canvas = new_canvas(*size)
    painter = Painter(canvas)
    cx, cy = 112, 112
    for start in (200, 20):
        arc = [(cx + 88 * math.cos(math.radians(a)), cy + 38 * math.sin(math.radians(a)) - 26)
               for a in range(start, start + 130, 10)]
        for a, b in zip(arc, arc[1:]):
            painter.polygon([a, b, (b[0], b[1] + 14), (a[0], a[1] + 14)], STEEL)
            painter.polygon([(a[0], a[1] - 4), (b[0], b[1] - 4), b, a], STEEL_LIGHT)
    prism(painter, cx, cy - 8, 30, 13, 20, 6, STEEL_LIGHT, STEEL, windows=(255, 160, 80))
    painter.line((cx - 30, cy - 8), (cx - 74, cy - 40), STEEL_LIGHT, 3)
    painter.line((cx + 30, cy - 8), (cx + 60, cy + 10), STEEL_LIGHT, 3)
    prism(painter, cx + 64, cy + 18, 14, 6, 10, 4, STEEL, STEEL_DARK)
    prism(painter, cx - 70, cy + 22, 12, 5, 8, 4, STEEL, STEEL_DARK)
    return with_glow(canvas, size, (cx, cy - 10), 46, (255, 140, 60), 0.25)


def satellite():
    size = (72, 72)
    canvas = new_canvas(*size)
    painter = Painter(canvas)
    for direction in (-1, 1):
        x0 = 36 + direction * 8
        panel = [(x0, 30), (x0 + direction * 24, 22), (x0 + direction * 24, 34), (x0, 42)]
        painter.polygon(panel, (40, 60, 120))
        painter.line(((panel[0][0] + panel[1][0]) / 2, 26), ((panel[3][0] + panel[2][0]) / 2, 38), (90, 120, 190), 0.8)
    prism(painter, 36, 34, 9, 5, 12, 6, STEEL_LIGHT, STEEL)
    painter.line((36, 30), (36, 12), STEEL_LIGHT, 1.2)
    painter.ellipse((32, 6, 40, 12), (200, 210, 230))
    return with_glow(canvas, size, (36, 9), 7, (255, 80, 80), 0.9)


def crystals():
    size = (96, 112)
    canvas = new_canvas(*size)
    painter = Painter(canvas)
    for dx, tip, half_width in ((-20, 40, 9), (18, 34, 8), (0, 10, 12), (-6, 52, 6), (26, 58, 5)):
        x = 48 + dx
        painter.polygon([(x, tip), (x - half_width, 82), (x, 92)], CRYSTAL_LIGHT, outline=(20, 70, 130, 255))
        painter.polygon([(x, tip), (x + half_width, 82), (x, 92)], CRYSTAL_DARK, outline=(20, 70, 130, 255))
    return with_glow(canvas, size, (48, 70), 44, (90, 200, 255), 0.55)


def laser_fence(axis):
    """Tramo de valla láser de una casilla. axis 'x' o 'y' según la dirección de la valla en la grilla."""
    size = (TILE_WIDTH, 64)
    canvas = new_canvas(*size)
    painter = Painter(canvas)
    ground_y = 48
    start, end = ((16, ground_y - 8), (48, ground_y + 8)) if axis == "x" else ((48, ground_y - 8), (16, ground_y + 8))
    for lift in (6, 14, 22):
        painter.line((start[0], start[1] - lift), (end[0], end[1] - lift), LASER, 1.6)
    for x, y in (start, end):
        painter.polygon([(x - 3, y), (x - 3, y - 28), (x + 3, y - 28), (x + 3, y)], STEEL_LIGHT)
        painter.ellipse((x - 3, y - 31, x + 3, y - 26), LASER, outline=None)
    middle = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 14)
    return with_glow(canvas, size, middle, 22, LASER, 0.45)


def watchtower():
    size = (80, 128)
    canvas = new_canvas(*size)
    painter = Painter(canvas)
    prism(painter, 40, 104, 26, 11, 8, 6, STEEL, STEEL_DARK)
    painter.polygon([(34, 100), (34, 40), (40, 43), (40, 103)], STEEL_LIGHT)
    painter.polygon([(40, 103), (40, 43), (46, 40), (46, 100)], STEEL)
    prism(painter, 40, 36, 16, 7, 8, 6, STEEL_LIGHT, STEEL)
    painter.ellipse((32, 18, 48, 30), (140, 255, 200))
    return with_glow(canvas, size, (40, 24), 26, (120, 255, 190), 0.6)


# ---------- dron neutral ----------

def drone():
    size = (40, 40)
    canvas = new_canvas(*size)
    painter = Painter(canvas)
    painter.ellipse((10, 14, 30, 26), STEEL_LIGHT)
    painter.ellipse((15, 15, 25, 21), (120, 200, 255), outline=None)
    for x in (6, 34):
        painter.line((20, 20), (x, 16), STEEL, 1.4)
        painter.ellipse((x - 4, 13, x + 4, 18), (90, 100, 120))
    return with_glow(canvas, size, (20, 18), 8, (120, 200, 255), 0.6)


def drone_shadow():
    xs, ys = pixel_grid(40, 20)
    alpha = np.clip(1 - np.hypot((xs - 20) / 12, (ys - 10) / 5), 0, 1) * 0.5
    return to_image(np.zeros(alpha.shape + (3,)), alpha)


# ---------- aviso de apertura de portales ----------

SHOCKWAVE_SIZE = 192
SHOCKWAVE_FRAMES = 10


def shockwave_frame(index):
    xs, ys = pixel_grid(SHOCKWAVE_SIZE, SHOCKWAVE_SIZE // 2)
    progress = index / (SHOCKWAVE_FRAMES - 1)
    radius = 0.15 + 0.85 * progress
    distance = np.hypot((xs - SHOCKWAVE_SIZE / 2) / (SHOCKWAVE_SIZE / 2), (ys - SHOCKWAVE_SIZE / 4) / (SHOCKWAVE_SIZE / 4))
    ring = np.clip(1 - np.abs(distance - radius) / 0.07, 0, 1) * (1 - progress) ** 0.8
    rgb = color(120, 255, 210) * (0.7 + 0.3 * ring[..., None]) + ring[..., None] * 0.3
    return to_image(rgb, ring)


def shockwave_sheet():
    frames = [shockwave_frame(i) for i in range(SHOCKWAVE_FRAMES)]
    sheet = Image.new("RGBA", (SHOCKWAVE_SIZE * SHOCKWAVE_FRAMES, SHOCKWAVE_SIZE // 2), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index * SHOCKWAVE_SIZE, 0), frame)
    return sheet


def stardust_particle():
    xs, ys = pixel_grid(12, 12)
    glow = radial_glow(xs, ys, (6, 6), 6)
    return to_image(np.broadcast_to(color(200, 240, 255), glow.shape + (3,)), glow)
