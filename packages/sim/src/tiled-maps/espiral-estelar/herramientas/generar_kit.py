"""Genera todo el kit: tilesets, mapa Espiral Estelar (TMX + JSON), assets del juego, vistas previas y zip."""
import json
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import assets_runtime  # noqa: E402
import diseno_espiral  # noqa: E402
import mapa_tiled  # noqa: E402
import naves  # noqa: E402
import tilesets  # noqa: E402
import vista_previa  # noqa: E402

KIT_DIR = Path(__file__).resolve().parent.parent
RUNTIME_DIR = KIT_DIR / "assets-juego"
OUTPUT_ZIP = KIT_DIR.parent / "espiral-estelar-kit.zip"
GENERATED = ["tilesets", "assets-juego", "vistas-previas"]
ZIP_EXCLUDED = {"node_modules", "__pycache__", "package-lock.json"}

OBJECT_CLASSES = [
    ("spawn", "#2F7FD8", [("owner", "int", 1)]),
    ("pronexo", "#E04848", [("index", "int", 1)]),
    ("pilar", "#E8B730", []),
    ("barrera", "#30B8E8", [("hp", "int", 500)]),
    ("mob_spawn", "#8C6A4A", [("count", "int", 3)]),
    ("recurso", "#F0A030", [("amount", "int", 300)]),
    ("agujero", "#3CC870", [("pairId", "string", "A"), ("cycleSeconds", "int", 90), ("openSeconds", "int", 30)]),
    ("asteroid_gate", "#A07850", [("cycleSeconds", "int", 60), ("openSeconds", "int", 20)]),
    ("CRITTER_SPAWN", "#45F0DF", [("entity_type", "string", "maintenance_drone"), ("max_units", "int", 3),
                                  ("flee_distance", "float", 150.0), ("flee_threshold_units", "int", 5),
                                  ("fow_sensitive", "bool", True), ("sprite_sheet", "string", "critter_drone.png")]),
    ("OBSTACLE_RING", "#72C1E8", [("collision_type", "string", "HEAVY_ONLY"), ("height_level", "int", -30),
                                  ("rotation_speed", "int", 12), ("blocks_vision", "bool", False),
                                  ("damage_on_collision", "int", 0)]),
    ("ENVIRONMENTAL_HAZARD", "#A855F7", [("collision_type", "string", "NONE"), ("height_level", "int", -60),
                                         ("vision_modifier", "string", "REDUCE_TO_1_TILE"),
                                         ("disable_radar", "bool", True), ("shield_drain_per_sec", "float", 5.0),
                                         ("blocks_vision", "bool", True)]),
    ("SOLID_BLOCKER", "#9DA8BE", [("collision_type", "string", "ALL_UNITS_BLOCKED"), ("height_level", "int", -90),
                                  ("blocks_vision", "bool", True), ("indestructible", "bool", True)]),
]


def project_json():
    terrain_enum = {"id": 1, "name": "Terreno", "type": "enum", "storageType": "string",
                    "values": [name for name, _ in tilesets.TERRAINS], "valuesAsFlags": False}
    classes = [{"id": i + 2, "name": name, "type": "class", "useAs": ["object"], "color": rgb, "drawFill": True,
                "members": [{"name": m, "type": kind, "value": value} for m, kind, value in members]}
               for i, (name, rgb, members) in enumerate(OBJECT_CLASSES)]
    return {"automappingRulesFile": "", "commands": [], "compatibilityVersion": 1100,
            "extensionsPath": "extensions", "folders": ["."], "propertyTypes": [terrain_enum] + classes}


def clean_generated():
    for folder in GENERATED:
        shutil.rmtree(KIT_DIR / folder, ignore_errors=True)


def write_runtime_assets():
    RUNTIME_DIR.mkdir(parents=True)
    for file_name, draw in assets_runtime.RUNTIME_ASSETS.items():
        draw().save(RUNTIME_DIR / file_name)
    (RUNTIME_DIR / "atlas.json").write_text(json.dumps(assets_runtime.RUNTIME_ATLAS, indent=2))
    naves.generate_fragata(RUNTIME_DIR / "naves")


def write_zip():
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(KIT_DIR.rglob("*")):
            relative = path.relative_to(KIT_DIR)
            if path.is_file() and not ZIP_EXCLUDED.intersection(relative.parts):
                archive.write(path, Path(KIT_DIR.name) / relative)


def main():
    clean_generated()
    all_tilesets = tilesets.write_all(KIT_DIR / "tilesets")
    layout = diseno_espiral.build_layout()
    map_data = mapa_tiled.write_map(KIT_DIR, layout, all_tilesets)
    (KIT_DIR / "espiral-estelar.tiled-project").write_text(json.dumps(project_json(), indent=2))
    write_runtime_assets()
    vista_previa.generate_previews(KIT_DIR, map_data)
    write_zip()


if __name__ == "__main__":
    main()
