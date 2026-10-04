import { cloneWorld, createMatchWorld, grantAugment, runTrainingRival, stepWorld, type AiMemory, type PlayerId, type TrainingMapId, type DurationMode, type World } from '../index.js';
import { AUGMENTS_BY_ID } from './catalog.js';
import { DURATION_MODES } from '../match-modes.js';
export interface BalanceOutcome { winner: PlayerId | null; augmented: PlayerId; ticks: number; ships: number; nodes: number[] }
interface Checkpoint {world:World;memories:Record<PlayerId,ReadonlyMap<string,AiMemory>>}
const checkpoints=new Map<string,Checkpoint>();
function checkpoint(seed:number,map:TrainingMapId,mode:DurationMode,at:number):Checkpoint {
  const key=`${seed}:${map}:${mode}:${at}`;const cached=checkpoints.get(key);if(cached)return cached;
  let world=createMatchWorld(map,mode,seed);
  // Account bookkeeping cannot affect combat; omit it from this benchmark.
  world.matchRecord=undefined;
  world.augmentMatch!.started=true;
  for(const player of ['p1','p2'] as const){world.augmentMatch!.players[player].offer=null;world.augmentMatch!.players[player].nextChoice=3;}
  const memories:Record<PlayerId,ReadonlyMap<string,AiMemory>>={p1:new Map(),p2:new Map()};
  while(world.tick<at){
    if(world.tick%world.rules.tickRate===0)for(const player of ['p1','p2'] as const){const turn=runTrainingRival(world,memories[player],'medium',player);world=turn.world;memories[player]=turn.memories;}
    world=stepWorld(world);
    world.squads=world.squads.filter(s=>s.hp>0);
  }
  const state={world,memories};
  if(checkpoints.size>=4)checkpoints.delete(checkpoints.keys().next().value!);
  checkpoints.set(key,state);return state;
}
/** Uses the production simulator and rival brains; no substitute combat model or synthetic win RNG. */
export function simulateAugmentMatch(seed: number, map: TrainingMapId, mode: DurationMode, id: string | null, augmented: PlayerId): BalanceOutcome {
  const tier=id?AUGMENTS_BY_ID.get(id)!.tier:'silver';
  const chooseAt=DURATION_MODES[mode].choices[tier==='silver'?0:tier==='gold'?1:2];
  // Both sides of a paired seed share the identical unaugmented opening. Reuse
  // that real simulated prefix and clone it before branching; outcomes remain
  // fully determined by production simulation, not a proxy model.
  const opening=checkpoint(seed,map,mode,chooseAt);
  let world=cloneWorld(opening.world),memories={...opening.memories};
  let granted=false;
  // Sudden death uses the live rules, with the server's 45-minute safety limit.
  const limit=27000;
  while(world.winner===null && world.tick<limit){
    if(id && !granted && world.tick>=chooseAt){grantAugment(world,augmented,id);granted=true;}
    // Refresh each brain at exactly the same cadence as the live training room.
    if(world.tick%world.rules.tickRate===0)for(const player of ['p1','p2'] as const){const turn=runTrainingRival(world,memories[player],'medium',player);world=turn.world;memories[player]=turn.memories;}
    world=stepWorld(world);
    world.squads=world.squads.filter(s=>s.hp>0);
  }
  return {winner:world.winner,augmented,ticks:world.tick,ships:world.squads.filter(s=>s.hp>0).length,nodes:['p1','p2'].map(p=>world.nodes.filter(n=>n.ownerId===p).length)};
}
