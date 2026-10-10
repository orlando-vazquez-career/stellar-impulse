import type { Locale } from '../i18n';
import { gameText } from './game-copy';
import { hangarSlots } from './hud-logic';
import type { PresentationIntent, ProductionViewModel, QueuedProductionViewModel, SquadType } from './model';
import { shipIconSrc } from './phaser/game-assets';

type CancelIntent = Extract<PresentationIntent, { type: 'cancel-production' }>;

/** One hangar order as its queue slot draws it. */
export interface HangarSlotView {
  key: string;
  label: string;
  icon: string;
  /** The ship in production: the only slot with progress and seconds. */
  active: boolean;
  /** Sweep of the slot's conic progress, 0 to 360; null on a waiting order. */
  progressDegrees: number | null;
  secondsLeft: number | null;
  cancel: CancelIntent;
}

/** How far the ship in production has come, 0 to 1, from the view's progress or else from its remaining time. */
function buildProgress(production: ProductionViewModel): number {
  if (production.progress !== undefined) return Math.min(1, Math.max(0, production.progress));
  return production.totalSeconds ? Math.min(1, Math.max(0, 1 - production.remainingSeconds / production.totalSeconds)) : 0;
}

/** The hangar's orders, slot by slot, as the queue draws them: what a click on each one cancels and refunds. */
export function hangarQueueView(production: ProductionViewModel | null, queue: readonly QueuedProductionViewModel[],
  locale: Locale, unitNames: Record<SquadType, string>): HangarSlotView[] {
  return hangarSlots(production, queue).map((slot) => {
    const active = slot.slot === 0 && production !== null;
    return {
      key: `${slot.slot}-${slot.kind}`,
      label: gameText(locale, 'cancelOrder', { ship: unitNames[slot.kind], refund: slot.refund }),
      icon: shipIconSrc(slot.kind),
      active,
      progressDegrees: active ? Math.round((slot.progress ?? buildProgress(production)) * 360) : null,
      secondsLeft: active && slot.secondsLeft !== undefined ? Math.ceil(slot.secondsLeft) : null,
      cancel: { type: 'cancel-production', slot: slot.slot, kind: slot.kind },
    };
  });
}

/** The orders a hangar holds, by kind and in order: it changes when an order is placed, cancelled or launched. */
export function hangarSignature(production: ProductionViewModel | null, queue: readonly QueuedProductionViewModel[]): string {
  return [production?.kind ?? '-', ...queue.map((order) => order.kind)].join(',');
}

/** How long a cancel the server never applies (it refused it) keeps the queue locked. */
export const CANCEL_HOLD_MS = 2500;
/** Every cancel holds the queue at least this long, the span of a double click, even if the view already moved. */
export const DOUBLE_CLICK_MS = 500;

/**
 * One cancel in flight at a time. A cancel names a slot, and once the server applies it the orders behind move up a
 * slot: a second cancel sent before the view shows that would land on the order that took the slot (a double click
 * on [Interceptor, Interceptor, Interceptor] would cancel two ships). So the queue takes no other cancel until the
 * view shows different orders, or until the hold runs out if the server refused it.
 */
export function createHangarCancel(dispatch: (intent: CancelIntent) => void, now: () => number = Date.now, holdMs = CANCEL_HOLD_MS) {
  let pending: { signature: string; at: number } | null = null;
  const locked = (production: ProductionViewModel | null, queue: readonly QueuedProductionViewModel[]): boolean => {
    if (!pending) return false;
    const age = now() - pending.at;
    // A view that arrives between the two clicks of a double click must not hand the second one the next order.
    if (age < DOUBLE_CLICK_MS) return true;
    if (pending.signature !== hangarSignature(production, queue) || age >= holdMs) {
      pending = null;
      return false;
    }
    return true;
  };
  return {
    locked,
    /** Sends the cancel unless one is still waiting for the server; true when it was sent. */
    cancel(production: ProductionViewModel | null, queue: readonly QueuedProductionViewModel[], intent: CancelIntent): boolean {
      if (locked(production, queue)) return false;
      pending = { signature: hangarSignature(production, queue), at: now() };
      dispatch(intent);
      return true;
    },
  };
}
