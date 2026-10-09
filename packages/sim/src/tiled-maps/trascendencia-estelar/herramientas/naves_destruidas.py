"""Restos de naves destruidas para decorar el mapa, con el mismo modelo de la Fragata."""
import random
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFilter

from naves import (
    COLORS, WING_LEFT, FrameBuilder, Projector, adjust_color, ellipse_points, render_svg,
)

CANVAS = (768, 512)
DOWNSCALE = 2
WRECK_SCALE = 1.5
HULL_THICKNESS = 22
DEBRIS_SPREAD = (95, 38)
PADDING = 6
BURNT_HULL = "#4A5160"
BURNT_ARMOR = "#343A4A"
EMBER = "#FF8A2A"

FRONT_HALF = [(115, 0), (75, -17), (-5, -21), (4, -13), (-8, -5), (5, 3), (-6, 12), (-4, 21), (75, 17)]
FRONT_BREAK = FRONT_HALF[2:8]
BACK_HALF = [(-10, -22), (-35, -23), (-95, -17), (-105, 0), (-95, 17), (-35, 23), (-8, 22), (-16, 12), (-4, 3),
             (-18, -5), (-6, -13)]
BACK_BREAK = BACK_HALF[6:] + BACK_HALF[:1]
ENGINE_BLOCKS = [[(-117, -27), (-95, -27), (-95, -11), (-117, -11)], [(-117, 11), (-95, 11), (-95, 27), (-117, 27)]]


@dataclass(frozen=True)
class Placement:
    anchor: tuple
    angle: float
    lift: float


@dataclass
class Wreck:
    pieces: list = field(default_factory=list)
    debris_count: int = 0
    seed: int = 0


def draw_embers(frame, edge, lift):
    for start, end in zip(edge, edge[1:]):
        frame.line(start, end, lift, EMBER, 3.2)
    for point in edge[1:-1]:
        frame.glow(point, lift, 9, "#FFE2B0", EMBER)


def draw_scorch(frame, points, lift, seed):
    rng = random.Random(seed)
    xs = [x for x, _ in points]
    for _ in range(4):
        cx, cy = rng.uniform(min(xs) + 10, max(xs) - 10), rng.uniform(-12, 12)
        blob = ellipse_points(cx, cy, rng.uniform(6, 14), rng.uniform(4, 8), 10)
        frame.polygon(blob, lift, "#000000", stroke="none", extra='fill-opacity="0.45"')


def hull_piece(points, edge, extra_blocks=()):
    def draw(frame, placement, seed):
        bottom, top = placement.lift, placement.lift + HULL_THICKNESS
        for block in extra_blocks:
            frame.prism(block, bottom + 1, top + 2, BURNT_ARMOR)
        frame.prism(points, bottom, top, BURNT_HULL)
        draw_scorch(frame, points, top, seed)
        draw_embers(frame, edge, top)
    return draw, points


def wing_piece():
    def draw(frame, placement, seed):
        frame.prism(WING_LEFT, placement.lift, placement.lift + 5, BURNT_ARMOR)
        frame.polygon([(-65, -61), (-25, -61), (-31, -55), (-62, -55)], placement.lift + 5,
                      adjust_color(COLORS["team"], 0.6), width=0.6)
        draw_embers(frame, [(15, -23), (-55, -23)], placement.lift + 5)
    return draw, WING_LEFT


def turret_piece():
    ring = ellipse_points(0, 0, 11, 11)

    def draw(frame, placement, seed):
        frame.line((0, 0), (26, 4), placement.lift + 4, COLORS["line"], 5)
        frame.prism(ring, placement.lift, placement.lift + 7, adjust_color(COLORS["turret"], 0.7))
    return draw, ring


def debris_shape(rng):
    size = rng.uniform(4, 11)
    return [(rng.uniform(-size, -size / 3), rng.uniform(-size, 0)), (rng.uniform(size / 3, size), rng.uniform(-size, 0)),
            (rng.uniform(size / 3, size), rng.uniform(0, size)), (rng.uniform(-size, -size / 3), rng.uniform(0, size))]


def debris_pieces(count, seed):
    rng = random.Random(seed)
    center_x, center_y = CANVAS[0] / 2, CANVAS[1] * 0.55
    pieces = []
    for _ in range(count):
        shape = debris_shape(rng)
        tone = rng.choice([BURNT_HULL, BURNT_ARMOR, "#5C6678"])
        hot = rng.random() < 0.2

        def draw(frame, placement, piece_seed, shape=shape, tone=tone, hot=hot):
            frame.prism(shape, placement.lift, placement.lift + 2.5, tone)
            if hot:
                frame.glow((0, 0), placement.lift + 3, 8, "#FFE2B0", EMBER)

        anchor = (center_x + rng.gauss(0, DEBRIS_SPREAD[0]), center_y + rng.gauss(0, DEBRIS_SPREAD[1]))
        pieces.append(((draw, shape), Placement(anchor, rng.uniform(0, 360), rng.uniform(16, 60))))
    return pieces


def render_shadow(placed):
    shadow = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    for (_, footprint), placement in placed:
        projector = Projector(placement.angle, placement.anchor, WRECK_SCALE)
        draw.polygon([projector.screen(x, y) for x, y in footprint], fill=(0, 0, 0, 90))
    return shadow.filter(ImageFilter.GaussianBlur(8))


def render_wreck(wreck):
    placed = wreck.pieces + debris_pieces(wreck.debris_count, wreck.seed)
    placed.sort(key=lambda item: item[1].anchor[1])
    builder = FrameBuilder(Projector(0))
    for index, ((draw, _), placement) in enumerate(placed):
        frame = builder.with_projector(Projector(placement.angle, placement.anchor, WRECK_SCALE))
        draw(frame, placement, wreck.seed + index)
    image = render_shadow(placed)
    image.alpha_composite(render_svg(builder.to_svg(*CANVAS)))
    return crop_to_content(image.resize((CANVAS[0] // DOWNSCALE, CANVAS[1] // DOWNSCALE), Image.LANCZOS))


def crop_to_content(image):
    left, top, right, bottom = image.getbbox()
    box = (max(0, left - PADDING), max(0, top - PADDING), min(image.width, right + PADDING),
           min(image.height, bottom + PADDING))
    return image.crop(box)


def split_frigate():
    return Wreck(pieces=[
        (hull_piece(BACK_HALF, BACK_BREAK, ENGINE_BLOCKS), Placement((290, 280), 160, 30)),
        (hull_piece(FRONT_HALF, FRONT_BREAK), Placement((480, 245), 25, 40)),
        (wing_piece(), Placement((560, 350), 95, 24)),
        (turret_piece(), Placement((395, 335), 40, 34)),
    ], debris_count=22, seed=5)


def drifting_bow():
    return Wreck(pieces=[
        (hull_piece(BACK_HALF, BACK_BREAK, ENGINE_BLOCKS), Placement((384, 270), 300, 34)),
        (turret_piece(), Placement((500, 330), 200, 26)),
    ], debris_count=16, seed=9)


def debris_field():
    return Wreck(pieces=[(turret_piece(), Placement((384, 290), 120, 24))], debris_count=28, seed=13)


WRECKS = [
    ("nave_destruida_1", lambda: render_wreck(split_frigate())),
    ("nave_destruida_2", lambda: render_wreck(drifting_bow())),
    ("restos_nave", lambda: render_wreck(debris_field())),
]
