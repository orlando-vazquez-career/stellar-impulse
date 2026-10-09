import type { WorldPoint } from './iso-projection';

export interface CritterConfig {
  readonly home: WorldPoint;
  readonly wanderRadius: number;
  readonly scareRadius: number;
  /** Cantidad de naves visibles cerca a partir de la cual el dron huye. */
  readonly scareThreshold: number;
  readonly speed: number;
  readonly fleeSpeed: number;
  readonly calmDownMs: number;
}

export const DEFAULT_CRITTER: Omit<CritterConfig, 'home'> = {
  wanderRadius: 60,
  scareRadius: 140,
  scareThreshold: 5,
  speed: 0.03,
  fleeSpeed: 0.18,
  calmDownMs: 6000,
};

export type CritterState = 'idle' | 'flee' | 'return';

/** Elige a dónde huir: por defecto, en dirección contraria a las amenazas. */
export type FleeTargetChooser = (position: WorldPoint, threats: readonly WorldPoint[]) => WorldPoint;

/**
 * Dron neutral decorativo. Corre solo en el cliente y reacciona únicamente a naves que el jugador ve,
 * para no delatar enemigos ocultos en la niebla.
 */
export class CritterBrain {
  position: WorldPoint;
  state: CritterState = 'idle';
  private target: WorldPoint;
  private calmTimer = 0;

  constructor(
    private readonly config: CritterConfig,
    private readonly random: () => number = Math.random,
    private readonly chooseFleeTarget?: FleeTargetChooser,
  ) {
    this.position = config.home;
    this.target = this.pickWanderTarget();
  }

  update(elapsedMs: number, visibleUnits: readonly WorldPoint[]): void {
    const threats = visibleUnits.filter((unit) => distance(unit, this.position) <= this.config.scareRadius);
    if (threats.length >= this.config.scareThreshold) this.startFleeing(threats);
    else this.updateCalmState(elapsedMs);
    this.moveTowardTarget(elapsedMs);
  }

  private startFleeing(threats: readonly WorldPoint[]): void {
    this.state = 'flee';
    this.calmTimer = this.config.calmDownMs;
    this.target = this.chooseFleeTarget?.(this.position, threats) ?? this.awayFrom(threats);
  }

  private awayFrom(threats: readonly WorldPoint[]): WorldPoint {
    const away = averageDirection(this.position, threats);
    return { x: this.position.x + away.x * this.config.scareRadius, y: this.position.y + away.y * this.config.scareRadius };
  }

  private updateCalmState(elapsedMs: number): void {
    if (this.state === 'flee') {
      this.calmTimer -= elapsedMs;
      if (this.calmTimer <= 0) this.goHome();
    } else if (distance(this.position, this.target) < 2) {
      this.state = 'idle';
      this.target = this.pickWanderTarget();
    }
  }

  private goHome(): void {
    this.state = 'return';
    this.target = this.config.home;
  }

  private moveTowardTarget(elapsedMs: number): void {
    const speed = this.state === 'flee' ? this.config.fleeSpeed : this.config.speed;
    const remaining = distance(this.position, this.target);
    const step = Math.min(remaining, speed * elapsedMs);
    if (remaining === 0) return;
    this.position = {
      x: this.position.x + ((this.target.x - this.position.x) / remaining) * step,
      y: this.position.y + ((this.target.y - this.position.y) / remaining) * step,
    };
  }

  private pickWanderTarget(): WorldPoint {
    const angle = this.random() * Math.PI * 2;
    const radius = this.random() * this.config.wanderRadius;
    return { x: this.config.home.x + Math.cos(angle) * radius, y: this.config.home.y + Math.sin(angle) * radius * 0.5 };
  }
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averageDirection(from: WorldPoint, threats: readonly WorldPoint[]): WorldPoint {
  const sum = threats.reduce((total, threat) => ({ x: total.x + from.x - threat.x, y: total.y + from.y - threat.y }), { x: 0, y: 0 });
  const length = Math.hypot(sum.x, sum.y) || 1;
  return { x: sum.x / length, y: sum.y / length };
}
