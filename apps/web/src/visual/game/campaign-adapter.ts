import { FLEET_CAP } from '@impulso/sim';
import { decodeBattlefieldMask, type BattlefieldOwnSquad, type BattlefieldView } from '@impulso/state';
import { readStoredFormation, storeFormation } from './formation';
import { rememberView, type FogMemory } from './server-adapter';
import type { MultiplayerSession, MultiplayerSnapshot } from '../../multiplayer/session';
import type {
  CoreState, GameplayEvent, GameplayPresentationAdapter, GameplayViewModel, PresentationIntent, SquadOwner, SquadViewModel,
} from './model';

function canCommand(session: MultiplayerSnapshot): boolean {
  return session.connection === 'online' && session.phase?.phase === 'sector'
    && session.phase.pause === null && session.phase.resumeInMs === null && session.view?.winner === null;
}
function connection(session: MultiplayerSnapshot): GameplayViewModel['connection'] {
  if (session.connection === 'online') return 'online';
  return session.connection === 'connecting' || session.connection === 'reconnecting' ? 'connecting' : 'offline';
}
function phaseNotice(session: MultiplayerSnapshot): string | null {
  if (session.error) return session.error;
  if (session.connection === 'reconnecting') return 'Reconectando con la sala…';
  if (session.connection === 'connecting') return 'Conectando con la sala…';
  if (session.connection !== 'online') return 'Se perdió la conexión con la sala.';
  const phase = session.phase;
  if (!phase) return 'Sincronizando la partida…';
  if (phase.pause) return `Partida pausada: esperando la reconexión de ${phase.seats[phase.pause.by]?.name ?? 'un jugador'}.`;
  if (phase.resumeInMs !== null) return `La partida continúa en ${Math.ceil(phase.resumeInMs / 1000)} s…`;
  if (phase.phase === 'countdown') return `La partida comienza en ${Math.ceil((phase.remainingMs ?? 0) / 1000)} s…`;
  if (phase.phase === 'transition') return `Sector ${phase.sector} completado. Preparando el siguiente sector…`;
  if (phase.phase === 'results' || phase.phase === 'closed') {
    if (phase.result?.reason === 'annulled') return 'La partida fue anulada.';
    if (phase.result?.winner === null) return 'La partida terminó en empate.';
    if (phase.result?.reason === 'forfeit') return 'La partida terminó por abandono de un jugador.';
    return null;
  }
  return null;
}
function blank(session: MultiplayerSnapshot): GameplayViewModel {
  const phase = session.phase;
  const winner = phase?.phase === 'results' || phase?.phase === 'closed' ? phase.result?.winner : null;
  const result = winner === null || winner === undefined ? null : winner === phase?.playerId ? 'victory' : 'defeat';
  return {
    tick: 0, sector: session.phase?.sector ?? 1, elapsedSeconds: 0,
    selectedSquadId: null, selectedSquadIds: [], activeAction: null, moveOrder: null, formation: readStoredFormation(),
    resources: { metal: 0, metalRate: 0, energy: 0, energyRate: 0, fleet: 0, fleetCap: FLEET_CAP },
    squads: [], core: { state: 'locked', progress: 0, opensInSeconds: 0 },
    enemiesVisible: true, clockRunning: false, nodes: [], production: null, canProduce: false,
    result, notice: phaseNotice(session), connection: connection(session), visibleCells: null,
  };
}
function coreState(view: BattlefieldView): CoreState {
  if (!view.core.open) return 'locked';
  const own = view.core.progress[view.playerId];
  const rival = view.core.progress[view.playerId === 'p1' ? 'p2' : 'p1'];
  if (own > rival) return 'blue-capturing';
  if (rival > own) return 'red-capturing';
  return own > 0 ? 'contested' : 'available';
}

function eventsBetween(previous: BattlefieldView | null, next: BattlefieldView): GameplayEvent[] {
  if (!previous) return [{ kind: 'match-start' }];
  const events: GameplayEvent[] = [];
  const visible = decodeBattlefieldMask(next.visible);
  const own = next.playerId;
  const after = new Map(next.squads.filter((squad) => squad.hp > 0).map((squad) => [squad.id, squad]));
  for (const squad of previous.squads) {
    if (squad.hp <= 0 || after.has(squad.id)) continue;
    if (squad.ownerId === own || visible[squad.y * next.width + squad.x]) {
      events.push({ kind: 'ship-destroyed', own: squad.ownerId === own });
    }
  }
  if (next.squads.some((squad) => squad.ownerId === own && squad.hp > 0
    && squad.hp < (previous.squads.find((old) => old.id === squad.id)?.hp ?? squad.hp))) {
    events.push({ kind: 'under-attack' });
  }
  for (const node of next.nodes) {
    const old = previous.nodes.find((candidate) => candidate.id === node.id);
    if (!old || old.ownerId === node.ownerId || node.kind !== 'metal') continue;
    if (node.ownerId === own) events.push({ kind: 'node-captured', own: true });
    else if (old.ownerId === own) events.push({ kind: 'node-lost' });
  }
  for (const guardian of previous.guardians) {
    if (guardian.hp > 0 && visible[guardian.y * next.width + guardian.x]
      && !next.guardians.some((unit) => unit.id === guardian.id && unit.hp > 0)) events.push({ kind: 'guardian-down' });
  }
  if (!previous.core.open && next.core.open) events.push({ kind: 'core-open' });
  return events;
}

/** Projects the retained campaign session without opening or closing any room. */
export function createCampaignGameplayAdapter(session: MultiplayerSession): GameplayPresentationAdapter {
  let snapshot = blank(session.getSnapshot());
  let latest: BattlefieldView | null = null;
  const memory: FogMemory = { explored: null, nodes: new Map() };
  let lastSector = session.getSnapshot().phase?.sector;
  let localNotice: string | null = null;
  let destroyed = false;
  let lastUnderAttack = -Infinity;
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: GameplayEvent) => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const rebuild = () => {
    if (destroyed) return;
    const source = session.getSnapshot();
    const view = source.view;
    if (!view) { snapshot = blank(source); emit(); return; }
    const me = view.playerId;
    const ownerOf = (player: string): SquadOwner => player === me ? 'blue' : 'red';
    const ownIds = new Set(view.squads.filter((squad) => squad.ownerId === me && squad.hp > 0).map((squad) => squad.id));
    const changedSector = source.phase?.sector !== lastSector;
    if (changedSector) {
      lastSector = source.phase?.sector; localNotice = null;
      memory.explored = null; memory.nodes.clear();
    }
    const visible = decodeBattlefieldMask(view.visible);
    rememberView(memory, { ...view, visibleCells: visible.flatMap((seen, index) => seen
      ? [{ x: index % view.width, y: Math.floor(index / view.width) }] : []) });
    const selectedIds = changedSector ? [] : snapshot.selectedSquadIds.filter((id) => ownIds.has(id));
    const counts = new Map<string, number>();
    const squads: SquadViewModel[] = view.squads.filter((squad) => squad.hp > 0).map((squad) => {
      const own = squad.ownerId === me;
      const privateSquad = own ? squad as BattlefieldOwnSquad : null;
      const count = (counts.get(squad.ownerId) ?? 0) + 1;
      counts.set(squad.ownerId, count);
      return {
        id: squad.id, callSign: `INT-${count}`, owner: ownerOf(squad.ownerId), unitType: squad.kind,
        gridX: squad.x, gridY: squad.y, healthPercent: Math.round(squad.hp / squad.maxHp * 100),
        attackCooldown: squad.attackCooldown, lastShot: squad.lastShot,
        destination: privateSquad?.target ? { ...privateSquad.target } : null,
        attackTargetId: privateSquad?.attackTargetId ?? null, selected: selectedIds.includes(squad.id), visible: true,
        composition: { interceptors: 1, frigates: 0 },
        status: privateSquad?.attackTargetId ? 'attacking' : privateSquad?.target || privateSquad?.route?.length ? 'moving' : 'idle',
      };
    });
    for (const guardian of view.guardians.filter((unit) => unit.hp > 0)) {
      squads.push({
        id: guardian.id, callSign: guardian.objectiveId === view.core.id ? 'GUARDIÁN Ω' : 'GUARDIÁN', owner: 'neutral',
        unitType: guardian.objectiveId === view.core.id ? 'bomber' : 'frigate', gridX: guardian.x, gridY: guardian.y,
        healthPercent: Math.round(guardian.hp / guardian.maxHp * 100), selected: false, visible: true,
        composition: { interceptors: 0, frigates: 0 }, status: 'idle',
      });
    }
    const leader = view.squads.find((squad) => squad.id === selectedIds[0] && squad.ownerId === me) as BattlefieldOwnSquad | undefined;
    const route = leader?.route ?? [];
    const winner = source.phase?.phase === 'results' || source.phase?.phase === 'closed' ? source.phase.result?.winner : null;
    const result = winner === null || winner === undefined ? null : winner === me ? 'victory' : 'defeat';
    const previousResult = snapshot.result;
    snapshot = {
      ...snapshot, tick: view.tick, sector: source.phase?.sector ?? 1,
      tickRate: view.rules.tickRate,
      elapsedSeconds: Math.floor(view.tick / view.rules.tickRate),
      selectedSquadIds: selectedIds, selectedSquadId: selectedIds[0] ?? null,
      activeAction: canCommand(source) && !changedSector ? snapshot.activeAction : null,
      moveOrder: leader && route.length ? {
        squadId: leader.id, destination: { ...route.at(-1)! }, route: [{ x: leader.x, y: leader.y }, ...route],
      } : null,
      resources: { metal: view.players[me].metal ?? 0,
        metalRate: view.nodes.filter((node) => node.kind === 'metal' && node.ownerId === me).length + 0.5,
        energy: 0, energyRate: 0, fleet: ownIds.size, fleetCap: FLEET_CAP },
      squads, nodes: [...memory.nodes.values()].map((node) => ({ ...node })),
      core: { state: coreState(view),
        progress: Math.round(Math.max(view.core.progress.p1, view.core.progress.p2) / view.rules.coreCaptureTicks * 100),
        opensInSeconds: Math.max(0, Math.ceil((view.rules.coreOpenTick - view.tick) / view.rules.tickRate)) },
      visibleCells: visible, exploredCells: decodeBattlefieldMask(view.explored), connection: connection(source), clockRunning: canCommand(source),
      canProduce: false, production: null, notice: phaseNotice(source) ?? localNotice, result,
    };
    if (latest !== view) {
      for (const event of eventsBetween(changedSector ? null : latest, view)) {
        if (event.kind === 'under-attack') {
          if (performance.now() - lastUnderAttack < 10_000) continue;
          lastUnderAttack = performance.now();
        }
        eventListeners.forEach((listener) => listener(event));
      }
      latest = view;
    }
    if (result && result !== previousResult) eventListeners.forEach((listener) => listener({ kind: result }));
    emit();
  };
  const off = session.subscribe(rebuild);
  rebuild();
  const selected = () => snapshot.squads.filter((squad) => snapshot.selectedSquadIds.includes(squad.id)
    && squad.owner === 'blue' && squad.healthPercent > 0);
  const openCell = (x: number, y: number) => {
    const source = session.getSnapshot();
    if (!source.view) return null;
    let chosen: { x: number; y: number } | null = null;
    let distance = Infinity;
    for (let cy = Math.floor(y - 1.5); cy <= Math.ceil(y + 1.5); cy++) {
      for (let cx = Math.floor(x - 1.5); cx <= Math.ceil(x + 1.5); cx++) {
        if (cx < 0 || cy < 0 || cx >= source.view.width || cy >= source.view.height) continue;
        if (source.map && !source.map.walkable[cy * source.view.width + cx]) continue;
        const gap = Math.hypot(cx - x, cy - y);
        if (gap <= 1.5 && gap < distance) { chosen = { x: cx, y: cy }; distance = gap; }
      }
    }
    return chosen;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeEvents(listener) { eventListeners.add(listener); return () => eventListeners.delete(listener); },
    dispatch(intent: PresentationIntent) {
      if (destroyed) return;
      if (intent.type === 'select-squad' || intent.type === 'select-squads') {
        const ids = intent.type === 'select-squad' ? [intent.squadId] : intent.squadIds;
        const own = new Set(snapshot.squads.filter((squad) => squad.owner === 'blue').map((squad) => squad.id));
        const selectedIds = [...new Set(ids)].filter((id) => own.has(id));
        snapshot = { ...snapshot, selectedSquadIds: selectedIds, selectedSquadId: selectedIds[0] ?? null, activeAction: null };
        rebuild(); return;
      }
      if (intent.type === 'set-formation') {
        storeFormation(intent.formation);
        snapshot = { ...snapshot, formation: intent.formation };
        emit(); return;
      }
      if (intent.type === 'produce') { localNotice = 'La producción de naves aún no está disponible en multijugador.'; rebuild(); return; }
      if (!canCommand(session.getSnapshot())) return;
      if (intent.type === 'set-action') {
        if (intent.action === 'hold') {
          const ids = selected().map((squad) => squad.id);
          if (ids.length) session.command({ type: 'stop', squadIds: ids });
          snapshot = { ...snapshot, activeAction: null };
        } else snapshot = { ...snapshot, activeAction: intent.action };
        localNotice = null; rebuild(); return;
      }
      if (intent.type === 'move-selected' || intent.type === 'move-squad') {
        const destination = openCell(intent.x, intent.y);
        if (!destination) { localNotice = 'No se puede volar a ese punto.'; rebuild(); return; }
        const ids = selected().filter((squad) => intent.type === 'move-selected' || squad.id === intent.squadId).map((squad) => squad.id);
        if (ids.length) session.command(ids.length > 1
          ? { type: 'move_formation', squadIds: ids, ...destination, formation: snapshot.formation ?? readStoredFormation() }
          : { type: 'move_group', squadIds: ids, ...destination });
      } else if (intent.type === 'attack-selected' || intent.type === 'attack-squad') {
        const ids = selected().filter((squad) => intent.type === 'attack-selected' || squad.id === intent.squadId).map((squad) => squad.id);
        if (ids.length) session.command({ type: 'attack_group', squadIds: ids, targetId: intent.targetId });
      } else return;
      snapshot = { ...snapshot, activeAction: null };
      localNotice = null; rebuild();
    },
    destroy() {
      destroyed = true; off(); listeners.clear(); eventListeners.clear();
    },
  };
}
