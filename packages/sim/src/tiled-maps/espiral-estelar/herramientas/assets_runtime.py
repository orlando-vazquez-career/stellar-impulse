"""Assets que usa el juego en ejecución: animación del portal y niebla de guerra."""
import math

import numpy as np
from PIL import Image, ImageFilter

from assets import pixel_grid, radial_glow, to_image, wormhole

PORTAL_SIZE = 112
OPENING_FRAMES = 16
ACTIVE_FRAMES = 8
SWIRL_ARMS = 5
FOG_TEXTURE_SIZE = 256
VISION_BRUSH_SIZE = 128


def ease_out_back(t):
    overshoot = 1.6
    return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2


def opening_frame(index):
    progress = index / (OPENING_FRAMES - 1)
    openness = max(0.0, min(1.08, ease_out_back(progress)))
    flash = max(0.0, 1 - abs(progress - 0.12) / 0.12) + 0.6 * max(0.0, 1 - abs(progress - 0.75) / 0.12)
    return wormhole(PORTAL_SIZE, openness=max(openness, 0.02), rotation=progress * 3.0, flash=flash)


def active_frame(index):
    rotation = 3.0 + (2 * math.pi / SWIRL_ARMS) * index / ACTIVE_FRAMES
    return wormhole(PORTAL_SIZE, openness=1.0, rotation=rotation)


def frame_strip(frames):
    strip = Image.new("RGBA", (PORTAL_SIZE * len(frames), PORTAL_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.paste(frame, (index * PORTAL_SIZE, 0), frame)
    return strip


def portal_opening_sheet():
    return frame_strip([opening_frame(i) for i in range(OPENING_FRAMES)])


def portal_active_sheet():
    return frame_strip([active_frame(i) for i in range(ACTIVE_FRAMES)])


def tileable_noise(size, blur, seed):
    rng = np.random.default_rng(seed)
    tiled = np.tile(rng.random((size, size)), (3, 3))
    noise_image = Image.fromarray((tiled * 255).astype(np.uint8))
    blurred = np.asarray(noise_image.filter(ImageFilter.GaussianBlur(blur)), dtype=float)
    center = blurred[size:2 * size, size:2 * size]
    return (center - center.min()) / (np.ptp(center) or 1)


def fog_texture():
    """Textura repetible de niebla para las zonas no exploradas."""
    clouds = 0.6 * tileable_noise(FOG_TEXTURE_SIZE, 12, 1) + 0.4 * tileable_noise(FOG_TEXTURE_SIZE, 4, 2)
    rgb = np.dstack([0.03 + 0.07 * clouds, 0.04 + 0.08 * clouds, 0.08 + 0.12 * clouds])
    data = np.dstack([rgb, np.ones_like(clouds)]) * 255
    return Image.fromarray(data.astype(np.uint8), "RGBA")


VISION_BRUSH_HEIGHT = 128
BRUSH_GROUND_Y = 96


def vision_brush():
    """Pincel suave que borra la niebla de una casilla y de lo que sobresale encima (naves, estructuras)."""
    xs, ys = pixel_grid(VISION_BRUSH_SIZE, VISION_BRUSH_HEIGHT)
    half_width, half_height = VISION_BRUSH_SIZE / 2, VISION_BRUSH_SIZE / 4
    ground = np.hypot((xs - half_width) / half_width, (ys - BRUSH_GROUND_Y) / half_height)
    above = np.hypot((xs - half_width) / (half_width * 0.8), np.clip(BRUSH_GROUND_Y - ys, 0, None) / BRUSH_GROUND_Y)
    above = np.where(ys <= BRUSH_GROUND_Y, above, ground)
    alpha = np.clip(1.25 - np.minimum(ground, above), 0, 1) ** 1.5
    return to_image(np.ones(alpha.shape + (3,)), alpha)


RUNTIME_ASSETS = {
    "portal_apertura.png": portal_opening_sheet,
    "portal_activo.png": portal_active_sheet,
    "niebla.png": fog_texture,
    "pincel_vision.png": vision_brush,
}

RUNTIME_ATLAS = {
    "portal_apertura": {"image": "portal_apertura.png", "frameWidth": PORTAL_SIZE, "frameHeight": PORTAL_SIZE,
                        "frames": OPENING_FRAMES, "frameRate": 20, "repeat": 0,
                        "note": "Para cerrar el portal, reproducir en reversa."},
    "portal_activo": {"image": "portal_activo.png", "frameWidth": PORTAL_SIZE, "frameHeight": PORTAL_SIZE,
                      "frames": ACTIVE_FRAMES, "frameRate": 12, "repeat": -1},
    "origin": {"x": 0.5, "y": (PORTAL_SIZE - 34) / PORTAL_SIZE},
    "pincel_vision": {"image": "pincel_vision.png", "originX": 0.5, "originY": BRUSH_GROUND_Y / VISION_BRUSH_HEIGHT},
}
