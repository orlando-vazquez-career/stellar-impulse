"""Lista de todo lo que entra en cada tileset del kit."""
from assets import (
    color, gate_tile, lane_tile, nebula_tile, pillar, pronexo, resource, space_tile, walkway_tile, wormhole,
)
from assets_bases import enemy_base, player_base
from asteroides import ROCKS, asteroid
from escudo import shield
from naves_destruidas import WRECKS

GROUND_TILES = (
    [(f"espacio_{i + 1}", lambda i=i: space_tile(i)) for i in range(4)]
    + [(f"nebulosa_{i + 1}", lambda i=i: nebula_tile(10 + i)) for i in range(3)]
    + [("acelerador", lambda: lane_tile(color(60, 160, 255), 20)),
       ("desacelerador", lambda: lane_tile(color(240, 70, 70), 21)),
       ("paso_asteroides", lambda: gate_tile(22))]
    + [(f"camino_{i + 1}", lambda i=i: walkway_tile(30 + i)) for i in range(2)]
)

ASTEROID_TILES = [(name, lambda rock=rock: asteroid(rock)) for name, rock in ROCKS]

STRUCTURES = [
    ("base_jugador", player_base), ("base_enemiga", enemy_base), ("pilar", pillar), ("escudo", shield),
    ("pronexo", pronexo), ("agujero", wormhole), ("recurso", resource),
] + WRECKS
