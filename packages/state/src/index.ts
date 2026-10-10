import { AUGMENTS_BY_ID, DURATION_MODES, effectsFor, effectiveFleetCap, effectiveBaseDamage, visionSources, isConcealed, statsForUnit, baseUpgradeCost, metalIncomeRate, captureDuration, type Augment } from '@impulso/sim';
import { nebulaClouds, nebulaHides, nebulaSlowdown, type NebulaCloudState } from '@impulso/sim';
import { beltGates, fallenBarriers, stationPrice, type BeltGateState } from '@impulso/sim';
import { capturePresence, type Core } from '@impulso/sim';
import { baseArmor, baseDefense, type ExtraModule, type ModuleKind, type ModuleSpec } from '@impulso/sim';
import { distance, statsFor, marchInterval, type ShipStats, type Guardian, type PlayerId, type PlayerStance, type Position, type ResourceNode, type Rules, type Squad, type UnitKind, type World } from '@impulso/sim';
import { weaponView, type WeaponView } from './weapons.js';
export { UNIT_STATS, damageAgainst, findPath } from '@impulso/sim';
export type { UnitKind } from '@impulso/sim';

export interface VisibleSquad extends Omit<Squad, 'target' | 'attackTargetId' | 'attackMemory' | 'nextAttackTick' | 'stance' | 'anchor' | 'gather' | 'route'>, WeaponView {
  stats?: ShipStats;
  moveTicks?: number;
  /** Rival destinations remain private even while their units are visible. */
  target?: Position | null;
  attackTargetId?: string | null;
  stance?: PlayerStance;
  anchor?: Position | null;
  route?: Position[];
}
export type AugmentCardView = Pick<Augment,'id'|'tier'|'icon'|'text'>;
/** Where the Core stands: shut, open and empty, being taken by one side, or held in a frozen dispute. */
export type CoreStatus = 'locked' | 'idle' | 'capturing' | 'contested';
/**
 * The central objective. Its timer and capture score are public rules. The extra fields are optional so an
 * older server's view still reads; this one always sends them.
 */
export interface CoreView extends Core {
  status?: CoreStatus;
  /** The side taking the Core right now: only while `status` is `capturing`. */
  captor?: PlayerId | null;
  /** Each side's progress over its own capture time, from 0 to 1. */
  fraction?: Record<PlayerId, number>;
  /** Ticks the captor still needs to take the Core, or null when nobody is taking it. */
  remainingTicks?: number | null;
}
export interface MatchLobbyView {
  roomId:string; phase:'lobby'|'sector'|'results'; playerId:PlayerId;
  map:'sector-01'|'espiral'|'espiral-2'|'trascendencia'; duration:'complete'|'skirmish';
  seats:Record<PlayerId,{name:string;ready:boolean}|null>;
}
export interface AugmentView {
  started: boolean; own: AugmentCardView[]; rival: AugmentCardView[]; nextChoiceTick: number | null;
  offer: {choice:number;tier:Augment['tier'];cards:AugmentCardView[];remainingSeconds:number;rerolls:number;rerollLimit:number} | null;
}
export interface PlayerView {
  schemaVersion: 1;
  mode: 'training';
  tick: number;
  duration?: World['duration'];
  suddenDeath?: boolean;
  playerId: PlayerId;
  width: number;
  height: number;
  /** Static terrain is not repeated here: the client reads it from its own copy of the map. */
  obstacles: Position[];
  rules: Rules;
  unitStats?: Record<UnitKind, ShipStats>;
  augments?: AugmentView;
  chart?: { nodes: Position[]; guardians: Position[] };
  base?: {damage:number;range?:number;fleetCap:number;upgradeCosts:Record<'damage'|'capacity',number|null>;
    /** Match worlds: own hull, shield timer and modules. */
    hp?:number;maxHp?:number;armor?:number;vulnerableTick?:number;
    modules?:{refinery:0|1|2;extras:ExtraModule[];building:{kind:ModuleKind;remainingTicks:number}|null};
    moduleCosts?:Record<ModuleKind,ModuleSpec>};
  /** The rival base: position always, hull only while it is in sight. */
  enemyBase?: {x:number;y:number;visible:boolean;hp?:number;maxHp?:number};
  productionForbidden?: UnitKind[];
  /**
   * Metal and the hangar are private to their owner.
   * `lastSequence`: owner only, so a restored client keeps numbering its orders after the server's last accepted one.
   * `production`: the ship being built, its whole build time and the Metal a cancel gives back.
   * `queue`: paid orders waiting behind it, in order; slot n of a cancel is `queue[n - 1]`.
   */
  players: Record<PlayerId, { id: PlayerId; base: Position; metal?: number; lastSequence?: number; baseUpgrades?: { damage: number; capacity: number };
    production?: { kind: UnitKind; remainingTicks: number; totalTicks: number; refund: number } | null;
    queue?: { kind: UnitKind; refund: number }[] }>;
  squads: VisibleSquad[];
  guardians: Guardian[];
  /** `fraction`: each side's capture progress from 0 to 1, with its own capture time. */
  nodes: (ResourceNode & { fraction?: Record<PlayerId, number> })[];
  /** Stations the player holds, in or out of sight, and what each ship costs there. */
  stations?: { id: string; x: number; y: number; prices: Record<UnitKind, number> }[];
  core: CoreView;
  visibleCells: Position[];
  winner: PlayerId | null;
  metalRate?:number;
  coreFraction?:number;
  reward?: import('@impulso/sim').MatchReward;
  /** Announced satellite falls. Public: the warning crosses the whole sky. */
  satellites?: import('@impulso/sim').SatelliteFall[];
  /** Drifting purple clouds and their next route. Public: the mass is visible from anywhere. */
  nebulas?: NebulaCloudState[];
  /** Passages of the asteroid belt and whether each is clear, about to close or closed. Public. */
  belts?: BeltGateState[];
  /** Destructible barriers already shot down: their cells are open ground for everyone. Public. */
  fallenBarriers?: string[];
}
/** Row-major cells within reach of any vision source. Each source only scans its own bounding box. */
function cellsInSight(world: World, sources: readonly { position: Position; radius: number }[]): Position[] {
  const seen = new Uint8Array(world.width * world.height);
  for (const { position, radius } of sources) {
    const reach = Math.ceil(radius);
    const top = Math.max(0, Math.ceil(position.y) - reach), bottom = Math.min(world.height - 1, Math.floor(position.y) + reach);
    const left = Math.max(0, Math.ceil(position.x) - reach), right = Math.min(world.width - 1, Math.floor(position.x) + reach);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) if (distance(position, { x, y }) <= radius) seen[y * world.width + x] = 1;
    }
  }
  const cells: Position[] = [];
  seen.forEach((inSight, index) => { if (inSight) cells.push({ x: index % world.width, y: Math.floor(index / world.width) }); });
  return cells;
}
const unit = (value: number) => Math.min(1, Math.max(0, value));
/**
 * The Core as every player sees it. Presence only counts once its guardian is down, like the capture
 * itself, so the status never tells whether an unseen guardian still stands.
 */
function coreView(world: World): CoreView {
  const { core } = world;
  const duration = (player: PlayerId) => captureDuration(world, player, world.rules.coreCaptureTicks, true);
  const fraction = { p1: unit(core.progress.p1 / duration('p1')), p2: unit(core.progress.p2 / duration('p2')) };
  let status: CoreStatus = 'locked';
  let captor: PlayerId | null = null;
  if (core.open) {
    const guarded = world.guardians.some((guardian) => guardian.id === core.guardianId && guardian.hp > 0);
    const present = guarded ? { p1: 0, p2: 0 } : capturePresence(world, core);
    status = present.p1 > 0 && present.p2 > 0 ? 'contested' : present.p1 > 0 || present.p2 > 0 ? 'capturing' : 'idle';
    if (status === 'capturing') captor = present.p1 > 0 ? 'p1' : 'p2';
  }
  return {
    id: core.id, guardianId: core.guardianId, x: core.x, y: core.y,
    open: core.open, progress: { p1: core.progress.p1, p2: core.progress.p2 },
    ...(core.radius !== undefined ? { radius: core.radius } : {}),
    status, captor, fraction,
    remainingTicks: captor ? Math.max(0, Math.ceil(duration(captor) - core.progress[captor])) : null,
  };
}
/** Fresh whitelist snapshot. Never send the authoritative world to a player. */
export function viewFor(world: World, playerId: PlayerId): PlayerView {
  if (playerId !== 'p1' && playerId !== 'p2') throw new Error('Unknown player');
  const sources=visionSources(world,playerId);
  const visible=(position:Position)=>sources.some((source)=>distance(source.position,position)<=source.radius);
  // Nebula cells stay dark unless one of the player's ships is right beside them.
  const visibleCells = cellsInSight(world, sources).filter((cell) => !nebulaHides(world, playerId, cell));
  const players: PlayerView['players'] = {
    p1: { id: 'p1', base: { ...world.players.p1.base } },
    p2: { id: 'p2', base: { ...world.players.p2.base } },
  };
  players[playerId].metal = world.players[playerId].metal;
  players[playerId].lastSequence = world.players[playerId].lastSequence;
  players[playerId].baseUpgrades = { ...(world.players[playerId].baseUpgrades ?? { damage: 0, capacity: 0 }) };
  const order = world.production[playerId];
  players[playerId].production = order ? { kind: order.kind, remainingTicks: Math.max(0, order.readyTick - world.tick), totalTicks: order.totalTicks, refund: order.paid } : null;
  players[playerId].queue = (world.productionQueue?.[playerId] ?? []).map((queued) => ({ kind: queued.kind, refund: queued.paid }));
  const card=(id:string):AugmentCardView=>{const a=AUGMENTS_BY_ID.get(id)!;return {id:a.id,tier:a.tier,icon:a.icon,text:{es:{...a.text.es},en:{...a.text.en}}};};
  const match=world.augmentMatch, augmentPlayer=match?.players[playerId];
  const offer=augmentPlayer?.offer;
  const rivalId=playerId==='p1'?'p2':'p1';
  const own=world.players[playerId];
  return {
    metalRate:metalIncomeRate(world,playerId),
    // A frozen sudden-death dispute keeps progress above the one-tick capture time: never past full.
    coreFraction:Math.min(1,Math.max(...(['p1','p2'] as const).map(p=>world.core.progress[p]/captureDuration(world,p,world.rules.coreCaptureTicks,true)))),
    augments: match && augmentPlayer ? {started:match.started,own:augmentPlayer.chosen.map(card),rival:match.players[rivalId].chosen.map(card),
      nextChoiceTick:world.duration && augmentPlayer.nextChoice<3 ? DURATION_MODES[world.duration].choices[augmentPlayer.nextChoice]! : null,
      offer:offer ? {choice:offer.choice,tier:offer.tier,cards:offer.cards.map(card),remainingSeconds:Math.max(0,Math.ceil((offer.deadline-match.clock)/world.rules.tickRate)),rerolls:offer.rerolls,rerollLimit:offer.rerollLimit ?? 1} : null} : undefined,
    chart:augmentPlayer?.chart ? {nodes:augmentPlayer.chart.nodes.map((p)=>({...p})),guardians:augmentPlayer.chart.guardians.map((p)=>({...p}))} : undefined,
    base:{damage:effectiveBaseDamage(world,playerId)+baseDefense(world,playerId).damage,range:Math.max(baseDefense(world,playerId).range,4),fleetCap:effectiveFleetCap(world,playerId),upgradeCosts:{damage:baseUpgradeCost('damage',world.players[playerId].baseUpgrades),capacity:baseUpgradeCost('capacity',world.players[playerId].baseUpgrades)},
      ...(world.baseRules && own.structure && own.modules ? {
        hp:own.structure.hp,maxHp:own.structure.maxHp,armor:baseArmor(world,playerId),vulnerableTick:world.baseRules.vulnerableTick,
        modules:{refinery:own.modules.refinery,extras:[...own.modules.extras],building:own.modules.building?{kind:own.modules.building.kind,remainingTicks:Math.max(0,own.modules.building.readyTick-world.tick)}:null},
        moduleCosts:Object.fromEntries(Object.entries(world.baseRules.modules).map(([kind,spec])=>[kind,{...spec}])) as Record<ModuleKind,ModuleSpec>,
      } : {})},
    enemyBase:world.baseRules ? (()=>{const rival=world.players[rivalId];const seen=visible(rival.base);
      return {x:rival.base.x,y:rival.base.y,visible:seen,...(seen&&rival.structure?{hp:rival.structure.hp,maxHp:rival.structure.maxHp}:{})};})() : undefined,
    productionForbidden:effectsFor(world,playerId).flatMap((e)=>e.hook==='no-production'?[e.kind]:[]),
    schemaVersion: 1, mode: 'training', tick: world.tick, playerId, duration: world.duration, suddenDeath: world.suddenDeath,
    width: world.width, height: world.height, obstacles: world.obstacles.map((point) => ({ ...point })),
    rules: { ...world.rules }, players,
    unitStats: Object.fromEntries(['explorer', 'interceptor', 'frigate', 'bomber'].map((kind) => [kind, statsFor(world, playerId, kind as UnitKind)])) as Record<UnitKind, ShipStats>,
    squads: world.squads.filter((unit) => unit.ownerId === playerId || (unit.hp > 0 && visible(unit) && !isConcealed(world,unit))).map((unit) => {
      const { target, attackTargetId } = unit;
      const disguised=unit.isDecoy && unit.ownerId!==playerId;
      const stats=statsForUnit(world,disguised?{...unit,isDecoy:false}:unit);
      const maxHp=disguised?stats.maxHp:unit.maxHp;
      const publicUnit = {
        id: unit.id, ownerId: unit.ownerId, kind: unit.kind,
        x: unit.x, y: unit.y, hp: disguised?unit.hp/unit.maxHp*maxHp:unit.hp, maxHp, damage: stats.damage,
        stats, moveTicks: marchInterval(world, unit),
        ...weaponView(unit, stats, world.tick, visible),
      };
      return unit.ownerId === playerId
        ? {
          ...publicUnit, isDecoy:unit.isDecoy, target: target ? { ...target } : null, attackTargetId, stance: unit.stance,
          anchor: unit.anchor ? { ...unit.anchor } : null, route: unit.route.map((cell) => ({ ...cell })),
        }
        : publicUnit;
    }),
    guardians: world.guardians.filter(visible).map((unit) => ({
      id: unit.id, objectiveId: unit.objectiveId, x: unit.x, y: unit.y,
      hp: unit.hp, maxHp: unit.maxHp, damage: unit.damage,
      ...(unit.role ? { role: unit.role, range: unit.range } : {}),
      ...(unit.lastShot ? { lastShot: { tick: unit.lastShot.tick, to: { ...unit.lastShot.to } } } : {}),
    })),
    nodes: world.nodes.filter(visible).map((node) => ({
      id: node.id, kind: node.kind, guardianId: node.guardianId, x: node.x, y: node.y,
      ownerId: node.ownerId, progress: { p1: node.progress.p1, p2: node.progress.p2 },
      fraction: { p1: node.progress.p1 / captureDuration(world, 'p1', world.rules.nodeCaptureTicks, false),
        p2: node.progress.p2 / captureDuration(world, 'p2', world.rules.nodeCaptureTicks, false) },
      ...(node.radius !== undefined ? { radius: node.radius } : {}),
      ...(node.station ? { station: { ...node.station } } : {}),
      ...(node.activeAt !== undefined && node.activeAt > world.tick ? { activeAt: node.activeAt } : {}),
    })),
    // The central objective timer and capture score are public rules.
    core: coreView(world),
    visibleCells, winner: world.winner,
    ...(world.satellites ? { satellites: world.satellites.falls.map((fall) => ({ ...fall })) } : {}),
    ...(world.nebula?.clouds.length ? { nebulas: nebulaClouds(world) } : {}),
    ...(world.belt ? { belts: beltGates(world) } : {}),
    ...(world.barriers ? { fallenBarriers: fallenBarriers(world) } : {}),
    ...(world.nodes.some((node) => node.station) ? { stations: world.nodes.filter((node) => node.station && node.ownerId === playerId).map((node) => ({
      id: node.id, x: node.x, y: node.y,
      prices: Object.fromEntries((['explorer', 'interceptor', 'frigate', 'bomber'] as const).map((kind) => [kind, stationPrice(world, playerId, node, kind)])) as Record<UnitKind, number>,
    })) } : {}),
  };
}

export { battlefieldViewFor, encodeBattlefieldMask, decodeBattlefieldMask } from './battlefield.js';
export type {
  BattlefieldView, BattlefieldMask, BattlefieldPublicPlayer, BattlefieldPublicSquad, BattlefieldOwnSquad,
} from './battlefield.js';
export type { CampaignPhase, CampaignPhaseView, CampaignSectorResult, CampaignResult } from './campaign.js';
