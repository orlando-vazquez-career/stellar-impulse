"""Escudo de energía (barrera del pilar) con patrón hexagonal sobre la esfera."""
import numpy as np

from assets import color, pixel_grid, radial_glow, smooth_noise, to_image

SIZE = 208
SHIELD_COLOR = color(140, 205, 255)
HEX_SIZE = 0.16
HEX_LINE_WIDTH = 0.1
SQRT3 = np.sqrt(3)


def hex_edge_proximity(u, v, size):
    """1 sobre las aristas de una grilla hexagonal y 0 en el centro de cada celda."""
    q = (SQRT3 / 3 * u - v / 3) / size
    r = (2 / 3 * v) / size
    cube_x, cube_z = q, r
    cube_y = -cube_x - cube_z
    rx, ry, rz = np.round(cube_x), np.round(cube_y), np.round(cube_z)
    dx, dy, dz = np.abs(rx - cube_x), np.abs(ry - cube_y), np.abs(rz - cube_z)
    rx = np.where((dx > dy) & (dx > dz), -ry - rz, rx)
    rz = np.where(~((dx > dy) & (dx > dz)) & ~(dy > dz), -rx - ry, rz)
    center_u = size * SQRT3 * (rx + rz / 2)
    center_v = size * 1.5 * rz
    local_u, local_v = np.abs(u - center_u), np.abs(v - center_v)
    distance = np.maximum(local_u, local_u / 2 + local_v * SQRT3 / 2) / (size * SQRT3 / 2)
    return np.clip(distance, 0, 1)


def emitter_ring(xs, ys, cx, ground_y, radius):
    ring = np.hypot((xs - cx) / radius, (ys - ground_y) / (radius * 0.42))
    return np.clip(1 - np.abs(ring - 1) / 0.08, 0, 1)


def shield():
    xs, ys = pixel_grid(SIZE, SIZE)
    cx, cy, radius = SIZE / 2, SIZE / 2 - 2, SIZE * 0.45
    nx, ny = (xs - cx) / radius, (ys - cy) / radius
    q = np.hypot(nx, ny)
    inside = q < 1
    u, v = np.arcsin(np.clip(nx, -1, 1)), np.arcsin(np.clip(ny, -1, 1))
    fresnel = np.clip(q, 0, 1) ** 4
    hex_lines = np.clip((hex_edge_proximity(u, v, HEX_SIZE) - (1 - HEX_LINE_WIDTH)) / HEX_LINE_WIDTH, 0, 1)
    hex_lines *= 0.25 + 0.75 * fresnel
    highlight = radial_glow(xs, ys, (cx - radius * 0.4, cy - radius * 0.45), radius * 0.32)
    shimmer = 0.85 + 0.15 * smooth_noise(SIZE, SIZE, 4, 11)
    ring = emitter_ring(xs, ys, cx, cy + radius * 0.82, radius * 0.62)
    rgb = SHIELD_COLOR * shimmer[..., None] + (highlight + hex_lines * 0.4)[..., None] * 0.6
    alpha = (0.05 + 0.7 * fresnel + 0.45 * hex_lines + 0.5 * highlight) * inside + 0.8 * ring
    return to_image(np.clip(rgb, 0, 1), np.clip(alpha, 0, 1))
