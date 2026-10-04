import { describe, expect, it } from 'vitest';
import { createMatchWorld, grantAugment, INITIAL_AUGMENTS, initializeAugments, pickAugment, rerollAugments, stepWorld, type World } from '../index.js';
const choose=(world:World,player:'p1'|'p2')=>{const offer=world.augmentMatch!.players[player].offer!;return pickAugment(world,player,offer.choice,offer.cards[0]).world;};
describe('augment choices',()=>{
  it('has deterministic, distinct private hands drawn from each player pool',()=>{
    const a=createMatchWorld('sector-01','skirmish',42),b=createMatchWorld('sector-01','skirmish',42);
    expect(a.augmentMatch).toEqual(b.augmentMatch);
    expect(a.augmentMatch!.players.p1.offer!.cards).toHaveLength(3);
    expect(new Set(a.augmentMatch!.players.p1.offer!.cards).size).toBe(3);
    expect(a.augmentMatch!.players.p1.offer!.cards.every((id)=>INITIAL_AUGMENTS.includes(id))).toBe(true);
    initializeAugments(a,{p1:['s-reservas','s-optica','s-mamparos']});
    expect(a.augmentMatch!.players.p1.offer!.cards.sort()).toEqual(['s-mamparos','s-optica','s-reservas']);
    expect(a.augmentMatch!.players.p2.unlocked).not.toContain('s-mamparos');
  });
  it('holds game income and tick until both players choose, with a 30-second upper bound',()=>{
    let world=createMatchWorld(); const metal=world.players.p1.metal;
    for(let i=0;i<299;i++) world=stepWorld(world);
    expect(world.tick).toBe(0);expect(world.players.p1.metal).toBe(metal);
    world=stepWorld(world);expect(world.augmentMatch!.started).toBe(true);
    expect(world.augmentMatch!.players.p1.chosen).toHaveLength(1);expect(world.augmentMatch!.players.p2.chosen).toHaveLength(1);
    expect(JSON.stringify(world)).toBe(JSON.stringify((()=>{let w=createMatchWorld();for(let i=0;i<300;i++)w=stepWorld(w);return w;})()));
  });
  it.each(['complete','skirmish'] as const)('offers each tier on its %s schedule without pausing midway',mode=>{
    let world=createMatchWorld('sector-01',mode,1);world=choose(choose(world,'p1'),'p2');
    const at=mode==='complete'?3000:1200;world.tick=at-1;
    world=stepWorld(world);expect(world.augmentMatch!.players.p1.offer?.tier).toBe('gold');expect(world.tick).toBe(at);
    for(let i=0;i<200;i++)world=stepWorld(world);
    expect(world.tick).toBe(at+200);expect(world.augmentMatch!.players.p1.chosen).toHaveLength(2);
    world.tick=at*2-1;world=stepWorld(world);expect(world.augmentMatch!.players.p1.offer?.tier).toBe('prismatic');
  });
  it('validates identity, offer number, deadline and one reroll, never spending Metal',()=>{
    const world=createMatchWorld('espiral','skirmish',12),old=world.augmentMatch!.players.p1.offer!,metal=world.players.p1.metal;
    expect(pickAugment(world,'p1',0,'p-todo').accepted).toBe(false);
    expect(pickAugment(world,'p1',1,old.cards[0]).accepted).toBe(false);
    const next=rerollAugments(world,'p1',0).world,hand=next.augmentMatch!.players.p1.offer!;
    expect(hand.cards).not.toEqual(old.cards);expect(hand.cards.every((id)=>!old.cards.includes(id))).toBe(true);
    expect(next.players.p1.metal).toBe(metal);expect(rerollAugments(next,'p1',0).accepted).toBe(false);
    expect(pickAugment(next,'p1',0,old.cards[0]).accepted).toBe(false);
    const accepted=pickAugment(next,'p1',0,hand.cards[0]);expect(accepted.accepted).toBe(true);
    expect(pickAugment(accepted.world,'p1',0,hand.cards[0]).accepted).toBe(false);
    next.augmentMatch!.clock=hand.deadline;expect(pickAugment(next,'p1',0,hand.cards[0]).accepted).toBe(false);
  });
  it('excludes already owned cards and incompatible exclusive tags',()=>{
    let world=createMatchWorld();world=choose(choose(world,'p1'),'p2');
    grantAugment(world,'p1','g-serie');grantAugment(world,'p1','p-asalto');
    world.tick=2399;world=stepWorld(world);
    expect(world.augmentMatch!.players.p1.offer!.cards).not.toContain('p-enjambre');
    expect(world.augmentMatch!.players.p1.offer!.cards).not.toContain('p-asalto');
    expect(world.augmentMatch!.players.p1.offer!.cards).toHaveLength(3);
  });
});
