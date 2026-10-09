#!/usr/bin/env python3
"""Genera trascendencia-estelar.tmx: archipiélago espacial para cuatro flotas (163×163, isométrico 64×32).

Diseño (vista de pantalla):
- Isla central con el Núcleo y, alrededor, ocho islas que flotan en el vacío.
- Cuatro islas de base en las puntas: azul a la izquierda (1) y arriba (3), roja a la derecha (2) y abajo (4).
- Cuatro islas de pronexo en las diagonales y dos pronexos más dentro de la isla central: seis en total.
- Puentes principales: de la isla central a cada isla. Siempre abiertos.
- Camino de ronda: une cada base con las dos islas de pronexo vecinas sin pasar por el centro. Cada tramo
  lleva dos barreras destruibles (una de hielo y una de chatarra) y, entre ellas, un remanso con una luna
  que hay que rodear. Mientras nadie rompa las barreras, toda ruta cruza la isla central.
- Veinte recursos: dos por base, uno en el islote de cada puente de base, uno por isla de pronexo y cuatro
  en la isla central.
- Una nebulosa morada a mitad de cada puente de pronexo, con su niebla móvil, y ocho zonas de caída de
  satélites en dos grupos que se turnan.
- El vacío es espacio abierto: estrellas que titilan, planetas, nubes de gas, galaxias, cometas, púlsares
  y constelaciones de roca de hielo.
- Emblemas de Stellar pintados en el suelo: uno dorado bajo el Núcleo, uno ante cada base y uno bajo cada
  pronexo exterior.

El terreno es simétrico en las ocho direcciones y los objetos de juego giran de cuarto en cuarto de vuelta,
así que las cuatro flotas recorren las mismas distancias. El fondo lejano no es simétrico a propósito.
Uso:  python herramientas/diseno_trascendencia.py
Después exportar a JSON:  tiled --export-map json trascendencia-estelar.tmx trascendencia-estelar.json
"""
from __future__ import annotations

import math
import random
from collections import deque
from pathlib import Path

from PIL import Image

KIT = Path(__file__).resolve().parent.parent
TMX = KIT / 'trascendencia-estelar.tmx'
W = H = 163
LAST = W - 1
MID = LAST // 2  # casilla central (81, 81)
TILE = 32  # Tiled guarda las posiciones de objetos en píxeles de alto de casilla en ambos ejes.
ROOT2 = math.sqrt(2)

# Terreno de la capa `logica` (tileset logica, firstgid 1).
EMPTY, NEBULA, ASTEROID, BLOCKED = 1, 2, 3, 6
# Suelo (firstgid 9).
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
# Emblemas de Stellar (firstgid 118), anclados al centro: los genera logo_stellar.py.
LOGO_GID = 118
LOGO, LOGO_ORO = LOGO_GID, LOGO_GID + 1
# Decorado externo (firstgid 120): antenas y satélites.
DECORADO_GID = 120
DECORADO = ['deco_satelite_1', 'deco_satelite_2', 'deco_satelite_frontal', 'deco_satelite_dorsal',
            'deco_antena_larga_1', 'deco_antena_larga_2', 'deco_antena_larga_3', 'deco_antena_larga_4',
            'deco_antena_plato_1', 'deco_antena_plato_2', 'deco_antena_plato_3',
            'deco_antena_multipolar_1', 'deco_antena_multipolar_2', 'deco_satelite_baliza']  # la baliza es el tile animado
DECORADO_TILE = {name: index for index, name in enumerate(DECORADO)}
# Decorado espacial, fabricado por assets_espacio.py.
HIELO_GID = 141      # hielo.tsx: 3 grandes, 3 medianos, 2 chicos
HIELO_GRANDE, HIELO_MEDIANO, HIELO_CHICO = [141, 142, 143], [144, 145, 146], [147, 148]
ESTRELLA_GID = 149   # estrellas.tsx: cuatro estrellas animadas, una cada cuatro tiles
ESTRELLAS = [ESTRELLA_GID + 4 * star for star in range(4)]
ESPACIO_GID = 165    # espacio.tsx, anclado al centro
ESPACIO = ['planeta_00', 'planeta_01', 'planeta_02', 'planeta_03', 'planeta_04', 'planeta_05', 'planeta_06', 'planeta_07',
           'planeta_08', 'planeta_09', 'estacion_lejana_1', 'estacion_lejana_2', 'nube_violeta', 'nube_azul', 'nube_rosa',
           'galaxia', 'cometa_1', 'cometa_2', 'cometa_3', 'cometa_4', 'cometa_5', 'cometa_6', 'pulsar_1']
ESPACIO_TILE = {name: index for index, name in enumerate(ESPACIO)}
DESTRUIBLE_GID = 193  # destruibles.tsx, anclado abajo
DESTRUIBLE = {'barrera_hielo': 193, 'barrera_hielo_rota': 194, 'barrera_chatarra': 195, 'cristal_gigante_1': 196, 'cristal_gigante_2': 197}
BARRERA_HP = {'hielo': 600, 'chatarra': 900}

rng = random.Random(2026)


# ---------------------------------------------------------------- geometría
# Coordenadas de pantalla (u, v): u crece hacia la derecha y v hacia abajo, con el Núcleo en (0, 0).
# Una unidad de u o de v es una casilla en diagonal, o sea √2 casillas de distancia.
def cell(u: int, v: int) -> tuple[int, int]:
    """Punto de pantalla → casilla."""
    return (MID + v + u, MID + v - u)


def pos(u: float, v: float) -> tuple[float, float]:
    """Punto de pantalla → posición exacta, en casillas."""
    return (MID + 0.5 + v + u, MID + 0.5 + v - u)


def turn(point):
    """Un cuarto de vuelta en pantalla: izquierda → arriba → derecha → abajo."""
    return (-point[1], point[0])


def turns(point):
    """El punto y sus tres giros: una copia por flota."""
    out = [point]
    for _ in range(3):
        out.append(turn(out[-1]))
    return out


def eight(point):
    """El punto, su espejo y los giros de ambos: las ocho copias que tiene el terreno."""
    return [*turns(point), *turns((point[0], -point[1]))]


def rotate_cell(x: int, y: int) -> tuple[int, int]:
    return (LAST - y, x)


def scaled(u: float, v: float) -> tuple[float, float]:
    """Punto de pantalla del octavo de diseño → casillas, donde las distancias ya son reales."""
    return (u * ROOT2, v * ROOT2)


# El terreno se define en un octavo del mapa (a >= b >= 0).
CENTRO = (0.0, 0.0)
BASE = scaled(55, 0)        # isla de base, en la punta
ISLOTE = scaled(33, 0)      # ensanche a mitad del puente de base
PRONEXO = scaled(30, 30)    # isla de pronexo, en la diagonal
NIEBLA = scaled(18, 18)     # nebulosa a mitad del puente de pronexo
REMANSO = scaled(42.5, 15)  # ensanche a mitad del camino de ronda, con una luna en medio
# Islas: (centro, radio, radio de la plataforma interior).
ISLAS = [(CENTRO, 21.0, 9.0), (BASE, 12.5, 7.0), (PRONEXO, 10.5, 5.0), (ISLOTE, 5.0, 0.0), (REMANSO, 5.4, 0.0)]
# Puentes principales: (extremo, semiancho). Todos salen de la isla central.
PUENTES = [(BASE, 2.8), (PRONEXO, 2.5)]
NEBULOSAS = [(NIEBLA, 4.4)]
RONDA_SEMIANCHO = 2.2
RONDA_LARGO = math.dist(BASE, PRONEXO)
# Barreras del camino de ronda: (fracción del tramo desde la base, material).
BARRERAS = [(0.33, 'hielo'), (0.68, 'chatarra')]
BARRERA_SEMIGROSOR = 1.0
LUNA_RADIO = 1.6
# Constelaciones de hielo en el vacío: nodos y aristas, en el octavo de diseño.
NODOS = {'A': (26, 14), 'B': (30, 10), 'C': (40, 7), 'D': (34, 16), 'E': (50, 20), 'F': (56, 16), 'G': (48, 27), 'H': (44, 30)}
ARISTAS = ['AB', 'BC', 'CD', 'DA', 'BD', 'FE', 'EG', 'GH']
CRISTALES_GIGANTES = [('cristal_gigante_1', 'B'), ('cristal_gigante_2', 'F')]


def seg_param(p, a, b):
    """Distancia de p al tramo a→b y fracción del tramo donde cae."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy
    t = 0 if length == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length))
    return math.hypot(px - ax - t * dx, py - ay - t * dy), t


def wobble(a, b):
    """Borde irregular, determinista: las costas no quedan como compases."""
    return 0.45 * math.sin(a * 0.9 + b * 0.35) + 0.35 * math.sin(b * 1.3 - a * 0.5)


def octant(x: int, y: int) -> tuple[float, float]:
    """Casilla → su punto equivalente en el octavo de diseño."""
    u, v = (x - y) / 2, (x + y) / 2 - MID
    a, b = max(abs(u), abs(v)), min(abs(u), abs(v))
    return (a * ROOT2, b * ROOT2)


def terrain_at(x: int, y: int):
    """Devuelve (terreno, es_plataforma, cierre): cierre es 'luna', un material de barrera o None."""
    p = octant(x, y)
    rough = wobble(*p)
    if math.dist(p, REMANSO) <= LUNA_RADIO:
        return EMPTY, False, 'luna'
    for center, radius in NEBULOSAS:
        if math.dist(p, center) <= radius + rough * 0.6:
            return NEBULA, False, None
    for center, radius, deck in ISLAS:
        distance = math.dist(p, center)
        if distance <= radius + rough * 0.8:
            return EMPTY, distance <= deck, None
    for end, half in PUENTES:
        if seg_param(p, CENTRO, end)[0] <= half + rough * 0.4:
            return EMPTY, False, None
    distance, t = seg_param(p, BASE, PRONEXO)
    if distance <= RONDA_SEMIANCHO + rough * 0.4:
        for at, material in BARRERAS:
            if abs(t - at) * RONDA_LARGO <= BARRERA_SEMIGROSOR:
                return EMPTY, False, material
        return EMPTY, False, None
    return ASTEROID, False, None


# ---------------------------------------------------------------- terreno
logic = [[ASTEROID] * W for _ in range(H)]
platform = [[False] * W for _ in range(H)]
seal = [[None] * W for _ in range(H)]
for y in range(1, H - 1):  # el borde del mapa queda siempre cerrado
    for x in range(1, W - 1):
        logic[y][x], platform[y][x], seal[y][x] = terrain_at(x, y)

walk = lambda x, y: 0 <= x < W and 0 <= y < H and logic[y][x] in (EMPTY, NEBULA)

# ---------------------------------------------------------------- marcadores de juego
# Dueños: 1 y 3 son la flota azul (jugador y aliado), 2 y 4 la roja. El 1 y el 2 quedan enfrentados.
spawns = {1: cell(-55, 0), 2: cell(55, 0), 3: cell(0, -55), 4: cell(0, 55)}
core = cell(0, 0)
pronexos = [cell(-30, -30), cell(30, -30), cell(-30, 30), cell(30, 30), cell(-9, 9), cell(9, -9)]  # índices 1 a 6
metals = [cell(*p) for seed in [(57, 6), (57, -6), (33, 0), (34, 34), (11, 0)] for p in turns(seed)]
mobs = [cell(*p) for p in turns((3, 3))]
towers = [cell(*p) for p in turns((60, 0))]
nieblas = {'niebla_noroeste': (-18, -18), 'niebla_sureste': (18, 18), 'niebla_noreste': (18, -18), 'niebla_suroeste': (-18, 18)}

goals = [*spawns.values(), core, *pronexos, *metals]
if len(set(goals)) != len(goals):
    raise SystemExit('Dos objetivos caen en la misma casilla')
for gx, gy in goals:
    if not walk(gx, gy) or seal[gy][gx]:
        raise SystemExit(f'Objetivo sobre terreno cerrado: {(gx, gy)}')


def reachable(start, closed=frozenset()):
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = (x + dx, y + dy)
            if nxt not in seen and nxt not in closed and walk(*nxt):
                seen.add(nxt)
                queue.append(nxt)
    return seen


# Con las barreras rotas todo el suelo debe quedar unido; lo que nadie alcance se rellena.
open_cells = reachable(spawns[1])
missing = [goal for goal in goals if goal not in open_cells]
if missing:
    raise SystemExit(f'Objetivos inalcanzables desde la base azul: {missing}')
for y in range(H):
    for x in range(W):
        if walk(x, y) and (x, y) not in open_cells:
            logic[y][x], platform[y][x], seal[y][x] = ASTEROID, False, None

# Lunas y barreras cierran sus casillas. Cada barrera es un grupo de casillas contiguas.
moon_cells = {(x, y) for y in range(H) for x in range(W) if seal[y][x] == 'luna'}
barrier_cells = {(x, y): seal[y][x] for y in range(H) for x in range(W) if seal[y][x] in BARRERA_HP}
for x, y in [*moon_cells, *barrier_cells]:
    logic[y][x] = BLOCKED
barriers = []  # (material, casillas ordenadas)
pending = set(barrier_cells)
while pending:
    start = min(pending)
    group, queue = {start}, deque([start])
    pending.discard(start)
    while queue:
        x, y = queue.popleft()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nxt = (x + dx, y + dy)
                if nxt in pending and barrier_cells[nxt] == barrier_cells[start]:
                    pending.discard(nxt)
                    group.add(nxt)
                    queue.append(nxt)
    barriers.append((barrier_cells[start], sorted(group)))
if len(barriers) != 8 * len(BARRERAS):
    raise SystemExit(f'Se esperaban {8 * len(BARRERAS)} barreras y salieron {len(barriers)}')
# Cerradas, ningún tramo del camino de ronda deja pasar: de una base solo se sale por su puente.
ring_probe = cell(41, 13)  # una casilla del remanso, entre las dos barreras y fuera de la luna
if not walk(*ring_probe):
    raise SystemExit('La casilla de prueba del remanso no es suelo')
if ring_probe in reachable(spawns[1]):
    raise SystemExit('Una barrera no cierra del todo el camino de ronda')

# ---------------------------------------------------------------- obstáculos y decorado
# Naves destruidas (OBSTACLE_RING): el juego las dibuja y cierra sus casillas al leer el mapa.
# Van dentro de las islas, nunca en los puentes. (modelo, punto de pantalla); cada una se repite por flota.
WRECK_SEEDS = [
    ('nave_destruida_1', (10, 5)),     # isla central
    ('estacion_rota', (53, -6)),       # isla de base
    ('cristales', (27, 34)),           # isla de pronexo
    ('satelite', (34, 27)),
]
WRECKS = [(model, pos(*p)) for model, seed in WRECK_SEEDS for p in turns(seed)]
WRECK_RADIUS = {'nave_destruida_1': 2, 'estacion_rota': 1.5, 'nave_destruida_2': 1.5, 'cristales': 1, 'satelite': 0.5}
# Antenas y satélites: (sprite, punto de pantalla, lado del bloqueo en casillas, escala de la imagen).
# Su huella es `blocked` en la capa lógica.
PROP_SEEDS = [
    ('deco_antena_larga_1', (61, -4), 1, 0.75),
    ('deco_antena_plato_1', (61, 4), 1, 0.85),
    ('deco_satelite_baliza', (10, -5), 3, 0.9),
    ('deco_antena_larga_3', (35, 31), 1, 0.75),
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
    """Cuadrado de `side` casillas centrado en una casilla (side impar)."""
    reach = side // 2
    return {(center[0] + dx, center[1] + dy) for dx in range(-reach, reach + 1) for dy in range(-reach, reach + 1)}


near_goal = {(gx + dx, gy + dy) for gx, gy in goals for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
placed_props = []
for sprite, seed, side, scale in PROP_SEEDS:
    for point in turns(seed):
        center = cell(*point)
        cells = footprint(center, side)
        if cells & near_goal or any(logic[y][x] != EMPTY for x, y in cells):
            raise SystemExit(f'{sprite} pisa un objetivo o sale de su isla: {sorted(cells)}')
        for x, y in cells:
            logic[y][x] = BLOCKED
        placed_props.append((sprite, center, side, scale))

closed = {c for model, (x, y) in WRECKS for c in wreck_cells(x, y, WRECK_RADIUS[model])}
if closed & near_goal:
    raise SystemExit('Una nave destruida tapa un objetivo')
if any(logic[y][x] != EMPTY for x, y in closed):
    raise SystemExit('Una nave destruida sale de su isla o pisa una antena')
for owner, base in spawns.items():
    seen = reachable(base, closed)
    if any(goal not in seen for goal in goals):
        raise SystemExit(f'Los obstáculos cortan el paso desde la base {owner}')

for y in range(H):
    for x in range(W):
        rx, ry = rotate_cell(x, y)
        if logic[y][x] != logic[ry][rx]:
            raise SystemExit(f'El mapa no es simétrico en {(x, y)}')

# ---------------------------------------------------------------- capas de tiles
dist = [[99] * W for _ in range(H)]  # distancia (en casillas) a la costa más cercana
queue = deque()
for y in range(H):
    for x in range(W):
        if logic[y][x] != ASTEROID:
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


def in_void(point, margin: int, what: str):
    x, y = (math.floor(c) for c in pos(*point))
    if not (0 <= x < W and 0 <= y < H) or dist[y][x] < margin:
        raise SystemExit(f'{what} queda pegado a una isla o fuera del mapa: {point}')
    return x, y


# Fondo: el vacío no lleva suelo, solo estrellas sueltas y algún planeta animado.
fondo = [[0] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        if dist[y][x] >= 2 and rng.random() < 0.075:
            fondo[y][x] = rng.choice(ESTRELLAS)
for seed in [(40, 36), (16, 30)]:
    for point in turns(seed):
        px, py = in_void(point, 4, 'Un planeta')
        fondo[py][px] = PLANETA

node = {name: scaled(*at) for name, at in NODOS.items()}
visual = [[0] * W for _ in range(H)]
deco = [[0] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        # Elección simétrica: las ocho casillas equivalentes sacan el mismo número.
        p = octant(x, y)
        local = random.Random(round(p[0] * 4) * 9973 + round(p[1] * 4))
        terrain = logic[y][x]
        if terrain == NEBULA:
            visual[y][x] = local.choice(NEBULOSA)
        elif terrain in (EMPTY, BLOCKED):  # bajo una antena, una luna o una barrera sigue el suelo de la isla
            visual[y][x] = local.choice(PLATAFORMA) if platform[y][x] else local.choice(CAMINO)
        else:
            d = dist[y][x]
            roll = local.random()
            if d == 1:  # la costa: un borde de roca, con algo de hielo
                visual[y][x] = local.choice(PROFUNDO)
                if roll < 0.34:
                    deco[y][x] = local.choice(AST_CHICO)
                elif roll < 0.46:
                    deco[y][x] = local.choice(HIELO_CHICO)
            elif d == 2 and roll < 0.2:
                deco[y][x] = local.choice(AST_MEDIANO + AST_CHICO + HIELO_CHICO)
            elif d >= 4:
                # Constelaciones: un cristal grande en cada nodo y roca de hielo a lo largo de las aristas.
                if any(math.dist(p, at) <= 1.2 for at in node.values()):
                    deco[y][x] = local.choice(HIELO_GRANDE)
                elif any(seg_param(p, node[a], node[b])[0] <= 0.75 for a, b in ARISTAS) and roll < 0.5:
                    deco[y][x] = local.choice(HIELO_MEDIANO + HIELO_CHICO)
                elif roll < 0.012:  # alguna piedra suelta a la deriva
                    deco[y][x] = local.choice(AST_GRANDE + AST_MEDIANO + HIELO_MEDIANO)
            if deco[y][x]:
                fondo[y][x] = 0
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


def sprite(name: str, gid: int, x: float, y: float, width: float, height: float) -> str:
    return (f'  <object id="{new_id()}" name="{name}" gid="{gid}" x="{fmt(x * TILE)}" y="{fmt(y * TILE)}" '
            f'width="{round(width)}" height="{round(height)}"/>')


def image(model: str, x: float, y: float) -> str:
    return sprite(model, GID[model], x, y, *ART[model])


def emblem(gid: int, name: str, at: tuple[float, float], radius: float) -> str:
    """Emblema de suelo que cubre un círculo de `radius` casillas (en pantalla, una elipse 2:1)."""
    width = round(radius * 2 * ROOT2 * TILE)
    return sprite(name, gid, at[0], at[1], width, width // 2)


def far(name: str, at: tuple[float, float], scale: float) -> str:
    """Objeto del fondo lejano, centrado en un punto de pantalla."""
    source = 'pulsar_1' if name == 'pulsar' else 'cometa_1' if name == 'cometa' else name
    width, height = Image.open(KIT / 'tilesets' / 'img' / f'{source}.png').size
    x, y = pos(*at)
    return sprite(name, ESPACIO_GID + ESPACIO_TILE[source], x, y, width * scale, height * scale)


# Fondo lejano: nubes de gas al fondo, luego galaxias, planetas y estaciones, y delante cometas y púlsares.
fondo_espacio = [far(name, at, scale) for name, at, scale in [
    ('nube_violeta', (-44, -24), 2.0), ('nube_azul', (40, -30), 2.2), ('nube_rosa', (44, 22), 1.8), ('nube_azul', (-38, 26), 2.0),
    ('nube_violeta', (14, -46), 1.7), ('nube_rosa', (-16, 48), 1.7), ('nube_violeta', (60, -12), 1.4), ('nube_azul', (-62, 10), 1.4),
    ('galaxia', (-58, -16), 1.3), ('galaxia', (-20, 52), 1.1), ('galaxia', (22, -22), 0.8),
    ('planeta_03', (-62, -14), 0.95), ('planeta_02', (62, 14), 0.85), ('planeta_09', (-12, -66), 1.0), ('planeta_07', (10, 66), 0.8),
    ('planeta_05', (-46, -28), 0.6), ('planeta_08', (48, -26), 1.2), ('planeta_00', (-44, 30), 0.9), ('planeta_06', (42, 34), 0.55),
    ('planeta_04', (-36, -10), 0.4), ('planeta_01', (36, -9), 0.45),
    ('estacion_lejana_1', (-26, -50), 1.0), ('estacion_lejana_2', (28, 48), 0.9),
    ('cometa', (-30, -40), 1.2), ('cometa', (52, -18), 1.0), ('cometa', (30, 44), 1.3), ('cometa', (-54, 18), 0.9),
    ('pulsar', (-70, 0), 1.0), ('pulsar', (70, 0), 1.0), ('pulsar', (0, -70), 1.0), ('pulsar', (0, 70), 1.0),
]]

# Emblemas de Stellar: van bajo las estructuras, pintados sobre el suelo.
logos = [emblem(LOGO_ORO, 'logo_stellar_nucleo', pos(0, 0), 7.5)]
logos += [emblem(LOGO, 'logo_stellar_base', pos(*p), 3.4) for p in turns((-48, 0))]
logos += [emblem(LOGO, 'logo_stellar_pronexo', pos(*p), 4.6) for p in turns((-30, -30))]

# Estructuras: imágenes (ancla abajo al centro). Desplazamientos tomados del Espiral original.
estructuras = [image('base_jugador' if owner in (1, 3) else 'base_enemiga', x + 0.0, y + 0.4) for owner, (x, y) in spawns.items()]
estructuras += [image('pilar', core[0] + 0.25, core[1] + 0.25), image('escudo', core[0] + 0.41, core[1] + 0.41)]
estructuras += [image('pronexo', px + 0.69, py + 0.69) for px, py in pronexos]
estructuras += [image('recurso', mx + 0.94, my + 0.94) for mx, my in metals]
estructuras += [image('torre_vigilancia', tx + 0.5, ty + 0.5) for tx, ty in towers]
# Restos a la deriva en el vacío entre islas (solo decoran: su lógica ya es asteroide).
for model, seed in [('restos_nave', (22, 6)), ('nave_destruida_2', (22, -6))]:
    for p in turns(seed):
        in_void(p, 4, 'Un resto a la deriva')
        estructuras.append(image(model, *pos(*p)))
# Cristales gigantes: el nodo más brillante de cada constelación de hielo.
for model, name in CRISTALES_GIGANTES:
    for p in eight(NODOS[name]):
        in_void(p, 4, 'Un cristal gigante')
        x, y = pos(*p)
        estructuras.append(sprite(model, DESTRUIBLE[model], x + 1.1, y + 1.1, 208 * 0.75, 216 * 0.75))
# Lunas de los remansos: el planeta animado, como estorbo que hay que rodear.
for p in eight((42.5, 15)):
    x, y = pos(*p)
    estructuras.append(sprite('luna', PLANETA, x + 1.5, y + 1.5, 122, 120))
# Barreras destruibles: un dibujo por barrera, centrado en sus casillas.
for material, cells in barriers:
    cx = sum(x for x, _ in cells) / len(cells) + 0.5
    cy = sum(y for _, y in cells) / len(cells) + 0.5
    estructuras.append(sprite(f'barrera_{material}', DESTRUIBLE[f'barrera_{material}'], cx + 0.9, cy + 0.9, 176 * 1.15, 136 * 1.15))


def prop_image(name, center, side, scale):
    """Imagen anclada abajo al centro de su huella, escalada al tamaño del juego."""
    source = 'deco_satelite_baliza_1' if name == 'deco_satelite_baliza' else name
    width, height = Image.open(KIT / 'assets-externos' / 'sprites' / f'{source}.png').size
    x, y = center[0] + 0.5 + side * 0.3, center[1] + 0.5 + side * 0.3
    return sprite(name[5:], DECORADO_GID + DECORADO_TILE[name], x, y, width * scale, height * scale)


estructuras += [prop_image(*prop) for prop in placed_props]

zonas = [
    ('Base Azul', spawns[1]), ('Base Aliada', spawns[3]), ('Base Roja', spawns[2]), ('Base Roja Aliada', spawns[4]),
    ('Núcleo', core),
    ('Isla Noroeste', pronexos[0]), ('Isla Noreste', pronexos[1]), ('Isla Suroeste', pronexos[2]), ('Isla Sureste', pronexos[3]),
    ('Islote Oeste', cell(-33, 0)), ('Islote Norte', cell(0, -33)), ('Islote Este', cell(33, 0)), ('Islote Sur', cell(0, 33)),
    *[(name.replace('niebla_', 'Nebulosa ').title(), cell(*at)) for name, at in nieblas.items()],
]
objetos = [point('spawn', x + 0.33, y, {'owner': owner, 'equipo': 1 if owner in (1, 3) else 2}) for owner, (x, y) in sorted(spawns.items())]
objetos += [point('pilar', core[0], core[1]), point('barrera', core[0], core[1], {'hp': 500})]
objetos += [point('pronexo', px + 0.5, py + 0.5, {'index': index + 1, 'radio': 3}) for index, (px, py) in enumerate(pronexos)]
objetos += [point('recurso', mx + 0.5, my + 0.5, {'amount': 300}) for mx, my in metals]
objetos += [point('mob_spawn', mx + 0.5, my + 0.5, {'count': 3}) for mx, my in mobs]
objetos += [point('torre_vigilancia', tx + 0.5, ty + 0.5, {'visionRadius': 10}) for tx, ty in towers]
objetos += [point('zona', zx + 0.5, zy + 0.5, {'nombre': name}) for name, (zx, zy) in zonas]
objetos += [point('OBSTACLE_RING', x, y, {'modelo': model}, name='Punto Obstaculo') for model, (x, y) in WRECKS]
# Una barrera destruible abre sus `celdas` (x,y separadas por ;) cuando su vida llega a cero.
for material, cells in barriers:
    cx = sum(x for x, _ in cells) / len(cells) + 0.5
    cy = sum(y for _, y in cells) / len(cells) + 0.5
    objetos.append(point('barrera_destruible', cx, cy, {
        'material': material, 'hp': BARRERA_HP[material], 'celdas': ';'.join(f'{x},{y}' for x, y in cells),
    }, name=f'barrera_{material}'))

robots = []
for x, y in [(MID - 4.5, MID + 2.5), (MID + 2.5, MID - 4.5), (MID - 3.5, MID - 3.5)]:
    robots.append(sprite('robot_capsula', ROBOT_CAPSULA, x, y, 72, 80))
for p in turns((29, 3)):
    robots.append(sprite('robotsitoo', ROBOTSITO, *pos(*p), 64, 64))

# Eventos: ocho zonas de caída en dos grupos que se turnan, y una niebla móvil por nebulosa con dos rutas.
SATELITE = {'amount': 1, 'damage': 40, 'intervalSeconds': 45, 'objeto': 'satelite', 'radius': 1, 'warningSeconds': 4}


def drop_zone(name, center, group, size=7):
    cx, cy = center
    return rect('zona_caida', cx - size // 2, cy - size // 2, size, size, {**SATELITE, 'grupo': group}, name=name)


eventos = [drop_zone(f'caida_islote_{side}', cell(*p), 1) for side, p in zip(['este', 'sur', 'oeste', 'norte'], turns((33, 0)))]
eventos += [drop_zone(f'caida_puente_{side}', cell(*p), 2) for side, p in zip(['sureste', 'suroeste', 'noroeste', 'noreste'], turns((13, 13)))]
for index, (name, (u, v)) in enumerate(nieblas.items()):
    cx, cy = cell(u, v)
    eventos.append(rect('niebla_movil', cx - 3, cy - 3, 6, 6, {
        'maxCells': 13, 'cellsPerSecond': 1.25, 'warningSeconds': 5, 'holdSeconds': 6, 'restSeconds': 20,
        'startSeconds': 40 + 22 * index, 'slowFactor': 2, 'visionRadius': 2,
    }, name=name))
    # Una ruta baja a la isla central y la otra sube a la isla de pronexo; las nieblas se turnan cuál sale primero.
    sign = (1 if u > 0 else -1, 1 if v > 0 else -1)
    routes = [cell(sign[0] * 10, sign[1] * 10), cell(sign[0] * 30, sign[1] * 30)]
    if index % 2:
        routes.reverse()
    for order, target in enumerate(routes, start=1):
        points = f'0,0 {fmt((target[0] - cx) * TILE)},{fmt((target[1] - cy) * TILE)}'
        eventos.append(f'  <object id="{new_id()}" name="{name} ruta {order}" type="ruta_niebla" x="{fmt(cx * TILE)}" y="{fmt(cy * TILE)}">\n'
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
    f'tilewidth="64" tileheight="32" infinite="0" backgroundcolor="#03040b" nextlayerid="13" nextobjectid="{next_id}">',
    ' <editorsettings>\n  <export target="trascendencia-estelar.json" format="json"/>\n </editorsettings>',
    ' <properties>\n  <property name="jugadores" type="int" value="4"/>\n'
    '  <property name="nebulosaActiva" type="bool" value="true"/>\n </properties>',
    ' <tileset firstgid="1" source="tilesets/logica.tsx"/>',
    ' <tileset firstgid="9" source="tilesets/suelo.tsx"/>',
    ' <tileset firstgid="24" source="tilesets/asteroides.tsx"/>',
    ' <tileset firstgid="32" source="tilesets/estructuras.tsx"/>',
    ' <tileset firstgid="48" source="tilesets/plataformas.tsx"/>',
    ' <tileset firstgid="51" source="tilesets/altura.tsx"/>',
    ' <tileset firstgid="53" source="assets-externos/robotsitoo.tsx"/>',
    ' <tileset firstgid="61" source="assets-externos/robot-sal.tsx"/>',
    ' <tileset firstgid="69" source="planetafondo.tsx"/>',
    f' <tileset firstgid="{LOGO_GID}" source="tilesets/logo_stellar.tsx"/>',
    f' <tileset firstgid="{DECORADO_GID}" source="tilesets/decorado_externo.tsx"/>',
    f' <tileset firstgid="{HIELO_GID}" source="tilesets/hielo.tsx"/>',
    f' <tileset firstgid="{ESTRELLA_GID}" source="tilesets/estrellas.tsx"/>',
    f' <tileset firstgid="{ESPACIO_GID}" source="tilesets/espacio.tsx"/>',
    f' <tileset firstgid="{DESTRUIBLE_GID}" source="tilesets/destruibles.tsx"/>',
    layer(1, 'fondo', fondo),
    group(2, 'fondo-espacio', fondo_espacio),
    layer(3, 'terreno-visual', visual),
    layer(4, 'decoracion', deco),
    group(5, 'logos', logos),
    layer(6, 'altura', altura, ' opacity="0.35"'),
    layer(7, 'logica', logic, ' opacity="0.45"'),
    group(8, 'estructuras', estructuras),
    group(9, 'objetos', objetos),
    group(10, 'robots', robots),
    group(11, 'eventos', eventos, ' color="#ff5a3c"'),
    f' <objectgroup id="12" name="obstaculos-vista" locked="1">\n' + '\n'.join(vista) + '\n </objectgroup>',
    '</map>',
]
TMX.write_text('\n'.join(parts) + '\n', encoding='utf-8')

if __name__ == '__main__':
    chars = {EMPTY: '.', NEBULA: 'n', ASTEROID: ' ', BLOCKED: 'X'}
    marks = {**{at: 'ABCD'[owner - 1] for owner, at in spawns.items()}, core: 'N',
             **{p: str(i + 1) for i, p in enumerate(pronexos)}, **{m: 'R' for m in metals},
             **{c: '#' for c in barrier_cells}, **{c: 'O' for c in moon_cells}}
    for y in range(H):
        print(''.join(marks.get((x, y), '*' if deco[y][x] in HIELO_GRANDE + HIELO_MEDIANO else chars[logic[y][x]]) for x in range(W)).rstrip())
    walkable = sum(walk(x, y) for y in range(H) for x in range(W))
    print(f'{TMX.name}: {W}x{H}, {walkable} casillas abiertas, {len(pronexos)} pronexos, {len(metals)} recursos, '
          f'{len(barriers)} barreras destruibles ({min(len(c) for _, c in barriers)}-{max(len(c) for _, c in barriers)} casillas), '
          f'{len(moon_cells)} casillas de luna, {len(logos)} emblemas, {len(fondo_espacio)} objetos de fondo, {len(eventos)} eventos')
