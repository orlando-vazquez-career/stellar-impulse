import { describe, expect, it } from 'vitest';
import { applyCommand, createMatchWorld, pickAugment, prepareCampaignSector, rerollAugments, stepWorld, type World } from '../index.js';
type Carried={p1:string[];p2:string[]};
const pick=(world:World,player:'p1'|'p2')=>{const offer=world.augmentMatch!.players[player].offer!;return pickAugment(world,player,offer.choice,offer.cards[0]).world;};
const sector=(choice:number,carried:Carried={p1:[],p2:[]},extraRerolls:Partial<Record<'p1'|'p2',number>>={})=>{
  const world=createMatchWorld('sector-01','skirmish',7);prepareCampaignSector(world,{choice,carried,extraRerolls});return world;
};
describe('campaign sector augments',()=>{
  it.each([[0,'silver'],[1,'gold'],[2,'prismatic']] as const)('sector choice %i opens with one %s offer for each player',(choice,tier)=>{
    const world=sector(choice);
    expect(world.augmentMatch!.players.p1.offer!.tier).toBe(tier);
    expect(world.augmentMatch!.players.p2.offer!.tier).toBe(tier);
    expect(world.augmentMatch!.players.p1.offer!.cards).toHaveLength(3);
  });
  it('applies the carried picks again, one-shot bonuses included',()=>{
    const world=sector(1,{p1:['s-optica','s-reservas'],p2:['s-blindaje']});
    expect(world.players.p1.augments).toEqual(['s-optica','s-reservas']);
    expect(world.players.p2.augments).toEqual(['s-blindaje']);
    // "Reservas de emergencia" gives 8 Metal when picked: each sector starts with that bonus again.
    expect(world.players.p1.metal).toBe(createMatchWorld('sector-01','skirmish',7).players.p1.metal+8);
  });
  it('holds the clock and every order until both players pick, even with carried picks',()=>{
    let world=sector(2,{p1:['s-optica'],p2:['s-blindaje']});
    expect(world.augmentMatch!.started).toBe(false);
    expect(applyCommand(world,'p1',{seq:1,type:'move',squadId:'p1-interceptor',x:3,y:3})).toMatchObject({accepted:false,reason:'opening_selection'});
    world=stepWorld(world);expect(world.tick).toBe(0);
    world=pick(pick(world,'p1'),'p2');
    expect(world.augmentMatch!.started).toBe(true);
    world=stepWorld(world);expect(world.tick).toBe(1);
  });
  it('assigns a card when a sector offer is not answered within 30 seconds',()=>{
    let world=sector(1,{p1:['s-optica'],p2:['s-blindaje']});
    for(let i=0;i<299;i++)world=stepWorld(world);
    expect(world.tick).toBe(0);expect(world.augmentMatch!.players.p1.chosen).toHaveLength(1);
    world=stepWorld(world);
    expect(world.augmentMatch!.started).toBe(true);
    expect(world.augmentMatch!.players.p1.chosen).toHaveLength(2);
    expect(world.augmentMatch!.players.p2.chosen).toHaveLength(2);
  });
  it('never offers a second card inside a campaign sector',()=>{
    let world=pick(pick(sector(0),'p1'),'p2');
    // Skirmish matches offer gold at 1200 ticks and prismatic at 2400; a campaign sector does not.
    world.tick=1199;world=stepWorld(world);
    expect(world.augmentMatch!.players.p1.offer).toBeNull();
    world.tick=2399;world=stepWorld(world);
    expect(world.augmentMatch!.players.p2.offer).toBeNull();
  });
  it('gives the previous sector winner one extra reroll',()=>{
    const world=sector(1,{p1:[],p2:[]},{p1:1});
    const once=rerollAugments(world,'p1',1);expect(once.accepted).toBe(true);
    const twice=rerollAugments(once.world,'p1',1);expect(twice.accepted).toBe(true);
    expect(twice.world.augmentMatch!.players.p1.offer!.cards).not.toEqual(once.world.augmentMatch!.players.p1.offer!.cards);
    expect(rerollAugments(twice.world,'p1',1).accepted).toBe(false);
    const rival=rerollAugments(world,'p2',1);expect(rival.accepted).toBe(true);
    expect(rerollAugments(rival.world,'p2',1).accepted).toBe(false);
  });
});
