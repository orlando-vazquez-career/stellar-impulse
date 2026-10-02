import { Client, type Room } from '@colyseus/sdk';
import type {
  BattlefieldOwnSquad,
  BattlefieldPublicSquad,
  BattlefieldView,
  PlayerView,
  VisibleSquad,
} from '@impulso/state';
import type { BattlefieldCommand } from '@impulso/input';
import type {
  CoreState,
  GameplayPresentationAdapter,
  GameplayViewModel,
  PresentationIntent,
  SquadViewModel,
} from './model';

interface MoveCommand { seq: number; type: 'move'; squadId: string; x: number; y: number }
interface AttackCommand { seq: number; type: 'attack'; squadId: string; targetId: string }
interface StopCommand { seq: number; type: 'stop'; squadId: string }
type TrainingCommand = MoveCommand | AttackCommand | StopCommand;
type BattlefieldSquad = BattlefieldPublicSquad | BattlefieldOwnSquad;
const PROTOCOL_VERSION = 2;

const DEFAULT_RULES = {
  tickRate: 10,
  moveEveryTicks: 3,
  attackEveryTicks: 10,
  visionRadius: 4,
  captureRadius: 1,
  nodeCaptureTicks: 30,
  coreOpenTick: 200,
  coreCaptureTicks: 80,
} as const;

function callSign(id: string): string {
  const suffix = id.split('-').at(-1) ?? id;
  return suffix.slice(0, 1).toUpperCase() + suffix.slice(1);
}

function statusOf(unit: VisibleSquad): SquadViewModel['status'] {
  if (unit.hp <= 0) return 'destroyed';
  if (unit.attackTargetId) return 'attacking';
  if (unit.target || unit.route?.length) return 'moving';
  if (unit.stance === 'guard') return 'holding';
  return 'idle';
}

function coreState(view: PlayerView): { state: CoreState; progress: number } {
  if (!view.core.open) return { state: 'locked', progress: 0 };
  const own = view.core.progress[view.playerId];
  const rival = view.core.progress[view.playerId === 'p1' ? 'p2' : 'p1'];
  if (own === 0 && rival === 0) return { state: 'available', progress: 0 };
  if (own === rival) return { state: 'contested', progress: Math.round(own / view.rules.coreCaptureTicks * 100) };
  return own > rival
    ? { state: 'blue-capturing', progress: Math.round(own / view.rules.coreCaptureTicks * 100) }
    : { state: 'red-capturing', progress: Math.round(rival / view.rules.coreCaptureTicks * 100) };
}

function mapSquad(view: PlayerView, unit: VisibleSquad, selectedIds: readonly string[]): SquadViewModel {
  const own = unit.ownerId === view.playerId;
  const composition = {
    interceptors: unit.kind === 'interceptor' ? 1 : 0,
    frigates: unit.kind === 'frigate' ? 1 : 0,
    bombers: unit.kind === 'bomber' ? 1 : 0,
    explorers: unit.kind === 'explorer' ? 1 : 0,
  };
  return {
    id: unit.id,
    callSign: callSign(unit.id),
    owner: own ? 'blue' : 'red',
    unitType: unit.kind,
    gridX: unit.x,
    gridY: unit.y,
    healthPercent: unit.maxHp > 0 ? Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100)) : 0,
    attackTargetId: own ? unit.attackTargetId : undefined,
    selected: own && selectedIds.includes(unit.id),
    visible: true,
    composition,
    status: statusOf(unit),
  };
}

export function mapTrainingView(view: PlayerView, previous: GameplayViewModel | null = null): GameplayViewModel {
  const ownIds = view.squads.filter((unit) => unit.ownerId === view.playerId && unit.hp > 0).map((unit) => unit.id);
  const selectedIds = (previous?.selectedSquadIds ?? []).filter((id) => ownIds.includes(id));
  const effectiveSelectedIds = selectedIds.length > 0 ? selectedIds : ownIds.slice(0, 1);
  const selectedId = effectiveSelectedIds[0] ?? null;
  const selectedUnit = view.squads.find((unit) => unit.id === selectedId);
  const order = selectedUnit?.target && selectedUnit.target.x !== undefined
    ? {
      squadId: selectedUnit.id,
      destination: { x: selectedUnit.target.x, y: selectedUnit.target.y },
      route: (selectedUnit.route ?? []).map((cell) => ({ x: cell.x, y: cell.y })),
    }
    : null;
  const core = coreState(view);
  const ownMetal = view.players[view.playerId].metal ?? 0;
  const visibleSquads = view.squads.map((unit) => mapSquad(view, unit, effectiveSelectedIds));
  return {
    tick: view.tick,
    sector: 1,
    elapsedSeconds: Math.floor(view.tick / (view.rules.tickRate || DEFAULT_RULES.tickRate)),
    selectedSquadId: selectedId,
    selectedSquadIds: effectiveSelectedIds,
    activeAction: previous?.activeAction ?? null,
    moveOrder: order,
    resources: {
      metal: ownMetal,
      metalRate: 0,
      energy: 0,
      energyRate: 0,
      fleet: ownIds.length,
      fleetCap: 1,
    },
    squads: visibleSquads,
    core: {
      state: core.state,
      progress: Math.max(0, Math.min(100, core.progress)),
      opensInSeconds: Math.max(0, Math.ceil((view.rules.coreOpenTick - view.tick) / (view.rules.tickRate || DEFAULT_RULES.tickRate))),
    },
    enemiesVisible: view.squads.some((unit) => unit.ownerId !== view.playerId),
    clockRunning: true,
    feedback: previous?.feedback ?? null,
  };
}

function ownSquadIds(view: PlayerView, selectedIds?: readonly string[]): string[] {
  const available = new Set(view.squads.filter((unit) => unit.ownerId === view.playerId && unit.hp > 0).map((unit) => unit.id));
  const requested = selectedIds?.length ? selectedIds : [...available];
  return requested.filter((id) => available.has(id));
}

export function trainingCommandsForIntent(
  intent: PresentationIntent,
  view: PlayerView,
  firstSequence: number,
  selectedIds?: readonly string[],
): TrainingCommand[] {
  const ids = ownSquadIds(view, selectedIds);
  if (intent.type === 'hold-selected') {
    return ids.map((squadId, index) => ({ seq: firstSequence + index, type: 'stop', squadId }));
  }
  if (intent.type === 'move-selected') {
    return ids.map((squadId, index) => ({ seq: firstSequence + index, type: 'move', squadId, x: Math.round(intent.x), y: Math.round(intent.y) }));
  }
  if (intent.type === 'attack-selected') {
    return ids.map((squadId, index) => ({ seq: firstSequence + index, type: 'attack', squadId, targetId: intent.targetId }));
  }
  if (intent.type === 'move-squad') {
    return ids.includes(intent.squadId) ? [{ seq: firstSequence, type: 'move', squadId: intent.squadId, x: Math.round(intent.x), y: Math.round(intent.y) }] : [];
  }
  if (intent.type === 'attack-squad') {
    return ids.includes(intent.squadId) ? [{ seq: firstSequence, type: 'attack', squadId: intent.squadId, targetId: intent.targetId }] : [];
  }
  return [];
}

function battlefieldStatusOf(unit: BattlefieldSquad): SquadViewModel['status'] {
  if (unit.hp <= 0) return 'destroyed';
  if ('attackTargetId' in unit && unit.attackTargetId) return 'attacking';
  if ('target' in unit && (unit.target || unit.route.length)) return 'moving';
  return 'idle';
}

function battlefieldCoreState(view: BattlefieldView): { state: CoreState; progress: number } {
  if (view.winner === view.playerId) return { state: 'blue-controlled', progress: 100 };
  if (view.winner && view.winner !== view.playerId) return { state: 'red-controlled', progress: 100 };
  if (!view.core.open) return { state: 'locked', progress: 0 };
  const rival = view.playerId === 'p1' ? 'p2' : 'p1';
  const own = view.core.progress[view.playerId];
  const enemy = view.core.progress[rival];
  if (own === 0 && enemy === 0) return { state: 'available', progress: 0 };
  if (own === enemy) return { state: 'contested', progress: Math.round(own / view.rules.coreCaptureTicks * 100) };
  return own > enemy
    ? { state: 'blue-capturing', progress: Math.round(own / view.rules.coreCaptureTicks * 100) }
    : { state: 'red-capturing', progress: Math.round(enemy / view.rules.coreCaptureTicks * 100) };
}

function mapBattlefieldSquad(view: BattlefieldView, unit: BattlefieldSquad, selectedIds: readonly string[]): SquadViewModel {
  const own = unit.ownerId === view.playerId;
  return {
    id: unit.id,
    callSign: callSign(unit.id),
    owner: own ? 'blue' : 'red',
    unitType: unit.kind,
    gridX: unit.x,
    gridY: unit.y,
    healthPercent: unit.maxHp > 0 ? Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100)) : 0,
    attackTargetId: own && 'attackTargetId' in unit ? unit.attackTargetId : undefined,
    selected: own && selectedIds.includes(unit.id),
    visible: true,
    composition: { interceptors: unit.kind === 'interceptor' ? 1 : 0, frigates: 0 },
    status: battlefieldStatusOf(unit),
  };
}

export function mapBattlefieldView(view: BattlefieldView, previous: GameplayViewModel | null = null): GameplayViewModel {
  const ownIds = view.squads.filter((unit) => unit.ownerId === view.playerId && unit.hp > 0).map((unit) => unit.id);
  const selectedIds = (previous?.selectedSquadIds ?? []).filter((id) => ownIds.includes(id));
  const effectiveSelectedIds = selectedIds.length ? selectedIds : ownIds.slice(0, 1);
  const selectedId = effectiveSelectedIds[0] ?? null;
  const selectedUnit = view.squads.find((unit) => unit.id === selectedId);
  const order = selectedUnit && 'target' in selectedUnit && selectedUnit.target
    ? { squadId: selectedUnit.id, destination: { ...selectedUnit.target }, route: selectedUnit.route.map((cell) => ({ ...cell })) }
    : null;
  const core = battlefieldCoreState(view);
  const tickRate = view.rules.tickRate || 10;
  return {
    tick: view.tick,
    sector: view.mapId === 'sector-01' ? 1 : 0,
    elapsedSeconds: Math.floor(view.tick / tickRate),
    selectedSquadId: selectedId,
    selectedSquadIds: effectiveSelectedIds,
    activeAction: previous?.activeAction ?? null,
    moveOrder: order,
    resources: {
      metal: view.players[view.playerId].metal ?? 0, metalRate: 0,
      energy: 0, energyRate: 0, fleet: ownIds.length, fleetCap: Math.max(ownIds.length, 1),
    },
    squads: view.squads.map((unit) => mapBattlefieldSquad(view, unit, effectiveSelectedIds)),
    core: {
      state: core.state,
      progress: Math.max(0, Math.min(100, core.progress)),
      opensInSeconds: Math.max(0, Math.ceil((view.rules.coreOpenTick - view.tick) / tickRate)),
    },
    enemiesVisible: view.squads.some((unit) => unit.ownerId !== view.playerId),
    clockRunning: view.winner === null,
    feedback: previous?.feedback ?? null,
  };
}

function battlefieldOwnIds(view: BattlefieldView, selectedIds?: readonly string[]): string[] {
  const available = new Set(view.squads.filter((unit) => unit.ownerId === view.playerId && unit.hp > 0).map((unit) => unit.id));
  return (selectedIds?.length ? selectedIds : [...available]).filter((id) => available.has(id));
}

export function battlefieldCommandsForIntent(
  intent: PresentationIntent,
  view: BattlefieldView,
  sequence: number,
  selectedIds?: readonly string[],
): BattlefieldCommand[] {
  const ids = battlefieldOwnIds(view, selectedIds);
  if (!ids.length) return [];
  if (intent.type === 'hold-selected') return [{ type: 'stop', seq: sequence, squadIds: ids }];
  if (intent.type === 'move-selected') return [{ type: 'move_group', seq: sequence, squadIds: ids, x: Math.round(intent.x), y: Math.round(intent.y) }];
  if (intent.type === 'attack-selected') return [{ type: 'attack_group', seq: sequence, squadIds: ids, targetId: intent.targetId }];
  if (intent.type === 'move-squad' && ids.includes(intent.squadId)) {
    return [{ type: 'move_group', seq: sequence, squadIds: [intent.squadId], x: Math.round(intent.x), y: Math.round(intent.y) }];
  }
  if (intent.type === 'attack-squad' && ids.includes(intent.squadId)) {
    return [{ type: 'attack_group', seq: sequence, squadIds: [intent.squadId], targetId: intent.targetId }];
  }
  return [];
}

function rejectionMessage(reason: string): string {
  const messages: Record<string, string> = {
    invalid_envelope: 'No puedo procesar esa orden.',
    unsupported_version: 'La versión del cliente no es compatible.',
    invalid_command: 'No puedo hacer eso.',
    rate_limit: 'No puedo hacer eso tan rápido.',
    blocked_destination: 'No puedo ir ahí.',
    blocked: 'No puedo ir ahí.',
    out_of_bounds: 'No puedo ir ahí.',
    unreachable_destination: 'No puedo llegar ahí.',
    unreachable: 'No puedo llegar ahí.',
    budget_exceeded: 'No puedo calcular esa ruta ahora.',
    target_not_visible: 'No puedo atacar un objetivo que no veo.',
    target_unavailable: 'Ese objetivo todavía no está disponible.',
    target_destroyed: 'Ese objetivo ya fue destruido.',
    friendly_target: 'No puedo atacar una nave aliada.',
    squad_destroyed: 'Esta nave ya no puede actuar.',
    unit_unavailable: 'Esta nave ya no puede actuar.',
    cannot_attack: 'Esta nave no puede atacar.',
    unknown_target: 'No puedo atacar ese objetivo.',
    stale_sequence: 'Esa orden ya fue procesada.',
    match_finished: 'La batalla ya terminó.',
  };
  return messages[reason] ?? 'No puedo hacer eso.';
}

function emptySnapshot(): GameplayViewModel {
  return {
    tick: 0, sector: 1, elapsedSeconds: 0,
    selectedSquadId: null, selectedSquadIds: [], activeAction: null, moveOrder: null,
    resources: { metal: 0, metalRate: 0, energy: 0, energyRate: 0, fleet: 0, fleetCap: 1 },
    squads: [], core: { state: 'locked', progress: 0, opensInSeconds: 20 },
    enemiesVisible: false, clockRunning: false, feedback: null,
  };
}

export interface NetworkGameplayAdapter extends GameplayPresentationAdapter {
  connect(): Promise<void>;
}

export function createNetworkGameplayAdapter(alias: string, serverUrl = 'http://127.0.0.1:2567'): NetworkGameplayAdapter {
  let snapshot = emptySnapshot();
  let room: Room | null = null;
  let latestView: BattlefieldView | null = null;
  let nextSequence = 1;
  let connectionAttempt = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const setFeedback = (feedback: string | null) => { snapshot = { ...snapshot, feedback }; emit(); };

  const sendIntent = (intent: PresentationIntent) => {
    if (!room || !latestView) {
      setFeedback('No hay conexión con el servidor.');
      return;
    }
    const commands = battlefieldCommandsForIntent(intent, latestView, nextSequence, snapshot.selectedSquadIds);
    nextSequence += commands.length;
    for (const command of commands) room.send('command', { protocolVersion: PROTOCOL_VERSION, body: command });
    if (commands.length) snapshot = { ...snapshot, activeAction: null, feedback: null };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async connect() {
      if (room) return;
      const attempt = ++connectionAttempt;
      disposed = false;
      try {
        const client = new Client(serverUrl);
        const joinedRoom = await client.joinOrCreate('battlefield', { protocolVersion: PROTOCOL_VERSION, name: alias });
        if (disposed || attempt !== connectionAttempt) {
          void joinedRoom.leave();
          return;
        }
        room = joinedRoom;
        room.onMessage('map', () => undefined);
        room.onMessage('view', (view: BattlefieldView) => {
          if (disposed) return;
          latestView = view;
          nextSequence = Math.max(nextSequence, (view.players[view.playerId].lastSequence ?? 0) + 1);
          snapshot = mapBattlefieldView(view, snapshot);
          emit();
        });
        room.onMessage('rejected', (message: { reason?: string; message?: string }) => {
          if (disposed) return;
          setFeedback(message.message ?? rejectionMessage(message.reason ?? 'unknown'));
        });
        room.onMessage('ack', () => { if (!disposed) setFeedback(null); });
        room.send('ready');
      } catch {
        if (!disposed && attempt === connectionAttempt) setFeedback('No se pudo conectar con el servidor autorizado.');
      }
    },
    dispatch(intent) {
      if (intent.type === 'select-squad' || intent.type === 'select-squads') {
        const requested = intent.type === 'select-squad' ? [intent.squadId] : intent.squadIds;
        const ids = [...new Set(requested)].filter((id) => snapshot.squads.some((unit) => unit.id === id && unit.owner === 'blue' && unit.healthPercent > 0));
        if (intent.type === 'select-squad' && ids.length === 0) return;
        snapshot = { ...snapshot, selectedSquadId: ids[0] ?? null, selectedSquadIds: ids,
          activeAction: null, moveOrder: null,
          squads: snapshot.squads.map((unit) => ({ ...unit, selected: ids.includes(unit.id) })) };
        emit();
        return;
      }
      if (intent.type === 'set-action') {
        snapshot = { ...snapshot, activeAction: intent.action, feedback: null };
        emit();
        return;
      }
      if (intent.type === 'set-enemy-visibility' || intent.type === 'set-selected-health'
        || intent.type === 'set-resource' || intent.type === 'set-core-state'
        || intent.type === 'set-core-progress' || intent.type === 'set-clock-running') return;
      sendIntent(intent);
    },
    destroy() {
      disposed = true;
      connectionAttempt += 1;
      const currentRoom = room;
      room = null;
      if (currentRoom) void currentRoom.leave();
      listeners.clear();
    },
  };
}
