import type { DurationMode } from '@impulso/sim';
import { Client, type Room } from '@colyseus/sdk';
import { FLEET_CAP, BASE_DEFENSE_RANGE } from '@impulso/sim';
import { type PlayerView, type UnitKind } from '@impulso/state';
import { sectorSurface, type TrainingMapId } from '../map/sector-map';
import type {
  CoreState, GameplayEvent, GameplayPresentationAdapter, GameplayViewModel, PresentationIntent, SquadOwner, SquadViewModel,
} from './model';

/** The client renders at this rate and eases ships toward the last authoritative cell. */
const FRAME_MS = 16;
/** Further than this, a ship snaps instead of sliding (respawn, reconnection, fog reveal). */
const SNAP_CELLS = 3;
const TICKS_PER_SECOND = 10;

type Point = { x: number; y: number };

/** Short map tags; the squad panel shows the full class name. */
const UNIT_LABEL: Record<UnitKind, string> = {
  explorer: 'EXP', interceptor: 'INT', frigate: 'FRG', bomber: 'BMB',
};

/** Server rejection codes shown to the player. Unknown codes fall back to a generic line. */
export const REJECTION_TEXT: Record<string, string> = {
  insufficient_metal: 'No alcanza el Metal.',
  fleet_full: 'Flota completa.',
  production_busy: 'El hangar ya está construyendo.',
  upgrade_maxed: 'Esta mejora ya está al máximo.',
  blocked_destination: 'No se puede volar a ese punto.',
  unreachable_destination: 'No hay ruta hasta ese punto.',
  target_not_visible: 'El objetivo no está a la vista.',
  target_unavailable: 'Ese guardián todavía no se puede atacar.',
  cannot_attack: 'El Explorador no ataca.',
  route_full: 'Ruta llena.',
  rate_limit: 'Demasiadas órdenes seguidas.',
};

function blankSnapshot(): GameplayViewModel {
  return {
    tick: 0, sector: 1, elapsedSeconds: 0,
    selectedSquadId: null, selectedSquadIds: [], activeAction: null, moveOrder: null,
    resources: { metal: 0, metalRate: 0, energy: 0, energyRate: 0, fleet: 0, fleetCap: FLEET_CAP },
    squads: [], core: { state: 'locked', progress: 0, opensInSeconds: 0 },
    enemiesVisible: true, clockRunning: true,
    nodes: [], production: null, result: null, notice: 'Conectando con el servidor…', connection: 'connecting',
    visibleCells: null,
  };
}

/** Snap a click to the nearest open cell within 1.5 cells, so edge clicks still land on the platform. */
export function nearestOpenCell(x: number, y: number): Point | null {
  let best: Point | null = null;
  let bestGap = Infinity;
  for (let cy = Math.floor(y - 1.5); cy <= Math.ceil(y + 1.5); cy += 1) {
    for (let cx = Math.floor(x - 1.5); cx <= Math.ceil(x + 1.5); cx += 1) {
      if (cx < 0 || cy < 0 || cx >= sectorSurface.width || cy >= sectorSurface.height) continue;
      if (!sectorSurface.walkable[cy * sectorSurface.width + cx]) continue;
      const gap = Math.hypot(cx - x, cy - y);
      if (gap <= 1.5 && gap < bestGap) { best = { x: cx, y: cy }; bestGap = gap; }
    }
  }
  return best;
}

const UNDER_ATTACK_COOLDOWN_MS = 10_000;

/** Compare two consecutive server views and name what changed for the player. */
export function diffViews(previous: PlayerView | null, next: PlayerView): GameplayEvent[] {
  if (!previous) return [{ kind: 'match-start' }];
  const events: GameplayEvent[] = [];
  const me = next.playerId;
  const visible = new Set(next.visibleCells.map((cell) => `${cell.x},${cell.y}`));
  const alive = (view: PlayerView) => new Map(view.squads.filter((squad) => squad.hp > 0).map((squad) => [squad.id, squad]));
  const before = alive(previous);
  const after = alive(next);
  for (const [id, squad] of before) {
    if (after.has(id)) continue;
    const own = squad.ownerId === me;
    // An enemy that walked out of sight is not a kill: only count it if its cell is still watched.
    if (own || visible.has(`${squad.x},${squad.y}`)) events.push({ kind: 'ship-destroyed', own });
  }
  for (const [id, squad] of after) if (!before.has(id) && squad.ownerId === me) events.push({ kind: 'ship-launched' });
  for (const guardian of previous.guardians) {
    if (guardian.hp <= 0) continue;
    const now = next.guardians.find((unit) => unit.id === guardian.id);
    if ((!now || now.hp <= 0) && visible.has(`${guardian.x},${guardian.y}`)) events.push({ kind: 'guardian-down' });
  }
  for (const node of next.nodes) {
    const old = previous.nodes.find((candidate) => candidate.id === node.id);
    if (!old || old.ownerId === node.ownerId || node.kind !== 'metal') continue;
    if (node.ownerId === me) events.push({ kind: 'node-captured', own: true });
    else if (old.ownerId === me) events.push({ kind: 'node-lost' });
    else if (node.ownerId !== null) events.push({ kind: 'node-captured', own: false });
  }
  const opensIn = (view: PlayerView) => (view.rules.coreOpenTick - view.tick) / TICKS_PER_SECOND;
  if (opensIn(previous) > 30 && opensIn(next) <= 30) events.push({ kind: 'core-soon' });
  if (!previous.core.open && next.core.open) events.push({ kind: 'core-open' });
  const rival = me === 'p1' ? 'p2' : 'p1';
  if (previous.core.progress[me] === 0 && next.core.progress[me] > 0) events.push({ kind: 'core-own-capturing' });
  if (previous.core.progress[rival] === 0 && next.core.progress[rival] > 0) events.push({ kind: 'core-rival-capturing' });
  if (previous.winner === null && next.winner !== null) events.push({ kind: next.winner === me ? 'victory' : 'defeat' });
  const hurt = [...after.values()].some((squad) => squad.ownerId === me && squad.hp < (before.get(squad.id)?.hp ?? squad.hp));
  if (hurt) events.push({ kind: 'under-attack' });
  return events;
}

function coreState(view: PlayerView): CoreState {
  if (!view.core.open) return 'locked';
  const mine = view.core.progress[view.playerId];
  const rival = view.core.progress[view.playerId === 'p1' ? 'p2' : 'p1'];
  if (mine > rival) return 'blue-capturing';
  if (rival > mine) return 'red-capturing';
  return mine > 0 ? 'contested' : 'available';
}

/**
 * Presentation adapter backed by the authoritative `training` room: one human against the
 * server rival (or a second human who joins the same room). The browser only sends intentions.
 */
export function createServerGameplayAdapter(serverUrl: string, difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  map: TrainingMapId = 'espiral', duration: DurationMode = 'skirmish', existingRoom?:Room): GameplayPresentationAdapter {
  let snapshot = blankSnapshot();
  let latest: PlayerView | null = null;
  let room: Room | null = null;
  let seq = 0;
  let destroyed = false;
  const shown = new Map<string, Point>();
  const transits = new Map<string, { from: Point; to: Point; startedAt: number; duration: number }>();
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: GameplayEvent) => void>();
  const emit = () => listeners.forEach((listener) => listener());
  let lastAttackAlert = -Infinity;

  const send = (command: Record<string, unknown>) => {
    if (!room || snapshot.result) return;
    seq += 1;
    room.send('command', { seq, ...command });
  };
  const ownerOf = (ownerId: string): SquadOwner => (latest && ownerId === latest.playerId ? 'blue' : 'red');
  const selectedOwn = () => snapshot.squads.filter((squad) => snapshot.selectedSquadIds.includes(squad.id)
    && squad.owner === 'blue' && squad.healthPercent > 0);

  /** Rebuild the view model from the last server view plus the eased on-screen positions. */
  const rebuild = () => {
    const view = latest;
    if (!view) return;
    const me = view.playerId;
    const alive = view.squads.filter((squad) => squad.hp > 0);
    const ownIds = new Set(alive.filter((squad) => squad.ownerId === me).map((squad) => squad.id));
    const selectedIds = snapshot.selectedSquadIds.filter((id) => ownIds.has(id));
    const counters = new Map<string, number>();
    const squads: SquadViewModel[] = alive.map((squad) => {
      const at = shown.get(squad.id) ?? { x: squad.x, y: squad.y };
      const counterKey = `${squad.ownerId}:${squad.kind}`;
      const count = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, count);
      const own = squad.ownerId === me;
      const moving = own && (squad.target || (squad.route?.length ?? 0) > 0);
      return {
        id: squad.id, callSign: `${UNIT_LABEL[squad.kind]}-${count}`, owner: ownerOf(squad.ownerId),
        isDecoy:squad.isDecoy, unitType: squad.kind, gridX: at.x, gridY: at.y,
        speedCellsPerSecond: squad.stats?.speed, hp: squad.hp, maxHp: squad.maxHp, stats: squad.stats,
        healthPercent: Math.round(squad.hp / squad.maxHp * 100),
        attackCooldown: squad.attackCooldown, lastShot: squad.lastShot,
        attackTargetId: own ? squad.attackTargetId ?? null : null,
        selected: selectedIds.includes(squad.id), visible: true,
        composition: {
          interceptors: squad.kind === 'interceptor' ? 1 : 0, frigates: squad.kind === 'frigate' ? 1 : 0,
          bombers: squad.kind === 'bomber' ? 1 : 0, explorers: squad.kind === 'explorer' ? 1 : 0,
        },
        status: own && squad.attackTargetId ? 'attacking' : moving ? 'moving' : own && squad.stance === 'guard' ? 'holding' : 'idle',
      };
    });
    // Neutral guardians are drawn as heavy ships in their own colour and can be attacked.
    for (const guardian of view.guardians.filter((unit) => unit.hp > 0)) {
      const isCore = guardian.objectiveId === view.core.id;
      squads.push({
        id: guardian.id, callSign: isCore ? 'GUARDIÁN Ω' : 'GUARDIÁN', owner: 'neutral',
        unitType: isCore ? 'bomber' : 'frigate', gridX: shown.get(guardian.id)?.x ?? guardian.x, gridY: shown.get(guardian.id)?.y ?? guardian.y,
        healthPercent: Math.round(guardian.hp / guardian.maxHp * 100), selected: false, visible: true,
        composition: { interceptors: 0, frigates: 0 }, status: 'idle',
      });
    }
    const leader = alive.find((squad) => squad.id === selectedIds[0] && squad.ownerId === me);
    const waypoints = leader ? [...(leader.target ? [leader.target] : []), ...(leader.route ?? [])] : [];
    const leaderAt = leader ? shown.get(leader.id) ?? leader : null;
    const ownedMetal = view.nodes.filter((node) => node.kind === 'metal' && node.ownerId === me).length;
    const own = view.players[me];
    snapshot = {
      ...snapshot,
      tick: view.tick,
      tickRate: view.rules.tickRate,
      elapsedSeconds: Math.floor(view.tick / TICKS_PER_SECOND),
      suddenDeath: view.suddenDeath,
      selectedSquadIds: selectedIds,
      selectedSquadId: selectedIds[0] ?? null,
      moveOrder: leader && leaderAt && waypoints.length
        ? { squadId: leader.id, destination: { ...waypoints.at(-1)! }, route: [{ x: leaderAt.x, y: leaderAt.y }, ...waypoints] }
        : null,
      resources: {
        metal: own.metal ?? 0, metalRate: view.metalRate ?? ownedMetal + 0.5, energy: 0, energyRate: 0,
        fleet: alive.filter((u)=>u.ownerId===me && !u.isDecoy).length, fleetCap: view.base?.fleetCap ?? FLEET_CAP,
      },
      squads, unitStats: view.unitStats, augments:view.augments, chart:view.chart, productionForbidden:view.productionForbidden,
      nodes: view.nodes.map((node) => ({
        id: node.id, kind: node.kind, x: node.x, y: node.y,
        owner: node.ownerId === null ? null : ownerOf(node.ownerId),
      })),
      core: {
        state: coreState(view),
        progress: Math.round((view.coreFraction ?? Math.max(view.core.progress.p1, view.core.progress.p2) / view.rules.coreCaptureTicks) * 100),
        opensInSeconds: Math.max(0, Math.ceil((view.rules.coreOpenTick - view.tick) / TICKS_PER_SECOND)),
      },
      production: own.production
        ? { kind: own.production.kind, remainingSeconds: Math.ceil(own.production.remainingTicks / TICKS_PER_SECOND) }
        : null,
      base: { upgrades: { ...(own.baseUpgrades ?? { damage: 0, capacity: 0 }) }, damage: view.base?.damage ?? 0,
        range: BASE_DEFENSE_RANGE, position:{...own.base}, upgradeCosts: view.base?.upgradeCosts ?? {damage:null,capacity:null} },
      result: view.winner === null ? null : view.winner === me ? 'victory' : 'defeat',
      reward: view.reward,
      visibleCells: (() => {
        const cells = Array<boolean>(view.width * view.height).fill(false);
        for (const cell of view.visibleCells) cells[cell.y * view.width + cell.x] = true;
        return cells;
      })(),
    };
    emit();
  };

  /** Interpolate a complete server step over its cadence, including diagonal steps.
   * Fixed-distance catch-up made diagonal movement burst and pause at each cell. */
  const frame = setInterval(() => {
    if (!latest) return;
    let changed = false;
    const now = performance.now();
    for (const [id, transit] of transits) {
      const ratio = Math.min(1, Math.max(0, (now - transit.startedAt) / transit.duration));
      shown.set(id, { x: transit.from.x + (transit.to.x - transit.from.x) * ratio,
        y: transit.from.y + (transit.to.y - transit.from.y) * ratio });
      if (ratio === 1) transits.delete(id);
      changed = true;
    }
    if (changed) rebuild();
  }, FRAME_MS);

  const onView = (view: PlayerView) => {
    for (const event of diffViews(latest, view)) {
      if (event.kind === 'under-attack') {
        if (performance.now() - lastAttackAlert < UNDER_ATTACK_COOLDOWN_MS) continue;
        lastAttackAlert = performance.now();
      }
      eventListeners.forEach((listener) => listener(event));
    }
    const previous = latest;
    latest = view;
    const units = [...view.squads, ...view.guardians].filter((unit) => unit.hp > 0);
    const present = new Set(units.map((unit) => unit.id));
    for (const id of shown.keys()) if (!present.has(id)) { shown.delete(id); transits.delete(id); }
    for (const unit of units) {
      const at = shown.get(unit.id);
      const old = [...(previous?.squads ?? []), ...(previous?.guardians ?? [])].find((candidate) => candidate.id === unit.id);
      if (!at || Math.hypot(unit.x - at.x, unit.y - at.y) > SNAP_CELLS) {
        shown.set(unit.id, { x: unit.x, y: unit.y });
        transits.delete(unit.id);
      } else if (!old || old.x !== unit.x || old.y !== unit.y) {
        const ticks = 'kind' in unit
          ? 'moveTicks' in unit && typeof unit.moveTicks === 'number' ? unit.moveTicks : view.rules.moveEveryTicks : 9;
        transits.set(unit.id, { from: { ...at }, to: { x: unit.x, y: unit.y },
          startedAt: performance.now(), duration: ticks * 1000 / view.rules.tickRate });
      }
    }
    if (snapshot.connection !== 'online') snapshot = { ...snapshot, connection: 'online', notice: null };
    rebuild();
  };

  void (async () => {
    try {
      const testing = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
      const token=typeof sessionStorage==='undefined'?null:sessionStorage.getItem('impulso.auth-token');
      const joined = existingRoom ?? await new Client(serverUrl).create('training', { difficulty, map, duration,token,
        testTimeScale: Number(testing.get('testTimeScale') ?? 1), ...(testing.has('testSeed')?{testSeed:Number(testing.get('testSeed'))}:{}) });
      if (destroyed) { void joined.leave(); return; }
      room = joined;
      joined.onMessage('view', onView);
      joined.onMessage('augmentOffer',()=>{});joined.onMessage('augmentChosen',()=>{});
      joined.onMessage('ack', () => { /* the next view already reflects accepted orders */ });
      joined.onMessage('rejected', (message: { reason?: string }) => {
        snapshot = { ...snapshot, notice: REJECTION_TEXT[message.reason ?? ''] ?? 'Orden rechazada.' };
        emit();
      });
      joined.onLeave(() => {
        if (destroyed) return;
        room = null;
        snapshot = { ...snapshot, connection: 'offline', notice: 'Se perdió la conexión con el servidor.' };
        emit();
      });
    } catch {
      snapshot = { ...snapshot, connection: 'offline', notice: 'No se pudo conectar. ¿Está corriendo el servidor (pnpm dev)?' };
      emit();
    }
  })();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    dispatch(intent: PresentationIntent) {
      if(intent.type==='augment-pick' || intent.type==='augment-reroll') {
        room?.send(intent.type==='augment-pick'?'augmentPick':'augmentReroll',intent.type==='augment-pick'?{choice:intent.choice,id:intent.id}:{choice:intent.choice});return;
      }
      if (intent.type === 'disband-selected') {
        const squadIds = selectedOwn().map((squad) => squad.id);
        if (!squadIds.length) return;
        send({ type: 'disband', squadIds });
        snapshot = { ...snapshot, activeAction: null, notice: null };
        emit();
        return;
      }
      if (intent.type === 'upgrade-base') {
        send({ type: 'upgrade_base', upgrade: intent.upgrade });
        snapshot = { ...snapshot, notice: null };
        emit();
        return;
      }
      if (intent.type === 'select-squad' || intent.type === 'select-squads') {
        const requested = intent.type === 'select-squad' ? [intent.squadId] : intent.squadIds;
        const ids = [...new Set(requested)].filter((id) => snapshot.squads.some((squad) => squad.id === id && squad.owner === 'blue'));
        if (intent.type === 'select-squad' && !ids.length) return;
        snapshot = { ...snapshot, selectedSquadIds: ids, selectedSquadId: ids[0] ?? null, activeAction: null };
        rebuild();
        if (!latest) emit();
        return;
      }
      if (intent.type === 'set-action') {
        if (intent.action === 'hold') {
          for (const squad of selectedOwn()) send({ type: 'stance', squadId: squad.id, stance: 'guard' });
          snapshot = { ...snapshot, activeAction: null };
        } else snapshot = { ...snapshot, activeAction: intent.action };
        emit();
        return;
      }
      if (intent.type === 'move-selected' || intent.type === 'move-squad') {
        const cell = nearestOpenCell(intent.x, intent.y);
        if (!cell) {
          snapshot = { ...snapshot, notice: REJECTION_TEXT.blocked_destination! };
          emit();
          return;
        }
        const { x, y } = cell;
        const movers = intent.type === 'move-squad'
          ? selectedOwn().filter((squad) => squad.id === intent.squadId) : selectedOwn();
        // The server spreads ships that share a destination around it.
        for (const squad of movers) send({ type: 'move', squadId: squad.id, x, y });
        snapshot = { ...snapshot, activeAction: null, notice: null };
        emit();
        return;
      }
      if (intent.type === 'attack-selected' || intent.type === 'attack-squad') {
        const attackers = selectedOwn().filter((squad) => (squad.stats?.damage ?? 0) > 0
          && (intent.type === 'attack-selected' || squad.id === intent.squadId));
        for (const squad of attackers) send({ type: 'attack', squadId: squad.id, targetId: intent.targetId });
        snapshot = { ...snapshot, activeAction: null, notice: null };
        emit();
        return;
      }
      if (intent.type === 'produce') {
        send({ type: 'produce', kind: intent.kind });
        snapshot = { ...snapshot, notice: null };
        emit();
      }
      // Development intents (forcing core state, health or resources) only exist in the local mock.
    },
    destroy() {
      destroyed = true;
      clearInterval(frame);
      transits.clear();
      shown.clear();
      void room?.leave();
      room = null;
      listeners.clear();
      eventListeners.clear();
    },
  };
}
