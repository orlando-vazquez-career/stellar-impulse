import type {
  GameplayPresentationAdapter,
  GameplayViewModel,
  MoveOrder,
  PresentationIntent,
} from './model';
import { UNIT_STATS, damageAgainst } from '@impulso/state';
import { planSectorMove, sectorSurface } from '../map/sector-map';
import { advanceFreeMove } from './phaser/free-movement';

const MOVE_SPEED = 4; // Interceptor speed in grid units per second for the visual prototype.
const MOVE_STEP_MS = 50;

const initialSnapshot: GameplayViewModel = {
  tick: 0,
  sector: 1,
  elapsedSeconds: 268,
  selectedSquadId: 'blue-alpha',
  selectedSquadIds: ['blue-alpha'],
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
      gridX: 12, gridY: 13, healthPercent: 82, selected: true, visible: true,
      composition: { interceptors: 1, frigates: 0 }, status: 'idle',
    },
    {
      id: 'blue-beta', callSign: 'Beta', owner: 'blue', unitType: 'frigate',
      gridX: 13, gridY: 15, healthPercent: 100, selected: false, visible: true,
      composition: { interceptors: 0, frigates: 1 }, status: 'holding',
    },
    {
      id: 'blue-gamma', callSign: 'Gamma', owner: 'blue', unitType: 'bomber',
      gridX: 12, gridY: 15, healthPercent: 100, selected: false, visible: true,
      composition: { interceptors: 0, frigates: 0, bombers: 1 }, status: 'idle',
    },
    {
      id: 'red-sigma', callSign: 'Sigma', owner: 'red', unitType: 'frigate',
      gridX: 17, gridY: 14, healthPercent: 68, selected: false, visible: true,
      composition: { interceptors: 0, frigates: 1 }, status: 'holding',
    },
  ],
};

function cloneSnapshot(snapshot: GameplayViewModel): GameplayViewModel {
  return {
    ...snapshot,
    selectedSquadIds: [...snapshot.selectedSquadIds],
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
  const orders = new Map<string, MoveOrder>();
  const movements = new Map<string, ReturnType<typeof setInterval>>();
  const attacks = new Map<string, ReturnType<typeof setInterval>>();
  const replyReadyAt = new Map<string, number>();
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());
  const stopClock = () => {
    if (clock) clearInterval(clock);
    clock = null;
  };
  const stopMovement = (squadId: string) => {
    const movement = movements.get(squadId);
    if (movement) clearInterval(movement);
    movements.delete(squadId);
  };
  const stopAttack = (squadId: string) => {
    const attack = attacks.get(squadId);
    if (attack) clearInterval(attack);
    attacks.delete(squadId);
  };
  const startAttack = (squadId: string) => {
    stopAttack(squadId);
    let inRangeMs = 0;
    let lastUpdate = Date.now();
    const attack = setInterval(() => {
      const now = Date.now();
      const elapsedMs = Math.max(0, now - lastUpdate);
      lastUpdate = now;
      const attacker = snapshot.squads.find((squad) => squad.id === squadId);
      const target = snapshot.squads.find((squad) => squad.id === attacker?.attackTargetId);
      if (!attacker || !target || !attacker.visible || !target.visible || attacker.healthPercent <= 0 || target.healthPercent <= 0) {
        stopAttack(squadId);
        snapshot = { ...snapshot, squads: snapshot.squads.map((squad) => squad.id === squadId
          ? { ...squad, attackTargetId: null, status: squad.healthPercent > 0 ? 'idle' : 'destroyed' } : squad) };
        emit();
        return;
      }
      const range = Math.hypot(target.gridX - attacker.gridX, target.gridY - attacker.gridY);
      if (range > 1.5) {
        inRangeMs = 0;
        const route = planSectorMove({ x: attacker.gridX, y: attacker.gridY }, { x: target.gridX, y: target.gridY });
        if (route.length < 2) { stopAttack(squadId); return; }
        const speed = MOVE_SPEED / UNIT_STATS[attacker.unitType].moveIntervalFactor;
        const next = advanceFreeMove(route, speed * elapsedMs / 1000)[0]!;
        snapshot = { ...snapshot, squads: snapshot.squads.map((squad) => squad.id === squadId
          ? { ...squad, gridX: next.x, gridY: next.y, status: 'attacking' } : squad) };
        emit();
        return;
      }
      inRangeMs += elapsedMs;
      if (inRangeMs < 500) return;
      inRangeMs %= 500;
      const hit = damageAgainst(attacker.unitType, target.unitType);
      const reply = now >= (replyReadyAt.get(target.id) ?? 0)
        ? damageAgainst(target.unitType, attacker.unitType) : 0;
      if (reply) replyReadyAt.set(target.id, now + 500);
      const targetHealth = Math.max(0, Math.round((target.healthPercent - hit / UNIT_STATS[target.unitType].maxHp * 100) * 10) / 10);
      const attackerHealth = Math.max(0, Math.round((attacker.healthPercent - reply / UNIT_STATS[attacker.unitType].maxHp * 100) * 10) / 10);
      snapshot = { ...snapshot, squads: snapshot.squads.map((squad) => {
        if (squad.id === target.id) return { ...squad, healthPercent: targetHealth, visible: targetHealth > 0, status: targetHealth > 0 ? 'attacking' : 'destroyed' };
        if (squad.id === attacker.id) return { ...squad, healthPercent: attackerHealth, visible: attackerHealth > 0, status: attackerHealth > 0 ? 'attacking' : 'destroyed' };
        return squad;
      }) };
      emit();
    }, MOVE_STEP_MS);
    attacks.set(squadId, attack);
  };
  const startMovement = (squadId: string) => {
    stopMovement(squadId);
    let lastUpdate = Date.now();
    const movement = setInterval(() => {
      const now = Date.now();
      const elapsedMs = Math.max(0, now - lastUpdate);
      lastUpdate = now;
      const order = orders.get(squadId);
      if (!order || order.route.length < 2) { stopMovement(squadId); return; }
      const movingSquad = snapshot.squads.find((squad) => squad.id === squadId);
      if (!movingSquad) { stopMovement(squadId); return; }
      const speed = MOVE_SPEED / UNIT_STATS[movingSquad.unitType].moveIntervalFactor;
      const remaining = advanceFreeMove(order.route, speed * elapsedMs / 1000);
      const next = remaining[0]!;
      const arrived = remaining.length === 1;
      const updatedOrder = arrived ? null : { ...order, route: remaining };
      if (updatedOrder) orders.set(squadId, updatedOrder);
      else orders.delete(squadId);
      snapshot = {
        ...snapshot,
        moveOrder: snapshot.selectedSquadId === squadId ? updatedOrder : snapshot.moveOrder,
        squads: snapshot.squads.map((squad) => squad.id === order.squadId
          ? { ...squad, gridX: next.x, gridY: next.y, status: arrived ? 'idle' : 'moving' }
          : squad),
      };
      if (arrived) stopMovement(squadId);
      emit();
    }, MOVE_STEP_MS);
    movements.set(squadId, movement);
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
  const selectedAllies = () => snapshot.squads.filter((squad) => snapshot.selectedSquadIds.includes(squad.id)
    && squad.owner === 'blue' && squad.visible && squad.healthPercent > 0);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(intent: PresentationIntent) {
      if (intent.type === 'select-squad' || intent.type === 'select-squads') {
        const requested = intent.type === 'select-squad' ? [intent.squadId] : intent.squadIds;
        const ids = [...new Set(requested)].filter((id) => snapshot.squads.some((squad) =>
          squad.id === id && squad.owner === 'blue' && squad.visible && squad.healthPercent > 0));
        if (intent.type === 'select-squad' && !ids.length) return;
        snapshot = {
          ...snapshot,
          selectedSquadId: ids[0] ?? null,
          selectedSquadIds: ids,
          activeAction: null,
          moveOrder: ids[0] ? orders.get(ids[0]) ?? null : null,
          squads: snapshot.squads.map((squad) => ({
            ...squad,
            selected: ids.includes(squad.id),
          })),
        };
      } else if (intent.type === 'set-action') {
        snapshot = { ...snapshot, activeAction: intent.action };
      } else if (intent.type === 'move-squad') {
        if (snapshot.activeAction !== null && snapshot.activeAction !== 'move') return;
        const squad = snapshot.squads.find((candidate) => candidate.id === intent.squadId
          && candidate.id === snapshot.selectedSquadId && candidate.owner === 'blue' && candidate.visible && candidate.healthPercent > 0);
        const route = squad ? planSectorMove({ x: squad.gridX, y: squad.gridY }, { x: intent.x, y: intent.y }) : [];
        if (!squad || route.length < 2) return;
        stopAttack(squad.id);
        const order: MoveOrder = { squadId: squad.id, destination: { x: intent.x, y: intent.y }, route };
        orders.set(squad.id, order);
        snapshot = {
          ...snapshot,
          activeAction: null,
          moveOrder: order,
          squads: snapshot.squads.map((candidate) => candidate.id === squad.id ? { ...candidate, attackTargetId: null, status: 'moving' } : candidate),
        };
        startMovement(squad.id);
      } else if (intent.type === 'move-selected') {
        if (snapshot.activeAction !== null && snapshot.activeAction !== 'move') return;
        const selected = selectedAllies();
        if (!selected.length || !Number.isFinite(intent.x) || !Number.isFinite(intent.y)
          || !sectorSurface.walkable[Math.round(intent.y) * sectorSurface.width + Math.round(intent.x)]) return;
        const center = selected.reduce((sum, squad) => ({ x: sum.x + squad.gridX / selected.length, y: sum.y + squad.gridY / selected.length }), { x: 0, y: 0 });
        const newOrders: MoveOrder[] = [];
        for (const squad of selected) {
          const desired = { x: intent.x + squad.gridX - center.x, y: intent.y + squad.gridY - center.y };
          let route = planSectorMove({ x: squad.gridX, y: squad.gridY }, desired);
          let destination = desired;
          if (route.length < 2) {
            destination = { x: intent.x, y: intent.y };
            route = planSectorMove({ x: squad.gridX, y: squad.gridY }, destination);
          }
          if (route.length < 2) continue;
          stopAttack(squad.id);
          const order: MoveOrder = { squadId: squad.id, destination, route };
          orders.set(squad.id, order);
          newOrders.push(order);
          startMovement(squad.id);
        }
        if (!newOrders.length) return;
        const moved = new Set(newOrders.map((order) => order.squadId));
        snapshot = { ...snapshot, activeAction: null,
          moveOrder: newOrders.find((order) => order.squadId === snapshot.selectedSquadId) ?? newOrders[0]!,
          squads: snapshot.squads.map((squad) => moved.has(squad.id)
            ? { ...squad, attackTargetId: null, status: 'moving' } : squad) };
      } else if (intent.type === 'attack-squad') {
        if (snapshot.activeAction !== null && snapshot.activeAction !== 'attack') return;
        const squad = snapshot.squads.find((candidate) => candidate.id === intent.squadId
          && candidate.id === snapshot.selectedSquadId && candidate.owner === 'blue' && candidate.visible && candidate.healthPercent > 0);
        const target = snapshot.squads.find((candidate) => candidate.id === intent.targetId
          && candidate.owner === 'red' && candidate.visible && candidate.healthPercent > 0);
        if (!squad || !target || UNIT_STATS[squad.unitType].damage <= 0) return;
        if (!planSectorMove({ x: squad.gridX, y: squad.gridY }, { x: target.gridX, y: target.gridY }).length) return;
        stopMovement(squad.id);
        orders.delete(squad.id);
        snapshot = { ...snapshot, activeAction: null, moveOrder: null,
          squads: snapshot.squads.map((candidate) => candidate.id === squad.id
            ? { ...candidate, attackTargetId: target.id, status: 'attacking' } : candidate) };
        startAttack(squad.id);
      } else if (intent.type === 'attack-selected') {
        if (snapshot.activeAction !== null && snapshot.activeAction !== 'attack') return;
        const target = snapshot.squads.find((squad) => squad.id === intent.targetId
          && squad.owner === 'red' && squad.visible && squad.healthPercent > 0);
        if (!target) return;
        const attackers = selectedAllies().filter((squad) => UNIT_STATS[squad.unitType].damage > 0
          && planSectorMove({ x: squad.gridX, y: squad.gridY }, { x: target.gridX, y: target.gridY }).length > 0);
        if (!attackers.length) return;
        const ids = new Set(attackers.map((squad) => squad.id));
        for (const squad of attackers) { stopMovement(squad.id); orders.delete(squad.id); }
        snapshot = { ...snapshot, activeAction: null, moveOrder: null,
          squads: snapshot.squads.map((squad) => ids.has(squad.id)
            ? { ...squad, attackTargetId: target.id, status: 'attacking' } : squad) };
        for (const squad of attackers) startAttack(squad.id);
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
      for (const squadId of movements.keys()) stopMovement(squadId);
      for (const squadId of attacks.keys()) stopAttack(squadId);
      orders.clear();
      listeners.clear();
    },
  };
}
