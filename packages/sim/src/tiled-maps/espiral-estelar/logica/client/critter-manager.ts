import { CritterBrain, DEFAULT_CRITTER, type CritterState } from './critters';
import type { WorldPoint } from './iso-projection';

/** Lo que necesita el manager del sistema de visión del jugador: solo enemigos que este cliente ve. */
export interface PlayerVisionSystem {
  getVisibleEnemies(): readonly WorldPoint[];
}

/** Datos de un objeto CRITTER_SPAWN de la capa Critters_Dynamic. */
export interface CritterSpawner {
  readonly position: WorldPoint;
  readonly maxUnits: number;
  readonly fleeDistance: number;
  readonly fleeThresholdUnits: number;
}

export const CRITTER_ANIMATION: Readonly<Record<CritterState, string>> = {
  idle: 'critter-idle',
  flee: 'critter-flee',
  return: 'critter-idle',
};

const SPAWN_SPREAD = 24;

/**
 * IA local de los drones (solo cliente, sin sockets). Si ven suficientes enemigos cerca,
 * huyen hacia la cobertura más cercana (asteroides o nebulosa) o, si no hay, a la estación espacial.
 */
export class CritterManager {
  readonly critters: CritterBrain[] = [];

  constructor(
    spawners: readonly CritterSpawner[],
    private readonly vision: PlayerVisionSystem,
    private readonly coverPoints: readonly WorldPoint[],
    private readonly station: WorldPoint,
    random: () => number = Math.random,
  ) {
    for (const spawner of spawners) {
      for (let index = 0; index < spawner.maxUnits; index++) {
        const home = spreadAround(spawner.position, index, spawner.maxUnits);
        const config = {
          ...DEFAULT_CRITTER, home, scareRadius: spawner.fleeDistance, scareThreshold: spawner.fleeThresholdUnits,
        };
        this.critters.push(new CritterBrain(config, random, (position) => this.nearestShelter(position)));
      }
    }
  }

  update(elapsedMs: number): void {
    const enemies = this.vision.getVisibleEnemies();
    this.critters.forEach((critter) => critter.update(elapsedMs, enemies));
  }

  nearestShelter(position: WorldPoint): WorldPoint {
    const candidates = this.coverPoints.length > 0 ? this.coverPoints : [this.station];
    return candidates.reduce((best, point) => (distance(point, position) < distance(best, position) ? point : best));
  }
}

function spreadAround(center: WorldPoint, index: number, total: number): WorldPoint {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  return { x: center.x + Math.cos(angle) * SPAWN_SPREAD, y: center.y + Math.sin(angle) * SPAWN_SPREAD * 0.5 };
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
