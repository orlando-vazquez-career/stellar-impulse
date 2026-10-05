import { describe, expect, it } from 'vitest';
import { applyCommand, createSectorWorld, createSquad, createWorld, findTiledPath, stepWorld, type World } from '../index.js';
import { assignArrival } from './orders.js';

function field(): World {
  const world = createWorld();
  world.obstacles = [];
  world.guardians = [];
  world.nodes = [];
  world.surface = { width: 20, height: 20, walkable: Array(400).fill(true), level: Array(400).fill(0), ramp: Array(400).fill(null) };
  world.squads = [createSquad('lead', 'p1', 'interceptor', { x: 3, y: 3 }),
    createSquad('parked', 'p1', 'interceptor', { x: 4, y: 3 })];
  return world;
}

describe('ship traffic', () => {
  it.each(['sector-01', 'espiral'] as const)('two allied ships crossing head-on on %s both arrive', (map) => {
    let world: World = createSectorWorld(map);
    world.guardians = [];
    const route = (findTiledPath(world.surface!, world.players.p1.base, world.core) as { path: { x: number; y: number }[] }).path;
    const [a, b] = world.squads.filter((squad) => squad.ownerId === 'p1');
    const from = route[3]!;
    const to = route[Math.min(route.length - 1, 20)]!;
    Object.assign(a!, from);
    Object.assign(b!, to);
    world = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: a!.id, x: to.x, y: to.y }).world;
    world = applyCommand(world, 'p1', { seq: 2, type: 'move', squadId: b!.id, x: from.x, y: from.y }).world;
    for (let tick = 0; tick < 1500; tick++) world = stepWorld(world);
    expect(world.squads.find((squad) => squad.id === a!.id)).toMatchObject(to);
    expect(world.squads.find((squad) => squad.id === b!.id)).toMatchObject(from);
  });

  it('routes around an allied ship and reaches its destination without sharing cells', () => {
    let world = applyCommand(field(), 'p1', { type: 'move', seq: 1, squadId: 'lead', x: 7, y: 3 }).world;
    let detoured = false;
    for (let tick = 0; tick < 120; tick++) {
      world = stepWorld(world);
      const [lead, parked] = world.squads;
      detoured ||= lead!.y !== 3;
      expect(lead!.x !== parked!.x || lead!.y !== parked!.y).toBe(true);
    }
    expect(detoured).toBe(true);
    expect(world.squads[0]).toMatchObject({ x: 7, y: 3, target: null });
  });

  it('atomically swaps allies in a single-cell corridor only on their shared cadence', () => {
    let world = field();
    world.surface!.walkable = world.surface!.walkable.map((_, index) => Math.floor(index / 20) === 3
      && (index % 20 === 3 || index % 20 === 4));
    world.squads[1]!.kind = 'explorer';
    world = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: 'lead', x: 4, y: 3 }).world;
    world = applyCommand(world, 'p1', { seq: 2, type: 'move', squadId: 'parked', x: 3, y: 3 }).world;
    const replay = world;
    for (let tick = 0; tick < 12; tick++) {
      world = stepWorld(world);
      const [a, b] = world.squads;
      expect(a!.x).not.toBe(b!.x);
      if (tick < 11) expect(a!.x).toBe(3);
    }
    expect(world.squads[0]).toMatchObject({ x: 4, y: 3, target: null });
    expect(world.squads[1]).toMatchObject({ x: 3, y: 3, target: null });
    let repeated = replay;
    for (let tick = 0; tick < 12; tick++) repeated = stepWorld(repeated);
    expect(repeated).toEqual(world);
  });

  it.each(['enemy', 'guardian'] as const)('keeps a %s blocking a narrow corridor', (blocker) => {
    let world = field();
    world.surface!.walkable = world.surface!.walkable.map((_, index) => Math.floor(index / 20) === 3);
    if (blocker === 'enemy') world.squads[1]!.ownerId = 'p2';
    else {
      world.squads.pop();
      world.guardians = [{ id: 'guard', objectiveId: 'core', x: 4, y: 3, hp: 1000, maxHp: 1000, damage: 0 }];
    }
    world.squads[0]!.damage = 0;
    world = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: 'lead', x: 5, y: 3 }).world;
    for (let tick = 0; tick < 120; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 3, y: 3, target: { x: 5, y: 3 } });
  });

  it('waits at an occupied destination and resumes the same order after it frees up', () => {
    let world = applyCommand(field(), 'p1', { type: 'move', seq: 1, squadId: 'lead', x: 4, y: 3 }).world;
    for (let tick = 0; tick < 9; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 3, y: 3, target: { x: 4, y: 3 } });
    world.squads[1]!.hp = 0;
    for (let tick = 0; tick < 9; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 4, y: 3, target: null });
  });

  it('reserves the cell a ship leaves until its interpolated step finishes', () => {
    let world = field();
    world.squads[1]!.x = 2;
    world = applyCommand(world, 'p1', { type: 'move', seq: 1, squadId: 'lead', x: 4, y: 3 }).world;
    world = applyCommand(world, 'p1', { type: 'move', seq: 2, squadId: 'parked', x: 3, y: 3 }).world;
    for (let tick = 0; tick < 6; tick++) world = stepWorld(world);
    expect(world.squads[0]).toMatchObject({ x: 4, y: 3 });
    expect(world.squads[1]).toMatchObject({ x: 2, y: 3 });
    for (let tick = 0; tick < 6; tick++) world = stepWorld(world);
    expect(world.squads[1]).toMatchObject({ x: 3, y: 3 });
  });
  it.each(['ally','enemy','guardian'] as const)('diagonal passing keeps a %s corner rule without sharing destination cells',blocker=>{
    let world=field();world.economy=false;
    if(blocker==='enemy')world.squads[1]!.ownerId='p2';
    if(blocker==='guardian'){world.squads.pop();world.guardians=[{id:'corner',objectiveId:'core',x:4,y:3,hp:1000,maxHp:1000,damage:0}];}
    world=applyCommand(world,'p1',{seq:1,type:'move',squadId:'lead',x:4,y:4}).world;
    // The first step is immediate; only an allied corner lets it cut the diagonal.
    world=stepWorld(world);
    if(blocker==='ally')expect(world.squads[0]).toMatchObject({x:4,y:4,target:null});
    else expect(world.squads[0]!.x===4&&world.squads[0]!.y===4).toBe(false);
    expect(world.squads[0]!.x===4&&world.squads[0]!.y===3).toBe(false);
  });

  it('gives a full fleet distinct arrival seats even at a blocked map edge', () => {
    const seats = assignArrival(Array.from({ length: 12 }, (_, index) => `ship-${index}`), { x: 0, y: 0 },
      { width: 20, height: 20, blocked: new Set(['1,0', '1,1']) });
    expect(seats.size).toBe(12);
    expect(new Set([...seats.values()].map((cell) => `${cell.x},${cell.y}`)).size).toBe(12);
    expect([...seats.values()].every((cell) => cell.x >= 0 && cell.y >= 0)).toBe(true);
  });
  it('all 24 members finish their orders without overlapping in a crowded formation',()=>{
    let world=field();world.economy=false;world.rules.coreOpenTick=100000;
    world.squads=Array.from({length:24},(_,i)=>createSquad(`fleet-${String(i).padStart(2,'0')}`,'p1',i%3===0?'bomber':i%3===1?'frigate':'interceptor',{x:1+i%6,y:1+Math.floor(i/6)}));
    for(let i=0;i<24;i++)world=applyCommand(world,'p1',{seq:i+1,type:'move',squadId:world.squads[i]!.id,x:14,y:14}).world;
    const seats=new Map(world.squads.map(s=>[s.id,{...s.target!}]));
    for(let t=0;t<1500;t++){
      world=stepWorld(world);
      expect(new Set(world.squads.map(s=>`${s.x},${s.y}`)).size).toBe(24);
      for(const s of world.squads)if(s.target)expect(s.target).toEqual(seats.get(s.id));
    }
    expect(world.squads.filter(s=>s.target).map(s=>({id:s.id,x:s.x,y:s.y,target:s.target}))).toEqual([]);
    for(const s of world.squads){expect(s.target).toBeNull();expect(Math.max(Math.abs(s.x-14),Math.abs(s.y-14))).toBeLessThanOrEqual(6);}
  });
  it.each(['sector-01','espiral'] as const)('a 24-ship fleet reaches a crowded destination on %s',(map)=>{
    let world=createSectorWorld(map);world.guardians=[];world.economy=false;world.rules.coreOpenTick=100000;
    const route=(findTiledPath(world.surface!,world.players.p1.base,world.core) as {path:{x:number;y:number}[]}).path;
    const destination=route[Math.min(20,route.length-1)]!;
    const cells=world.surface!.walkable.flatMap((open,i)=>open?[{x:i%world.width,y:Math.floor(i/world.width)}]:[])
      .filter(cell=>findTiledPath(world.surface!,cell,destination).status==='found')
      .sort((a,b)=>Math.abs(a.x-world.players.p1.base.x)+Math.abs(a.y-world.players.p1.base.y)-Math.abs(b.x-world.players.p1.base.x)-Math.abs(b.y-world.players.p1.base.y)||a.y-b.y||a.x-b.x);
    world.squads=cells.slice(0,24).map((cell,i)=>createSquad(`fleet-${String(i).padStart(2,'0')}`,'p1',i%3===0?'bomber':i%3===1?'frigate':'interceptor',cell));
    for(let i=0;i<24;i++)world=applyCommand(world,'p1',{seq:i+1,type:'move',squadId:world.squads[i]!.id,...destination}).world;
    for(let t=0;t<3000;t++){world=stepWorld(world);expect(new Set(world.squads.map(s=>`${s.x},${s.y}`)).size).toBe(24);}
    expect(world.squads.filter(s=>s.target).map(s=>({id:s.id,x:s.x,y:s.y,target:s.target}))).toEqual([]);
  });
  it('a parked ally yields in a corridor when it blocks a route beyond its cell',()=>{
    let world=field();world.economy=false;world.surface!.walkable=world.surface!.walkable.map((_,i)=>Math.floor(i/20)===3);
    world=applyCommand(world,'p1',{seq:1,type:'move',squadId:'lead',x:7,y:3}).world;
    for(let t=0;t<120;t++)world=stepWorld(world);
    expect(world.squads[0]).toMatchObject({x:7,y:3,target:null});expect(world.squads[1]).toMatchObject({x:3,y:3});
  });
});
