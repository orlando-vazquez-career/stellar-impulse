"""Dibuja el mapa exportado como lo vería Tiled, con niebla de ejemplo y un minimapa de la capa lógica."""
from pathlib import Path

from PIL import Image, ImageChops

PREVIEW_SCALE = 0.35
MINIMAP_CELL = 8
BACKGROUND = (5, 7, 15, 255)
MINIMAP_COLORS = {"empty": (120, 130, 150), "nebula": (140, 70, 190), "asteroid": (90, 70, 55),
                  "boost": (50, 140, 240), "slow": (220, 60, 60), "blocked": (15, 15, 20)}
VISIBLE_RADIUS = 9
EXPLORED_DISTANCE = 40


class TiledRenderer:
    def __init__(self, kit_dir: Path, data: dict):
        self.kit_dir, self.data = kit_dir, data
        self.size = data["width"]
        self.half_width, self.half_height = data["tilewidth"] // 2, data["tileheight"] // 2
        self.origin_x = self.size * self.half_width
        self.top_margin = 160
        self.canvas = Image.new("RGBA", (self.size * data["tilewidth"], self.size * data["tileheight"]
                                         + self.top_margin), BACKGROUND)
        self.tiles = self.load_tiles()

    def load_tiles(self):
        tiles = {}
        for tileset in self.data["tilesets"]:
            offset_x = tileset.get("tileoffset", {}).get("x", 0)
            if "image" in tileset:
                sheet = Image.open(self.kit_dir / tileset["image"])
                width, height = tileset["tilewidth"], tileset["tileheight"]
                for index in range(tileset["tilecount"]):
                    crop = sheet.crop((index * width, 0, (index + 1) * width, height))
                    tiles[tileset["firstgid"] + index] = (crop, offset_x)
            else:
                for tile in tileset["tiles"]:
                    tiles[tileset["firstgid"] + tile["id"]] = (Image.open(self.kit_dir / tile["image"]), offset_x)
        return tiles

    def tile_top(self, x, y):
        return self.origin_x + (x - y) * self.half_width, self.top_margin + (x + y) * self.half_height

    def draw_tile_layer(self, layer):
        for index, gid in enumerate(layer["data"]):
            if not gid:
                continue
            image, offset_x = self.tiles[gid]
            top_x, top_y = self.tile_top(index % self.size, index // self.size)
            bottom = top_y + 2 * self.half_height
            self.canvas.alpha_composite(image, (top_x - self.half_width + offset_x, bottom - image.height))

    def draw_objects(self, layer):
        for obj in layer["objects"]:
            image, _ = self.tiles[obj["gid"]]
            x, y = self.object_to_screen(obj["x"], obj["y"])
            self.canvas.alpha_composite(image, (round(x - image.width / 2), round(y - image.height)))

    def object_to_screen(self, x, y):
        tx, ty = x / self.data["tileheight"], y / self.data["tileheight"]
        return self.origin_x + (tx - ty) * self.half_width, self.top_margin + (tx + ty) * self.half_height

    def render(self, skip=("logica", "altura")):
        for layer in self.data["layers"]:
            if layer["name"] in skip:
                continue
            if layer["type"] == "tilelayer":
                self.draw_tile_layer(layer)
            elif layer["name"] == "estructuras":
                self.draw_objects(layer)
        return self.canvas


def layer_by_name(data, name):
    return next(layer for layer in data["layers"] if layer["name"] == name)


def terrain_grid(data):
    logic = next(t for t in data["tilesets"] if t["name"] == "logica")
    names = {logic["firstgid"] + tile["id"]: tile["properties"][0]["value"] for tile in logic["tiles"]}
    return [names[gid] for gid in layer_by_name(data, "logica")["data"]]


def blue_spawn(data):
    marker = next(obj for obj in layer_by_name(data, "objetos")["objects"]
                  if obj["type"] == "spawn" and obj["properties"][0]["value"] == 1)
    return marker["x"] / data["tileheight"], marker["y"] / data["tileheight"]


def visibility_for(data):
    spawn_x, spawn_y = blue_spawn(data)

    def strength(x, y):
        distance_squared = (x - spawn_x) ** 2 + (y - spawn_y) ** 2
        if distance_squared <= VISIBLE_RADIUS ** 2:
            return 1.0
        return 0.55 if x + y <= EXPLORED_DISTANCE else 0.0
    return strength


def tiled_fog_texture(runtime, size):
    fog = Image.new("RGBA", size)
    texture = Image.open(runtime / "niebla.png")
    for fy in range(0, size[1], texture.height):
        for fx in range(0, size[0], texture.width):
            fog.paste(texture, (fx, fy))
    return fog


def cleared_mask(renderer, brush):
    cleared = Image.new("L", renderer.canvas.size, 0)
    strength = visibility_for(renderer.data)
    for y in range(renderer.size):
        for x in range(renderer.size):
            amount = strength(x + 0.5, y + 0.5)
            if not amount:
                continue
            top_x, top_y = renderer.tile_top(x, y)
            box = (top_x - brush.width // 2, top_y + renderer.half_height - brush.height * 3 // 4)
            region = cleared.crop((box[0], box[1], box[0] + brush.width, box[1] + brush.height))
            cleared.paste(ImageChops.lighter(region, brush.point(lambda v: int(v * amount))), box)
    return cleared


def apply_fog(renderer, kit_dir):
    runtime = kit_dir / "assets-juego"
    fog = tiled_fog_texture(runtime, renderer.canvas.size)
    brush = Image.open(runtime / "pincel_vision.png").getchannel("A")
    fog.putalpha(ImageChops.invert(cleared_mask(renderer, brush)))
    canvas = renderer.canvas.copy()
    canvas.alpha_composite(fog)
    return canvas


def minimap(data):
    size = data["width"]
    image = Image.new("RGB", (size, size))
    for index, terrain in enumerate(terrain_grid(data)):
        image.putpixel((index % size, index // size), MINIMAP_COLORS[terrain])
    return image.resize((size * MINIMAP_CELL, size * MINIMAP_CELL), Image.NEAREST)


def shrink(image):
    return image.resize((int(image.width * PREVIEW_SCALE), int(image.height * PREVIEW_SCALE)), Image.LANCZOS)


def generate_previews(kit_dir: Path, data: dict):
    output_dir = kit_dir / "vistas-previas"
    output_dir.mkdir(exist_ok=True)
    renderer = TiledRenderer(kit_dir, data)
    full_map = renderer.render()
    shrink(full_map).save(output_dir / "mapa_completo.png")
    shrink(apply_fog(renderer, kit_dir)).save(output_dir / "mapa_con_niebla.png")
    minimap(data).save(output_dir / "minimapa_logica.png")
