import type { DurationMode, MatchReward } from '@impulso/sim';
import { Client, type Room } from '@colyseus/sdk';
import { FLEET_CAP, BASE_DEFENSE_RANGE, findTiledPath } from '@impulso/sim';
import { type PlayerView, type UnitKind } from '@impulso/state';
import { sectorSurface, type TrainingMapId } from '../map/sector-map';
import { formationSeats, readStoredFormation, storeFormation } from './formation';
import type {
  CoreState, GameplayEvent, GameplayPresentationAdapter, GameplayViewModel, NodeViewModel, PresentationIntent, SquadOwner, SquadViewModel,
} from './model';

/** The client renders at this rate and eases ships toward the last authoritative cell. */
const FRAME_MS = 16;
/** Further than this, a ship snaps instead of sliding (respawn, reconnection, fog reveal). */
const SNAP_CELLS = 3;
/** Server steps a rival ship trails behind its reported position, to absorb update jitter. Own ships lead with their predicted next cell instead. */
const TRAIL_LAG = 1;
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
  module_busy: 'La base ya está construyendo un módulo.',
  module_built: 'Ese módulo ya está construido.',
  module_locked: 'Primero construye la Refinería.',
  module_slots_full: 'No quedan espacios para módulos.',
  surrender_locked: 'Todavía no puedes rendirte.',
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
    selectedSquadId: null, selectedSquadIds: [], activeAction: null, moveOrder: null, formation: readStoredFormation(),
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

/** What the player remembers between views: explored terrain and the last seen state of each node. */
export interface FogMemory {
  explored: boolean[] | null;
  nodes: Map<string, NodeViewModel>;
}

/**
 * Fold a new server view into the player's memory and say whether new terrain was explored.
 * Built only from what the server already sent, so remembering never reveals anything new.
 */
export function rememberView(memory: FogMemory, view: Pick<PlayerView, 'width' | 'height' | 'playerId' | 'visibleCells' | 'nodes'>): boolean {
  let grew = false;
  if (!memory.explored || memory.explored.length !== view.width * view.height) {
    memory.explored = Array<boolean>(view.width * view.height).fill(false);
    grew = true;
  }
  for (const cell of view.visibleCells) {
    const index = cell.y * view.width + cell.x;
    if (!memory.explored[index]) { memory.explored[index] = true; grew = true; }
  }
  const ownerOf = (ownerId: string | null): SquadOwner | null => ownerId === null ? null : ownerId === view.playerId ? 'blue' : 'red';
  const seenNow = new Set(view.nodes.map((node) => node.id));
  for (const node of view.nodes) {
    memory.nodes.set(node.id, { id: node.id, kind: node.kind, x: node.x, y: node.y, owner: ownerOf(node.ownerId),
      ...(node.radius !== undefined ? { radius: node.radius } : {}), stale: false });
  }
  for (const [id, node] of memory.nodes) if (!seenNow.has(id) && !node.stale) memory.nodes.set(id, { ...node, stale: true });
  return grew;
}

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
  const known = new Set((previous.satellites ?? []).map((fall) => fall.id));
  if ((next.satellites ?? []).some((fall) => !known.has(fall.id))) events.push({ kind: 'satellite-warning' });
  if ((next.satellites ?? []).some((fall) => previous.tick < fall.impactTick && next.tick >= fall.impactTick)) events.push({ kind: 'satellite-impact' });
  const opensIn = (view: PlayerView) => (view.rules.coreOpenTick - view.tick) / TICKS_PER_SECOND;
  if (opensIn(previous) > 30 && opensIn(next) <= 30) events.push({ kind: 'core-soon' });
  if (!previous.core.open && next.core.open) events.push({ kind: 'core-open' });
  const rival = me === 'p1' ? 'p2' : 'p1';
  if (previous.core.progress[me] === 0 && next.core.progress[me] > 0) events.push({ kind: 'core-own-capturing' });
  if (previous.core.progress[rival] === 0 && next.core.progress[rival] > 0) events.push({ kind: 'core-rival-capturing' });
  if (previous.winner === null && next.winner !== null) events.push({ kind: next.winner === me ? 'victory' : 'defeat' });
  const baseHit = (next.base?.hp ?? 0) < (previous.base?.hp ?? 0);
  const hurt = baseHit || [...after.values()].some((squad) => squad.ownerId === me && squad.hp < (before.get(squad.id)?.hp ?? squad.hp));
  if (hurt) events.push({ kind: 'under-attack' });
  return events;
}

/** The side taking a node from its owner: whoever is further along among those that do not hold it. */
export function nodeCapture(node: PlayerView['nodes'][number], captureTicks: number,
  ownerOf: (ownerId: string) => SquadOwner): { capture?: { by: SquadOwner; fraction: number } } {
  const leading = (['p1', 'p2'] as const).filter((id) => id !== node.ownerId)
    .map((id) => ({ by: ownerOf(id), fraction: Math.min(1, node.fraction?.[id] ?? node.progress[id] / captureTicks) }))
    .filter((side) => side.fraction > 0).sort((a, b) => b.fraction - a.fraction)[0];
  return leading ? { capture: leading } : {};
}

function coreState(view: PlayerView): CoreState {
  if (!view.core.open) return 'locked';
  const mine = view.core.progress[view.playerId];
  const rival = view.core.progress[view.playerId === 'p1' ? 'p2' : 'p1'];
  if (mine > rival) return 'blue-capturing';
  if (rival > mine) return 'red-capturing';
  return mine > 0 ? 'contested' : 'available';
}

/** What a transport tells the adapter. */
export interface TransportEvents {
  view(view: PlayerView): void;
  rejected(reason: string): void;
  /** Text for the HUD; null clears it. */
  notice(text: string | null): void;
  connection(state: 'online' | 'connecting' | 'offline'): void;
  /** Something outside the views changed (campaign phase or outcome): rebuild. */
  refresh(): void;
}
/** Where the adapter sends intentions and gets views: its own training room, or the campaign session. */
export interface MatchTransport {
  /** Starts delivering events. The returned function stops them and releases only what the transport owns. */
  open(events: TransportEvents): () => void;
  command(command: Record<string, unknown>): void;
  augmentPick(choice: number, id: string): void;
  augmentReroll(choice: number): void;
  /** Campaign only: the running sector, and the campaign outcome that replaces each sector's winner. */
  sector?(): number;
  outcome?(): { result: 'victory' | 'defeat'; reward?: MatchReward } | null;
}
/** A training room the adapter owns: it numbers the orders and leaves the room when closed. */
function roomTransport(room: Room): MatchTransport {
  let seq = 0;
  let open = true;
  return {
    open(events) {
      room.onMessage('view', events.view);
      room.onMessage('augmentOffer', () => {}); room.onMessage('augmentChosen', () => {});
      room.onMessage('ack', () => { /* the next view already reflects accepted orders */ });
      room.onMessage('rejected', (message: { reason?: string }) => events.rejected(message.reason ?? ''));
      room.onLeave(() => {
        open = false;
        events.connection('offline');
        events.notice('Se perdió la conexión con el servidor.');
      });
      return () => { open = false; void room.leave(); };
    },
    command(command) { if (!open) return; seq += 1; room.send('command', { seq, ...command }); },
    augmentPick(choice, id) { if (open) room.send('augmentPick', { choice, id }); },
    augmentReroll(choice) { if (open) room.send('augmentReroll', { choice }); },
  };
}

/**
 * Presentation adapter for the authoritative match engine. Training opens its own `training` room
 * (one human against the server rival, or a second human who joins it); the campaign passes the
 * session as a transport. The browser only sends intentions.
 */
export function createServerGameplayAdapter(serverUrl: string, difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  map: TrainingMapId = 'espiral', duration: DurationMode = 'skirmish', source?: Room | MatchTransport): GameplayPresentationAdapter {
  let snapshot = blankSnapshot();
  let latest: PlayerView | null = null;
  let link: MatchTransport | null = null;
  let close: () => void = () => {};
  /** Campaign outcome already announced, so the victory or defeat call plays once. */
  let announced: 'victory' | 'defeat' | null = null;
  let destroyed = false;
  const shown = new Map<string, Point>();
  /** Cells each ship still has to cover on screen, its nominal speed and its current speed. */
  type Trail = { points: Point[]; cellsPerSecond: number; speed: number; pace: number; updatedAt: number;
    /** Own ships only: the next cell on their route, which the server has not stepped into yet. */
    predicted: Point | null; authoritative: Point; steppedAt: number };
  const trails = new Map<string, Trail>();
  const newTrail = (at: Point, cellsPerSecond: number): Trail => ({ points: [], cellsPerSecond, speed: cellsPerSecond * 1.15 * 0.8,
    pace: 1.15, updatedAt: performance.now(), predicted: null, authoritative: { ...at }, steppedAt: performance.now() });
  /** The cell after `from` on the same terrain route the server plans, or null at the goal. */
  const nextCell = (from: Point, goal: Point): Point | null => {
    if (from.x === goal.x && from.y === goal.y) return null;
    const result = findTiledPath(sectorSurface, from, goal);
    return result.status === 'found' && result.path[0] ? { ...result.path[0] } : null;
  };
  let lastFrame = performance.now();
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: GameplayEvent) => void>();
  const emit = () => listeners.forEach((listener) => listener());
  let lastAttackAlert = -Infinity;
  /** Destination shown the moment the player clicks, until the server view carries the order. */
  let pendingOrder: { squadId: string; destination: Point; at: number } | null = null;
  /** Formation seats shown the moment the player clicks, until the server view carries them. */
  let pendingSeats = new Map<string, Point>();

  const send = (command: Record<string, unknown>) => {
    if (!link || snapshot.result) return;
    link.command(command);
  };
  const ownerOf = (ownerId: string): SquadOwner => (latest && ownerId === latest.playerId ? 'blue' : 'red');
  const selectedOwn = () => snapshot.squads.filter((squad) => snapshot.selectedSquadIds.includes(squad.id)
    && squad.owner === 'blue' && squad.healthPercent > 0);

  // One mask per server view: rebuilds between ticks reuse it, so the scene and minimap can skip unchanged fog.
  let fog: { view: PlayerView; cells: boolean[] } | null = null;
  const fogOf = (view: PlayerView) => {
    if (fog?.view !== view) {
      const cells = Array<boolean>(view.width * view.height).fill(false);
      for (const cell of view.visibleCells) cells[cell.y * view.width + cell.x] = true;
      // Unchanged vision keeps the previous array, identity included.
      const same = fog !== null && fog.cells.length === cells.length && fog.cells.every((seen, index) => seen === cells[index]);
      fog = { view, cells: same ? fog!.cells : cells };
    }
    return fog.cells;
  };
  // Player memory for this match: explored terrain and the last seen owner of each node.
  const memory: FogMemory = { explored: null, nodes: new Map() };
  /** Copy of the explored cells handed to the view; replaced only when new terrain is seen. */
  let explored: boolean[] | null = null;
  /** Training ends with the match winner; a campaign ignores each sector's winner and waits for its own outcome. */
  const outcomeOf = (view: PlayerView): Pick<GameplayViewModel, 'result' | 'reward'> => {
    if (link?.outcome) {
      const final = link.outcome();
      return { result: final?.result ?? null, reward: final?.reward };
    }
    return { result: view.winner === null ? null : view.winner === view.playerId ? 'victory' : 'defeat', reward: view.reward };
  };
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
        ...(own ? { destination: squad.target ? { ...squad.target } : pendingSeats.get(squad.id) ?? null } : {}),
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
    if (pendingOrder && (waypoints.length || performance.now() - pendingOrder.at > 1500 || pendingOrder.squadId !== leader?.id)) pendingOrder = null;
    if (!pendingOrder) pendingSeats = new Map();
    const ownedMetal = view.nodes.filter((node) => node.kind === 'metal' && node.ownerId === me).length;
    const own = view.players[me];
    snapshot = {
      ...snapshot,
      tick: view.tick,
      sector: link?.sector?.() ?? 1,
      tickRate: view.rules.tickRate,
      elapsedSeconds: Math.floor(view.tick / TICKS_PER_SECOND),
      suddenDeath: view.suddenDeath,
      selectedSquadIds: selectedIds,
      selectedSquadId: selectedIds[0] ?? null,
      moveOrder: leader && leaderAt && waypoints.length
        ? { squadId: leader.id, destination: { ...waypoints.at(-1)! }, route: [{ x: leaderAt.x, y: leaderAt.y }, ...waypoints] }
        : leaderAt && pendingOrder
          ? { squadId: pendingOrder.squadId, destination: { ...pendingOrder.destination }, route: [{ x: leaderAt.x, y: leaderAt.y }, { ...pendingOrder.destination }] }
          : null,
      resources: {
        metal: own.metal ?? 0, metalRate: view.metalRate ?? ownedMetal + 0.5, energy: 0, energyRate: 0,
        fleet: alive.filter((u)=>u.ownerId===me && !u.isDecoy).length, fleetCap: view.base?.fleetCap ?? FLEET_CAP,
      },
      satellites: view.satellites?.map((fall) => ({ id: fall.id, x: fall.x, y: fall.y, radius: fall.radius, warnTick: fall.warnTick, impactTick: fall.impactTick })),
      squads, unitStats: view.unitStats, augments:view.augments, chart:view.chart, productionForbidden:view.productionForbidden,
      nodes: [
        ...view.nodes.map((node) => ({
          id: node.id, kind: node.kind, x: node.x, y: node.y,
          owner: node.ownerId === null ? null : ownerOf(node.ownerId),
          ...(node.radius !== undefined ? { radius: node.radius } : {}),
          ...nodeCapture(node, view.rules.nodeCaptureTicks, ownerOf),
          ...(node.activeAt !== undefined ? { stabilizingSeconds: Math.ceil((node.activeAt - view.tick) / TICKS_PER_SECOND) } : {}),
        })),
        // Nodes out of sight keep the owner the player last saw, marked as stale.
        ...[...memory.nodes.values()].filter((node) => node.stale).map((node) => ({ ...node })),
      ],
      core: {
        state: coreState(view),
        progress: Math.round((view.coreFraction ?? Math.max(view.core.progress.p1, view.core.progress.p2) / view.rules.coreCaptureTicks) * 100),
        opensInSeconds: Math.max(0, Math.ceil((view.rules.coreOpenTick - view.tick) / TICKS_PER_SECOND)),
      },
      production: own.production
        ? { kind: own.production.kind, remainingSeconds: Math.ceil(own.production.remainingTicks / TICKS_PER_SECOND) }
        : null,
      base: { upgrades: { ...(own.baseUpgrades ?? { damage: 0, capacity: 0 }) }, damage: view.base?.damage ?? 0,
        range: view.base?.range ?? BASE_DEFENSE_RANGE, position:{...own.base}, upgradeCosts: view.base?.upgradeCosts ?? {damage:null,capacity:null},
        ...(view.base?.hp !== undefined ? {
          hp: view.base.hp, maxHp: view.base.maxHp, armor: view.base.armor, moduleCosts: view.base.moduleCosts,
          vulnerableInSeconds: Math.max(0, Math.ceil(((view.base.vulnerableTick ?? 0) - view.tick) / TICKS_PER_SECOND)),
          modules: view.base.modules && { ...view.base.modules, extras: [...view.base.modules.extras],
            building: view.base.modules.building && { kind: view.base.modules.building.kind, remainingSeconds: Math.ceil(view.base.modules.building.remainingTicks / TICKS_PER_SECOND) } },
        } : {}) },
      enemyBase: view.enemyBase && { id: `${me === 'p1' ? 'p2' : 'p1'}-base`, ...view.enemyBase },
      ...outcomeOf(view),
      visibleCells: fogOf(view),
      exploredCells: explored,
    };
    emit();
  };

  /** Ships glide along the cells the server reported at a near-constant speed. Animating each
   * cell over exactly one server step made them stop at every cell while the next update was in
   * flight, and change speed on every diagonal. Instead they trail about half a cell behind the
   * authoritative position: a little faster when behind, easing in only at the final cell. */
  const frame = setInterval(() => {
    const now = performance.now();
    const seconds = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!latest) return;
    let changed = false;
    for (const [id, trail] of trails) {
      let at = shown.get(id);
      const stepMs = 1000 / trail.cellsPerSecond;
      const ended = !trail.predicted && now - trail.updatedAt > stepMs * 1.3;
      const path = trail.predicted ? [...trail.points, trail.predicted] : [...trail.points];
      if (!at || (!path.length && ended)) { trails.delete(id); continue; }
      // Caught up while the next cell is still in flight: keep the trail (and its speed).
      if (!path.length) continue;
      const remaining = path.reduce((sum, point, index) =>
        sum + Math.hypot(point.x - (index ? path[index - 1]! : at!).x, point.y - (index ? path[index - 1]! : at!).y), 0);
      // Cruise at the route's average step length per server step, nudged to stay about one
      // step behind. Brake only once no new cell has arrived for a while: the route ended.
      const target = ended ? trail.cellsPerSecond * Math.max(0.6, Math.min(2, remaining * 2.5))
        : trail.cellsPerSecond * trail.pace * Math.min(1.6, Math.max(0.7, 1 + 0.3 * (remaining - trail.pace * TRAIL_LAG)))
          // Ease off rather than stop when almost caught up with the server.
          * Math.min(1, remaining / 0.4);
      trail.speed += (target - trail.speed) * (1 - Math.exp(-seconds / 0.25));
      // Until the route ends, never quite reach the last known cell: approach it ever slower
      // so a late update reads as a soft slowdown instead of a stop.
      let budget = Math.min(ended ? remaining : remaining * 0.6, trail.speed * seconds);
      if (trail.predicted) {
        // Lead toward the predicted cell only as far as one server step has had time to go;
        // past 80 % approach it ever more slowly, so a late confirmation never parks the ship.
        const elapsed = (now - trail.steppedAt) / stepMs;
        const lead = elapsed < 0.8 ? elapsed : 0.8 + 0.2 * (1 - Math.exp(-(elapsed - 0.8) / 0.15));
        const span = Math.hypot(trail.predicted.x - trail.authoritative.x, trail.predicted.y - trail.authoritative.y);
        budget = Math.max(0, Math.min(budget, remaining - span * (1 - lead)));
      }
      while (budget > 0 && path.length) {
        const next = path[0]!;
        const gap = Math.hypot(next.x - at.x, next.y - at.y);
        if (gap <= budget) {
          at = { ...next }; budget -= gap; path.shift();
          if (trail.points.length) trail.points.shift();
          continue;
        }
        at = { x: at.x + (next.x - at.x) * budget / gap, y: at.y + (next.y - at.y) * budget / gap };
        budget = 0;
      }
      shown.set(id, at);
      changed = true;
    }
    if (changed) rebuild();
  }, FRAME_MS);

  /** A campaign sector is a fresh world: forget the previous sector's ships, fog, orders and selection. */
  const resetSector = () => {
    latest = null; fog = null; explored = null;
    memory.explored = null; memory.nodes.clear();
    trails.clear(); shown.clear();
    pendingOrder = null; pendingSeats = new Map();
    snapshot = { ...snapshot, selectedSquadIds: [], selectedSquadId: null, activeAction: null, moveOrder: null };
  };
  const announceOutcome = () => {
    const final = link?.outcome?.();
    if (!final || final.result === announced) return;
    announced = final.result;
    eventListeners.forEach((listener) => listener({ kind: final.result }));
  };
  const onView = (view: PlayerView) => {
    if (latest && view.tick < latest.tick) resetSector();
    const campaign = Boolean(link?.outcome);
    for (const event of diffViews(latest, view)) {
      if (campaign && (event.kind === 'victory' || event.kind === 'defeat')) continue;
      if (event.kind === 'under-attack') {
        if (performance.now() - lastAttackAlert < UNDER_ATTACK_COOLDOWN_MS) continue;
        lastAttackAlert = performance.now();
      }
      eventListeners.forEach((listener) => listener(event));
    }
    const previous = latest;
    latest = view;
    if (rememberView(memory, view)) explored = [...memory.explored!];
    const units = [...view.squads, ...view.guardians].filter((unit) => unit.hp > 0);
    const present = new Set(units.map((unit) => unit.id));
    for (const id of shown.keys()) if (!present.has(id)) { shown.delete(id); trails.delete(id); }
    for (const unit of units) {
      const at = shown.get(unit.id);
      const old = [...(previous?.squads ?? []), ...(previous?.guardians ?? [])].find((candidate) => candidate.id === unit.id);
      if (!at || Math.hypot(unit.x - at.x, unit.y - at.y) > SNAP_CELLS) {
        shown.set(unit.id, { x: unit.x, y: unit.y });
        trails.delete(unit.id);
      } else if (!old || old.x !== unit.x || old.y !== unit.y) {
        const ticks = 'kind' in unit
          ? 'moveTicks' in unit && typeof unit.moveTicks === 'number' ? unit.moveTicks : view.rules.moveEveryTicks : 9;
        // A ship that was standing still answers the order at cruise speed, without a slow ramp.
        const trail = trails.get(unit.id) ?? newTrail(at, view.rules.tickRate / ticks);
        trail.cellsPerSecond = view.rules.tickRate / ticks;
        // Diagonal steps cover 1.41 cells per server step; track the route's average.
        const from = trail.points.at(-1) ?? old ?? at;
        trail.pace += (Math.hypot(unit.x - from.x, unit.y - from.y) - trail.pace) * 0.35;
        trail.updatedAt = trail.steppedAt = performance.now();
        trail.authoritative = { x: unit.x, y: unit.y };
        // The predicted cell is now confirmed (or replaced) by the server's own step.
        trail.predicted = null;
        trail.points.push({ x: unit.x, y: unit.y });
        // Never fall more than a few cells behind the server.
        while (trail.points.length > 3) { shown.set(unit.id, trail.points.shift()!); }
        trails.set(unit.id, trail);
      }
    }
    for (const squad of view.squads) {
      if (squad.ownerId !== view.playerId || squad.hp <= 0) continue;
      const goal = squad.target ?? squad.route?.[0] ?? null;
      const trail = trails.get(squad.id);
      const next = goal ? nextCell({ x: squad.x, y: squad.y }, goal) : null;
      if (!next) { if (trail) trail.predicted = null; continue; }
      const at = shown.get(squad.id) ?? { x: squad.x, y: squad.y };
      const moving = trail ?? newTrail(at, view.rules.tickRate / (squad.moveTicks ?? view.rules.moveEveryTicks));
      if (!trail) { moving.authoritative = { x: squad.x, y: squad.y }; trails.set(squad.id, moving); }
      moving.predicted = next;
    }
    if (snapshot.connection !== 'online') snapshot = { ...snapshot, connection: 'online', notice: null };
    rebuild();
  };

  const start = (transport: MatchTransport) => {
    link = transport;
    close = transport.open({
      view: (view) => { if (!destroyed) onView(view); },
      rejected: (reason) => {
        if (destroyed) return;
        snapshot = { ...snapshot, notice: REJECTION_TEXT[reason] ?? 'Orden rechazada.' };
        emit();
      },
      notice: (text) => { if (destroyed) return; snapshot = { ...snapshot, notice: text }; emit(); },
      connection: (state) => { if (destroyed) return; snapshot = { ...snapshot, connection: state }; emit(); },
      refresh: () => {
        if (destroyed) return;
        announceOutcome();
        // A reload into the results gets no further views: the outcome alone decides what to show.
        if (latest) rebuild();
        else if (link?.outcome) { const final = link.outcome(); snapshot = { ...snapshot, result: final?.result ?? null, reward: final?.reward }; }
        emit();
      },
    });
  };
  if (source && 'open' in source) start(source);
  else if (source) start(roomTransport(source));
  else void (async () => {
    try {
      const testing = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
      const token=typeof sessionStorage==='undefined'?null:sessionStorage.getItem('impulso.auth-token');
      const joined = await new Client(serverUrl).create('training', { difficulty, map, duration,token,
        testTimeScale: Number(testing.get('testTimeScale') ?? 1), ...(testing.has('testSeed')?{testSeed:Number(testing.get('testSeed'))}:{}) });
      if (destroyed) { void joined.leave(); return; }
      start(roomTransport(joined));
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
      if(intent.type==='augment-pick') { link?.augmentPick(intent.choice,intent.id); return; }
      if(intent.type==='augment-reroll') { link?.augmentReroll(intent.choice); return; }
      if (intent.type === 'disband-selected') {
        const squadIds = selectedOwn().map((squad) => squad.id);
        if (!squadIds.length) return;
        send({ type: 'disband', squadIds });
        snapshot = { ...snapshot, activeAction: null, notice: null };
        emit();
        return;
      }
      if (intent.type === 'build-module') {
        send({ type: 'build_module', module: intent.module });
        snapshot = { ...snapshot, notice: null };
        emit();
        return;
      }
      if (intent.type === 'surrender') {
        send({ type: 'surrender' });
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
      if (intent.type === 'set-formation') {
        storeFormation(intent.formation);
        snapshot = { ...snapshot, formation: intent.formation };
        emit();
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
        const servers = movers.flatMap((squad) => latest?.squads.find((candidate) => candidate.id === squad.id) ?? []);
        // A group flies as one formation: every ship gets its own seat, facing the march.
        const formation = snapshot.formation ?? readStoredFormation();
        pendingSeats = movers.length > 1 ? formationSeats(servers, { x, y }, formation) : new Map();
        if (movers.length > 1) send({ type: 'move_formation', squadIds: movers.map((squad) => squad.id), x, y, formation });
        else for (const squad of movers) send({ type: 'move', squadId: squad.id, x, y });
        if (movers.length && snapshot.selectedSquadId) pendingOrder = { squadId: snapshot.selectedSquadId, destination: { x, y }, at: performance.now() };
        for (const squad of movers) {
          const server = latest?.squads.find((candidate) => candidate.id === squad.id);
          if (!server) continue;
          const next = nextCell({ x: server.x, y: server.y }, pendingSeats.get(squad.id) ?? { x, y });
          if (!next) continue;
          const at = shown.get(squad.id) ?? { x: server.x, y: server.y };
          const trail = trails.get(squad.id) ?? newTrail(at, (latest?.rules.tickRate ?? 10) / (server.moveTicks ?? latest?.rules.moveEveryTicks ?? 6));
          if (!trails.has(squad.id)) { trail.authoritative = { x: server.x, y: server.y }; trails.set(squad.id, trail); }
          trail.predicted = next;
          trail.steppedAt = performance.now();
        }
        snapshot = { ...snapshot, activeAction: null, notice: null };
        rebuild();
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
      trails.clear();
      shown.clear();
      close();
      link = null;
      listeners.clear();
      eventListeners.clear();
    },
  };
}
