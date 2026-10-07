export interface RobotPoint { x: number; y: number }
/** One step of a Tiled tile animation. */
export interface RobotFrame { tileid: number; duration: number }

/** Cells around the robot in which it notices ships. */
export const ROBOT_SIGHT = 6;
/** More ships than this in sight and the robot runs for its capsule. */
export const ROBOT_CALM_SHIPS = 5;
const WALK_SPEED = 0.8;
const FLEE_SPEED = 2.4;
/** The alert stays up this long after the last crowded look. */
const CALM_MS = 3000;
/** Tiled holds the last frame of `salir`/`volver` for the preview loop; in game the robot moves on. */
const LAST_FRAME_MS = 300;
const WANDER = { min: 1.2, max: 2.8 };

export type RobotPhase = 'inside' | 'exiting' | 'walking' | 'returning' | 'fleeing' | 'entering';

export interface RobotOptions {
  /** Capsule frames while leaving and while going back in (the `salir` and `volver` animations). */
  exit: readonly RobotFrame[];
  enter: readonly RobotFrame[];
  /** False for a robot placed on the map without a capsule: it only wanders around its spot. */
  capsule: boolean;
  walkable(x: number, y: number): boolean;
  random?: () => number;
}

/**
 * Decorative robot, client only. It leaves its capsule, walks a little and goes back in. It reacts only
 * to ships this player can see, so it never gives away anything hidden in the fog.
 */
export class RobotBrain {
  phase: RobotPhase;
  /** Tiled cell units (pixels / tile height). */
  position: RobotPoint;
  capsuleFrame: number;
  alert = false;
  moving = false;
  private readonly random: () => number;
  private target: RobotPoint;
  private wait: number;
  private stops = 0;
  private calm = 0;
  private step = 0;
  private stepClock = 0;

  constructor(readonly home: RobotPoint, private readonly options: RobotOptions) {
    this.random = options.random ?? Math.random;
    this.position = { ...home };
    this.target = { ...home };
    this.phase = options.capsule ? 'inside' : 'walking';
    this.capsuleFrame = options.exit[0]?.tileid ?? 0;
    this.wait = this.rest();
  }

  update(elapsedMs: number, ships: readonly RobotPoint[]): void {
    const seen = ships.filter((ship) => Math.hypot(ship.x - this.position.x, ship.y - this.position.y) <= ROBOT_SIGHT).length;
    if (seen > ROBOT_CALM_SHIPS) this.calm = CALM_MS;
    else this.calm = Math.max(0, this.calm - elapsedMs);
    const scared = this.calm > 0;
    if (scared) this.panic();
    this.moving = false;
    if (this.phase === 'inside') {
      // It does not come out while the crowd is still around.
      if (!scared) this.wait -= elapsedMs;
      if (this.wait <= 0) { this.phase = 'exiting'; this.step = 0; this.stepClock = 0; }
    } else if (this.phase === 'exiting') {
      if (this.play(this.options.exit, elapsedMs)) {
        this.phase = 'walking';
        this.stops = 2 + Math.floor(this.random() * 2);
        // The robot is out: the capsule shows its closed frame until it comes back.
        this.capsuleFrame = this.options.exit[0]?.tileid ?? 0;
        this.wander();
      }
    } else if (this.phase === 'entering') {
      if (this.play(this.options.enter, elapsedMs * (scared ? 2 : 1))) { this.phase = 'inside'; this.wait = this.rest(); }
    } else if (this.phase === 'walking') {
      if (this.wait > 0) this.wait -= elapsedMs;
      else if (this.walk(elapsedMs, WALK_SPEED)) {
        this.stops -= 1;
        this.wait = 400 + this.random() * 800;
        if (this.options.capsule && this.stops <= 0) { this.phase = 'returning'; this.target = { ...this.home }; }
        else this.wander();
      }
    } else if (this.walk(elapsedMs, this.phase === 'fleeing' ? FLEE_SPEED : WALK_SPEED)) {
      if (this.options.capsule) this.goIn(0);
      // Without a capsule it waits at its spot until the ships thin out.
      else if (!scared) { this.phase = 'walking'; this.wander(); }
    }
    this.alert = scared && this.phase !== 'inside';
  }

  private panic(): void {
    if (this.phase === 'walking' || this.phase === 'returning') { this.phase = 'fleeing'; this.target = { ...this.home }; this.wait = 0; }
    else if (this.phase === 'exiting') {
      // Back in from wherever the hatch was.
      const index = this.options.enter.findIndex((frame) => frame.tileid === this.capsuleFrame);
      this.goIn(Math.max(0, index));
    }
  }

  private goIn(step: number): void {
    this.phase = 'entering';
    this.position = { ...this.home };
    this.step = step;
    this.stepClock = 0;
    this.capsuleFrame = this.options.enter[step]?.tileid ?? this.capsuleFrame;
  }

  /** Advance a capsule animation; true once its last frame has been shown. */
  private play(frames: readonly RobotFrame[], elapsedMs: number): boolean {
    this.stepClock += elapsedMs;
    for (;;) {
      const frame = frames[this.step];
      if (!frame) return true;
      this.capsuleFrame = frame.tileid;
      const hold = this.step === frames.length - 1 ? Math.min(frame.duration, LAST_FRAME_MS) : frame.duration;
      if (this.stepClock < hold) return false;
      this.stepClock -= hold;
      this.step += 1;
    }
  }

  /** Move toward the target; true on arrival. */
  private walk(elapsedMs: number, speed: number): boolean {
    const dx = this.target.x - this.position.x, dy = this.target.y - this.position.y;
    const gap = Math.hypot(dx, dy);
    const reach = speed * elapsedMs / 1000;
    if (gap <= reach) { this.position = { ...this.target }; return true; }
    this.position = { x: this.position.x + dx / gap * reach, y: this.position.y + dy / gap * reach };
    this.moving = true;
    return false;
  }

  /** A nearby point reachable in a straight line over open floor; home when nothing fits. */
  private wander(): void {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const radius = WANDER.min + this.random() * (WANDER.max - WANDER.min);
      const goal = { x: this.home.x + Math.cos(angle) * radius, y: this.home.y + Math.sin(angle) * radius };
      if (this.clear(this.position, goal)) { this.target = goal; return; }
    }
    this.target = { ...this.home };
  }

  private clear(from: RobotPoint, to: RobotPoint): boolean {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 4);
    for (let step = 1; step <= steps; step += 1) {
      const x = from.x + (to.x - from.x) * step / steps, y = from.y + (to.y - from.y) * step / steps;
      if (!this.options.walkable(Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  private rest(): number {
    return 2500 + this.random() * 3500;
  }
}
