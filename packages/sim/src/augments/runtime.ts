import { canSee, cloneWorld, createSquad, type PlayerId, type UnitKind, type World } from '../index.js';
import { launchCell } from '../economia.js';
import { statsFor } from '../stats.js';
import { DURATION_MODES } from '../match-modes.js';
import { AUGMENT_CATALOG, AUGMENTS_BY_ID, INITIAL_AUGMENTS, type AugmentTier } from './catalog.js';
import { effectsFor, statsForUnit } from './effects.js';
import { randomFor } from './random.js';
import { knownObjectives, observeKnowledge } from '../inteligencia-enemiga/knowledge.js';
/** `rerollLimit` defaults to 1; a campaign sector raises it for the previous sector winner. */
export interface AugmentOffer { choice: number; tier: AugmentTier; cards: string[]; deadline: number; rerolls: number; rerollLimit?: number }
export interface AugmentPlayer {
  unlocked: string[]; chosen: string[]; offer: AugmentOffer | null; nextChoice: number;
  pickedAt: Record<string, number>; fastBuilds: number; fastFactor: number; captureBounties: number;
  spawnCount: number; pendingSpawns: { kind: UnitKind; decoy?: boolean; lifetime?: number }[];
  chart?: { nodes: { id: string; x: number; y: number }[]; guardians: { id: string; x: number; y: number }[] };
}
export interface AugmentMatch { clock: number; started: boolean; players: Record<PlayerId, AugmentPlayer> }
export function cloneAugmentMatch(match: AugmentMatch | undefined): AugmentMatch | undefined {
  if (!match) return undefined;
  const clone = (state: AugmentPlayer): AugmentPlayer => ({ ...state, chosen: [...state.chosen],
    offer: state.offer ? {...state.offer,cards:[...state.offer.cards]} : null,
    pickedAt: {...state.pickedAt}, pendingSpawns: state.pendingSpawns.map((spawn)=>({...spawn})) });
  return {...match,players:{p1:clone(match.players.p1),p2:clone(match.players.p2)}};
}
const TIERS: AugmentTier[] = ['silver','gold','prismatic'];
const PLAYERS = ['p1','p2'] as const;
/** The opening holds the clock until every player has resolved its pending offer. */
const openingResolved = (match: AugmentMatch) => PLAYERS.every((p) => match.players[p].offer === null && match.players[p].chosen.length > 0);
const OPENING_TICKS = 300;
function hand(world: World, player: PlayerId, choice: number, rerolls: number, previous: string[] = []): string[] {
  const state = world.augmentMatch!.players[player];
  const tags = new Set(state.chosen.flatMap((id) => [...AUGMENTS_BY_ID.get(id)!.tags]));
  const pool = AUGMENT_CATALOG.filter((a) => a.tier === TIERS[choice] && state.unlocked.includes(a.id)
    && !state.chosen.includes(a.id) && !a.tags.some((tag) => tags.has(tag))).map((a) => a.id);
  const unseen = pool.filter((id) => !previous.includes(id));
  const candidates = unseen.length >= 3 ? unseen : pool;
  const rng = randomFor(world.seed ?? 1, player, choice, rerolls, 'offer');
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i+1)); [candidates[i],candidates[j]]=[candidates[j]!,candidates[i]!]; }
  // Initial gold/prismatic pools contain five cards: disjoint three-card rerolls
  // are impossible. Allow overlap, but change all three displayed positions.
  if (previous.length && unseen.length < 3) {
    for (let rotation=0;rotation<candidates.length;rotation++) {
      const next = candidates.slice(0,3);
      if (next.every((id,i) => id !== previous[i])) return next;
      candidates.push(candidates.shift()!);
    }
  }
  return candidates.slice(0,3);
}
function offer(world: World, player: PlayerId, choice: number): void {
  const state = world.augmentMatch!.players[player];
  const cards = hand(world,player,choice,0);
  // A long run can exhaust a tier: with nothing left to deal, that choice is skipped.
  state.offer = cards.length ? { choice, tier: TIERS[choice]!, cards,
    deadline: world.augmentMatch!.clock + (choice === 0 ? OPENING_TICKS : 200), rerolls: 0 } : null;
  state.nextChoice = choice + 1;
}
export function initializeAugments(world: World, pools: Partial<Record<PlayerId, readonly string[]>> = {}): void {
  const state = (player: PlayerId): AugmentPlayer => ({ unlocked: [...(pools[player] ?? INITIAL_AUGMENTS)], chosen: [], offer: null,
    nextChoice: 0, pickedAt: {}, fastBuilds: 0, fastFactor: 1, captureBounties: 0, spawnCount: 0, pendingSpawns: [] });
  world.augmentMatch = { clock: 0, started: false, players: { p1: state('p1'), p2: state('p2') } };
  for (const player of PLAYERS) offer(world,player,0);
}
/** In-place trusted hook; public requests use pickAugment's clone-and-validate path. */
export function grantAugment(world: World, player: PlayerId, id: string): void {
  const card = AUGMENTS_BY_ID.get(id);
  if (!card || world.players[player].augments?.includes(id)) return;
  const before = new Map(world.squads.filter((s) => s.ownerId === player).map((s) => [s.id,statsForUnit(world,s).maxHp]));
  const state = world.augmentMatch?.players[player];
  world.players[player].augments = [...(world.players[player].augments ?? []),id];
  if (state) { state.chosen.push(id); state.pickedAt[id] = world.tick; }
  for (const effect of card.effects) {
    switch (effect.hook) {
      case 'stat': world.players[player].statModifiers = [...(world.players[player].statModifiers ?? []), effect]; break;
      case 'pick-metal': world.players[player].metal += effect.amount; break;
      case 'next-builds': if (state) { state.fastBuilds += effect.count; state.fastFactor = effect.factor; } break;
      case 'capture-bounty': if (state) state.captureBounties += effect.count; break;
      case 'spawn': if (state) state.pendingSpawns.push({kind:effect.kind,decoy:effect.decoy,lifetime:effect.lifetime}); break;
      case 'cartography': if (state) state.chart={nodes:world.nodes.map(({id,x,y})=>({id,x,y})),guardians:world.guardians.map(({id,x,y})=>({id,x,y}))}; break;
    }
  }
  for (const unit of world.squads.filter((s) => s.ownerId === player && s.hp > 0)) {
    const maxHp = statsForUnit(world,unit).maxHp;
    unit.hp = Math.max(Number.EPSILON, Math.min(maxHp, unit.hp * maxHp / before.get(unit.id)!));
    unit.maxHp = maxHp; unit.damage = statsForUnit(world,unit).damage;
  }
  spawnPending(world,player);
  observeKnowledge(world);
}
export type AugmentResult = { accepted: true; world: World } | { accepted: false; reason: string; world: World };
/** Account pools are supplied by trusted admission, before that player chooses. */
export function setAugmentPool(world:World,player:PlayerId,pool:readonly string[]):void {
  const state=world.augmentMatch?.players[player];
  if(!state || state.chosen.length || world.tick!==0)return;
  state.unlocked=[...pool];offer(world,player,0);
}
/** Trusted admission hook for a run of sectors: augments won in earlier sectors are owned again, then a fresh hand is dealt. */
export function carryAugments(world:World,player:PlayerId,ids:readonly string[]):void {
  const state=world.augmentMatch?.players[player];
  if(!state || state.chosen.length || world.tick!==0)return;
  for(const id of ids) if(state.unlocked.includes(id)) grantAugment(world,player,id);
  offer(world,player,0);
}
function validOffer(world: World, player: PlayerId, choice: unknown): AugmentOffer | null {
  const match = world.augmentMatch;
  const offered = match?.players[player]?.offer;
  return world.winner === null && offered && offered.choice === choice && match!.clock < offered.deadline ? offered : null;
}
export function pickAugment(world: World, player: PlayerId, choice: unknown, id: unknown): AugmentResult {
  const current = validOffer(world,player,choice);
  if (!current || typeof id !== 'string' || !current.cards.includes(id)) return {accepted:false,reason:'invalid_augment_pick',world};
  const next = cloneWorld(world); grantAugment(next,player,id); next.augmentMatch!.players[player].offer=null;
  if (openingResolved(next.augmentMatch!)) next.augmentMatch!.started=true;
  return {accepted:true,world:next};
}
export function rerollAugments(world: World, player: PlayerId, choice: unknown): AugmentResult {
  const current = validOffer(world,player,choice);
  if (!current || current.rerolls >= (current.rerollLimit ?? 1)) return {accepted:false,reason:'augment_reroll_used_or_expired',world};
  const next=cloneWorld(world); const offered=next.augmentMatch!.players[player].offer!;
  offered.rerolls=current.rerolls+1; offered.cards=hand(next,player,offered.choice,offered.rerolls,current.cards);
  return {accepted:true,world:next};
}
/** Returns true while the opening selection still holds the match clock. */
export function advanceAugmentClock(world: World): boolean {
  const match=world.augmentMatch;
  if (!match) return false;
  match.clock++;
  for (const player of PLAYERS) {
    const current=match.players[player].offer;
    if (current && match.clock >= current.deadline) {
      const rng=randomFor(world.seed ?? 1,player,current.choice,current.rerolls,'timeout');
      grantAugment(world,player,current.cards[Math.floor(rng()*current.cards.length)]!);
      match.players[player].offer=null;
    }
  }
  if (!match.started && openingResolved(match)) match.started=true;
  return !match.started;
}
export interface CampaignSectorAugments {
  /** 0, 1 or 2: silver, gold or prismatic, the one offer this sector makes. */
  choice: number;
  /** Picks from earlier sectors, applied again in order before the new offer. */
  carried: Record<PlayerId, readonly string[]>;
  pools?: Partial<Record<PlayerId, readonly string[]>>;
  /** The previous sector winner gets one more reroll. */
  extraRerolls?: Partial<Record<PlayerId, number>>;
}
/**
 * Campaign sectors: each one is a fresh match where the carried picks apply again and a single
 * offer of the sector's tier holds the clock, like a match opening. No other offer follows.
 */
export function prepareCampaignSector(world: World, sector: CampaignSectorAugments): void {
  initializeAugments(world, sector.pools ?? {});
  const match = world.augmentMatch!;
  for (const player of PLAYERS) {
    for (const id of sector.carried[player]) grantAugment(world, player, id);
    offer(world, player, sector.choice);
    const state = match.players[player];
    state.nextChoice = TIERS.length;
    if (!state.offer) continue;
    state.offer = { ...state.offer, deadline: match.clock + OPENING_TICKS, rerollLimit: 1 + (sector.extraRerolls?.[player] ?? 0) };
  }
  match.started = false;
}
export function scheduleAugments(world: World): void {
  if (!world.augmentMatch || !world.duration) return;
  for (const player of PLAYERS) {
    const choice=world.augmentMatch.players[player].nextChoice;
    if (choice < 3 && world.tick >= DURATION_MODES[world.duration].choices[choice]!) offer(world,player,choice);
  }
}
export function chooseAiAugment(world: World, player: PlayerId, difficulty: 'easy'|'medium'|'hard'): World {
  const offered=world.augmentMatch?.players[player].offer;
  if (!offered) return world;
  const rng=randomFor(world.seed ?? 1,player,offered.choice,'ai');
  const weights=offered.cards.map((id) => {
    const card=AUGMENTS_BY_ID.get(id)!;
    let weight=card.weight;
    if (difficulty === 'hard') {
      const theirs=world.squads.filter((s) => s.ownerId !== player && s.hp > 0 && canSee(world,player,s));
      const interceptorMajority=theirs.filter((s) => s.kind === 'interceptor').length > theirs.length / 2;
      const known=knownObjectives(world,player);
      const behind=known.filter((n) => n.ownerId === player).length < known.filter((n) => n.ownerId !== null && n.ownerId !== player).length;
      if (interceptorMajority && card.effects.some((e) => 'kind' in e && e.kind === 'frigate')) weight += 4;
      if (behind && card.effects.some((e) => ['node-income','pick-metal','capture-bounty'].includes(e.hook))) weight += 4;
    } else if (difficulty === 'medium') weight += card.effects.some((e) => ['stat','node-income'].includes(e.hook)) ? 1 : 0;
    return difficulty === 'easy' ? 1 : weight;
  });
  let point=rng()*weights.reduce((s,w)=>s+w,0), selected=offered.cards[0]!;
  for (let i=0;i<weights.length;i++) { point-=weights[i]!; if (point<0) { selected=offered.cards[i]!;break; } }
  const result=pickAugment(world,player,offered.choice,selected); return result.world;
}
export function spawnPending(world: World, player: PlayerId): void {
  const state=world.augmentMatch?.players[player]; if (!state) return;
  while (state.pendingSpawns.length) {
    const spawn=state.pendingSpawns[0]!;
    const cell=launchCell(world.players[player].base,world.width,world.height,
      (p) => !world.surface || world.surface.walkable[p.y*world.width+p.x] === true,
      (p) => [...world.squads,...world.guardians].some((u)=>u.hp>0 && ((u.x===p.x&&u.y===p.y)
        || (u.transit && u.transit.untilTick>world.tick && u.transit.from.x===p.x&&u.transit.from.y===p.y))), 1);
    if (!cell) break;
    const unit=createSquad(`${player}-augment-${++state.spawnCount}`,player,spawn.kind,cell,world);
    if (spawn.decoy) { unit.isDecoy=true;unit.hp=unit.maxHp=30;unit.damage=0;unit.expiresAt=world.tick+(spawn.lifetime ?? 600); }
    world.squads.push(unit);state.pendingSpawns.shift();
  }
}
/** Per-tick hooks: production, repair, recurring spawns and official kill/loss rewards. */
export function runAugmentEffects(world: World): void {
  if (!world.augmentMatch) return;
  for (const player of PLAYERS) {
    const effects=effectsFor(world,player), state=world.augmentMatch.players[player];
    for (const effect of effects) {
      if (effect.hook==='spawn' && effect.interval>0) {
        const id=world.players[player].augments!.find((id)=>AUGMENTS_BY_ID.get(id)!.effects.includes(effect))!;
        const elapsed=world.tick-state.pickedAt[id]!;
        if (elapsed>0 && elapsed%effect.interval===0) state.pendingSpawns.push({kind:effect.kind,decoy:effect.decoy,lifetime:effect.lifetime});
      }
      if (effect.hook==='field-repair' && world.tick%world.rules.tickRate===0) for (const unit of world.squads) {
        if (unit.ownerId===player && unit.hp>0 && world.tick-Math.max(unit.lastAttackTick??0,unit.lastDamageTick??0)>=effect.idleTicks)
          unit.hp=Math.min(unit.maxHp,unit.hp+effect.rate);
      }
      if (effect.hook==='veteran') for (const unit of world.squads) if (unit.ownerId===player && !unit.veteran && (unit.kills??0)>=effect.kills) {
        unit.veteran=true;unit.maxHp+=effect.hp;if(unit.hp>0) unit.hp=Math.min(unit.maxHp,unit.hp+effect.hp);unit.damage+=effect.damage;
      }
      for (const event of world.events ?? []) {
        if (effect.hook==='kill-income' && event.attackerOwner===player) world.players[player].metal+=Math.floor(event.cost*effect.factor);
        if (effect.hook==='loss-income' && event.victimOwner===player) world.players[player].metal+=event.cost*effect.factor;
      }
    }
    spawnPending(world,player);
  }
  for (const unit of world.squads) if (unit.expiresAt !== undefined && unit.expiresAt<=world.tick) unit.hp=0;
}
