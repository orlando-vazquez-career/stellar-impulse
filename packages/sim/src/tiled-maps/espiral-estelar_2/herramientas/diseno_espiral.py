"""Diseño del mapa 3 · Espiral Estelar (96×96).

El boceto se describe en coordenadas de la imagen de referencia (u, v de 0 a 1, base azul arriba a la
izquierda), se escala para ocupar toda la grilla y se gira unos grados: las bases quedan cerca de las puntas
de arriba y de abajo del rombo, corridas hacia las esquinas superior izquierda e inferior derecha de la pantalla.
El suelo transitable es espacio abierto; los asteroides, restos y estructuras son los que dibujan las rutas.
Solo se define la mitad azul; la roja sale por simetría central (rotación de 180°).
"""
import heapq
import math
import random
from collections import deque
from dataclasses import dataclass, field

import numpy as np

MAP_SIZE = 96
LAST = MAP_SIZE - 1
GRID_CENTER = LAST / 2
SKETCH_SCALE = 82
ROTATION_DEGREES = -30

MAIN_RADIUS = 2.6
SIDE_RADIUS = 1.6
SPUR_RADIUS = 1.4
SPLINE_STEPS = 24

WALKABLE_BLOCKERS = ("asteroid", "blocked")
EXPECTED_BASE_EXITS = 2
TRAVEL_RANGE = (70, 200)


def to_grid(point):
    angle = math.radians(ROTATION_DEGREES)
    du, dv = point[0] - 0.5, point[1] - 0.5
    rotated_x = du * math.cos(angle) - dv * math.sin(angle)
    rotated_y = du * math.sin(angle) + dv * math.cos(angle)
    return GRID_CENTER + rotated_x * SKETCH_SCALE, GRID_CENTER + rotated_y * SKETCH_SCALE


def mirror_tile(tile):
    return LAST - tile[0], LAST - tile[1]


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


# ---------- mitad azul (coordenadas del boceto) ----------

BLUE_BASE = (0.15, 0.146)
PRONEXO_1 = (0.414, 0.22)
PRONEXO_2 = (0.836, 0.305)
CENTER = (0.5, 0.5)
PORTAL_TOP = (0.594, 0.082)
PORTAL_LEFT = (0.044, 0.365)

OUTER_TOP = Path((BLUE_BASE, (0.27, 0.08), (0.42, 0.065), (0.56, 0.09), (0.68, 0.15), (0.78, 0.2), PRONEXO_2),
                 "boost", MAIN_RADIUS)
OUTER_LEFT = Path((BLUE_BASE, (0.1, 0.24), (0.08, 0.34), (0.075, 0.45), (0.06, 0.53)), "walkway", MAIN_RADIUS)

PATHS = [
    OUTER_TOP,
    OUTER_LEFT,
    Path((PRONEXO_2, (0.9, 0.38), (0.94, 0.47), (0.94, 0.55)), "walkway", MAIN_RADIUS),
    Path(((0.3, 0.075), (0.34, 0.15), PRONEXO_1), "walkway", MAIN_RADIUS),
    Path((PRONEXO_1, (0.5, 0.2), (0.58, 0.26), (0.67, 0.31), (0.76, 0.3), PRONEXO_2), "boost", SIDE_RADIUS),
    Path((PRONEXO_1, (0.41, 0.31), (0.34, 0.36), (0.31, 0.43), (0.39, 0.48), CENTER), "slow", SIDE_RADIUS),
    Path((PRONEXO_2, (0.81, 0.4), (0.71, 0.45), (0.61, 0.5), CENTER), "boost", MAIN_RADIUS),
    Path(((0.075, 0.42), (0.16, 0.44), (0.24, 0.48), (0.33, 0.52), CENTER), "slow", SIDE_RADIUS),
    Path(((0.09, 0.3), (0.2, 0.3), (0.26, 0.36), (0.31, 0.42)), "boost", SIDE_RADIUS),
    Path(((0.57, 0.1), PORTAL_TOP), "walkway", SPUR_RADIUS),
    Path(((0.08, 0.35), PORTAL_LEFT), "walkway", SPUR_RADIUS),
]

NEBULAS = [((0.66, 0.22), 0.075, 0.05), ((0.22, 0.37), 0.05, 0.04), ((0.88, 0.52), 0.04, 0.035)]

BASE_PLATFORM_RADIUS = 6.0
PLATFORMS = [(PRONEXO_1, 3.2), (PRONEXO_2, 3.2)]
CENTER_PLATFORM_RADIUS = 7.0
PORTAL_CLEARING = 2.2

# Bolsillos en las puntas libres del rombo (coordenadas de grilla): espacio abierto con obstáculos y premio.
POCKETS = [
    {"name": "Cementerio de Naves", "center": (10, 10), "radius": 5.5},
    {"name": "Campo de Cristal", "center": (11, 85), "radius": 5.0},
]

GATES = [((0.47, 0.1), (0.46, 0.18)), ((0.86, 0.36), (0.78, 0.38))]
GATE_RADIUS = 1.4

BLOCKING_WRECKS = [
    ("nave_destruida_1", (0.66, 0.2), 2.0),
    ("nave_destruida_2", (0.21, 0.455), 1.4),
    ("nave_destruida_1", (0.75, 0.49), 1.4),
]
DECOR_WRECKS = [("restos_nave", (0.5, 0.12)), ("restos_nave", (0.9, 0.45))]
SATELLITES = [(0.3, 0.27), (0.62, 0.36), (0.12, 0.6), (0.55, 0.08)]

RESOURCES = [(0.27, 0.085), (0.1, 0.27), (0.45, 0.205), (0.8, 0.28), (0.36, 0.38)]
MOB_SPAWNS = [(0.44, 0.5), (0.5, 0.44)]
SPAWN_POINT = (0.2, 0.17)
ZONES = [("Nebulosa Norte", (0.66, 0.22)), ("Paso del Pronexo", (0.36, 0.14)), ("Corriente Oeste", (0.07, 0.42))]
TOWER_RADIUS = 10


@dataclass
class Layout:
    terrain: np.ndarray
    ground: np.ndarray
    elevation: np.ndarray
    rocks: np.ndarray
    structures: list
    markers: list
    gates: list
    fences: list
    report: dict


# ---------- geometría ----------

def catmull_rom(points):
    padded = [points[0], *points, points[-1]]
    curve = []
    for p0, p1, p2, p3 in zip(padded, padded[1:], padded[2:], padded[3:]):
        for step in range(SPLINE_STEPS):
            t = step / SPLINE_STEPS
            curve.append(tuple(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t ** 2
                                      + (-a + 3 * b - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    return [*curve, points[-1]]


YS, XS = (grid.astype(float) for grid in np.mgrid[0:MAP_SIZE, 0:MAP_SIZE])


def disk_mask(center, radius):
    return np.hypot(XS - center[0], YS - center[1]) <= radius


def curve_mask(grid_points, radius):
    mask = np.zeros((MAP_SIZE, MAP_SIZE), dtype=bool)
    for point in catmull_rom(grid_points):
        mask |= disk_mask(point, radius)
    return mask


def stroke_mask(sketch_points, radius):
    return curve_mask([to_grid(p) for p in sketch_points], radius)


def sketch_ellipse_mask(center, radius_u, radius_v):
    angle = math.radians(-ROTATION_DEGREES)
    dx, dy = (XS - GRID_CENTER) / SKETCH_SCALE, (YS - GRID_CENTER) / SKETCH_SCALE
    u = dx * math.cos(angle) - dy * math.sin(angle) + 0.5
    v = dx * math.sin(angle) + dy * math.cos(angle) + 0.5
    return ((u - center[0]) / radius_u) ** 2 + ((v - center[1]) / radius_v) ** 2 <= 1


def symmetric(mask):
    return mask | mask[::-1, ::-1]


def grid_tile(sketch_point):
    x, y = to_grid(sketch_point)
    return round(x), round(y)


# ---------- pintado del terreno ----------

def paint_corridors(terrain, ground):
    for center, radius_u, radius_v in NEBULAS:
        nebula = symmetric(sketch_ellipse_mask(center, radius_u, radius_v))
        terrain[nebula], ground[nebula] = "nebula", "nebulosa"
    for path in PATHS:
        mask = symmetric(stroke_mask(path.points, path.radius))
        terrain[mask] = {"boost": "boost", "slow": "slow"}.get(path.lane, "empty")
        ground[mask] = {"boost": "acelerador", "slow": "desacelerador"}.get(path.lane, "")


def nearest_route_point(target):
    """Punto de las rutas azules más cercano a un bolsillo, para conectarlo con un pasillo corto."""
    points = [p for path in PATHS for p in catmull_rom([to_grid(q) for q in path.points])]
    return min(points, key=lambda p: math.dist(p, target))


def paint_pockets(terrain, ground):
    for pocket in POCKETS:
        start = nearest_route_point(pocket["center"])
        connector = curve_mask([start, pocket["center"]], SIDE_RADIUS)
        area = connector | disk_mask(pocket["center"], pocket["radius"])
        terrain[symmetric(area)], ground[symmetric(area)] = "empty", ""


def platform_mask():
    mask = disk_mask(to_grid(BLUE_BASE), BASE_PLATFORM_RADIUS)
    for center, radius in PLATFORMS:
        mask |= disk_mask(to_grid(center), radius)
    return symmetric(mask) | disk_mask(to_grid(CENTER), CENTER_PLATFORM_RADIUS)


def paint_platforms(terrain, ground, elevation):
    clearings = np.zeros_like(elevation, dtype=bool)
    for portal in (PORTAL_TOP, PORTAL_LEFT):
        clearings |= symmetric(disk_mask(to_grid(portal), PORTAL_CLEARING))
    terrain[clearings], ground[clearings] = "empty", ""
    platforms = platform_mask()
    terrain[platforms], ground[platforms], elevation[platforms] = "empty", "plataforma", 1


def paint_gates(terrain, ground):
    gates = []
    for segment in GATES:
        mask = stroke_mask(segment, GATE_RADIUS) & (terrain == "asteroid")
        for gate_mask in (mask, mask[::-1, ::-1]):
            terrain[gate_mask], ground[gate_mask] = "asteroid", "paso_asteroides"
            gates.append(tiles_of(gate_mask))
    return gates


def tiles_of(mask):
    return [(int(x), int(y)) for y, x in zip(*np.nonzero(mask))]


def fence_line(pocket):
    """Valla láser que cruza la entrada del bolsillo, alineada con la grilla."""
    start, end = np.array(nearest_route_point(pocket["center"])), np.array(pocket["center"])
    direction = (start - end) / (np.linalg.norm(start - end) or 1)
    middle = end + direction * (pocket["radius"] + 1.5)
    along_x = abs(end[0] - start[0]) >= abs(end[1] - start[1])
    axis = "y" if along_x else "x"
    cx, cy = round(middle[0]), round(middle[1])
    offsets = range(-4, 5)
    tiles = [(cx, cy + d) for d in offsets] if axis == "y" else [(cx + d, cy) for d in offsets]
    return axis, tiles


def paint_fences(terrain):
    fences = []
    for pocket in POCKETS:
        axis, tiles = fence_line(pocket)
        walkable = [tile for tile in tiles if terrain[tile[1], tile[0]] not in WALKABLE_BLOCKERS]
        for tile_set in (walkable, [mirror_tile(tile) for tile in walkable]):
            for x, y in tile_set:
                terrain[y, x] = "blocked"
            fences.append((axis, tile_set))
    return fences


def paint_blocked(terrain, mask):
    terrain[symmetric(mask)] = "blocked"


def obstacle_footprints():
    footprints = [disk_mask(to_grid(center), radius) for _, center, radius in BLOCKING_WRECKS]
    footprints += [disk_mask(to_grid(point), 0.5) for point in SATELLITES]
    footprints.append(disk_mask(POCKETS[0]["center"], 2.2))
    crystal_center = (POCKETS[1]["center"][0] - 2, POCKETS[1]["center"][1] + 1)
    footprints.append(disk_mask(crystal_center, 1.6))
    footprints.append(disk_mask(to_grid(BLUE_BASE), 1.6))
    return footprints


def paint_obstacles(terrain):
    for footprint in obstacle_footprints():
        paint_blocked(terrain, footprint)
    low, high = math.floor(GRID_CENTER), math.ceil(GRID_CENTER)
    terrain[low:high + 1, low:high + 1] = "blocked"


def place_rocks(terrain, gates, seed=21):
    rng = random.Random(seed)
    rocks = np.full((MAP_SIZE, MAP_SIZE), -1)
    gate_tiles = {tile for tiles in gates for tile in tiles}
    walkable = ~np.isin(terrain, WALKABLE_BLOCKERS)
    for y in range(MAP_SIZE):
        for x in range(MAP_SIZE):
            if terrain[y, x] != "asteroid" or (x, y) in gate_tiles:
                continue
            near_path = walkable[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any()
            if rng.random() < (0.85 if near_path else 0.5):
                rocks[y, x] = rng.randrange(3, 8) if near_path else rng.randrange(0, 8)
    return rocks


# ---------- estructuras y marcadores ----------

def nearest_walkable(terrain, tile):
    candidates = sorted((dx * dx + dy * dy, dy, dx) for dx in range(-6, 7) for dy in range(-6, 7))
    for _, dy, dx in candidates:
        x, y = tile[0] + dx, tile[1] + dy
        if 0 <= x < MAP_SIZE and 0 <= y < MAP_SIZE and terrain[y, x] not in WALKABLE_BLOCKERS:
            return x, y
    raise ValueError(f"No hay casilla libre cerca de {tile}")


def both(tile):
    return [tile, mirror_tile(tile)]


def structures(terrain, resource_tiles, fences):
    center = (GRID_CENTER, GRID_CENTER)
    placed = [("base_jugador", grid_tile(BLUE_BASE)), ("base_enemiga", mirror_tile(grid_tile(BLUE_BASE))),
              ("pilar", center), ("escudo", center)]
    sketch_items = [("pronexo", p) for p in (PRONEXO_1, PRONEXO_2)] + [("agujero", p) for p in (PORTAL_TOP, PORTAL_LEFT)]
    sketch_items += [(name, c) for name, c, _ in BLOCKING_WRECKS] + DECOR_WRECKS + [("satelite", p) for p in SATELLITES]
    for name, point in sketch_items:
        placed += [(name, tile) for tile in both(grid_tile(point))]
    crystal = (POCKETS[1]["center"][0] - 2, POCKETS[1]["center"][1] + 1)
    grid_items = [("estacion_rota", POCKETS[0]["center"]), ("cristales", crystal), ("torre_vigilancia", tower_tile(terrain))]
    for name, tile in grid_items:
        placed += [(name, t) for t in both(tile)]
    placed += [("recurso", t) for blue in resource_tiles for t in both(blue)]
    placed += [(f"valla_laser_{axis}", tile) for axis, tiles in fences for tile in tiles]
    return placed


def tower_tile(terrain):
    pocket = POCKETS[1]["center"]
    return nearest_walkable(terrain, (pocket[0] + 3, pocket[1] - 3))


def markers(terrain, resource_tiles, mob_tiles):
    spawn = nearest_walkable(terrain, grid_tile(SPAWN_POINT))
    first, second = both(grid_tile(PRONEXO_1)), both(grid_tile(PRONEXO_2))
    center = (GRID_CENTER, GRID_CENTER)
    found = [Placed("spawn", spawn, {"owner": 1}), Placed("spawn", mirror_tile(spawn), {"owner": 2}),
             Placed("pilar", center), Placed("barrera", center, {"hp": 500}),
             Placed("pronexo", first[0], {"index": 1}), Placed("pronexo", second[0], {"index": 2}),
             Placed("pronexo", second[1], {"index": 3}), Placed("pronexo", first[1], {"index": 4})]
    cycle = {"cycleSeconds": 90, "openSeconds": 30, "warningSeconds": 5}
    for pair, point in (("A", PORTAL_TOP), ("B", PORTAL_LEFT)):
        found += [Placed("agujero", tile, {"pairId": pair, **cycle}) for tile in both(grid_tile(point))]
    found += [Placed("recurso", t, {"amount": 300}) for blue in resource_tiles for t in both(blue)]
    found += [Placed("mob_spawn", t, {"count": 3}) for blue in mob_tiles for t in both(blue)]
    found += [Placed("torre_vigilancia", t, {"visionRadius": TOWER_RADIUS}) for t in both(tower_tile(terrain))]
    found += zone_markers(terrain)
    return found


def zone_markers(terrain):
    zones = [(name, grid_tile(point)) for name, point in ZONES]
    zones += [(pocket["name"], pocket["center"]) for pocket in POCKETS]
    found = []
    for name, tile in zones:
        blue, red = both(nearest_walkable(terrain, tile))
        found += [Placed("zona", blue, {"nombre": f"{name} (azul)"}), Placed("zona", red, {"nombre": f"{name} (rojo)"})]
    return found


def build_layout():
    terrain = np.full((MAP_SIZE, MAP_SIZE), "asteroid", dtype=object)
    ground = np.full((MAP_SIZE, MAP_SIZE), "", dtype=object)
    elevation = np.zeros((MAP_SIZE, MAP_SIZE), dtype=int)
    paint_corridors(terrain, ground)
    paint_pockets(terrain, ground)
    paint_platforms(terrain, ground, elevation)
    gates = paint_gates(terrain, ground)
    paint_obstacles(terrain)
    fences = paint_fences(terrain)
    ground[terrain == "asteroid"] = np.where(ground[terrain == "asteroid"] == "", "espacio_profundo",
                                             ground[terrain == "asteroid"])
    resource_tiles = [nearest_walkable(terrain, grid_tile(p)) for p in RESOURCES]
    mob_tiles = [nearest_walkable(terrain, grid_tile(p)) for p in MOB_SPAWNS]
    layout = Layout(terrain, ground, elevation, place_rocks(terrain, gates), structures(terrain, resource_tiles, fences),
                    markers(terrain, resource_tiles, mob_tiles), gates, fences, {})
    validate(layout)
    return layout


# ---------- validación ----------

def walkable_mask(terrain):
    return ~np.isin(terrain, WALKABLE_BLOCKERS)


def reachable_from(walkable, start):
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < MAP_SIZE and 0 <= ny < MAP_SIZE and (nx, ny) not in seen and walkable[ny, nx]:
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def wide_route_mask(walkable):
    """Casillas donde cabe un bloque de 3×3: si hay camino aquí, existe una ruta de al menos 3 de ancho."""
    padded = np.pad(walkable, 1, constant_values=False)
    wide = np.ones_like(walkable)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            wide &= padded[dy:dy + MAP_SIZE, dx:dx + MAP_SIZE]
    return wide


def nearest_wide(wide, tile):
    candidates = sorted((dx * dx + dy * dy, dx, dy) for dx in range(-3, 4) for dy in range(-3, 4))
    for _, dx, dy in candidates:
        x, y = tile[0] + dx, tile[1] + dy
        if 0 <= x < MAP_SIZE and 0 <= y < MAP_SIZE and wide[y, x]:
            return x, y
    return tile


def count_base_exits(walkable):
    """Cuenta los grupos de casillas libres en un anillo alrededor de la base (cada grupo es una salida)."""
    cx, cy = to_grid(BLUE_BASE)
    distance = np.hypot(XS - cx, YS - cy)
    ring = walkable & (distance >= BASE_PLATFORM_RADIUS + 1.5) & (distance <= BASE_PLATFORM_RADIUS + 3.5)
    remaining, exits = set(tiles_of(ring)), 0
    while remaining:
        exits += 1
        queue = deque([remaining.pop()])
        while queue:
            x, y = queue.popleft()
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if (nx, ny) in remaining:
                        remaining.discard((nx, ny))
                        queue.append((nx, ny))
    return exits


def travel_cost(terrain, start, goal):
    """Costo del viaje más corto en casillas equivalentes, con la velocidad de cada terreno."""
    speed = {"empty": 1.0, "nebula": 1.0, "boost": 1.5, "slow": 0.5}
    best, queue = {start: 0.0}, [(0.0, start)]
    while queue:
        cost, (x, y) = heapq.heappop(queue)
        if (x, y) == goal:
            return cost
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if (dx or dy) and 0 <= nx < MAP_SIZE and 0 <= ny < MAP_SIZE and terrain[ny, nx] in speed:
                    step = (1.414 if dx and dy else 1.0) / speed[terrain[ny, nx]]
                    if cost + step < best.get((nx, ny), math.inf):
                        best[(nx, ny)] = cost + step
                        heapq.heappush(queue, (cost + step, (nx, ny)))
    return math.inf


def validate(layout):
    if not np.array_equal(layout.terrain, layout.terrain[::-1, ::-1]):
        raise ValueError("El terreno no es simétrico")
    walkable = walkable_mask(layout.terrain)
    with_open_fences = walkable.copy()
    for _, tiles in layout.fences:
        for x, y in tiles:
            with_open_fences[y, x] = True
    spawns = [m.tile for m in layout.markers if m.kind == "spawn"]
    reachable = reachable_from(with_open_fences, spawns[0])
    for marker in layout.markers:
        if marker.kind not in ("pilar", "barrera") and tuple(marker.tile) not in reachable:
            raise ValueError(f"{marker.kind} en {marker.tile} no es alcanzable desde la base azul")
    wide = wide_route_mask(walkable)
    wide_reachable = reachable_from(wide, nearest_wide(wide, spawns[0]))
    for marker in layout.markers:
        if marker.kind in ("spawn", "pronexo") and nearest_wide(wide, marker.tile) not in wide_reachable:
            raise ValueError(f"No hay ruta de 3 casillas de ancho hasta {marker.kind} en {marker.tile}")
    exits = count_base_exits(walkable)
    if exits != EXPECTED_BASE_EXITS:
        raise ValueError(f"La base tiene {exits} salidas y se esperaban {EXPECTED_BASE_EXITS}")
    cost = travel_cost(layout.terrain, spawns[0], spawns[1])
    if not TRAVEL_RANGE[0] <= cost <= TRAVEL_RANGE[1]:
        raise ValueError(f"El viaje entre bases cuesta {cost:.0f} casillas, fuera de {TRAVEL_RANGE}")
    layout.report.update({"salidas_base": exits, "viaje_entre_bases": round(cost, 1)})
