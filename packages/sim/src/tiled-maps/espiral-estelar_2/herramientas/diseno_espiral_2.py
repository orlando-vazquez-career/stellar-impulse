#!/usr/bin/env python3
"""Genera espiral-estelar_2.tmx: la variante horizontal del Espiral Estelar (96×96, isométrico 64×32).

Diseño (vista de pantalla, como la imagen de referencia `ejemploespiral-estelar_2.png`):
- Base azul a la izquierda y roja a la derecha, Núcleo (N) al centro.
- Pronexos 1 y 2 arriba, 3 y 4 abajo, unidos por una barra superior y otra inferior con un portal cada una.
- Cuatro recursos (P) en las curvas exteriores, uno junto a cada pronexo y dos en los cruces del centro.
- Carriles anchos (6-7 casillas) y pocas rutas: carril superior, carril inferior y una diagonal al centro por lado.
- Seis nebulosas moradas (ralentizan y tapan la visión); de tres de ellas sale una niebla móvil con dos rutas.
- Ocho zonas de caída de satélites en dos grupos de cuatro que se turnan.

El mapa es simétrico en espejo (izquierda ↔ derecha, que en el mapa isométrico es intercambiar x e y),
así que ambas flotas recorren las mismas distancias. Uso:  python herramientas/diseno_espiral_2.py
Después exportar a JSON:  tiled --export-map json espiral-estelar_2.tmx espiral-estelar_2.json
"""
from __future__ import annotations

import math
import random
from collections import deque
from pathlib import Path

from PIL import Image

KIT = Path(__file__).resolve().parent.parent
TMX = KIT / 'espiral-estelar_2.tmx'
W = H = 96
TILE = 32  # Tiled guarda las posiciones de objetos en píxeles de alto de casilla en ambos ejes.

# Terreno de la capa `logica` (tileset logica, firstgid 1).
EMPTY, NEBULA, ASTEROID, BLOCKED = 1, 2, 3, 6
# Suelo (firstgid 9).
ESPACIO = [9, 10, 11, 12]
NEBULOSA = [13, 14, 15]
CAMINO = [19, 20]
PROFUNDO = [21, 22, 23]
# Asteroides de decoración (firstgid 24).
AST_GRANDE, AST_MEDIANO, AST_CHICO = [24, 25, 26], [27, 28, 29], [30, 31]
# Estructuras (firstgid 32), tiles de imagen.
GID = {
    'base_jugador': 32, 'base_enemiga': 33, 'pilar': 34, 'escudo': 35, 'pronexo': 36, 'agujero': 37,
    'recurso': 38, 'nave_destruida_1': 39, 'nave_destruida_2': 40, 'restos_nave': 41, 'estacion_rota': 42,
    'satelite': 43, 'cristales': 44, 'valla_laser_x': 45, 'valla_laser_y': 46, 'torre_vigilancia': 47,
}
ART = {  # tamaño de cada imagen de estructuras.tsx
    'base_jugador': (256, 248), 'base_enemiga': (256, 248), 'pilar': (128, 184), 'escudo': (208, 208),
    'pronexo': (96, 112), 'agujero': (112, 112), 'recurso': (64, 72), 'nave_destruida_1': (295, 138),
    'nave_destruida_2': (239, 105), 'restos_nave': (231, 106), 'estacion_rota': (224, 176), 'satelite': (72, 72),
    'cristales': (96, 112), 'torre_vigilancia': (80, 128),
}
PLATAFORMA = [48, 49, 50]
ALTURA_0 = 51
ROBOTSITO, ROBOT_CAPSULA = 53, 61
PLANETA = 71  # planetafondo, tile animado
# Decorado externo (firstgid 118): antenas y satélites recortados por recortar_externos.py.
DECORADO_GID = 118
DECORADO = ['deco_satelite_1', 'deco_satelite_2', 'deco_satelite_frontal', 'deco_satelite_dorsal',
            'deco_antena_larga_1', 'deco_antena_larga_2', 'deco_antena_larga_3', 'deco_antena_larga_4',
            'deco_antena_plato_1', 'deco_antena_plato_2', 'deco_antena_plato_3',
            'deco_antena_multipolar_1', 'deco_antena_multipolar_2', 'deco_satelite_baliza']  # la baliza es el tile animado
DECORADO_TILE = {name: index for index, name in enumerate(DECORADO)}

rng = random.Random(2026)


# ---------------------------------------------------------------- geometría
def cell(sx: float, dy: float) -> tuple[float, float]:
    """Punto de pantalla → casilla. sx: horizontal (x - y), dy: vertical desde el centro ((x + y) / 2 - 47.5)."""
    sy = 47.5 + dy
    return (sy + sx / 2, sy - sx / 2)


def mirror(point):
    return (point[1], point[0])


B = cell(-72, 0)         # base azul (p1)
N = cell(0, 0)           # núcleo
P1, P3 = cell(-22, -26), cell(-22, 26)          # pronexos de la mitad azul
PTL, PBL = cell(-46, -20), cell(-46, 20)        # recursos exteriores
PT, PB = cell(0, -34), cell(0, 34)              # portales (barras superior e inferior)
J = cell(-19, 0)                                # cruce a la izquierda del núcleo
V1, V3 = cell(-21, -13), cell(-21, 13)          # conectores pronexo → cruce
MD = cell(-36, 6)                               # diagonal media (nebulosa lateral)
ZT, ZB = cell(0, -18), cell(0, 18)              # bolsas de nebulosa sobre y bajo el núcleo

# Carriles de la mitad azul: (puntos, semiancho en casillas).
LANES = [
    ([B, cell(-62, -12), PTL, P1, cell(-10, -32), PT], 3.2),     # carril superior
    ([B, cell(-60, 12), PBL, P3, cell(-10, 32), PB], 3.2),       # carril inferior
    ([cell(-52, 11), MD, J, N], 3.0),                            # diagonal media al núcleo
    ([P1, V1, J], 2.8),                                          # conector pronexo 1 → cruce
    ([P3, V3, J], 2.8),                                          # conector pronexo 3 → cruce
    ([N, ZT], 2.4), ([N, ZB], 2.4),                              # bolsas del núcleo
]
# Plazas: (centro, radio en casillas, ¿plataforma?)
PLAZAS = [
    (B, 6.5, True), (N, 7.0, True), (P1, 4.5, True), (P3, 4.5, True),
    (PTL, 3.5, False), (PBL, 3.5, False), (PT, 4.0, False), (PB, 4.0, False), (J, 4.0, False),
]
# Las seis nebulosas: cuatro en el eje (válidas para las dos mitades) y una lateral por lado.
NEBULOSAS = [(PT, 4.6), (ZT, 4.6), (ZB, 4.6), (PB, 4.6), (MD, 4.4)]


def seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy
    t = 0 if length == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def wobble(x, y):
    """Borde irregular, determinista: los carriles no quedan como reglas."""
    return 0.45 * math.sin(x * 0.9 + y * 0.35) + 0.35 * math.sin(y * 1.3 - x * 0.5)


def left_half(x: int, y: int):
    """Terreno de una casilla de la mitad azul (x <= y). Devuelve (terreno, es_plaza)."""
    p = (x + 0.5, y + 0.5)
    for center, radius in NEBULOSAS:
        if math.dist(p, center) <= radius + wobble(x, y) * 0.6:
            return NEBULA, False
    for center, radius, platform in PLAZAS:
        if math.dist(p, center) <= radius + (0 if platform else wobble(x, y) * 0.5):
            return EMPTY, platform
    for points, half in LANES:
        for a, b in zip(points, points[1:]):
            if seg_dist(p, a, b) <= half + wobble(x, y) * 0.5:
                return EMPTY, False
    return ASTEROID, False


# ---------------------------------------------------------------- terreno
logic = [[ASTEROID] * W for _ in range(H)]
platform = [[False] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        sx, sy = (x, y) if x <= y else (y, x)
        logic[y][x], platform[y][x] = left_half(sx, sy)
# Borde del mapa siempre cerrado.
for i in range(W):
    for x, y in ((i, 0), (i, H - 1), (0, i), (W - 1, i)):
        logic[y][x], platform[y][x] = ASTEROID, False

walk = lambda x, y: 0 <= x < W and 0 <= y < H and logic[y][x] in (EMPTY, NEBULA)


def snap(point):
    return (int(point[0]), int(point[1]))


# ---------------------------------------------------------------- marcadores de juego
spawn1 = snap(B)
spawn2 = mirror(spawn1)
core = (48, 48)
pronexos = [snap(P1), mirror(snap(P1)), snap(P3), mirror(snap(P3))]          # índices 1, 2, 3, 4
half_metals = [snap(PTL), snap(PBL), (snap(P1)[0] + 3, snap(P1)[1] - 1), (snap(P3)[0] + 3, snap(P3)[1] + 1), snap(J)]
metals = [m for metal in half_metals for m in (metal, mirror(metal))]
portals = {'A': [snap(PT), snap(ZT)], 'B': [snap(PB), snap(ZB)]}

goals = [spawn1, spawn2, core, *pronexos, *metals]
for gx, gy in goals:
    if not walk(gx, gy):
        raise SystemExit(f'Objetivo sobre terreno cerrado: {(gx, gy)}')


def reachable(start):
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = (x + dx, y + dy)
            if nxt not in seen and walk(*nxt):
                seen.add(nxt)
                queue.append(nxt)
    return seen


open_cells = reachable(spawn1)
missing = [goal for goal in goals if goal not in open_cells]
if missing:
    raise SystemExit(f'Objetivos inalcanzables desde la base azul: {missing}')
# Bolsas que nadie puede alcanzar se rellenan: no dejan suelo suelto que confunda al jugador.
for y in range(H):
    for x in range(W):
        if walk(x, y) and (x, y) not in open_cells:
            logic[y][x], platform[y][x] = ASTEROID, False


# ---------------------------------------------------------------- obstáculos y decorado
def beside(a, b, t, side, offset):
    """Punto a `offset` casillas del eje del tramo a→b, en la fracción t del tramo (side ±1 elige la orilla)."""
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    nx, ny = -(by - ay) / length, (bx - ax) / length
    return (ax + (bx - ax) * t + nx * side * offset, ay + (by - ay) * t + ny * side * offset)


UPPER, LOWER, MIDDLE, CONN1, CONN3 = (points for points, _ in LANES[:5])
EDGE = 3.2  # semiancho de los carriles principales
# Naves destruidas (OBSTACLE_RING): las del borde exterior ya estaban; las de dentro angostan el carril
# a unas cuatro casillas sin cerrarlo. El juego las dibuja y cierra sus casillas al leer el mapa.
WRECKS_HALF = [
    ('nave_destruida_2', beside(UPPER[1], UPPER[2], 0.5, 1, EDGE + 0.3)),
    ('estacion_rota', beside(LOWER[1], LOWER[2], 0.5, -1, EDGE + 0.3)),
    ('cristales', beside(UPPER[3], UPPER[4], 0.4, -1, EDGE + 0.3)),
    ('satelite', beside(LOWER[3], LOWER[4], 0.4, 1, EDGE + 0.3)),
    ('nave_destruida_1', beside(UPPER[0], UPPER[1], 0.45, -1, EDGE - 0.6)),
    ('nave_destruida_2', beside(MIDDLE[0], MIDDLE[1], 0.35, 1, 2.6)),
    ('estacion_rota', beside(CONN1[1], CONN1[2], 0.45, 1, 2.3)),
    ('nave_destruida_1', beside(LOWER[2], LOWER[3], 0.55, 1, EDGE - 0.6)),
    ('nave_destruida_2', beside(UPPER[1], UPPER[2], 0.85, -1, EDGE - 0.5)),
    ('estacion_rota', beside(UPPER[2], UPPER[3], 0.15, -1, EDGE - 0.4)),
]
WRECKS = [(model, at) for model, half in WRECKS_HALF for at in (half, mirror(half))]
WRECK_RADIUS = {'nave_destruida_1': 2, 'estacion_rota': 1.5, 'nave_destruida_2': 1.5, 'cristales': 1, 'satelite': 0.5}
# Antenas y satélites: (sprite, centro, lado del bloqueo en casillas, escala de la imagen).
# Se apoyan medio dentro del carril para romper su ancho; su huella es `blocked` en la capa lógica.
PROPS_HALF = [
    ('deco_antena_larga_1', beside(UPPER[0], UPPER[1], 0.8, 1, EDGE - 0.4), 1, 0.75),
    ('deco_antena_plato_1', beside(UPPER[1], UPPER[2], 0.25, -1, EDGE - 0.4), 1, 0.85),
    ('deco_satelite_baliza', beside(UPPER[2], UPPER[3], 0.5, 1, EDGE - 1.0), 3, 0.9),
    ('deco_antena_multipolar_2', beside(UPPER[3], UPPER[4], 0.65, 1, EDGE - 0.8), 2, 0.7),
    ('deco_satelite_dorsal', beside(UPPER[4], UPPER[5], 0.2, 1, EDGE - 1.0), 3, 0.7),
    ('deco_antena_plato_2', beside(UPPER[0], UPPER[1], 0.2, 1, EDGE - 0.4), 1, 0.85),
    ('deco_antena_larga_3', beside(LOWER[0], LOWER[1], 0.7, -1, EDGE - 0.4), 1, 0.75),
    ('deco_antena_multipolar_1', beside(LOWER[1], LOWER[2], 0.25, 1, EDGE - 0.8), 2, 0.7),
    ('deco_antena_larga_4', beside(LOWER[1], LOWER[2], 0.75, -1, EDGE - 0.4), 1, 0.75),
    ('deco_satelite_frontal', beside(LOWER[2], LOWER[3], 0.25, -1, EDGE - 1.0), 3, 0.7),
    ('deco_satelite_2', beside(LOWER[3], LOWER[4], 0.65, -1, EDGE - 1.0), 3, 0.65),
    ('deco_antena_plato_3', beside(LOWER[4], LOWER[5], 0.25, -1, EDGE - 0.4), 1, 0.85),
    ('deco_antena_plato_2', beside(CONN1[0], CONN1[1], 0.55, -1, 2.4), 1, 0.85),
    ('deco_antena_larga_2', beside(CONN1[1], CONN1[2], 0.2, -1, 2.4), 1, 0.75),
    ('deco_antena_larga_2', beside(CONN3[0], CONN3[1], 0.5, 1, 2.4), 1, 0.75),
    ('deco_antena_larga_4', beside(CONN3[1], CONN3[2], 0.6, -1, 2.4), 1, 0.75),
    ('deco_antena_multipolar_2', beside(MIDDLE[1], MIDDLE[2], 0.6, -1, 2.3), 2, 0.7),
    ('deco_antena_plato_3', beside(MIDDLE[0], MIDDLE[1], 0.15, -1, 2.4), 1, 0.85),
]


def wreck_cells(x, y, radius):
    """Las mismas casillas que cierra el juego (obstacleCells en packages/sim/src/mapas/obstaculos.ts)."""
    cells = set()
    for cy in range(math.floor(y - radius), math.floor(y + radius) + 1):
        for cx in range(math.floor(x - radius), math.floor(x + radius) + 1):
            if (cx, cy) == (math.floor(x), math.floor(y)) or math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= radius:
                cells.add((cx, cy))
    return cells


def footprint(center, side):
    left, top = round(center[0] - side / 2), round(center[1] - side / 2)
    return {(left + dx, top + dy) for dx in range(side) for dy in range(side)}


near_goal = {(gx + dx, gy + dy) for gx, gy in goals for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
placed_props = []
for sprite, center, side, scale in PROPS_HALF:
    if center[0] > center[1]:
        raise SystemExit(f'{sprite}: los apoyos se definen en la mitad azul (x <= y)')
    cells = footprint(center, side)
    if cells & near_goal or any(logic[y][x] == NEBULA for x, y in cells):
        raise SystemExit(f'{sprite} pisa un objetivo o una nebulosa: {sorted(cells)}')
    for x, y in cells | {mirror(c) for c in cells}:
        logic[y][x] = BLOCKED
    placed_props += [(sprite, center, side, scale), (sprite, mirror(center), side, scale)]

closed = {cell for model, (x, y) in WRECKS for cell in wreck_cells(x, y, WRECK_RADIUS[model])}
if closed & set(goals):
    raise SystemExit('Una nave destruida tapa un objetivo')
for base in (spawn1, spawn2):
    seen, queue = {base}, deque([base])
    while queue:
        x, y = queue.popleft()
        for nxt in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if nxt not in seen and walk(*nxt) and nxt not in closed:
                seen.add(nxt)
                queue.append(nxt)
    if any(goal not in seen for goal in goals):
        raise SystemExit(f'Los obstáculos cortan el paso desde {base}')

for y in range(H):
    for x in range(W):
        if logic[y][x] != logic[x][y]:
            raise SystemExit(f'El mapa no es simétrico en {(x, y)}')

# ---------------------------------------------------------------- capas de tiles
dist = [[99] * W for _ in range(H)]  # distancia (en casillas) al suelo abierto, para repartir asteroides
queue = deque()
for y in range(H):
    for x in range(W):
        if walk(x, y):
            dist[y][x] = 0
            queue.append((x, y))
while queue:
    x, y = queue.popleft()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and dist[ny][nx] > dist[y][x] + 1:
                dist[ny][nx] = dist[y][x] + 1
                queue.append((nx, ny))

fondo = [[rng.choice(ESPACIO) for _ in range(W)] for _ in range(H)]
for x, y in [(4, 4), (20, 3), (3, 22), (90, 90), (75, 92), (92, 73), (8, 60), (60, 8), (88, 35), (35, 88), (50, 2), (2, 50)]:
    fondo[y][x] = PLANETA
visual = [[0] * W for _ in range(H)]
deco = [[0] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        # Elección simétrica: la casilla espejo saca el mismo número.
        local = random.Random((min(x, y) * 131 + max(x, y)) * 7919)
        terrain = logic[y][x]
        if terrain == NEBULA:
            visual[y][x] = local.choice(NEBULOSA)
        elif terrain in (EMPTY, BLOCKED):  # bajo una antena o un satélite sigue el suelo del carril
            visual[y][x] = local.choice(PLATAFORMA) if platform[y][x] else local.choice(CAMINO)
        else:
            visual[y][x] = local.choice(PROFUNDO)
            d = dist[y][x]
            roll = local.random()
            if d == 1 and roll < 0.38:
                deco[y][x] = local.choice(AST_CHICO)
            elif d == 2 and roll < 0.55:
                deco[y][x] = local.choice(AST_MEDIANO + AST_CHICO)
            elif d >= 3 and roll < 0.62:
                deco[y][x] = local.choice(AST_GRANDE + AST_MEDIANO)
altura = [[ALTURA_0] * W for _ in range(H)]

# ---------------------------------------------------------------- objetos
next_id = 1
def new_id():
    global next_id
    value = next_id
    next_id += 1
    return value


def props(values: dict) -> str:
    if not values:
        return ''
    lines = []
    for name, value in values.items():
        if isinstance(value, bool):
            lines.append(f'    <property name="{name}" type="bool" value="{str(value).lower()}"/>')
        elif isinstance(value, int):
            lines.append(f'    <property name="{name}" type="int" value="{value}"/>')
        elif isinstance(value, float):
            lines.append(f'    <property name="{name}" type="float" value="{value}"/>')
        else:
            lines.append(f'    <property name="{name}" value="{value}"/>')
    return '   <properties>\n' + '\n'.join(lines) + '\n   </properties>\n'


def fmt(value: float) -> str:
    return f'{round(value, 2):g}'


def point(kind: str, x: float, y: float, values: dict | None = None, name: str = '') -> str:
    return (f'  <object id="{new_id()}" name="{name}" type="{kind}" x="{fmt(x * TILE)}" y="{fmt(y * TILE)}">\n'
            f'{props(values or {})}   <point/>\n  </object>')


def rect(kind: str, x: float, y: float, w: float, h: float, values: dict | None = None, name: str = '') -> str:
    body = props(values or {})
    head = f'  <object id="{new_id()}" name="{name}" type="{kind}" x="{fmt(x * TILE)}" y="{fmt(y * TILE)}" width="{fmt(w * TILE)}" height="{fmt(h * TILE)}"'
    return f'{head}>\n{body}  </object>' if body else f'{head}/>'


def image(model: str, x: float, y: float, gid: int | None = None) -> str:
    width, height = ART[model]
    return (f'  <object id="{new_id()}" name="{model}" gid="{gid or GID[model]}" x="{fmt(x * TILE)}" y="{fmt(y * TILE)}" '
            f'width="{width}" height="{height}"/>')


def both(cells):
    """Una posición de la mitad azul y su espejo."""
    return [c for p in cells for c in (p, mirror(p))]


# Estructuras: imágenes (ancla abajo al centro). Desplazamientos tomados del Espiral original.
estructuras = [
    image('base_jugador', spawn1[0] + 0.0, spawn1[1] + 0.4),
    image('base_enemiga', spawn2[0] + 0.0, spawn2[1] + 0.4),
    image('pilar', core[0] + 0.25, core[1] + 0.25),
    image('escudo', core[0] + 0.41, core[1] + 0.41),
]
estructuras += [image('pronexo', px + 0.69, py + 0.69) for px, py in pronexos]
estructuras += [image('recurso', mx + 0.94, my + 0.94) for mx, my in metals]
estructuras += [image('agujero', ax + 1.56, ay + 1.56) for pair in portals.values() for ax, ay in pair]
estructuras += [image('torre_vigilancia', tx + 0.5, ty + 0.5) for tx, ty in both([(spawn1[0] + 5, spawn1[1] + 3)])]
# Restos decorativos en los campos de asteroides (no tapan carriles: su lógica ya es asteroide).
for model, at in [('estacion_rota', cell(-58, 0)), ('restos_nave', cell(-34, -12)), ('nave_destruida_2', cell(-8, -24)),
                  ('cristales', cell(-80, -6)), ('satelite', cell(-30, 16)), ('restos_nave', cell(-10, 24))]:
    for x, y in both([at]):
        estructuras.append(image(model, x, y))


def prop_image(sprite, center, side, scale):
    """Imagen anclada abajo al centro de su huella, escalada al tamaño del juego."""
    source = 'deco_satelite_baliza_1' if sprite == 'deco_satelite_baliza' else sprite
    width, height = Image.open(KIT / 'assets-externos' / 'sprites' / f'{source}.png').size
    x, y = center[0] + side * 0.3, center[1] + side * 0.3
    return (f'  <object id="{new_id()}" name="{sprite[5:]}" gid="{DECORADO_GID + DECORADO_TILE[sprite]}" x="{fmt(x * TILE)}" '
            f'y="{fmt(y * TILE)}" width="{round(width * scale)}" height="{round(height * scale)}"/>')


estructuras += [prop_image(*prop) for prop in placed_props]

zonas = [
    ('Base Azul', spawn1), ('Base Roja', spawn2), ('Núcleo', core),
    ('Portal Norte', portals['A'][0]), ('Portal Sur', portals['B'][0]),
    ('Bolsa Norte', portals['A'][1]), ('Bolsa Sur', portals['B'][1]),
    ('Nebulosa Oeste', snap(MD)), ('Nebulosa Este', mirror(snap(MD))),
    ('Cruce Oeste', snap(J)), ('Cruce Este', mirror(snap(J))),
]
objetos = [
    point('spawn', spawn1[0] + 0.33, spawn1[1], {'owner': 1}),
    point('spawn', spawn2[0] + 0.33, spawn2[1], {'owner': 2}),
    point('pilar', core[0], core[1]),
    point('barrera', core[0], core[1], {'hp': 500}),
]
objetos += [point('pronexo', px + 0.5, py + 0.5, {'index': index + 1, 'radio': 3}) for index, (px, py) in enumerate(pronexos)]
for pair_id, (outer, inner) in portals.items():
    for ax, ay in (outer, inner):
        objetos.append(point('agujero', ax + 0.5, ay + 0.5,
                             {'cycleSeconds': 90, 'openSeconds': 30, 'pairId': pair_id, 'warningSeconds': 5}))
objetos += [point('recurso', mx + 0.5, my + 0.5, {'amount': 300}) for mx, my in metals]
objetos += [point('mob_spawn', mx + 0.5, my + 0.5, {'count': 3}) for mx, my in [(44, 51), (51, 44), (44, 44), (52, 52)]]
objetos += [point('torre_vigilancia', tx + 0.5, ty + 0.5, {'visionRadius': 10}) for tx, ty in both([(spawn1[0] + 5, spawn1[1] + 3)])]
objetos += [point('zona', zx + 0.5, zy + 0.5, {'nombre': name}) for name, (zx, zy) in zonas]

objetos += [point('OBSTACLE_RING', x, y, {'modelo': model}, name='Punto Obstaculo') for model, (x, y) in WRECKS]

robots = []
for x, y in [(43.5, 50.5), (50.5, 43.5), (44.5, 44.5)]:
    robots.append(f'  <object id="{new_id()}" name="robot_capsula" gid="{ROBOT_CAPSULA}" x="{fmt(x * TILE)}" y="{fmt(y * TILE)}" width="72" height="80"/>')
for x, y in both([(snap(J)[0] + 1.5, snap(J)[1] - 2.5)]):
    robots.append(f'  <object id="{new_id()}" name="robotsitoo" gid="{ROBOTSITO}" x="{fmt(x * TILE)}" y="{fmt(y * TILE)}" width="64" height="64"/>')

# Eventos: ocho zonas de caída en dos grupos que se turnan, y tres nieblas móviles con dos rutas cada una.
SATELITE = {'amount': 1, 'damage': 40, 'intervalSeconds': 45, 'objeto': 'satelite', 'radius': 1, 'warningSeconds': 4}


def drop_zone(name, center, group, size=7):
    cx, cy = snap(center)
    return rect('zona_caida', cx - size // 2, cy - size // 2, size, size, {**SATELITE, 'grupo': group}, name=name)


eventos = [
    drop_zone('caida_norte', cell(0, -31), 1),
    drop_zone('caida_sur', cell(0, 31), 1),
    drop_zone('caida_oeste', J, 1),
    drop_zone('caida_este', mirror(J), 1),
    drop_zone('caida_noroeste', V1, 2),
    drop_zone('caida_noreste', mirror(V1), 2),
    drop_zone('caida_suroeste', V3, 2),
    drop_zone('caida_sureste', mirror(V3), 2),
]
NIEBLAS = [
    # nombre, centro, ruta 1 (mitad azul), segundos hasta la primera salida
    ('niebla_norte', snap(PT), [cell(-10, -32), P1], 40),
    ('niebla_centro', snap(ZT), [V1], 62),
    ('niebla_sur', snap(PB), [cell(-10, 32), P3], 84),
]
for index, (name, (cx, cy), route, start) in enumerate(NIEBLAS):
    eventos.append(rect('niebla_movil', cx - 3, cy - 3, 6, 6, {
        'maxCells': 13, 'cellsPerSecond': 1.25, 'warningSeconds': 5, 'holdSeconds': 6, 'restSeconds': 20,
        'startSeconds': start, 'slowFactor': 2, 'visionRadius': 2,
    }, name=name))
    # La niebla del centro arranca por la derecha y las otras por la izquierda: nunca cargan las dos al mismo lado.
    sides = [route, [mirror(p) for p in route]]
    if index == 1:
        sides.reverse()
    for order, waypoints in enumerate(sides, start=1):
        origin = (cx, cy)
        points = ' '.join(f'{fmt((px - origin[0]) * TILE)},{fmt((py - origin[1]) * TILE)}' for px, py in [origin, *waypoints])
        eventos.append(f'  <object id="{new_id()}" name="{name} ruta {order}" type="ruta_niebla" x="{fmt(origin[0] * TILE)}" y="{fmt(origin[1] * TILE)}">\n'
                       f'{props({"niebla": name, "orden": order})}   <polyline points="{points}"/>\n  </object>')

# Vista previa de obstáculos en Tiled (el juego los dibuja desde la simulación; esta capa no se dibuja).
vista = []
for model, (x, y) in WRECKS:
    width, height = ART[model]
    shift = height * 0.28
    vista.append(f'  <object id="{new_id()}" name="{model}" gid="{GID[model]}" x="{fmt(x * TILE + shift)}" y="{fmt(y * TILE + shift)}" width="{width}" height="{height}"/>')


# ---------------------------------------------------------------- escritura
def csv(grid):
    rows = [','.join(str(v) for v in row) for row in grid]
    return ',\n'.join(rows)


def layer(layer_id, name, grid, extra=''):
    return (f' <layer id="{layer_id}" name="{name}" width="{W}" height="{H}"{extra}>\n  <data encoding="csv">\n'
            f'{csv(grid)}\n</data>\n </layer>')


def group(group_id, name, objects, extra=''):
    return f' <objectgroup draworder="index" id="{group_id}" name="{name}"{extra}>\n' + '\n'.join(objects) + '\n </objectgroup>'


parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    f'<map version="1.10" tiledversion="1.12.2" orientation="isometric" renderorder="right-down" width="{W}" height="{H}" '
    f'tilewidth="64" tileheight="32" infinite="0" backgroundcolor="#05070f" nextlayerid="12" nextobjectid="{next_id}">',
    ' <editorsettings>\n  <export target="espiral-estelar_2.json" format="json"/>\n </editorsettings>',
    ' <properties>\n  <property name="nebulosaActiva" type="bool" value="true"/>\n </properties>',
    ' <tileset firstgid="1" source="tilesets/logica.tsx"/>',
    ' <tileset firstgid="9" source="tilesets/suelo.tsx"/>',
    ' <tileset firstgid="24" source="tilesets/asteroides.tsx"/>',
    ' <tileset firstgid="32" source="tilesets/estructuras.tsx"/>',
    ' <tileset firstgid="48" source="tilesets/plataformas.tsx"/>',
    ' <tileset firstgid="51" source="tilesets/altura.tsx"/>',
    ' <tileset firstgid="53" source="assets-externos/robotsitoo.tsx"/>',
    ' <tileset firstgid="61" source="assets-externos/robot-sal.tsx"/>',
    ' <tileset firstgid="69" source="planetafondo.tsx"/>',
    f' <tileset firstgid="{DECORADO_GID}" source="tilesets/decorado_externo.tsx"/>',
    layer(1, 'fondo', fondo),
    layer(2, 'terreno-visual', visual),
    layer(3, 'decoracion', deco),
    layer(4, 'altura', altura, ' opacity="0.35"'),
    layer(5, 'logica', logic, ' opacity="0.45"'),
    group(6, 'estructuras', estructuras),
    group(7, 'objetos', objetos),
    group(8, 'robots', robots),
    group(9, 'eventos', eventos, ' color="#ff5a3c"'),
    f' <objectgroup id="11" name="obstaculos-vista" locked="1">\n' + '\n'.join(vista) + '\n </objectgroup>',
    '</map>',
]
TMX.write_text('\n'.join(parts) + '\n', encoding='utf-8')

if __name__ == '__main__':
    chars = {EMPTY: '.', NEBULA: 'n', ASTEROID: '#', BLOCKED: 'X'}
    marks = {spawn1: 'A', spawn2: 'B', core: 'N', **{p: str(i + 1) for i, p in enumerate(pronexos)}, **{m: 'R' for m in metals}}
    for pair in portals.values():
        for p in pair:
            marks[p] = 'O'
    for y in range(H):
        print(''.join(marks.get((x, y), chars[logic[y][x]]) for x in range(W)))
    walkable = sum(walk(x, y) for y in range(H) for x in range(W))
    print(f'{TMX.name}: {walkable} casillas abiertas, {sum(logic[y][x] == NEBULA for y in range(H) for x in range(W))} de nebulosa, '
          f'{len(objetos)} marcadores, {len(eventos)} eventos')
