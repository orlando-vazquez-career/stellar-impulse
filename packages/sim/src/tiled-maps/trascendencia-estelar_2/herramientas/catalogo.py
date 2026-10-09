"""Lista de todo lo que entra en cada tileset del kit."""
from assets import (
    chevron_pattern, color, dot_pattern, gate_tile, nebula_tile, patterned_lane_tile, pillar, pronexo, resource,
    space_tile, walkway_tile, wormhole,
)
from assets_obstaculos import (
    crystals, deep_space_tile, elevation_tile, laser_fence, platform_tile, satellite, station_ruin, watchtower,
)
from assets_bases import enemy_base, player_base
from asteroides import ROCKS, asteroid
from escudo import shield
from naves_destruidas import WRECKS

GROUND_TILES = (
    [(f"espacio_{i + 1}", lambda i=i: space_tile(i)) for i in range(4)]
    + [(f"nebulosa_{i + 1}", lambda i=i: nebula_tile(10 + i)) for i in range(3)]
    + [("acelerador", lambda: patterned_lane_tile(color(60, 160, 255), 20, chevron_pattern)),
       ("desacelerador", lambda: patterned_lane_tile(color(240, 70, 70), 21, dot_pattern)),
       ("paso_asteroides", lambda: gate_tile(22))]
    + [(f"camino_{i + 1}", lambda i=i: walkway_tile(30 + i)) for i in range(2)]
    + [(f"espacio_profundo_{i + 1}", lambda i=i: deep_space_tile(i)) for i in range(3)]
)

PLATFORM_TILES = [(f"plataforma_{i + 1}", lambda i=i: platform_tile(i)) for i in range(3)]

ELEVATION_TILES = [("normal", lambda: elevation_tile(0)), ("alta", lambda: elevation_tile(1))]

ASTEROID_TILES = [(name, lambda rock=rock: asteroid(rock)) for name, rock in ROCKS]

STRUCTURES = [
    ("base_jugador", player_base), ("base_enemiga", enemy_base), ("pilar", pillar), ("escudo", shield),
    ("pronexo", pronexo), ("agujero", wormhole), ("recurso", resource),
] + WRECKS + [
    ("estacion_rota", station_ruin), ("satelite", satellite), ("cristales", crystals),
    ("valla_laser_x", lambda: laser_fence("x")), ("valla_laser_y", lambda: laser_fence("y")),
    ("torre_vigilancia", watchtower),
]
