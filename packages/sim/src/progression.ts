import { AUGMENT_CATALOG, INITIAL_AUGMENTS, type ChallengeId } from './augments/catalog.js';
import { effectiveFleetCap } from './augments/effects.js';
import type { PlayerId, RivalDifficulty, World } from './index.js';

export const CHALLENGES: readonly {id:ChallengeId;name:{es:string;en:string};target:number;condition:{es:string;en:string}}[] = [
  {id:'double-impact',name:{es:'Doble impacto',en:'Double impact'},target:2,condition:{es:'Destruye 2 naves con un disparo de Bombardero.',en:'Destroy 2 ships with one Bomber shot.'}},
  {id:'elite-veteran',name:{es:'Veterano de élite',en:'Elite veteran'},target:1,condition:{es:'Gana contra la IA Difícil.',en:'Beat Hard AI.'}},
  {id:'steel-wall',name:{es:'Muro de acero',en:'Steel wall'},target:1,condition:{es:'Gana con 3 Fragatas y 2 Bombarderos vivos.',en:'Win with 3 Frigates and 2 Bombers alive.'}},
  {id:'ace',name:{es:'As',en:'Ace'},target:5,condition:{es:'Destruye 5 naves con una sola nave.',en:'Destroy 5 ships with a single ship.'}},
  {id:'untouchable',name:{es:'Intocable',en:'Untouchable'},target:1,condition:{es:'Gana sin perder naves de combate.',en:'Win without losing combat ships.'}},
  {id:'scrapper',name:{es:'Chatarrero',en:'Scrapper'},target:15,condition:{es:'Destruye 15 naves enemigas en una partida.',en:'Destroy 15 enemy ships in one match.'}},
  {id:'full-armada',name:{es:'Armada completa',en:'Full armada'},target:1,condition:{es:'Llena tu límite actual de flota.',en:'Fill your current fleet limit.'}},
];
export interface MatchPlayerRecord { nodes:number; kills:number; combatLosses:number; killsByShip:Record<string,number>; bestSplash:number; fullFleet:boolean }
export interface MatchRecord { players:Record<PlayerId,MatchPlayerRecord> }
export function emptyMatchRecord():MatchRecord {
  const player=():MatchPlayerRecord=>({nodes:0,kills:0,combatLosses:0,killsByShip:{},bestSplash:0,fullFleet:false});
  return {players:{p1:player(),p2:player()}};
}
export function cloneMatchRecord(record:MatchRecord|undefined):MatchRecord|undefined {
  if(!record)return undefined;
  const clone=(p:MatchPlayerRecord)=>({...p,killsByShip:{...p.killsByShip}});
  return {players:{p1:clone(record.players.p1),p2:clone(record.players.p2)}};
}
/** Observe only authoritative capture ownership and destruction events from this tick. */
export function recordMatchTick(world:World,previous:World):void {
  const record=world.matchRecord;if(!record)return;
  const shots=new Map<string,{player:PlayerId;count:number}>();
  for(const node of world.nodes) if(node.ownerId && previous.nodes.find(n=>n.id===node.id)?.ownerId!==node.ownerId) record.players[node.ownerId].nodes++;
  for(const event of world.events ?? []) {
    if(event.kind!=='explorer')record.players[event.victimOwner].combatLosses++;
    if(!event.attackerOwner || event.attackerOwner===event.victimOwner)continue;
    const p=record.players[event.attackerOwner];p.kills++;
    const attacker=world.squads.find(s=>s.id===event.attackerId);
    if(attacker){p.killsByShip[event.attackerId]=(p.killsByShip[event.attackerId]??0)+1;}
    if(attacker?.kind==='bomber') {
      const shot=shots.get(event.shot) ?? {player:event.attackerOwner,count:0};shot.count++;shots.set(event.shot,shot);
    }
  }
  for(const shot of shots.values())record.players[shot.player].bestSplash=Math.max(record.players[shot.player].bestSplash,shot.count);
  for(const p of ['p1','p2'] as const) if(world.squads.filter(s=>s.ownerId===p&&s.hp>0&&!s.isDecoy).length>=effectiveFleetCap(world,p))record.players[p].fullFleet=true;
}
export interface AccountProgress { xp:number; completed:ChallengeId[]; best:Partial<Record<ChallengeId,number>>; awards:Record<string,MatchReward> }
export interface ProgressProfile { xp:number;level:number;levelXp:number;nextLevelXp:number;completed:ChallengeId[];best:Partial<Record<ChallengeId,number>>;unlocked:string[] }
export interface MatchReward { xpGained:number;beforeXp:number;profile:ProgressProfile;challenges:ChallengeId[];unlocked:string[];guest?:boolean }
export function emptyProgress():AccountProgress{return {xp:0,completed:[],best:{},awards:{}};}
export function unlockedPool(progress:Pick<AccountProgress,'xp'|'completed'>|null):string[] {
  if(!progress)return [...INITIAL_AUGMENTS];
  const level=1+Math.floor(progress.xp/300);
  return AUGMENT_CATALOG.filter(card=>card.unlock==='initial'||('level' in card.unlock?level>=card.unlock.level:progress.completed.includes(card.unlock.challenge))).map(card=>card.id);
}
export function profileFor(progress:AccountProgress):ProgressProfile {
  return {xp:progress.xp,level:1+Math.floor(progress.xp/300),levelXp:progress.xp%300,nextLevelXp:300,completed:[...progress.completed],best:{...progress.best},unlocked:unlockedPool(progress)};
}
export function challengeProgress(world:World,player:PlayerId,difficulty:RivalDifficulty|'pvp'):Partial<Record<ChallengeId,number>> {
  const record=world.matchRecord?.players[player] ?? emptyMatchRecord().players[player];
  const won=world.winner===player, live=world.squads.filter(s=>s.ownerId===player&&s.hp>0&&!s.isDecoy);
  return {
    'double-impact':record.bestSplash,'elite-veteran':Number(won&&difficulty==='hard'),
    'steel-wall':Number(won&&live.filter(s=>s.kind==='frigate').length>=3&&live.filter(s=>s.kind==='bomber').length>=2),
    ace:Math.max(0,...Object.values(record.killsByShip)),untouchable:Number(won&&record.combatLosses===0),scrapper:record.kills,'full-armada':Number(record.fullFleet),
  };
}
/** Challenge bonuses are a fixed 50 XP; difficulty/mode scale the match-performance XP. */
export function rewardForMatch(progress:AccountProgress,matchId:string,world:World,player:PlayerId,difficulty:RivalDifficulty|'pvp'):{progress:AccountProgress;reward:MatchReward} {
  if(world.winner===null)throw Error('Match has no official result');
  if(progress.awards[matchId])return {progress,reward:progress.awards[matchId]!};
  const previous=unlockedPool(progress),stats=world.matchRecord?.players[player] ?? emptyMatchRecord().players[player];
  const base=(world.winner===player?100:40)+Math.min(50,stats.nodes*10)+(world.winner===player?25:0);
  const factor=(difficulty==='easy'?0.25:1)*(world.duration==='skirmish'?0.6:1);
  const best={...progress.best},completed=[...progress.completed],challenges:ChallengeId[]=[];
  if(difficulty!=='easy') {
    const current=challengeProgress(world,player,difficulty);
    for(const challenge of CHALLENGES) {
      best[challenge.id]=Math.max(best[challenge.id]??0,Math.min(challenge.target,current[challenge.id]??0));
      if((current[challenge.id]??0)>=challenge.target&&!completed.includes(challenge.id)){completed.push(challenge.id);challenges.push(challenge.id);}
    }
  }
  const xpGained=Math.floor(base*factor)+challenges.length*50;
  const next:AccountProgress={xp:progress.xp+xpGained,completed,best,awards:{...progress.awards}};
  const reward:MatchReward={xpGained,beforeXp:progress.xp,profile:profileFor(next),challenges,unlocked:unlockedPool(next).filter(id=>!previous.includes(id))};
  next.awards[matchId]=reward;
  return {progress:next,reward};
}
