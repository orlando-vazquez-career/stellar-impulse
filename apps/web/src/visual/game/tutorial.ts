import type { GameplayViewModel } from './model';

export const TUTORIAL_SEEN_KEY = 'impulso.first-match-tutorial.v1';
export const TUTORIAL_STEPS = ['select', 'move', 'produce', 'capture', 'refinery'] as const;
export type TutorialStep = typeof TUTORIAL_STEPS[number];

export function tutorialWasSeen(): boolean {
  try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === 'seen'; }
  catch { return false; }
}

export function markTutorialSeen(): void {
  try { localStorage.setItem(TUTORIAL_SEEN_KEY, 'seen'); }
  catch { /* Practice remains playable when browser storage is unavailable. */ }
}

/** Observe confirmed presentation state; button presses alone never complete a task. */
export function createTutorialObserver(initial: GameplayViewModel) {
  const completed = new Set<TutorialStep>();
  const initialShips = new Set(initial.squads.filter(s => s.owner === 'blue').map(s => s.id));
  const moves = new Map<string, { x: number; y: number }>();
  let previous = initial;
  let producing = initial.production !== null;
  let index = 0;
  return {
    skip() { index = Math.min(TUTORIAL_STEPS.length, index + 1); return index; },
    observe(view: GameplayViewModel) {
      const own = view.squads.filter(s => s.owner === 'blue' && s.healthPercent > 0);
      if (own.some(s => view.selectedSquadIds.includes(s.id))) completed.add('select');
      // A pending route is optimistic. Wait until the selected ship actually moves.
      const order = view.moveOrder;
      if (order && !moves.has(order.squadId)) {
        const ship = own.find(s => s.id === order.squadId);
        if (ship) moves.set(ship.id, { x: ship.gridX, y: ship.gridY });
      }
      if (own.some(s => {
        const from = moves.get(s.id);
        return from && Math.hypot(s.gridX - from.x, s.gridY - from.y) > 0.25;
      })) completed.add('move');
      if (view.production) producing = true;
      if (producing && own.some(s => !s.isDecoy && !initialShips.has(s.id))) completed.add('produce');
      if (view.nodes.some(node => node.kind === 'metal' && node.owner === 'blue' && !node.stale
        && previous.nodes.some(old => old.id === node.id && old.owner !== 'blue'))) completed.add('capture');
      if ((initial.base?.modules?.refinery ?? 0) === 0 && (view.base?.modules?.refinery ?? 0) > 0) completed.add('refinery');
      previous = view;
      // One instruction at a time, remembering actions performed early.
      while (index < TUTORIAL_STEPS.length && completed.has(TUTORIAL_STEPS[index]!)) index++;
      return index;
    },
  };
}
