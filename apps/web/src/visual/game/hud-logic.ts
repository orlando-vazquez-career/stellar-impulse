import { MAX_PRODUCTION_QUEUE, UNIT_COSTS } from '@impulso/sim';
import type { CoreViewModel, GameplayViewModel, ProductionViewModel, QueuedProductionViewModel, SquadOwner, SquadType } from './model';

/** One hangar order as the HUD lists it. Slot 0 is the ship in production; a cancel sends this slot back. */
export interface HangarSlot {
  slot: number;
  kind: SquadType;
  refund: number;
  /** The ship in production only: how far it has come (0 to 1) and the seconds it still needs. */
  progress?: number;
  secondsLeft?: number;
}

/** The orders a hangar holds, slot by slot, never past `max` slots. */
export function hangarSlots(production: ProductionViewModel | null, queue: readonly QueuedProductionViewModel[],
  max = MAX_PRODUCTION_QUEUE): HangarSlot[] {
  const slots: HangarSlot[] = [];
  if (production) slots.push({ slot: 0, kind: production.kind, refund: production.refund ?? 0,
    ...(production.progress !== undefined ? { progress: production.progress } : {}), secondsLeft: production.remainingSeconds });
  queue.forEach((order, index) => slots.push({ slot: index + 1, kind: order.kind, refund: order.refund }));
  return slots.filter((entry) => entry.slot < max);
}

export type ProductionBlock = 'queue_full' | 'fleet_full' | 'metal' | 'forbidden' | 'finished';

/** Why the hangar would refuse this ship now, in the order the server checks; null when it would take it. */
export function productionBlock(view: GameplayViewModel, kind: SquadType): ProductionBlock | null {
  if (view.result !== null) return 'finished';
  const pending = (view.production ? 1 : 0) + view.productionQueue.length;
  if (pending >= MAX_PRODUCTION_QUEUE) return 'queue_full';
  if (view.productionForbidden?.includes(kind)) return 'forbidden';
  // Every order already paid for takes its berth in the fleet.
  if (view.resources.fleet + pending >= view.resources.fleetCap) return 'fleet_full';
  if (view.resources.metal < (view.unitStats?.[kind].cost ?? UNIT_COSTS[kind])) return 'metal';
  return null;
}

export interface CoreHud {
  status: 'locked' | 'idle' | 'capturing-own' | 'capturing-rival' | 'contested';
  /** The captor's progress while one side takes it, the leading progress otherwise (0 to 100). */
  percent: number;
  /** Seconds until it opens while locked, until the captor takes it while captured; null otherwise. */
  secondsLeft: number | null;
  /** Why nobody is taking an open Core: its guardian stands, or both sides are in it. */
  hint: 'guardian' | 'contested' | null;
}

/** What the HUD says about the Core. */
export function coreHud(core: CoreViewModel): CoreHud {
  const status: CoreHud['status'] = core.state === 'locked' ? 'locked'
    : core.state === 'contested' ? 'contested'
      : core.state === 'blue-capturing' ? 'capturing-own'
        : core.state === 'red-capturing' ? 'capturing-rival' : 'idle';
  const fraction = status === 'capturing-own' ? core.fractions.own : status === 'capturing-rival' ? core.fractions.rival : null;
  return {
    status,
    percent: fraction === null ? core.progress : Math.round(Math.min(1, Math.max(0, fraction)) * 100),
    secondsLeft: status === 'locked' ? core.opensInSeconds : fraction === null ? null : core.secondsLeft,
    hint: status === 'contested' ? 'contested' : status !== 'locked' && core.guarded ? 'guardian' : null,
  };
}

type Cell = { x: number; y: number };
/** Base colours: the player's own base is always blue. Before the server says which one it is, p1 is blue. */
export function baseFactions(ownBase: Cell | undefined, bases: { p1: Cell; p2: Cell }): Record<'p1' | 'p2', Exclude<SquadOwner, 'neutral'>> {
  const ownP2 = !!ownBase && ownBase.x === bases.p2.x && ownBase.y === bases.p2.y;
  return ownP2 ? { p1: 'red', p2: 'blue' } : { p1: 'blue', p2: 'red' };
}
