import { expect,it } from 'vitest';
import {cloneWorld,createMatchWorld,grantAugment,runTrainingRival,stepWorld,type AiMemory,type PlayerId,type World} from '../index.js';
it.each(['sector-01','espiral'] as const)('headless corpse cleanup preserves the official simulation on %s',map=>{
  let full=createMatchWorld(map,'skirmish',42);
  full.augmentMatch!.started=true;
  for(const p of ['p1','p2'] as const){full.augmentMatch!.players[p].offer=null;full.augmentMatch!.players[p].nextChoice=3;}
  grantAugment(full,'p1','g-chatarra');grantAugment(full,'p2','p-reciclaje');
  let cleaned=cloneWorld(full);
  const memories=()=>({p1:new Map<string,AiMemory>(),p2:new Map<string,AiMemory>()});
  const fm=memories(),cm=memories();
  function think(w:World,m:Record<PlayerId,ReadonlyMap<string,AiMemory>>){
    for(const p of ['p1','p2'] as const){const turn=runTrainingRival(w,m[p],'medium',p);w=turn.world;m[p]=turn.memories;}
    return w;
  }
  for(let i=0;i<1000;i++){
    if(i%10===0){full=think(full,fm);cleaned=think(cleaned,cm);}
    full=stepWorld(full);cleaned=stepWorld(cleaned);cleaned.squads=cleaned.squads.filter(s=>s.hp>0);
    if(i%100===99){
      expect(cleaned.squads).toEqual(full.squads.filter(s=>s.hp>0));
      for(const key of ['players','core','nodes','winner','built','production','events','knowledge'] as const)expect(cleaned[key]).toEqual(full[key]);
    }
  }
},15000);
