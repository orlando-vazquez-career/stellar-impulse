"""Modelo isométrico de la Fragata: geometría, proyección y hoja de sprites (8 direcciones + sombras)."""
import io
import json
import math

import cairosvg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FRAME_SIZE = 320
ANCHOR = (160, 190)
SCALE = 0.76
HOVER = 36
HULL_HEIGHT = 12
TURRET_HEIGHT = 7
FIN_HEIGHT = 44

DIRECTIONS = [("N", 225), ("NE", 270), ("E", 315), ("SE", 0),
              ("S", 45), ("SO", 90), ("O", 135), ("NO", 180)]

COLORS = {
    "hull": "#62728C", "armor": "#4A586E", "plate": "#93A3BA", "team": "#2F7FD8",
    "engine": "#3A4658", "turret": "#7F8FA8", "line": "#1A212C", "cockpit": "#7FD8F0",
}

HULL = [(115, 0), (75, -17), (-35, -23), (-95, -17), (-105, 0), (-95, 17), (-35, 23), (75, 17)]
PLATE = [(60, -8), (-30, -12), (-30, 12), (60, 8)]
WING_LEFT = [(15, -23), (-25, -60), (-65, -60), (-55, -23)]
ENGINE_LEFT = [(-117, -27), (-95, -27), (-95, -11), (-117, -11)]
TEAM_STRIPE_LEFT = [(-65, -61), (-25, -61), (-31, -55), (-62, -55)]


def mirror(points):
    return [(x, -y) for x, y in points]


def ellipse_points(cx, cy, rx, ry, count=20):
    return [(cx + rx * math.cos(2 * math.pi * i / count), cy + ry * math.sin(2 * math.pi * i / count))
            for i in range(count)]


def adjust_color(hex_color, factor):
    channels = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return "#" + "".join(f"{max(0, min(255, round(c * factor))):02X}" for c in channels)


class Projector:
    """Convierte coordenadas locales de la nave (vista en planta) a píxeles isométricos."""

    def __init__(self, angle_degrees, anchor=ANCHOR, scale=SCALE):
        angle = math.radians(angle_degrees)
        self.cos, self.sin = math.cos(angle), math.sin(angle)
        self.anchor, self.scale = anchor, scale

    def ground(self, x, y):
        return x * self.cos - y * self.sin, x * self.sin + y * self.cos

    def screen(self, x, y, lift=0.0):
        gx, gy = self.ground(x, y)
        return self.anchor[0] + (gx - gy) * self.scale, self.anchor[1] + (gx + gy) * self.scale / 2 - lift

    def depth(self, points):
        return sum(self.screen(x, y)[1] for x, y in points) / len(points)

    def screen_normal(self, nx, ny):
        gx, gy = self.ground(nx, ny)
        sx, sy = gx - gy, (gx + gy) / 2
        length = math.hypot(sx, sy) or 1
        return sx / length, sy / length


class FrameBuilder:
    """Acumula elementos SVG de un frame respetando el orden de dibujado."""

    def __init__(self, projector, elements=None, gradients=None):
        self.projector = projector
        self.elements = [] if elements is None else elements
        self.gradients = [] if gradients is None else gradients

    def with_projector(self, projector):
        """Otro constructor que dibuja en el mismo lienzo con otra posición o ángulo."""
        return FrameBuilder(projector, self.elements, self.gradients)

    def points_attr(self, points, lift):
        return " ".join(f"{px:.1f},{py:.1f}" for px, py in (self.projector.screen(x, y, lift) for x, y in points))

    def polygon(self, points, lift, fill, stroke=COLORS["line"], width=1.0, extra=""):
        self.elements.append(f'<polygon points="{self.points_attr(points, lift)}" fill="{fill}" '
                             f'stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round" {extra}/>')

    def line(self, start, end, lift, color, width, extra=""):
        (x1, y1), (x2, y2) = self.projector.screen(*start, lift), self.projector.screen(*end, lift)
        self.elements.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" '
                             f'stroke-width="{width}" stroke-linecap="round" {extra}/>')

    def lit_fill(self, base_color):
        gradient_id = f"g{len(self.gradients)}"
        self.gradients.append(
            f'<linearGradient id="{gradient_id}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{adjust_color(base_color, 1.3)}"/>'
            f'<stop offset="1" stop-color="{adjust_color(base_color, 0.85)}"/></linearGradient>')
        return f"url(#{gradient_id})"

    def glow(self, point, lift, radius, inner, outer):
        gradient_id = f"g{len(self.gradients)}"
        self.gradients.append(
            f'<radialGradient id="{gradient_id}"><stop offset="0" stop-color="{inner}"/>'
            f'<stop offset="0.45" stop-color="{outer}" stop-opacity="0.7"/>'
            f'<stop offset="1" stop-color="{outer}" stop-opacity="0"/></radialGradient>')
        cx, cy = self.projector.screen(*point, lift)
        self.elements.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{radius}" ry="{radius * 0.7:.1f}" '
                             f'fill="url(#{gradient_id})"/>')

    def prism_sides(self, points, bottom, top, color):
        centroid_x = sum(x for x, _ in points) / len(points)
        centroid_y = sum(y for _, y in points) / len(points)
        faces = []
        for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
            nx, ny = y2 - y1, -(x2 - x1)
            if nx * ((x1 + x2) / 2 - centroid_x) + ny * ((y1 + y2) / 2 - centroid_y) < 0:
                nx, ny = -nx, -ny
            sx, sy = self.projector.screen_normal(nx, ny)
            if sy <= 0:
                continue
            quad = [self.projector.screen(x1, y1, bottom), self.projector.screen(x2, y2, bottom),
                    self.projector.screen(x2, y2, top), self.projector.screen(x1, y1, top)]
            faces.append((sum(p[1] for p in quad), quad, adjust_color(color, 0.7 - 0.2 * sx)))
        for _, quad, shade in sorted(faces):
            attr = " ".join(f"{px:.1f},{py:.1f}" for px, py in quad)
            self.elements.append(f'<polygon points="{attr}" fill="{shade}" stroke="{COLORS["line"]}" '
                                 f'stroke-width="0.8" stroke-linejoin="round"/>')

    def prism(self, points, bottom, top, color):
        self.prism_sides(points, bottom, top, color)
        self.polygon(points, top, self.lit_fill(color))

    def to_svg(self, width=FRAME_SIZE, height=FRAME_SIZE):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
                f'<defs>{"".join(self.gradients)}</defs>{"".join(self.elements)}</svg>')


HULL_BOTTOM = HOVER
HULL_TOP = HOVER + HULL_HEIGHT
WING_BOTTOM, WING_TOP = HOVER + 4, HOVER + 7
EXHAUSTS = [(-121, -19), (-121, 19)]


def side_parts():
    """Partes que salen del casco: se dibujan antes o después según queden lejos o cerca."""
    return [
        (WING_LEFT, WING_BOTTOM, WING_TOP, COLORS["armor"], TEAM_STRIPE_LEFT),
        (mirror(WING_LEFT), WING_BOTTOM, WING_TOP, COLORS["armor"], mirror(TEAM_STRIPE_LEFT)),
        (ENGINE_LEFT, HOVER + 1, HOVER + 14, COLORS["engine"], None),
        (mirror(ENGINE_LEFT), HOVER + 1, HOVER + 14, COLORS["engine"], None),
    ]


def draw_side_parts(frame, parts):
    for points, bottom, top, color, stripe in parts:
        frame.prism(points, bottom, top, color)
        if stripe:
            frame.polygon(stripe, top, COLORS["team"], width=0.6)


def draw_exhausts(frame, exhausts):
    for point in exhausts:
        frame.glow(point, HOVER + 7, 24, "#FFF4D6", "#FF8A1F")


def draw_hull_details(frame):
    frame.polygon(PLATE, HULL_TOP, frame.lit_fill(COLORS["plate"]), width=0.8)
    panel_color = adjust_color(COLORS["hull"], 0.6)
    for side in (-1, 1):
        frame.line((-90, 13 * side), (70, 13 * side), HULL_TOP, panel_color, 1.2, 'stroke-opacity="0.7"')
    for x, half_width in ((-70, 18), (0, 21), (85, 12)):
        frame.line((x, -half_width), (x, half_width), HULL_TOP, panel_color, 1.0, 'stroke-opacity="0.6"')
    frame.polygon(ellipse_points(87, 0, 12, 6), HULL_TOP + 1, frame.lit_fill(COLORS["cockpit"]), width=0.8)
    frame.polygon(ellipse_points(90, -2, 4, 2, 10), HULL_TOP + 1.5, "#E8FBFF", stroke="none")


def turret_part(frame, x, radius, barrel_end, twin):
    def draw():
        base, top = HULL_TOP, HULL_TOP + TURRET_HEIGHT
        offsets = (-3.5, 3.5) if twin else (0,)
        for offset in offsets:
            frame.line((x, offset), (barrel_end, offset), top - 2, COLORS["line"], 5.5)
            frame.line((x, offset), (barrel_end, offset), top - 2, "#9AA9BF", 2.2)
        frame.prism(ellipse_points(x, 0, radius, radius), base, top, COLORS["turret"])
        frame.polygon(ellipse_points(x - 2, -2, radius * 0.45, radius * 0.45, 12), top, "#AEBCD0", stroke="none")
    return frame.projector.screen(x, 0)[1], draw


def fin_part(frame):
    def draw():
        base = [frame.projector.screen(-55, 0, HULL_TOP), frame.projector.screen(-82, 0, HULL_TOP)]
        tip = [frame.projector.screen(-90, 0, HULL_TOP + FIN_HEIGHT), frame.projector.screen(-76, 0, HULL_TOP + FIN_HEIGHT)]
        attr = " ".join(f"{px:.1f},{py:.1f}" for px, py in base + tip)
        frame.elements.append(f'<polygon points="{attr}" fill="{COLORS["armor"]}" stroke="{COLORS["line"]}" '
                              f'stroke-width="1.6" stroke-linejoin="round"/>')
        frame.line((-90, 0), (-76, 0), HULL_TOP + FIN_HEIGHT, COLORS["team"], 3)
        light_x, light_y = frame.projector.screen(-88, 0, HULL_TOP + FIN_HEIGHT + 3)
        frame.elements.append(f'<circle cx="{light_x:.1f}" cy="{light_y:.1f}" r="2.5" fill="#FF5A5A"/>')
    return frame.projector.screen(-70, 0)[1], draw


def draw_nav_lights(frame):
    for (x, y), color in (((-45, -60), "#FF4D4D"), ((-45, 60), "#4DFF88")):
        frame.glow((x, y), WING_TOP + 1, 9, "#FFFFFF", color)


def build_ship_svg(angle):
    frame = FrameBuilder(Projector(angle))
    hull_depth = frame.projector.depth(HULL)
    parts = side_parts()
    far_parts = [p for p in parts if frame.projector.depth(p[0]) <= hull_depth]
    near_parts = [p for p in parts if frame.projector.depth(p[0]) > hull_depth]
    exhaust_far = [e for e in EXHAUSTS if frame.projector.screen(*e)[1] <= ANCHOR[1]]
    exhaust_near = [e for e in EXHAUSTS if e not in exhaust_far]

    draw_exhausts(frame, exhaust_far)
    draw_side_parts(frame, far_parts)
    frame.prism_sides(HULL, HULL_BOTTOM, HULL_TOP, COLORS["hull"])
    draw_side_parts(frame, near_parts)
    frame.polygon(HULL, HULL_TOP, frame.lit_fill(COLORS["hull"]), stroke=adjust_color(COLORS["hull"], 1.5), width=1.2)
    draw_hull_details(frame)
    raised = [turret_part(frame, 35, 11, 66, True), turret_part(frame, -25, 9, 0, False), fin_part(frame)]
    for _, draw in sorted(raised, key=lambda item: item[0]):
        draw()
    draw_nav_lights(frame)
    draw_exhausts(frame, exhaust_near)
    return frame.to_svg()


def render_svg(svg):
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode()))).convert("RGBA")


def render_shadow(angle):
    projector = Projector(angle)
    image = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for points in (HULL, WING_LEFT, mirror(WING_LEFT), ENGINE_LEFT, mirror(ENGINE_LEFT)):
        draw.polygon([projector.screen(x, y) for x, y in points], fill=(0, 0, 0, 120))
    return image.filter(ImageFilter.GaussianBlur(5))


def build_sheet(frames):
    sheet = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index * FRAME_SIZE, 0), frame)
    return sheet


def draw_tile(canvas, center):
    cx, cy = center
    diamond = [(cx, cy - 64), (cx + 128, cy), (cx, cy + 64), (cx - 128, cy)]
    ImageDraw.Draw(canvas).polygon(diamond, fill=(27, 34, 51, 255), outline=(60, 76, 104, 255), width=2)


def build_preview(ships, shadows):
    columns, cell_height = 4, FRAME_SIZE + 40
    preview = Image.new("RGBA", (FRAME_SIZE * columns, cell_height * 2), (12, 15, 24, 255))
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    for index, (label, _) in enumerate(DIRECTIONS):
        origin = ((index % columns) * FRAME_SIZE, (index // columns) * cell_height)
        draw_tile(preview, (origin[0] + ANCHOR[0], origin[1] + ANCHOR[1]))
        preview.alpha_composite(shadows[index], origin)
        preview.alpha_composite(ships[index], origin)
        ImageDraw.Draw(preview).text((origin[0] + ANCHOR[0], origin[1] + FRAME_SIZE + 8), label,
                                     font=font, fill=(170, 182, 204, 255), anchor="mt")
    return preview


def build_atlas_info():
    return {
        "image": "fragata_naves.png",
        "shadowImage": "fragata_sombras.png",
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "frames": {label: index for index, (label, _) in enumerate(DIRECTIONS)},
        "origin": {"x": ANCHOR[0] / FRAME_SIZE, "y": ANCHOR[1] / FRAME_SIZE},
        "scaleForTile64x32": 0.25,
    }


def generate_fragata(output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    ships = [render_svg(build_ship_svg(angle)) for _, angle in DIRECTIONS]
    shadows = [render_shadow(angle) for _, angle in DIRECTIONS]
    build_sheet(ships).save(output_dir / "fragata_naves.png")
    build_sheet(shadows).save(output_dir / "fragata_sombras.png")
    build_preview(ships, shadows).save(output_dir / "fragata_preview.png")
    (output_dir / "fragata_atlas.json").write_text(json.dumps(build_atlas_info(), indent=2), encoding="utf-8")
