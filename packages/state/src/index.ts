import { AUGMENTS_BY_ID, DURATION_MODES, effectsFor, effectiveFleetCap, effectiveBaseDamage, visionSources, isConcealed, statsForUnit, baseUpgradeCost, metalIncomeRate, captureDuration, type Augment } from '@impulso/sim';
import { nebulaClouds, nebulaHides, nebulaSlowdown, type NebulaCloudState } from '@impulso/sim';
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
export interface MatchLobbyView {
  roomId:string; phase:'lobby'|'sector'|'results'; playerId:PlayerId;
  map:'sector-01'|'espiral'|'espiral-2'; duration:'complete'|'skirmish';
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
  /** Metal and the hangar queue are private to their owner. */
  /** `lastSequence`: owner only, so a restored client keeps numbering its orders after the server's last accepted one. */
  players: Record<PlayerId, { id: PlayerId; base: Position; metal?: number; lastSequence?: number; baseUpgrades?: { damage: number; capacity: number }; production?: { kind: UnitKind; remainingTicks: number } | null }>;
  squads: VisibleSquad[];
  guardians: Guardian[];
  /** `fraction`: each side's capture progress from 0 to 1, with its own capture time. */
  nodes: (ResourceNode & { fraction?: Record<PlayerId, number> })[];
  core: World['core'];
  visibleCells: Position[];
  winner: PlayerId | null;
  metalRate?:number;
  coreFraction?:number;
  reward?: import('@impulso/sim').MatchReward;
  /** Announced satellite falls. Public: the warning crosses the whole sky. */
  satellites?: import('@impulso/sim').SatelliteFall[];
  /** Drifting purple clouds and their next route. Public: the mass is visible from anywhere. */
  nebulas?: NebulaCloudState[];
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
  players[playerId].production = order ? { kind: order.kind, remainingTicks: Math.max(0, order.readyTick - world.tick) } : null;
  const card=(id:string):AugmentCardView=>{const a=AUGMENTS_BY_ID.get(id)!;return {id:a.id,tier:a.tier,icon:a.icon,text:{es:{...a.text.es},en:{...a.text.en}}};};
  const match=world.augmentMatch, augmentPlayer=match?.players[playerId];
  const offer=augmentPlayer?.offer;
  const rivalId=playerId==='p1'?'p2':'p1';
  const own=world.players[playerId];
  return {
    metalRate:metalIncomeRate(world,playerId),
    coreFraction:Math.max(...(['p1','p2'] as const).map(p=>world.core.progress[p]/captureDuration(world,p,world.rules.coreCaptureTicks,true))),
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
    })),
    nodes: world.nodes.filter(visible).map((node) => ({
      id: node.id, kind: node.kind, guardianId: node.guardianId, x: node.x, y: node.y,
      ownerId: node.ownerId, progress: { p1: node.progress.p1, p2: node.progress.p2 },
      fraction: { p1: node.progress.p1 / captureDuration(world, 'p1', world.rules.nodeCaptureTicks, false),
        p2: node.progress.p2 / captureDuration(world, 'p2', world.rules.nodeCaptureTicks, false) },
      ...(node.radius !== undefined ? { radius: node.radius } : {}),
      ...(node.activeAt !== undefined && node.activeAt > world.tick ? { activeAt: node.activeAt } : {}),
    })),
    // The central objective timer and capture score are public rules.
    core: {
      id: world.core.id, guardianId: world.core.guardianId, x: world.core.x, y: world.core.y,
      open: world.core.open, progress: { p1: world.core.progress.p1, p2: world.core.progress.p2 },
    },
    visibleCells, winner: world.winner,
    ...(world.satellites ? { satellites: world.satellites.falls.map((fall) => ({ ...fall })) } : {}),
    ...(world.nebula?.clouds.length ? { nebulas: nebulaClouds(world) } : {}),
  };
}

export { battlefieldViewFor, encodeBattlefieldMask, decodeBattlefieldMask } from './battlefield.js';
export type {
  BattlefieldView, BattlefieldMask, BattlefieldPublicPlayer, BattlefieldPublicSquad, BattlefieldOwnSquad,
} from './battlefield.js';
export type { CampaignPhase, CampaignPhaseView, CampaignSectorResult, CampaignResult } from './campaign.js';
