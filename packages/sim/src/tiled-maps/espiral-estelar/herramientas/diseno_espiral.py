"""Diseño del mapa 3 · Espiral Estelar.

Se define solo la mitad del jugador azul; todo se refleja con simetría central (rotación de 180°)
para que el 1v1 sea justo. Coordenadas en casillas de una grilla de 58×58.
"""
import random
from collections import deque
from dataclasses import dataclass, field

import numpy as np

MAP_SIZE = 58
LAST = MAP_SIZE - 1
CENTER = (LAST / 2, LAST / 2)

MAIN_WIDTH = 1.6
SIDE_WIDTH = 1.25


def mirror(point):
    return LAST - point[0], LAST - point[1]


@dataclass(frozen=True)
class Path:
    points: tuple
    lane: str
    radius: float


@dataclass(frozen=True)
class Placed:
    kind: str
    tile: tuple
    properties: dict = field(default_factory=dict)


# ---------- mitad azul ----------

BLUE_BASE = (8, 8)
PRONEXO_1 = (23, 13)
PRONEXO_2 = (48, 18)
PORTAL_TOP = (33, 3)
PORTAL_LEFT = (2, 22)

PATHS = [
    Path(((8, 8), (14, 5), (22, 5), (30, 6), (37, 8), (44, 11), (50, 14), (54, 20), (55, 28)), "boost", MAIN_WIDTH),
    Path(((8, 8), (5, 14), (5, 22), (5, 29)), "walkway", MAIN_WIDTH),
    Path(((8, 8), (14, 11), (19, 12), PRONEXO_1), "walkway", MAIN_WIDTH),
    Path((PRONEXO_1, (29, 11), (36, 13), (42, 16), PRONEXO_2), "boost", MAIN_WIDTH),
    Path((PRONEXO_2, (53, 20)), "walkway", SIDE_WIDTH),
    Path((PRONEXO_1, (20, 18), (18, 23), (22, 26), (28, 28)), "slow", SIDE_WIDTH),
    Path((PRONEXO_2, (46, 23), (40, 27), (34, 28), (28, 28)), "boost", SIDE_WIDTH),
    Path(((5, 25), (12, 27), (18, 28), (24, 28)), "slow", SIDE_WIDTH),
    Path(((33, 6), PORTAL_TOP), "walkway", SIDE_WIDTH),
    Path(((5, 22), PORTAL_LEFT), "walkway", SIDE_WIDTH),
]

NEBULAS = [((38, 21), 6.5, 4.8), ((11, 18), 4.8, 4.6)]

PLAZAS = [(BLUE_BASE, 5.0), (PRONEXO_1, 2.6), (PRONEXO_2, 2.6), (PORTAL_TOP, 1.6), (PORTAL_LEFT, 1.6)]
CENTER_PLAZA_RADIUS = 5.5

# Pasos de asteroides que se abren por ciclos: rectángulo (x, y, ancho, alto) en casillas.
GATES = [(28, 7, 2, 4)]

# Naves destruidas que bloquean el paso (huella en casillas) y restos que solo decoran.
BLOCKING_WRECKS = [
    ("nave_destruida_1", (39, 19), [(38, 18), (39, 18), (40, 18), (38, 19), (39, 19), (40, 19)]),
    ("nave_destruida_2", (12, 26), [(11, 26), (12, 26), (11, 27), (12, 27)]),
    ("nave_destruida_1", (45, 25), [(44, 24), (45, 24), (44, 25), (45, 25)]),
]
DECOR_WRECKS = [("restos_nave", (13, 18)), ("restos_nave", (31, 10))]

BASE_FOOTPRINT = [(x, y) for x in range(7, 10) for y in range(7, 10)]
PILLAR_FOOTPRINT = [(28, 28), (29, 28), (28, 29), (29, 29)]

RESOURCES = [(14, 5), (5, 15), (27, 12), (45, 17)]
MOB_SPAWNS = [(25, 28), (28, 24)]


@dataclass
class Layout:
    terrain: np.ndarray
    ground: np.ndarray
    rocks: np.ndarray
    structures: list
    markers: list
    gates: list


def tile_centers():
    ys, xs = np.mgrid[0:MAP_SIZE, 0:MAP_SIZE]
    return xs.astype(float), ys.astype(float)


def segment_mask(start, end, radius):
    xs, ys = tile_centers()
    (ax, ay), (bx, by) = start, end
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy or 1
    t = np.clip(((xs - ax) * dx + (ys - ay) * dy) / length_squared, 0, 1)
    return np.hypot(xs - (ax + t * dx), ys - (ay + t * dy)) <= radius


def path_mask(path):
    mask = np.zeros((MAP_SIZE, MAP_SIZE), dtype=bool)
    for start, end in zip(path.points, path.points[1:]):
        mask |= segment_mask(start, end, path.radius)
    return mask


def ellipse_mask(center, radius_x, radius_y):
    xs, ys = tile_centers()
    return ((xs - center[0]) / radius_x) ** 2 + ((ys - center[1]) / radius_y) ** 2 <= 1


def symmetric(mask):
    return mask | mask[::-1, ::-1]


def mirrored_paths():
    for path in PATHS:
        yield path
        yield Path(tuple(mirror(point) for point in path.points), path.lane, path.radius)


def paint_terrain():
    terrain = np.full((MAP_SIZE, MAP_SIZE), "asteroid", dtype=object)
    ground = np.full((MAP_SIZE, MAP_SIZE), "", dtype=object)
    for center, radius_x, radius_y in NEBULAS:
        nebula = symmetric(ellipse_mask(center, radius_x, radius_y))
        terrain[nebula], ground[nebula] = "nebula", "nebulosa"
    for path in mirrored_paths():
        mask = path_mask(path)
        terrain[mask] = {"boost": "boost", "slow": "slow"}.get(path.lane, "empty")
        ground[mask] = {"boost": "acelerador", "slow": "desacelerador"}.get(path.lane, "camino")
    plazas = np.zeros((MAP_SIZE, MAP_SIZE), dtype=bool)
    for center, radius in PLAZAS:
        plazas |= symmetric(ellipse_mask(center, radius, radius))
    plazas |= ellipse_mask(CENTER, CENTER_PLAZA_RADIUS, CENTER_PLAZA_RADIUS)
    terrain[plazas], ground[plazas] = "empty", "camino"
    return terrain, ground


def gate_tiles(rect):
    x, y, width, height = rect
    return [(tx, ty) for tx in range(x, x + width) for ty in range(y, y + height)]


def paint_gates(terrain, ground):
    gates = []
    for rect in GATES:
        for tiles in (gate_tiles(rect), [mirror(tile) for tile in gate_tiles(rect)]):
            for tx, ty in tiles:
                terrain[ty, tx], ground[ty, tx] = "asteroid", "paso_asteroides"
            gates.append(tiles)
    return gates


def paint_blocked(terrain, tiles):
    for tile in tiles:
        for tx, ty in (tile, mirror(tile)):
            terrain[int(ty), int(tx)] = "blocked"


def wreck_structures():
    structures = []
    for name, tile, footprint in BLOCKING_WRECKS:
        structures += [(name, tile), (name, mirror(tile))]
    for name, tile in DECOR_WRECKS:
        structures += [(name, tile), (name, mirror(tile))]
    return structures


def place_rocks(terrain, gates, seed=21):
    """Asteroides visibles: los grandes lejos de los caminos, los chicos en el borde."""
    rng = random.Random(seed)
    rocks = np.full((MAP_SIZE, MAP_SIZE), -1)
    gate_set = {tile for tiles in gates for tile in tiles}
    walkable = terrain != "asteroid"
    for y in range(MAP_SIZE):
        for x in range(MAP_SIZE):
            if terrain[y, x] != "asteroid" or (x, y) in gate_set:
                continue
            near_path = walkable[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any()
            if rng.random() < (0.75 if near_path else 0.5):
                rocks[y, x] = rng.randrange(3, 8) if near_path else rng.randrange(0, 8)
    return rocks


def structures_and_markers():
    structures = [("base_jugador", BLUE_BASE), ("base_enemiga", mirror(BLUE_BASE)),
                  ("pilar", CENTER), ("escudo", CENTER)]
    structures += [("pronexo", tile) for point in (PRONEXO_1, PRONEXO_2) for tile in (point, mirror(point))]
    structures += [("agujero", tile) for point in (PORTAL_TOP, PORTAL_LEFT) for tile in (point, mirror(point))]
    structures += [("recurso", tile) for point in RESOURCES for tile in (point, mirror(point))]
    structures += wreck_structures()
    markers = [
        Placed("spawn", (11, 11), {"owner": 1}), Placed("spawn", mirror((11, 11)), {"owner": 2}),
        Placed("pilar", CENTER), Placed("barrera", CENTER, {"hp": 500}),
        Placed("pronexo", PRONEXO_1, {"index": 1}), Placed("pronexo", PRONEXO_2, {"index": 2}),
        Placed("pronexo", mirror(PRONEXO_2), {"index": 3}), Placed("pronexo", mirror(PRONEXO_1), {"index": 4}),
        Placed("agujero", PORTAL_TOP, {"pairId": "A", "cycleSeconds": 90, "openSeconds": 30}),
        Placed("agujero", mirror(PORTAL_TOP), {"pairId": "A", "cycleSeconds": 90, "openSeconds": 30}),
        Placed("agujero", PORTAL_LEFT, {"pairId": "B", "cycleSeconds": 90, "openSeconds": 30}),
        Placed("agujero", mirror(PORTAL_LEFT), {"pairId": "B", "cycleSeconds": 90, "openSeconds": 30}),
    ]
    markers += [Placed("recurso", tile, {"amount": 300}) for point in RESOURCES for tile in (point, mirror(point))]
    markers += [Placed("mob_spawn", tile, {"count": 3}) for point in MOB_SPAWNS for tile in (point, mirror(point))]
    return structures, markers


def build_layout():
    terrain, ground = paint_terrain()
    gates = paint_gates(terrain, ground)
    for _, _, footprint in BLOCKING_WRECKS:
        paint_blocked(terrain, footprint)
    paint_blocked(terrain, BASE_FOOTPRINT)
    for tx, ty in PILLAR_FOOTPRINT:
        terrain[ty, tx] = "blocked"
    structures, markers = structures_and_markers()
    layout = Layout(terrain, ground, place_rocks(terrain, gates), structures, markers, gates)
    validate(layout)
    return layout


# ---------- validación ----------

def reachable_from(terrain, start):
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            inside = 0 <= nx < MAP_SIZE and 0 <= ny < MAP_SIZE
            if inside and (nx, ny) not in seen and terrain[ny, nx] not in ("asteroid", "blocked"):
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def validate(layout):
    """Comprueba simetría y que una nave mediana llegue a todo lo importante."""
    if not np.array_equal(layout.terrain, layout.terrain[::-1, ::-1]):
        raise ValueError("El terreno no es simétrico")
    reachable = reachable_from(layout.terrain, (11, 11))
    for marker in layout.markers:
        if marker.kind in ("pilar", "barrera"):
            continue
        tile = (round(marker.tile[0]), round(marker.tile[1]))
        if tile not in reachable:
            raise ValueError(f"{marker.kind} en {tile} no es alcanzable desde la base azul")
