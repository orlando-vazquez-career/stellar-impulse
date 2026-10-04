import {expect,it} from 'vitest';
import {createMatchWorld,grantAugment} from '../index.js';
import {knownObjectives,observeKnowledge} from './knowledge.js';
it('discovers objective coordinates through vision and Cartography without revealing unseen ownership',()=>{
  const world=createMatchWorld('espiral');
  const hidden=world.nodes.find(n=>!knownObjectives(world,'p1').some(k=>k.id===n.id))!;
  expect(hidden).toBeDefined();hidden.ownerId='p2';
  grantAugment(world,'p1','s-cartografia');
  expect(knownObjectives(world,'p1')).toHaveLength(world.nodes.length);
  expect(knownObjectives(world,'p1').find(n=>n.id===hidden.id)?.ownerId).toBeNull();
  Object.assign(world.squads.find(s=>s.ownerId==='p1')!,{x:hidden.x,y:hidden.y});observeKnowledge(world);
  expect(knownObjectives(world,'p1').find(n=>n.id===hidden.id)?.ownerId).toBe('p2');
});
