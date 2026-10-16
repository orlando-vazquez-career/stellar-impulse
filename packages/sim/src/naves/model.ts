import type { PlayerId, Position } from '../engine.js';
import type { PlayerStance } from '../mecanicas/orders.js';
import type { UnitKind } from './types.js';

export interface Squad extends Position {
  arrivalLocked?: boolean;
  arrivalSeat?: Position | null;
  id: string;
  ownerId: PlayerId;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  damage: number;
  lastAttackTick?: number;
  /** Last observation of the ordered target; never follows a position inside fog. */
  attackMemory?: Position & { seenAt: number };
  nextAttackTick?: number;
  lastShot?: { tick: number; from: Position; to: Position; splashRadius: number };
  lastDamageTick?: number;
  lastMovedTick?: number;
  kills?: number;
  veteran?: boolean;
  isDecoy?: boolean;
  expiresAt?: number;
  stance: PlayerStance;
  anchor: Position | null;
  gather: Position | null;
  target: Position | null;
  route: Position[];
  attackTargetId: string | null;
  /** Previous cell remains reserved while the client finishes this step. */
  transit?: { from: Position; untilTick: number };
  /** Brief right-of-way pause after taking an allied passing pocket. */
  trafficYieldUntil?: number;
  /** A fresh order may take its first step on the next tick instead of waiting for the beat. */
  quickStep?: boolean;
  /** After an off-beat first step, no further step before this tick (then the shared beat resumes). */
  moveHoldUntil?: number;
  /** Same-type formation march: members share the slowest member's beat, so the shape holds. */
  formationPace?: number;
  /** Beats spent waiting behind a marching ally; after a few the usual traffic rules take over. */
  formationWait?: number;
  /** This ship's cell in its formation. A passing ally may nudge it out; it then flies back. */
  formationSeat?: Position;
  /** Pushed off its seat by a passing ally and flying back: it waits, others never yield to it. */
  formationNudged?: boolean;
  /** Closest the formation march has come to its seat (in steps), and when. */
  formationProgress?: { best: number; tick: number };
}
