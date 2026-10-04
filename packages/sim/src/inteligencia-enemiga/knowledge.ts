import { distance, type PlayerId, type Position, type ResourceNode, type World } from '../index.js';
import { visionSources } from '../augments/effects.js';
import { findPath } from '../maps/pathfinding.js';
export interface AiKnowledge { seen:Uint8Array; nodes:ResourceNode[] }
const observationKeys=new WeakMap<AiKnowledge,string>();
export function emptyKnowledge(world:World):Record<PlayerId,AiKnowledge> {
  const player=():AiKnowledge=>({seen:new Uint8Array(world.width*world.height),nodes:[]});
  return {p1:player(),p2:player()};
}
/** Snapshots of discovered objectives only; unseen ownership is never refreshed. */
export function observeKnowledge(world:World):void {
  if(!world.knowledge)return;
  const next:Record<PlayerId,AiKnowledge>={...world.knowledge};
  for(const p of ['p1','p2'] as const) {
    const old:AiKnowledge=world.knowledge[p],sources=visionSources(world,p);
    const key=`${world.width}:${world.height}|${sources.map(s=>`${s.position.x},${s.position.y},${s.radius}`).join(';')}|${world.nodes.map(n=>`${n.id}:${n.ownerId}:${n.x},${n.y}`).join(';')}|${world.augmentMatch?.players[p].chart?.nodes.map(n=>n.id).join(',')??''}`;
    if(observationKeys.get(old)===key){next[p]=old;continue;}
    let seen=old.seen;
    const nodes:ResourceNode[]=old.nodes.map(n=>({...n,progress:{...n.progress}}));
    const visible=(at:Position)=>sources.some(s=>distance(s.position,at)<=s.radius);
    for(const source of sources)for(let dy=-source.radius;dy<=source.radius;dy++)for(let dx=-source.radius;dx<=source.radius;dx++) {
      const x=source.position.x+dx,y=source.position.y+dy;
      if(x>=0&&y>=0&&x<world.width&&y<world.height&&Math.abs(dx)+Math.abs(dy)<=source.radius&&!seen[y*world.width+x]) {
        if(seen===old.seen)seen=old.seen.slice();seen[y*world.width+x]=1;
      }
    }
    for(const node of world.nodes)if(visible(node)||node.ownerId===p){
      const snapshot={...node,progress:{p1:0,p2:0}},index=nodes.findIndex(n=>n.id===node.id);
      if(index<0)nodes.push(snapshot);else nodes[index]=snapshot;
    }
    for(const marker of world.augmentMatch?.players[p].chart?.nodes ?? [])if(!nodes.some(n=>n.id===marker.id)) {
      // Position and node kind are static map data; ownership remains unknown.
      const source=world.nodes.find(n=>n.id===marker.id)!;
      nodes.push({...marker,kind:source.kind,guardianId:source.guardianId,ownerId:null,progress:{p1:0,p2:0}});
    }
    next[p]={seen,nodes};
    observationKeys.set(next[p],key);
  }
  world.knowledge=next;
}
export function knownObjectives(world:World,p:PlayerId):ResourceNode[] {
  return world.knowledge?.[p].nodes ?? world.nodes;
}
const explorationCache=new WeakMap<Uint8Array,Map<string,Position>>();
export function explorationGoal(world:World,p:PlayerId,from:Position):Position {
  const known=world.knowledge?.[p];if(!known)return world.core;
  let cache=explorationCache.get(known.seen);if(!cache){cache=new Map();explorationCache.set(known.seen,cache);}
  const key=`${p}:${from.x},${from.y}`;const cached=cache.get(key);if(cached)return {...cached};
  const candidates:Position[]=[];
  for(let y=1;y<world.height;y+=3)for(let x=1;x<world.width;x+=3)
    if(!known.seen[y*world.width+x]&&(!world.surface||world.surface.walkable[y*world.width+x]))candidates.push({x,y});
  candidates.sort((a,b)=>distance(a,from)-distance(b,from)|| (p==='p1'?a.y-b.y||a.x-b.x:b.y-a.y||b.x-a.x));
  const goal=candidates.find(point=>!world.surface||findPath(world.surface,from,point).status==='found') ?? world.core;
  cache.set(key,{x:goal.x,y:goal.y});return goal;
}
