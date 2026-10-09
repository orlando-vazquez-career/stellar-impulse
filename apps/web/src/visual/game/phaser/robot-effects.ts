import Phaser from 'phaser';
import capsuleSheet from '../../../../../../packages/sim/src/tiled-maps/espiral-estelar/assets-externos/sprites/robot-sal.png?url';
import walkerSheet from '../../../../../../packages/sim/src/tiled-maps/espiral-estelar/assets-externos/sprites/robotsitoo.png?url';
import type { GameplayViewModel } from '../model';
import { sectorMap, sectorSurface, type Tileset } from '../../map/sector-map';
import { cellToIso, TILE_HALF_HEIGHT } from './isometric';
import { RobotBrain, type RobotFrame, type RobotPoint } from './robot-brain';

/** Object layer painted in Tiled: `robot_capsula` objects host a robot, `robotsitoo` ones roam without a capsule. */
export const ROBOT_LAYER = 'robots';
const CAPSULE = { key: 'robot-capsule', tileset: 'robot-sal', object: 'robot_capsula' };
const WALKER = { key: 'robot-walker', tileset: 'robotsitoo', object: 'robotsitoo' };
const DEPTH_UNITS = 100000;
const FOG_TINT = 0x4a5566;
/** The walker's last frame is the robot standing still. */
const IDLE_FRAME = 7;

interface RobotVisual {
  brain: RobotBrain;
  capsule?: Phaser.GameObjects.Image;
  walker: Phaser.GameObjects.Image;
  alert: Phaser.GameObjects.Text;
  clock: number;
}

/** Robots that step out of their capsules, stroll and hurry back when too many ships gather. Cosmetic only. */
export class RobotEffects {
  private readonly visuals: RobotVisual[] = [];
  private ships: RobotPoint[] = [];
  private visibleCells: boolean[] | null = null;
  private stride: readonly RobotFrame[] = [];

  static preload(scene: Phaser.Scene): void {
    for (const [sheet, source] of [[CAPSULE, capsuleSheet], [WALKER, walkerSheet]] as const) {
      const tileset = tilesetNamed(sheet.tileset);
      if (tileset) scene.load.spritesheet(sheet.key, source, { frameWidth: tileset.tilewidth, frameHeight: tileset.tileheight });
    }
  }

  constructor(private readonly scene: Phaser.Scene) {
    const layer = sectorMap.layers.find((candidate) => candidate.name === ROBOT_LAYER);
    const capsules = tilesetNamed(CAPSULE.tileset);
    const walkers = tilesetNamed(WALKER.tileset);
    if (!layer?.objects || !capsules || !walkers) return;
    const stride = animation(walkers, 'mover');
    const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < sectorSurface.width && y < sectorSurface.height
      && sectorSurface.walkable[y * sectorSurface.width + x] === true;
    for (const object of layer.objects) {
      const capsule = object.name === CAPSULE.object;
      if ((!capsule && object.name !== WALKER.object) || object.visible === false) continue;
      // Object positions are in tile-height pixels along both isometric axes.
      const home = { x: object.x / TILE_HALF_HEIGHT / 2, y: object.y / TILE_HALF_HEIGHT / 2 };
      const brain = new RobotBrain(home, { capsule, walkable, exit: animation(capsules, 'salir'), enter: animation(capsules, 'volver') });
      const at = ground(home);
      this.visuals.push({
        brain, clock: 0,
        capsule: capsule ? scene.add.image(at.x, at.y, CAPSULE.key, brain.capsuleFrame).setOrigin(0.5, 1).setDepth(DEPTH_UNITS + at.y) : undefined,
        walker: scene.add.image(at.x, at.y, WALKER.key, stride[0]?.tileid ?? 0).setOrigin(0.5, 1).setVisible(!capsule),
        alert: scene.add.text(at.x, at.y, '!', {
          color: '#ffd166', fontFamily: 'Rajdhani, sans-serif', fontSize: '26px', fontStyle: '700', stroke: '#7a1408', strokeThickness: 5,
        }).setOrigin(0.5, 1).setVisible(false),
      });
    }
    this.stride = stride;
  }

  /** Ships and fog as this player sees them; robots never react to anything hidden. */
  sync(snapshot: GameplayViewModel): void {
    this.ships = snapshot.squads.filter((squad) => squad.visible && squad.healthPercent > 0 && squad.owner !== 'neutral')
      // Ships sit on cell centres; robots use Tiled's corner-based cell units.
      .map((squad) => ({ x: squad.gridX + 0.5, y: squad.gridY + 0.5 }));
    this.visibleCells = snapshot.visibleCells;
  }

  update(elapsedMs: number): void {
    for (const visual of this.visuals) {
      const { brain, capsule, walker, alert } = visual;
      const before = brain.position.x - brain.position.y;
      brain.update(elapsedMs, this.ships);
      const tint = this.fogged(brain.position) ? FOG_TINT : 0xffffff;
      capsule?.setFrame(brain.capsuleFrame).setTint(this.fogged(brain.home) ? FOG_TINT : 0xffffff);
      const outside = brain.phase === 'walking' || brain.phase === 'returning' || brain.phase === 'fleeing';
      const at = ground(brain.position);
      walker.setVisible(outside).setPosition(at.x, at.y).setTint(tint);
      // Changing a depth re-sorts the whole scene: only when the robot crosses a row.
      const depth = DEPTH_UNITS + Math.round(at.y) + 1;
      if (walker.depth !== depth) { walker.setDepth(depth); alert.setDepth(depth + 1); }
      if (brain.moving) {
        // The Tiled `mover` loop, twice as fast while running away.
        visual.clock += elapsedMs * (brain.phase === 'fleeing' ? 2 : 1);
        walker.setFrame(frameAt(this.stride, visual.clock));
        const heading = brain.position.x - brain.position.y - before;
        if (Math.abs(heading) > 0.0005) walker.setFlipX(heading < 0);
      } else walker.setFrame(IDLE_FRAME);
      const top = outside ? at.y - walker.height : at.y - (capsule?.height ?? walker.height);
      alert.setVisible(brain.alert).setPosition(at.x, top - 2 + Math.sin(this.scene.time.now / 90) * 3);
    }
  }

  private fogged(point: RobotPoint): boolean {
    return this.visibleCells !== null && this.visibleCells[Math.floor(point.y) * sectorMap.width + Math.floor(point.x)] !== true;
  }

  destroy(): void {
    for (const visual of this.visuals) {
      visual.capsule?.destroy();
      visual.walker.destroy();
      visual.alert.destroy();
    }
    this.visuals.length = 0;
  }
}

/** Screen point of the floor under a position in Tiled cell units. */
function ground(point: RobotPoint): RobotPoint {
  const iso = cellToIso(point.x, point.y);
  return { x: iso.x, y: iso.y - TILE_HALF_HEIGHT };
}

function tilesetNamed(name: string): Tileset | undefined {
  return sectorMap.tilesets.find((tileset) => tileset.name === name);
}

/** Frames of the tile whose `animacion` property carries this name, as authored in Tiled. */
function animation(tileset: Tileset, name: string): RobotFrame[] {
  const tile = tileset.tiles?.find((candidate) => candidate.properties?.some((entry) => entry.name === 'animacion' && entry.value === name));
  return tile?.animation ?? [];
}

function frameAt(frames: readonly RobotFrame[], clock: number): number {
  const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
  if (total <= 0) return 0;
  let rest = clock % total;
  for (const frame of frames) {
    if (rest < frame.duration) return frame.tileid;
    rest -= frame.duration;
  }
  return frames[0]!.tileid;
}
