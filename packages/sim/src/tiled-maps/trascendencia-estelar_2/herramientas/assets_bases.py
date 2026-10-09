"""Bases 2.5D del jugador (azul) y del enemigo (rojo)."""
import math
from dataclasses import dataclass

from PIL import Image, ImageDraw

from assets import SUPERSAMPLE, finish_sprite, glow_layer

OUTLINE = (12, 16, 24, 255)
STEEL_DARK = (46, 52, 66)
STEEL = (74, 84, 104)
STEEL_LIGHT = (112, 124, 148)
GLASS = (160, 200, 235)


@dataclass(frozen=True)
class TeamPalette:
    emissive: tuple
    emissive_dark: tuple
    glow: tuple


PLAYER = TeamPalette(emissive=(80, 170, 255), emissive_dark=(30, 90, 170), glow=(70, 150, 255))
ENEMY = TeamPalette(emissive=(255, 90, 80), emissive_dark=(160, 30, 36), glow=(255, 70, 60))

CANVAS = (256, 248)
CENTER_X = CANVAS[0] / 2


class Painter:
    """Envuelve ImageDraw trabajando en coordenadas de sprite y escalando al supersampling."""

    def __init__(self, image):
        self.draw = ImageDraw.Draw(image)

    def polygon(self, points, fill, outline=OUTLINE):
        self.draw.polygon([(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in points], fill=_rgba(fill),
                          outline=outline, width=SUPERSAMPLE)

    def line(self, start, end, fill, width=1.0):
        self.draw.line([(start[0] * SUPERSAMPLE, start[1] * SUPERSAMPLE), (end[0] * SUPERSAMPLE, end[1] * SUPERSAMPLE)],
                       fill=_rgba(fill), width=max(1, round(width * SUPERSAMPLE)))

    def ellipse(self, box, fill, outline=OUTLINE):
        self.draw.ellipse([value * SUPERSAMPLE for value in box], fill=_rgba(fill), outline=outline, width=SUPERSAMPLE)

    def pieslice(self, box, start, end, fill):
        self.draw.pieslice([value * SUPERSAMPLE for value in box], start, end, fill=_rgba(fill),
                           outline=OUTLINE, width=SUPERSAMPLE)


def _rgba(fill):
    return fill if len(fill) == 4 else tuple(fill) + (255,)


def _scale(rgb, factor):
    return tuple(max(0, min(255, round(c * factor))) for c in rgb[:3])


def _lerp(a, b, t):
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t


def ring_points(cx, cy, rx, ry, sides, rotation=0.0):
    step = 360 / sides
    return [(cx + rx * math.cos(math.radians(rotation + i * step)), cy + ry * math.sin(math.radians(rotation + i * step)))
            for i in range(sides)]


def prism(painter, cx, cy, rx, ry, height, sides, top_color, side_color, windows=None, rotation=22.5):
    """Prisma de n lados visto en isométrico. Devuelve los puntos de la cara superior."""
    top = ring_points(cx, cy, rx, ry, sides, rotation)
    faces = [(a, b) for a, b in zip(top, top[1:] + top[:1]) if (a[1] + b[1]) / 2 > cy]
    for a, b in sorted(faces, key=lambda face: (face[0][1] + face[1][1]) / 2):
        light = 0.75 + 0.35 * (a[0] < cx and b[0] <= cx + 1)
        painter.polygon([a, b, (b[0], b[1] + height), (a[0], a[1] + height)], _scale(side_color, light))
        if windows:
            draw_windows(painter, a, b, height, windows)
    painter.polygon(top, top_color)
    return top


def draw_windows(painter, a, b, height, window_color):
    count = max(1, int(math.dist(a, b) // 9))
    for i in range(count):
        start = _lerp(a, b, (i + 0.3) / count)
        end = _lerp(a, b, (i + 0.7) / count)
        mid = height * 0.45
        painter.polygon([(start[0], start[1] + mid), (end[0], end[1] + mid),
                         (end[0], end[1] + mid + 2.5), (start[0], start[1] + mid + 2.5)], window_color, outline=None)


def draw_panel_lines(painter, top, cx, cy, color):
    for x, y in top[::2]:
        painter.line(_lerp((x, y), (cx, cy), 0.15), _lerp((x, y), (cx, cy), 0.55), color, 0.8)


def tower(painter, x, base_y, height, palette):
    painter.polygon([(x - 6, base_y), (x - 6, base_y - height), (x, base_y - height + 3), (x, base_y + 3)], STEEL_LIGHT)
    painter.polygon([(x, base_y + 3), (x, base_y - height + 3), (x + 6, base_y - height), (x + 6, base_y)], STEEL)
    for offset in range(8, height - 4, 9):
        painter.line((x - 5, base_y - offset), (x - 1, base_y - offset + 2), palette.emissive, 1.2)
    painter.ellipse((x - 7, base_y - height - 3, x + 7, base_y - height + 4), STEEL_LIGHT)
    painter.line((x, base_y - height), (x, base_y - height - 16), STEEL_LIGHT, 1.2)
    painter.ellipse((x - 2.2, base_y - height - 19, x + 2.2, base_y - height - 15), palette.emissive, outline=None)


def solar_arm(painter, start, direction):
    sx, sy = start
    end = (sx + 46 * direction, sy - 14)
    painter.line(start, end, STEEL_LIGHT, 2)
    panel = [(end[0] - 14, end[1] - 10), (end[0] + 14, end[1] - 4), (end[0] + 14, end[1] + 8), (end[0] - 14, end[1] + 2)]
    painter.polygon(panel, (40, 60, 110))
    for t in (0.33, 0.66):
        painter.line(_lerp(panel[0], panel[1], t), _lerp(panel[3], panel[2], t), (90, 120, 180), 0.8)
    painter.line(_lerp(panel[0], panel[3], 0.5), _lerp(panel[1], panel[2], 0.5), (90, 120, 180), 0.8)


def landing_pad(painter, cx, cy, palette):
    prism(painter, cx, cy, 20, 9, 4, 6, STEEL_DARK, STEEL_DARK)
    painter.ellipse((cx - 13, cy - 5.5, cx + 13, cy + 5.5), STEEL, outline=_rgba(palette.emissive))
    painter.line((cx - 5, cy - 2), (cx - 5, cy + 2), palette.emissive, 1.2)
    painter.line((cx + 5, cy - 2), (cx + 5, cy + 2), palette.emissive, 1.2)
    painter.line((cx - 5, cy), (cx + 5, cy), palette.emissive, 1.2)


def hangar_door(painter, palette):
    door = [(CENTER_X - 16, 168), (CENTER_X + 16, 168), (CENTER_X + 16, 178), (CENTER_X - 16, 178)]
    painter.polygon(door, (22, 26, 34))
    for i in range(1, 4):
        painter.line((CENTER_X - 15, 168 + i * 2.5), (CENTER_X + 15, 168 + i * 2.5), (50, 58, 72), 0.6)
    painter.line((CENTER_X - 16, 167), (CENTER_X + 16, 167), palette.emissive, 1.6)


def core(painter, palette):
    prism(painter, CENTER_X, 118, 34, 14, 26, 6, STEEL_LIGHT, STEEL)
    for offset in (-20, -7, 7, 20):
        painter.polygon([(CENTER_X + offset - 2, 128), (CENTER_X + offset + 2, 128),
                         (CENTER_X + offset + 2, 146), (CENTER_X + offset - 2, 146)], palette.emissive,
                        outline=_rgba(palette.emissive_dark))
    prism(painter, CENTER_X, 112, 30, 12, 6, 6, palette.emissive_dark, STEEL_DARK)
    painter.pieslice((CENTER_X - 26, 84, CENTER_X + 26, 132), 180, 360, GLASS)
    painter.ellipse((CENTER_X - 26, 103, CENTER_X + 26, 117), _scale(GLASS, 0.7))
    painter.ellipse((CENTER_X - 16, 90, CENTER_X - 4, 97), (240, 250, 255, 210), outline=None)
    painter.ellipse((CENTER_X - 8, 101, CENTER_X + 8, 108), palette.emissive, outline=None)


def base_sprite(palette):
    size = (CANVAS[0] * SUPERSAMPLE, CANVAS[1] * SUPERSAMPLE)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    painter = Painter(image)
    tower(painter, CENTER_X - 62, 140, 52, palette)
    tower(painter, CENTER_X + 62, 140, 52, palette)
    solar_arm(painter, (CENTER_X - 30, 120), -1)
    solar_arm(painter, (CENTER_X + 30, 120), 1)
    window_color = _scale(palette.emissive, 0.9)
    lower = prism(painter, CENTER_X, 172, 116, 48, 18, 8, STEEL_DARK, STEEL_DARK, windows=window_color)
    draw_panel_lines(painter, lower, CENTER_X, 172, (34, 40, 52))
    upper = prism(painter, CENTER_X, 152, 84, 35, 14, 8, STEEL, STEEL, windows=window_color)
    draw_panel_lines(painter, upper, CENTER_X, 152, (52, 60, 76))
    hangar_door(painter, palette)
    landing_pad(painter, CENTER_X - 84, 176, palette)
    landing_pad(painter, CENTER_X + 84, 176, palette)
    core(painter, palette)
    tower(painter, CENTER_X - 40, 196, 34, palette)
    tower(painter, CENTER_X + 40, 196, 34, palette)
    sprite = finish_sprite(image)
    glow = glow_layer(CANVAS, (CENTER_X, 120), 96, palette.glow, 0.45)
    glow.alpha_composite(sprite)
    return glow


def player_base():
    return base_sprite(PLAYER)


def enemy_base():
    return base_sprite(ENEMY)
