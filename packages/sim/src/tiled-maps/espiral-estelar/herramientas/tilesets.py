"""Escribe los tilesets de Tiled (.tsx) y guarda sus datos para incrustarlos en el JSON del mapa."""
from dataclasses import dataclass, field

from PIL import Image, ImageDraw

import catalogo
from assets import TILE_HEIGHT, TILE_WIDTH

ASTEROID_CANVAS = 96

TERRAINS = [
    ("empty", (110, 118, 132)), ("nebula", (150, 80, 200)), ("asteroid", (140, 100, 70)),
    ("boost", (40, 140, 240)), ("slow", (220, 60, 60)), ("blocked", (25, 25, 30)),
]


@dataclass
class Tileset:
    name: str
    tile_names: list
    data: dict
    sizes: dict = field(default_factory=dict)
    first_gid: int = 0

    def gid(self, tile_name):
        return self.first_gid + self.tile_names.index(tile_name)


def logic_tile(rgb):
    image = Image.new("RGBA", (TILE_WIDTH, TILE_HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(image).polygon([(32, 0), (63, 16), (32, 31), (0, 16)], fill=rgb + (255,), outline=(255, 255, 255, 140))
    return image


def strip(images, width, height):
    result = Image.new("RGBA", (width * len(images), height), (0, 0, 0, 0))
    for index, image in enumerate(images):
        result.paste(image, (index * width, 0), image)
    return result


def property_xml(properties):
    def attributes(p):
        custom = f' propertytype="{p["propertytype"]}"' if "propertytype" in p else ""
        return f'name="{p["name"]}" type="{p["type"]}"{custom} value="{p["value"]}"'
    items = "".join(f"<property {attributes(p)}/>" for p in properties)
    return f"<properties>{items}</properties>"


def tile_xml(tile):
    image = tile.get("image")
    image_xml = (f'\n  <image source="{image.removeprefix("tilesets/")}" width="{tile["imagewidth"]}" '
                 f'height="{tile["imageheight"]}"/>\n ') if image else ""
    return f' <tile id="{tile["id"]}">{property_xml(tile["properties"])}{image_xml}</tile>\n'


def tsx(data):
    attributes = (f'name="{data["name"]}" tilewidth="{data["tilewidth"]}" tileheight="{data["tileheight"]}" '
                  f'tilecount="{data["tilecount"]}" columns="{data["columns"]}"')
    if "objectalignment" in data:
        attributes += f' objectalignment="{data["objectalignment"]}"'
    body = ""
    if "tileoffset" in data:
        body += f' <tileoffset x="{data["tileoffset"]["x"]}" y="{data["tileoffset"]["y"]}"/>\n'
    if "grid" in data:
        body += ' <grid orientation="orthogonal" width="1" height="1"/>\n'
    if "image" in data:
        body += (f' <image source="{data["image"].removeprefix("tilesets/")}" width="{data["imagewidth"]}" '
                 f'height="{data["imageheight"]}"/>\n')
    body += "".join(tile_xml(tile) for tile in data["tiles"])
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.11.0" {attributes}>\n'
            f'{body}</tileset>\n')


def save(tileset_dir, tileset):
    (tileset_dir / f"{tileset.name}.tsx").write_text(tsx(tileset.data))
    return tileset


def named(name):
    return [{"name": "nombre", "type": "string", "value": name}]


def strip_tileset(tileset_dir, name, catalog, width, height, offset_x=0):
    image_path = f"tilesets/img/{name}.png"
    strip([draw() for _, draw in catalog], width, height).save(tileset_dir.parent / image_path)
    data = {"name": name, "tilewidth": width, "tileheight": height, "tilecount": len(catalog),
            "columns": len(catalog), "image": image_path, "imagewidth": width * len(catalog), "imageheight": height,
            "margin": 0, "spacing": 0, "tiles": [{"id": i, "properties": named(n)} for i, (n, _) in enumerate(catalog)]}
    if offset_x:
        data["tileoffset"] = {"x": offset_x, "y": 0}
    return save(tileset_dir, Tileset(name, [n for n, _ in catalog], data))


def logic_tileset(tileset_dir):
    catalog = [(terrain, lambda rgb=rgb: logic_tile(rgb)) for terrain, rgb in TERRAINS]
    tileset = strip_tileset(tileset_dir, "logica", catalog, TILE_WIDTH, TILE_HEIGHT)
    for tile, (terrain, _) in zip(tileset.data["tiles"], TERRAINS):
        tile["properties"] = [{"name": "terrain", "type": "string", "propertytype": "Terreno", "value": terrain}]
    return save(tileset_dir, tileset)


def structures_tileset(tileset_dir):
    images = [(name, draw()) for name, draw in catalogo.STRUCTURES]
    tiles = []
    for index, (name, image) in enumerate(images):
        image.save(tileset_dir / "img" / f"{name}.png")
        tiles.append({"id": index, "image": f"tilesets/img/{name}.png", "imagewidth": image.width,
                      "imageheight": image.height, "properties": named(name)})
    data = {"name": "estructuras", "tilewidth": max(i.width for _, i in images),
            "tileheight": max(i.height for _, i in images), "tilecount": len(images), "columns": 0,
            "objectalignment": "bottom", "grid": {"orientation": "orthogonal", "width": 1, "height": 1},
            "margin": 0, "spacing": 0, "tiles": tiles}
    sizes = {name: image.size for name, image in images}
    return save(tileset_dir, Tileset("estructuras", [n for n, _ in images], data, sizes))


def write_all(tileset_dir):
    (tileset_dir / "img").mkdir(parents=True)
    tilesets = [
        logic_tileset(tileset_dir),
        strip_tileset(tileset_dir, "suelo", catalogo.GROUND_TILES, TILE_WIDTH, TILE_HEIGHT),
        strip_tileset(tileset_dir, "asteroides", catalogo.ASTEROID_TILES, ASTEROID_CANVAS, ASTEROID_CANVAS,
                      offset_x=-(ASTEROID_CANVAS - TILE_WIDTH) // 2),
        structures_tileset(tileset_dir),
    ]
    next_gid = 1
    for tileset in tilesets:
        tileset.first_gid = next_gid
        next_gid += len(tileset.tile_names)
    return {tileset.name: tileset for tileset in tilesets}
