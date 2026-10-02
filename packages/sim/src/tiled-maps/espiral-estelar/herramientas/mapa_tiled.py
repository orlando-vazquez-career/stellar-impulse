"""Convierte el diseño (Layout) en el mapa de Tiled (.tmx) y en el JSON exportado listo para el juego."""
import json
import random
from xml.sax.saxutils import quoteattr

from assets import TILE_HEIGHT, TILE_WIDTH
from diseno_espiral import MAP_SIZE

TILE_LAYERS = ["fondo", "terreno-visual", "decoracion", "logica"]
LAYER_OPACITY = {"logica": 0.45}
GROUND_VARIANTS = {"nebulosa": ["nebulosa_1", "nebulosa_2", "nebulosa_3"], "camino": ["camino_1", "camino_2"]}
SPACE_VARIANTS = ["espacio_1", "espacio_2", "espacio_3", "espacio_4"]

# Píxeles desde el borde inferior de cada imagen hasta el punto que debe quedar sobre su casilla.
GROUND_OFFSET_PX = {"base_jugador": 58, "base_enemiga": 58, "pilar": 24, "escudo": 29, "pronexo": 22,
                    "agujero": 34, "recurso": 14}
WRECK_GROUND_RATIO = 0.4


class MapBuilder:
    def __init__(self, layout, tilesets, seed=7):
        self.layout, self.tilesets = layout, tilesets
        self.rng = random.Random(seed)
        self.next_object_id = 1

    # ---------- capas de casillas ----------

    def layer_gids(self, name):
        cells = [(x, y) for y in range(MAP_SIZE) for x in range(MAP_SIZE)]
        return [getattr(self, f"gid_{name.replace('-', '_')}")(x, y) for x, y in cells]

    def gid_fondo(self, x, y):
        return self.tilesets["suelo"].gid(self.rng.choice(SPACE_VARIANTS))

    def gid_terreno_visual(self, x, y):
        ground = self.layout.ground[y, x]
        if not ground:
            return 0
        variants = GROUND_VARIANTS.get(ground, [ground])
        return self.tilesets["suelo"].gid(variants[(x * 7 + y * 13) % len(variants)])

    def gid_decoracion(self, x, y):
        variant = self.layout.rocks[y, x]
        return 0 if variant < 0 else self.tilesets["asteroides"].first_gid + int(variant)

    def gid_logica(self, x, y):
        return self.tilesets["logica"].gid(self.layout.terrain[y, x])

    # ---------- objetos ----------

    def new_id(self):
        self.next_object_id += 1
        return self.next_object_id - 1

    def structure_objects(self):
        tileset = self.tilesets["estructuras"]
        ordered = sorted(self.layout.structures, key=lambda item: item[1][0] + item[1][1])
        objects = []
        for name, (tx, ty) in ordered:
            width, height = tileset.sizes[name]
            offset = GROUND_OFFSET_PX.get(name, height * WRECK_GROUND_RATIO) / TILE_HEIGHT
            objects.append({"id": self.new_id(), "gid": tileset.gid(name), "name": name, "type": "",
                            "x": (tx + 0.5 + offset) * TILE_HEIGHT, "y": (ty + 0.5 + offset) * TILE_HEIGHT,
                            "width": width, "height": height, "rotation": 0, "visible": True})
        return objects

    def marker_objects(self):
        objects = [self.point_object(marker) for marker in self.layout.markers]
        objects += [self.gate_object(tiles) for tiles in self.layout.gates]
        return objects

    def point_object(self, marker):
        tx, ty = marker.tile
        return {"id": self.new_id(), "name": "", "type": marker.kind, "x": (tx + 0.5) * TILE_HEIGHT,
                "y": (ty + 0.5) * TILE_HEIGHT, "width": 0, "height": 0, "rotation": 0, "visible": True,
                "point": True, "properties": typed_properties(marker.properties)}

    def gate_object(self, tiles):
        xs, ys = [x for x, _ in tiles], [y for _, y in tiles]
        properties = typed_properties({"cycleSeconds": 60, "openSeconds": 20})
        return {"id": self.new_id(), "name": "", "type": "asteroid_gate", "x": min(xs) * TILE_HEIGHT,
                "y": min(ys) * TILE_HEIGHT, "width": (max(xs) - min(xs) + 1) * TILE_HEIGHT,
                "height": (max(ys) - min(ys) + 1) * TILE_HEIGHT, "rotation": 0, "visible": True,
                "properties": properties}

    # ---------- salida ----------

    def build(self):
        tile_layers = [{"id": i + 1, "name": name, "type": "tilelayer", "width": MAP_SIZE, "height": MAP_SIZE,
                        "x": 0, "y": 0, "opacity": LAYER_OPACITY.get(name, 1), "visible": True,
                        "data": self.layer_gids(name)} for i, name in enumerate(TILE_LAYERS)]
        next_layer = len(TILE_LAYERS) + 1
        object_layers = [
            {"id": next_layer, "name": "estructuras", "type": "objectgroup", "draworder": "index",
             "opacity": 1, "visible": True, "x": 0, "y": 0, "objects": self.structure_objects()},
            {"id": next_layer + 1, "name": "objetos", "type": "objectgroup", "draworder": "index",
             "opacity": 1, "visible": True, "x": 0, "y": 0, "objects": self.marker_objects()},
        ]
        return {"type": "map", "version": "1.10", "tiledversion": "1.11.0", "orientation": "isometric",
                "renderorder": "right-down", "width": MAP_SIZE, "height": MAP_SIZE, "tilewidth": TILE_WIDTH,
                "tileheight": TILE_HEIGHT, "infinite": False, "backgroundcolor": "#05070f",
                "nextlayerid": next_layer + 2, "nextobjectid": self.next_object_id, "compressionlevel": -1,
                "layers": tile_layers + object_layers,
                "tilesets": [dict(t.data, firstgid=t.first_gid) for t in self.tilesets.values()]}


def typed_properties(properties):
    def kind(value):
        return "bool" if isinstance(value, bool) else "int" if isinstance(value, int) else "string"
    return [{"name": name, "type": kind(value), "value": value} for name, value in properties.items()]


# ---------- TMX ----------

def properties_xml(properties):
    if not properties:
        return ""
    items = "".join(f'<property name="{p["name"]}" type="{p["type"]}" value={quoteattr(str(p["value"]))}/>'
                    for p in properties)
    return f"<properties>{items}</properties>"


def object_xml(obj):
    attributes = f'id="{obj["id"]}" x="{obj["x"]:g}" y="{obj["y"]:g}"'
    if obj.get("type"):
        attributes += f' type="{obj["type"]}"'
    if obj.get("name"):
        attributes += f' name="{obj["name"]}"'
    if "gid" in obj:
        attributes += f' gid="{obj["gid"]}"'
    if obj["width"] or obj["height"]:
        attributes += f' width="{obj["width"]:g}" height="{obj["height"]:g}"'
    inner = properties_xml(obj.get("properties")) + ("<point/>" if obj.get("point") else "")
    return f'  <object {attributes}>{inner}</object>\n' if inner else f'  <object {attributes}/>\n'


def layer_xml(layer):
    if layer["type"] == "tilelayer":
        rows = (",".join(map(str, layer["data"][y * MAP_SIZE:(y + 1) * MAP_SIZE])) for y in range(MAP_SIZE))
        opacity = f' opacity="{layer["opacity"]}"' if layer["opacity"] != 1 else ""
        return (f' <layer id="{layer["id"]}" name="{layer["name"]}" width="{MAP_SIZE}" height="{MAP_SIZE}"{opacity}>\n'
                f'  <data encoding="csv">\n' + ",\n".join(rows) + "\n</data>\n </layer>\n")
    objects = "".join(object_xml(obj) for obj in layer["objects"])
    return f' <objectgroup id="{layer["id"]}" name="{layer["name"]}" draworder="index">\n{objects} </objectgroup>\n'


def tmx(data):
    tilesets = "".join(f' <tileset firstgid="{t["firstgid"]}" source="tilesets/{t["name"]}.tsx"/>\n'
                       for t in data["tilesets"])
    header = (f'<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.10" tiledversion="1.11.0" '
              f'orientation="isometric" renderorder="right-down" width="{MAP_SIZE}" height="{MAP_SIZE}" '
              f'tilewidth="{TILE_WIDTH}" tileheight="{TILE_HEIGHT}" infinite="0" backgroundcolor="#05070f" '
              f'nextlayerid="{data["nextlayerid"]}" nextobjectid="{data["nextobjectid"]}">\n')
    return header + tilesets + "".join(layer_xml(layer) for layer in data["layers"]) + "</map>\n"


def write_map(kit_dir, layout, tilesets, name="espiral-estelar"):
    data = MapBuilder(layout, tilesets).build()
    (kit_dir / f"{name}.tmx").write_text(tmx(data))
    (kit_dir / f"{name}.json").write_text(json.dumps(data))
    return data
