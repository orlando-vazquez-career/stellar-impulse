"""Dibujo procedural de los assets del mapa Espiral Estelar."""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TILE_WIDTH, TILE_HEIGHT = 64, 32
SUPERSAMPLE = 3
LIGHT = np.array([-0.55, -0.65, 0.52]) / np.linalg.norm([-0.55, -0.65, 0.52])


# ---------- utilidades ----------

def to_image(rgb, alpha):
    """Convierte arrays float (0-1) a imagen RGBA reducida con antialiasing."""
    data = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)[..., None]]) * 255
    image = Image.fromarray(data.astype(np.uint8), "RGBA")
    return image.resize((image.width // SUPERSAMPLE, image.height // SUPERSAMPLE), Image.LANCZOS)


def pixel_grid(width, height):
    ys, xs = np.mgrid[0:height * SUPERSAMPLE, 0:width * SUPERSAMPLE].astype(float)
    return xs / SUPERSAMPLE, ys / SUPERSAMPLE


def smooth_noise(width, height, blur, seed):
    rng = np.random.default_rng(seed)
    noise = Image.fromarray((rng.random((height, width)) * 255).astype(np.uint8))
    blurred = np.asarray(noise.filter(ImageFilter.GaussianBlur(blur)), dtype=float)
    blurred = (blurred - blurred.min()) / (np.ptp(blurred) or 1)
    return np.asarray(Image.fromarray((blurred * 255).astype(np.uint8)).resize(
        (width * SUPERSAMPLE, height * SUPERSAMPLE), Image.BICUBIC), dtype=float) / 255


def diamond_distance(xs, ys):
    """0 en el centro del rombo y 1 en su borde."""
    return np.abs(xs - TILE_WIDTH / 2) / (TILE_WIDTH / 2) + np.abs(ys - TILE_HEIGHT / 2) / (TILE_HEIGHT / 2)


def diamond_mask(xs, ys):
    return diamond_distance(xs, ys) <= 1.06


def fade_to_edge(values, xs, ys, edge_value):
    """Lleva los valores a una constante en el borde para que los tiles empalmen sin costuras."""
    blend = np.clip((diamond_distance(xs, ys) - 0.55) / 0.45, 0, 1) ** 2
    return values * (1 - blend) + edge_value * blend


def color(*rgb):
    return np.array(rgb, dtype=float) / 255


def radial_glow(xs, ys, center, radius):
    distance = np.hypot(xs - center[0], ys - center[1]) / radius
    return np.clip(1 - distance, 0, 1) ** 2


# ---------- suelo ----------

def draw_stars(rgb, xs, ys, seed, count):
    rng = random.Random(seed)
    for _ in range(count):
        cx, cy = rng.uniform(14, 50), rng.uniform(7, 25)
        brightness = rng.uniform(0.4, 1.0)
        size = rng.uniform(0.35, 0.8) if rng.random() < 0.85 else 1.3
        rgb += radial_glow(xs, ys, (cx, cy), size * 1.6)[..., None] * color(225, 232, 255) * brightness


def space_tile(seed):
    xs, ys = pixel_grid(TILE_WIDTH, TILE_HEIGHT)
    dust = smooth_noise(TILE_WIDTH, TILE_HEIGHT, 6, seed)
    rgb = color(9, 12, 26) + dust[..., None] * color(22, 18, 44)
    draw_stars(rgb, xs, ys, seed, 7)
    return to_image(rgb, diamond_mask(xs, ys).astype(float))


def nebula_tile(seed):
    xs, ys = pixel_grid(TILE_WIDTH, TILE_HEIGHT)
    base = np.asarray(space_tile(seed).resize((TILE_WIDTH * SUPERSAMPLE, TILE_HEIGHT * SUPERSAMPLE)),
                      dtype=float)[..., :3] / 255
    clouds = fade_to_edge(0.6 + 0.22 * smooth_noise(TILE_WIDTH, TILE_HEIGHT, 5, seed + 100), xs, ys, 0.71)
    warm = fade_to_edge(smooth_noise(TILE_WIDTH, TILE_HEIGHT, 7, seed + 200) ** 3, xs, ys, 0.1)
    tint = color(150, 60, 190) * (1 - warm[..., None]) + color(240, 140, 70) * warm[..., None]
    rgb = base * (1 - 0.7 * clouds[..., None]) + tint * clouds[..., None] * 0.85
    draw_stars(rgb, xs, ys, seed + 300, 3)
    return to_image(rgb, diamond_mask(xs, ys).astype(float))


def lane_tile(glow_color, seed):
    xs, ys = pixel_grid(TILE_WIDTH, TILE_HEIGHT)
    base = np.asarray(space_tile(seed).resize((TILE_WIDTH * SUPERSAMPLE, TILE_HEIGHT * SUPERSAMPLE)),
                      dtype=float)[..., :3] / 255
    streaks = smooth_noise(TILE_WIDTH, TILE_HEIGHT, 2, seed + 50) ** 2
    energy = fade_to_edge(0.35 + 0.65 * streaks, xs, ys, 0.5)
    rgb = base * 0.55 + glow_color * (energy * 0.7)[..., None]
    return to_image(rgb, diamond_mask(xs, ys).astype(float))


def walkway_tile(seed):
    """Placa metálica de los caminos principales, con luces de borde ocasionales."""
    xs, ys = pixel_grid(TILE_WIDTH, TILE_HEIGHT)
    distance = diamond_distance(xs, ys)
    grime = smooth_noise(TILE_WIDTH, TILE_HEIGHT, 2, seed + 70)
    shade = 0.82 + 0.18 * (1 - ys / TILE_HEIGHT) + 0.08 * (grime - 0.5)
    rgb = color(72, 84, 108) * shade[..., None]
    seam = np.clip(1 - np.abs(distance - 0.93) / 0.05, 0, 1) + np.clip(1 - np.abs(xs - 32) / 0.6, 0, 1) * 0.5
    rgb = rgb * (1 - 0.35 * np.clip(seam, 0, 1))[..., None]
    if seed % 2 == 0:
        for light in ((32, 4), (32, 28)):
            rgb += radial_glow(xs, ys, light, 2.2)[..., None] * color(120, 200, 255)
    return to_image(rgb, diamond_mask(xs, ys).astype(float))


def gate_tile(seed):
    image = space_tile(seed)
    draw = ImageDraw.Draw(image)
    rng = random.Random(seed)
    for _ in range(9):
        x, y, r = rng.uniform(18, 46), rng.uniform(10, 22), rng.uniform(0.8, 1.8)
        draw.ellipse((x - r, y - r * 0.8, x + r, y + r * 0.8), fill=(120, 104, 92, 255))
    outline = [(32, 3), (61, 16), (32, 29), (3, 16)]
    for start, end in zip(outline, outline[1:] + outline[:1]):
        draw.line([start, end], fill=(230, 170, 90, 200), width=1)
    return image


# ---------- estructuras ----------

def wormhole(size=112, openness=1.0, rotation=0.0, flash=0.0):
    """Vórtice del agujero de gusano. openness va de 0 (cerrado) a 1 (abierto)."""
    xs, ys = pixel_grid(size, size)
    cx, cy = size / 2, size - 34
    radius = max(size * 0.42 * openness, 0.5)
    u, v = xs - cx, (ys - cy) / 0.55
    r = np.hypot(u, v) / radius
    angle = np.arctan2(v, u) + rotation
    swirl = 0.5 + 0.5 * np.sin(5 * angle + 9 * np.log(r + 0.06))
    body = np.clip(1 - r, 0, 1) ** 0.5 * (r < 1)
    ring = np.clip(1 - np.abs(r - 0.95) / 0.1, 0, 1) * (1 + 2 * flash)
    spark = radial_glow(xs, ys, (cx, cy), size * 0.12) * flash
    intensity = np.clip(swirl * body * 0.9 + ring + spark, 0, 1)
    core = np.clip(1 - r / 0.22, 0, 1) * openness
    rgb = color(40, 200, 150) * intensity[..., None] + color(210, 255, 235) * (intensity ** 3)[..., None]
    rgb *= (1 - core)[..., None]
    alpha = np.clip(intensity * 1.2 + core, 0, 1) * ((r < 1.08) | (spark > 0.01))
    return to_image(rgb, alpha)


def shaded_polygon(draw, points, fill, outline=(14, 18, 26, 255)):
    draw.polygon([(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in points], fill=fill, outline=outline,
                 width=SUPERSAMPLE)


def glow_layer(size, center, radius, rgb, strength):
    xs, ys = pixel_grid(*size)
    glow = radial_glow(xs, ys, center, radius) * strength
    return to_image(np.broadcast_to(color(*rgb), glow.shape + (3,)), glow)


def finish_sprite(canvas):
    return canvas.resize((canvas.width // SUPERSAMPLE, canvas.height // SUPERSAMPLE), Image.LANCZOS)


def hex_platform(draw, cx, cy, rx, ry, height, top_color, side_color):
    top = [(cx + rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a))) for a in range(0, 360, 60)]
    for index in (0, 1, 2):
        a, b = top[index], top[index + 1]
        shade = tuple(int(c * (0.75 + 0.12 * index)) for c in side_color) + (255,)
        shaded_polygon(draw, [a, b, (b[0], b[1] + height), (a[0], a[1] + height)], shade)
    shaded_polygon(draw, top, top_color + (255,))
    return top


def pillar():
    width, height = 128, 184
    canvas = Image.new("RGBA", (width * SUPERSAMPLE, height * SUPERSAMPLE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    cx = width / 2
    hex_platform(draw, cx, 150, 56, 22, 10, (70, 80, 98), (52, 60, 76))
    hex_platform(draw, cx, 140, 40, 15, 8, (120, 40, 44), (90, 28, 32))
    body = [(cx - 30, 136), (cx - 30, 60), (cx + 30, 60), (cx + 30, 136)]
    shaded_polygon(draw, body[:2] + [(cx, 66), (cx, 142)], (88, 100, 122, 255))
    shaded_polygon(draw, [(cx, 66), (cx + 30, 60), (cx + 30, 136), (cx, 142)], (60, 70, 88, 255))
    for offset in (-20, -8, 8, 20):
        shaded_polygon(draw, [(cx + offset - 3, 72), (cx + offset + 3, 72), (cx + offset + 3, 128),
                              (cx + offset - 3, 128)], (120, 210, 255, 255), outline=(40, 120, 200, 255))
    for side in (-1, 1):
        x0 = cx + side * 30
        shaded_polygon(draw, [(x0, 92), (x0 + side * 7, 96), (x0 + side * 7, 128), (x0, 132)], (150, 44, 48, 255))
    hex_platform(draw, cx, 58, 36, 14, 10, (96, 108, 130), (60, 70, 88))
    hex_platform(draw, cx, 46, 24, 9, 6, (130, 220, 255), (60, 150, 210))
    sprite = finish_sprite(canvas)
    glow = glow_layer((width, height), (cx, 100), 46, (90, 190, 255), 0.55)
    glow.alpha_composite(sprite)
    return glow


def pronexo():
    width, height = 96, 112
    canvas = Image.new("RGBA", (width * SUPERSAMPLE, height * SUPERSAMPLE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    cx = width / 2
    hex_platform(draw, cx, 82, 36, 15, 8, (66, 74, 92), (46, 52, 66))
    hex_platform(draw, cx, 78, 22, 9, 4, (150, 50, 54), (100, 32, 36))
    crystal_left = [(cx, 22), (cx - 12, 46), (cx, 66)]
    crystal_right = [(cx, 22), (cx + 12, 46), (cx, 66)]
    shaded_polygon(draw, crystal_left, (255, 110, 110, 255), outline=(120, 20, 30, 255))
    shaded_polygon(draw, crystal_right, (190, 40, 50, 255), outline=(120, 20, 30, 255))
    sprite = finish_sprite(canvas)
    glow = glow_layer((width, height), (cx, 46), 34, (255, 70, 70), 0.6)
    glow.alpha_composite(sprite)
    return glow


def resource():
    width, height = 64, 72
    canvas = Image.new("RGBA", (width * SUPERSAMPLE, height * SUPERSAMPLE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    for dx, tip, base_width in ((-12, 26, 7), (12, 30, 7), (0, 14, 9), (-4, 34, 5)):
        x = width / 2 + dx
        left = [(x, tip), (x - base_width, 52), (x, 58)]
        right = [(x, tip), (x + base_width, 52), (x, 58)]
        shaded_polygon(draw, left, (255, 200, 90, 255), outline=(130, 70, 10, 255))
        shaded_polygon(draw, right, (230, 130, 30, 255), outline=(130, 70, 10, 255))
    sprite = finish_sprite(canvas)
    glow = glow_layer((width, height), (width / 2, 44), 30, (255, 160, 60), 0.55)
    glow.alpha_composite(sprite)
    return glow
