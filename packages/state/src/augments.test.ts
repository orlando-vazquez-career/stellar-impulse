import {expect,it} from 'vitest';
import {createMatchWorld,grantAugment,initializeAugments,pickAugment,createSquad} from '@impulso/sim';
import {viewFor} from './index';
it('keeps seeds, enemy offers and account pools private but reveals chosen augments',()=>{
  let w=createMatchWorld('sector-01','skirmish',12345);
  initializeAugments(w,{p1:['s-reservas','s-cartografia','s-mamparos']});
  const v=viewFor(w,'p2'),serialized=JSON.stringify(v);
  expect(serialized).not.toContain('12345');expect(serialized).not.toContain('unlocked');expect(serialized).not.toContain('s-mamparos');
  w=pickAugment(w,'p1',0,'s-mamparos').world;
  expect(viewFor(w,'p2').augments!.rival[0]!.id).toBe('s-mamparos');
  v.augments!.offer!.cards[0]!.text.es.name='changed';
  expect(viewFor(w,'p2').augments!.offer!.cards[0]!.text.es.name).not.toBe('changed');
});
it('cartography markers are frozen snapshots and do not grant live visibility',()=>{
  const w=createMatchWorld();grantAugment(w,'p1','s-cartografia');
  const marker={...viewFor(w,'p1').chart!.guardians[0]!};
  w.guardians[0]!.x++;
  expect(viewFor(w,'p1').chart!.guardians[0]).toEqual(marker);
  expect(viewFor(w,'p2').chart).toBeUndefined();
});
it('new camouflaged ships must wait three seconds and decoys are not identified to the opponent',()=>{
  const w=createMatchWorld('sector-01');w.tick=1000;grantAugment(w,'p2','p-camuflaje');
  const position=w.players.p1.base;
  w.squads.push(createSquad('new','p2','interceptor',position,w));
  expect(viewFor(w,'p1').squads.some(s=>s.id==='new')).toBe(true);
  w.tick+=30;expect(viewFor(w,'p1').squads.some(s=>s.id==='new')).toBe(false);
  grantAugment(w,'p2','g-senuelos');const decoy=w.squads.find(s=>s.isDecoy)!;Object.assign(decoy,position);decoy.lastMovedTick=w.tick;
  const visible=viewFor(w,'p1').squads.find(s=>s.id===decoy.id)!;
  expect(visible.kind).toBe('bomber');expect(visible.isDecoy).toBeUndefined();
  expect(visible.damage).toBe(36);expect(visible.stats!.range).toBe(4);expect(visible.maxHp).toBe(120);
  expect(viewFor(w,'p2').squads.find(s=>s.id===decoy.id)!.maxHp).toBe(30);
});
it('reports authoritative passive income and the modified core capture progress',()=>{
  const w=createMatchWorld('sector-01');w.nodes.forEach(n=>n.ownerId='p1');
  grantAugment(w,'p1','p-guerra');grantAugment(w,'p1','g-mineria');
  const expected=2*(w.nodes.filter(n=>n.kind==='metal').length+w.nodes.length/4);
  expect(viewFor(w,'p1').metalRate).toBe(expected);
  expect(viewFor(w,'p2').metalRate).toBe(.5);
  const sprint=createMatchWorld('sector-01');grantAugment(sprint,'p1','p-relampago');sprint.core.progress.p1=135;
  expect(viewFor(sprint,'p1').coreFraction).toBe(.5);
});
