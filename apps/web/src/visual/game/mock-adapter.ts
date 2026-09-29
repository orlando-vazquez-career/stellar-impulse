import type {
  GameplayPresentationAdapter,
  GameplayViewModel,
  PresentationIntent,
} from './model';
import { buildRoute } from './phaser/grid';

const initialSnapshot: GameplayViewModel = {
  tick: 0,
  sector: 1,
  elapsedSeconds: 268,
  selectedSquadId: 'blue-alpha',
  activeAction: null,
  moveOrder: null,
  resources: {
    metal: 240,
    metalRate: 12,
    energy: 180,
    energyRate: 8,
    fleet: 12,
    fleetCap: 20,
  },
  core: { state: 'locked', progress: 34, opensInSeconds: 88 },
  enemiesVisible: true,
  clockRunning: false,
  squads: [
    {
      id: 'blue-alpha', callSign: 'Alpha', owner: 'blue', unitType: 'interceptor',
      gridX: 32, gridY: 35, healthPercent: 82, selected: true, visible: true,
      composition: { interceptors: 3, frigates: 2 }, status: 'idle',
    },
    {
      id: 'blue-beta', callSign: 'Beta', owner: 'blue', unitType: 'frigate',
      gridX: 33, gridY: 37, healthPercent: 100, selected: false, visible: true,
      composition: { interceptors: 1, frigates: 3 }, status: 'holding',
    },
    {
      id: 'red-sigma', callSign: 'Sigma', owner: 'red', unitType: 'frigate',
      gridX: 41, gridY: 34, healthPercent: 68, selected: false, visible: true,
      composition: { interceptors: 2, frigates: 2 }, status: 'holding',
    },
  ],
};

function cloneSnapshot(snapshot: GameplayViewModel): GameplayViewModel {
  return {
    ...snapshot,
    resources: { ...snapshot.resources },
    core: { ...snapshot.core },
    moveOrder: snapshot.moveOrder && {
      ...snapshot.moveOrder,
      destination: { ...snapshot.moveOrder.destination },
      route: snapshot.moveOrder.route.map((cell) => ({ ...cell })),
    },
    squads: snapshot.squads.map((squad) => ({
      ...squad,
      composition: { ...squad.composition },
    })),
  };
}

export function createMockGameplayAdapter(): GameplayPresentationAdapter {
  let snapshot = cloneSnapshot(initialSnapshot);
  let clock: ReturnType<typeof setInterval> | null = null;
  let movement: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());
  const stopClock = () => {
    if (clock) clearInterval(clock);
    clock = null;
  };
  const stopMovement = () => {
    if (movement) clearInterval(movement);
    movement = null;
  };
  const startMovement = () => {
    stopMovement();
    movement = setInterval(() => {
      const order = snapshot.moveOrder;
      if (!order || order.route.length < 2) { stopMovement(); return; }
      const next = order.route[1];
      if (!next) { stopMovement(); return; }
      const remaining = order.route.slice(1);
      const arrived = remaining.length === 1;
      snapshot = {
        ...snapshot,
        moveOrder: arrived ? null : { ...order, route: remaining },
        squads: snapshot.squads.map((squad) => squad.id === order.squadId
          ? { ...squad, gridX: next.x, gridY: next.y, status: arrived ? 'idle' : 'moving' }
          : squad),
      };
      if (arrived) stopMovement();
      emit();
    }, 240);
  };
  const startClock = () => {
    if (clock) return;
    clock = setInterval(() => {
      snapshot = {
        ...snapshot,
        tick: snapshot.tick + 10,
        elapsedSeconds: snapshot.elapsedSeconds + 1,
        core: {
          ...snapshot.core,
          opensInSeconds: Math.max(0, snapshot.core.opensInSeconds - 1),
        },
      };
      emit();
    }, 1000);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(intent: PresentationIntent) {
      if (intent.type === 'select-squad') {
        snapshot = {
          ...snapshot,
          selectedSquadId: intent.squadId,
          squads: snapshot.squads.map((squad) => ({
            ...squad,
            selected: squad.id === intent.squadId,
          })),
        };
      } else if (intent.type === 'set-action') {
        snapshot = { ...snapshot, activeAction: intent.action };
      } else if (intent.type === 'move-squad') {
        const squad = snapshot.squads.find((candidate) => candidate.id === intent.squadId && candidate.owner === 'blue');
        const blocked = snapshot.squads.filter((candidate) => candidate.visible && candidate.id !== squad?.id)
          .map((candidate) => ({ x: candidate.gridX, y: candidate.gridY }));
        const route = squad ? buildRoute({ x: squad.gridX, y: squad.gridY }, { x: intent.x, y: intent.y }, blocked) : [];
        if (!squad || route.length < 2 || snapshot.activeAction !== 'move') return;
        snapshot = {
          ...snapshot,
          activeAction: null,
          moveOrder: { squadId: squad.id, destination: { x: intent.x, y: intent.y }, route },
          squads: snapshot.squads.map((candidate) => candidate.id === squad.id ? { ...candidate, status: 'moving' } : candidate),
        };
        startMovement();
      } else if (intent.type === 'set-core-state') {
        snapshot = { ...snapshot, core: { ...snapshot.core, state: intent.state } };
      } else if (intent.type === 'set-core-progress') {
        snapshot = {
          ...snapshot,
          core: { ...snapshot.core, progress: Math.max(0, Math.min(100, intent.progress)) },
        };
      } else if (intent.type === 'set-selected-health') {
        snapshot = {
          ...snapshot,
          squads: snapshot.squads.map((squad) => squad.id === snapshot.selectedSquadId
            ? { ...squad, healthPercent: Math.max(0, Math.min(100, intent.healthPercent)) }
            : squad),
        };
      } else if (intent.type === 'set-resource') {
        snapshot = {
          ...snapshot,
          resources: { ...snapshot.resources, [intent.resource]: Math.max(0, intent.value) },
        };
      } else if (intent.type === 'set-enemy-visibility') {
        snapshot = {
          ...snapshot,
          enemiesVisible: intent.visible,
          squads: snapshot.squads.map((squad) => squad.owner === 'red'
            ? { ...squad, visible: intent.visible }
            : squad),
        };
      } else if (intent.type === 'set-clock-running') {
        snapshot = { ...snapshot, clockRunning: intent.running };
        if (intent.running) startClock(); else stopClock();
      }
      emit();
    },
    destroy() {
      stopClock();
      stopMovement();
      listeners.clear();
    },
  };
}
