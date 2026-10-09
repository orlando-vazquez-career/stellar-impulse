"""Asteroides sombreados con relieve, cráteres y luz de borde."""
import random
from dataclasses import dataclass

import numpy as np

from assets import LIGHT, SUPERSAMPLE, color, pixel_grid, smooth_noise, to_image

CANVAS = 96
AMBIENT = 0.14
RIM_COLOR = color(90, 150, 240)

PALETTES = [
    (color(150, 136, 120), color(96, 84, 74)),
    (color(132, 128, 124), color(80, 78, 82)),
    (color(160, 130, 100), color(104, 78, 60)),
]


@dataclass(frozen=True)
class Rock:
    radius: float
    seed: int


def silhouette(xs, ys, center, rock):
    """Contorno irregular: el radio varía con el ángulo usando varias octavas."""
    rng = random.Random(rock.seed)
    tilt, stretch = rng.uniform(-0.6, 0.6), rng.uniform(1.0, 1.3)
    rx, ry = xs - center[0], (ys - center[1]) / 0.9
    dx = (rx * np.cos(tilt) + ry * np.sin(tilt)) / stretch
    dy = -rx * np.sin(tilt) + ry * np.cos(tilt)
    angle = np.arctan2(dy, dx)
    wobble = sum(rng.uniform(0.08, 0.3) / k * np.sin(k * angle + rng.uniform(0, 6.3)) for k in range(2, 9))
    edge = rock.radius * (1 + wobble)
    return dx / edge, dy / edge, np.hypot(dx, dy) / edge


def bump_gradient(noise, strength):
    grad_y, grad_x = np.gradient(noise)
    return grad_x * strength * SUPERSAMPLE, grad_y * strength * SUPERSAMPLE


def apply_craters(nx, ny, albedo, xs, ys, center, rock):
    rng = random.Random(rock.seed + 99)
    for _ in range(int(4 + rock.radius / 4)):
        angle, distance = rng.uniform(0, 6.3), rng.uniform(0, 0.7) * rock.radius
        cx = center[0] + np.cos(angle) * distance
        cy = center[1] + np.sin(angle) * distance * 0.9
        crater_radius = rng.uniform(0.1, 0.28) * rock.radius
        dx, dy = (xs - cx) / crater_radius, (ys - cy) / crater_radius
        distance_to_center = np.hypot(dx, dy)
        bowl = distance_to_center < 1
        lip = (distance_to_center >= 1) & (distance_to_center < 1.3)
        nx = np.where(bowl, nx - dx * 0.7, np.where(lip, nx + dx * 0.2, nx))
        ny = np.where(bowl, ny - dy * 0.7, np.where(lip, ny + dy * 0.2, ny))
        albedo = np.where(bowl, albedo * (0.75 + 0.25 * distance_to_center), albedo)
    return nx, ny, albedo


def speckles(shape, seed):
    rng = np.random.default_rng(seed)
    dots = (rng.random(shape) > 0.985).astype(float)
    return 1 + 0.35 * dots


def asteroid(rock):
    xs, ys = pixel_grid(CANVAS, CANVAS)
    center = (CANVAS / 2, CANVAS - 36 - rock.radius * 0.45)
    nx, ny, q = silhouette(xs, ys, center, rock)
    nz = np.sqrt(np.clip(1 - q ** 2, 0, 1))
    large_bumps = smooth_noise(CANVAS, CANVAS, 5, rock.seed)
    fine_bumps = smooth_noise(CANVAS, CANVAS, 1.2, rock.seed + 1)
    for noise, strength in ((large_bumps, 6.0), (fine_bumps, 2.5)):
        gx, gy = bump_gradient(noise, strength)
        nx, ny = nx - gx, ny - gy
    albedo = (0.8 + 0.2 * fine_bumps) * (0.75 + 0.25 * large_bumps) * speckles(xs.shape, rock.seed)
    nx, ny, albedo = apply_craters(nx, ny, albedo, xs, ys, center, rock)
    length = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2) + 1e-6
    lambert = np.clip((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / length, 0, 1)
    light, dark = PALETTES[rock.seed % len(PALETTES)]
    tint = dark + (light - dark) * large_bumps[..., None]
    rgb = tint * (AMBIENT + 1.25 * lambert * albedo)[..., None]
    rim = (q ** 6 * np.clip(nx / length * 0.9 - ny / length * 0.3, 0, 1))[..., None]
    rgb += rim * RIM_COLOR
    alpha = np.clip((1 - q) * rock.radius * 1.5, 0, 1)
    return to_image(rgb, alpha)


ROCKS = [
    ("asteroide_grande_1", Rock(31, 31)), ("asteroide_grande_2", Rock(29, 32)),
    ("asteroide_grande_3", Rock(27, 40)), ("asteroide_mediano_1", Rock(21, 33)),
    ("asteroide_mediano_2", Rock(19, 34)), ("asteroide_mediano_3", Rock(17, 41)),
    ("asteroide_chico_1", Rock(12, 35)), ("asteroide_chico_2", Rock(10, 36)),
]
