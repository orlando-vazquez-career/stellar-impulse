import { describe, expect, it } from 'vitest';
import { CANCEL_HOLD_MS, createHangarCancel, hangarQueueView, hangarSignature } from './hangar-queue';
import type { PresentationIntent, ProductionViewModel, QueuedProductionViewModel } from './model';

const names = { explorer: 'Explorador', interceptor: 'Interceptor', frigate: 'Fragata', bomber: 'Bombardero' };
const building: ProductionViewModel = { kind: 'interceptor', remainingSeconds: 3, totalSeconds: 4, progress: 0.25, refund: 6 };
const waiting: QueuedProductionViewModel[] = [{ kind: 'interceptor', refund: 6 }, { kind: 'interceptor', refund: 6 }];

describe('hangar queue slots', () => {
  it('labels every order with its ship and refund and shows progress only on the ship in production', () => {
    const slots = hangarQueueView(building, waiting, 'es', names);
    expect(slots.map((slot) => slot.label)).toEqual([
      'Cancelar Interceptor (reembolso +6 Metal)',
      'Cancelar Interceptor (reembolso +6 Metal)',
      'Cancelar Interceptor (reembolso +6 Metal)',
    ]);
    expect(slots[0]).toMatchObject({
      active: true, progressDegrees: 90, secondsLeft: 3, icon: '/assets/game/ships/ax7-blue.png',
      cancel: { type: 'cancel-production', slot: 0, kind: 'interceptor' },
    });
    expect(slots[1]).toMatchObject({ active: false, progressDegrees: null, secondsLeft: null, cancel: { type: 'cancel-production', slot: 1, kind: 'interceptor' } });
    expect(slots[2]!.cancel).toEqual({ type: 'cancel-production', slot: 2, kind: 'interceptor' });
    expect(new Set(slots.map((slot) => slot.key)).size).toBe(3);
  });

  it('reads the build progress from the remaining time when the view does not carry it', () => {
    const [first] = hangarQueueView({ kind: 'frigate', remainingSeconds: 3, totalSeconds: 6, refund: 9 }, [], 'en', names);
    expect(first).toMatchObject({ label: 'Cancel Fragata (refund +9 Metal)', progressDegrees: 180, secondsLeft: 3, icon: '/assets/game/ships/frigate-blue.png' });
    expect(hangarQueueView({ kind: 'bomber', remainingSeconds: 8 }, [], 'es', names)[0]).toMatchObject({ progressDegrees: 0, label: 'Cancelar Bombardero (reembolso +0 Metal)' });
    expect(hangarQueueView(null, [], 'es', names)).toEqual([]);
  });
});

describe('hangar cancels', () => {
  const clockAt = (start = 0) => { const clock = { now: start }; return clock; };

  it('sends one cancel while the queue looks the same: a double click never cancels the order that moved up', () => {
    const sent: PresentationIntent[] = [];
    const clock = clockAt();
    const cancels = createHangarCancel((intent) => sent.push(intent), () => clock.now);
    const [first] = hangarQueueView(building, waiting, 'es', names);
    expect(cancels.locked(building, waiting)).toBe(false);
    expect(cancels.cancel(building, waiting, first!.cancel)).toBe(true);
    clock.now += 120;
    expect(cancels.cancel(building, waiting, first!.cancel)).toBe(false);
    // A newer view of the same orders (the server has not applied the cancel yet) keeps the queue locked.
    const sameOrders = waiting.map((order) => ({ ...order }));
    expect(cancels.locked({ ...building, remainingSeconds: 2, progress: 0.5 }, sameOrders)).toBe(true);
    expect(cancels.cancel({ ...building, remainingSeconds: 2 }, sameOrders, { type: 'cancel-production', slot: 1, kind: 'interceptor' })).toBe(false);
    expect(sent).toEqual([{ type: 'cancel-production', slot: 0, kind: 'interceptor' }]);
  });

  it('takes a cancel again once the server view shows the queue changed', () => {
    const sent: PresentationIntent[] = [];
    const clock = clockAt();
    const cancels = createHangarCancel((intent) => sent.push(intent), () => clock.now);
    cancels.cancel(building, waiting, { type: 'cancel-production', slot: 0, kind: 'interceptor' });
    // The cancel landed: the next order is in production and one waits behind it.
    const promoted: ProductionViewModel = { kind: 'interceptor', remainingSeconds: 4, totalSeconds: 4, progress: 0, refund: 6 };
    const rest = [{ kind: 'interceptor' as const, refund: 6 }];
    clock.now += 600;
    expect(cancels.locked(promoted, rest)).toBe(false);
    expect(cancels.cancel(promoted, rest, { type: 'cancel-production', slot: 1, kind: 'interceptor' })).toBe(true);
    expect(sent).toHaveLength(2);
    // A new order that brings the queue back to the same look is a new queue, not the old cancel still pending.
    clock.now += 600;
    expect(cancels.locked(promoted, [])).toBe(false);
    expect(cancels.locked(promoted, rest)).toBe(false);
  });

  it('ignores the second click of a double click even when the view moves the queue up between the clicks', () => {
    const sent: PresentationIntent[] = [];
    const clock = clockAt();
    const cancels = createHangarCancel((intent) => sent.push(intent), () => clock.now);
    cancels.cancel(building, waiting, { type: 'cancel-production', slot: 1, kind: 'interceptor' });
    // The server applied it before the second click: the order behind moved up into slot 1.
    const movedUp = waiting.slice(1);
    clock.now += 80;
    expect(cancels.cancel(building, movedUp, { type: 'cancel-production', slot: 1, kind: 'interceptor' })).toBe(false);
    clock.now += 500;
    expect(cancels.cancel(building, movedUp, { type: 'cancel-production', slot: 1, kind: 'interceptor' })).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('frees the queue after a hold when the server refuses the cancel and the queue never changes', () => {
    const sent: PresentationIntent[] = [];
    const clock = clockAt(1_000);
    const cancels = createHangarCancel((intent) => sent.push(intent), () => clock.now);
    cancels.cancel(building, waiting, { type: 'cancel-production', slot: 2, kind: 'interceptor' });
    clock.now += CANCEL_HOLD_MS - 1;
    expect(cancels.locked(building, waiting)).toBe(true);
    clock.now += 1;
    expect(cancels.locked(building, waiting)).toBe(false);
    expect(cancels.cancel(building, waiting, { type: 'cancel-production', slot: 2, kind: 'interceptor' })).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('tells queues apart by their orders, not by the build clock', () => {
    expect(hangarSignature(building, waiting)).toBe(hangarSignature({ ...building, remainingSeconds: 1, progress: 0.9 }, waiting.map((order) => ({ ...order }))));
    expect(hangarSignature(building, waiting)).not.toBe(hangarSignature(building, waiting.slice(1)));
    expect(hangarSignature(building, [])).not.toBe(hangarSignature(null, [{ kind: 'interceptor', refund: 6 }]));
    expect(hangarSignature(building, [{ kind: 'frigate', refund: 9 }])).not.toBe(hangarSignature(building, [{ kind: 'bomber', refund: 12 }]));
  });
});
