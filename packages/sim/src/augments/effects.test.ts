import { describe, expect, it } from 'vitest';
import { AUGMENT_CATALOG, applyCommand, createMatchWorld, createSquad, effectiveBaseDamage, effectiveFleetCap, grantAugment, statsFor, statsForUnit, stepWorld, visionSources, isConcealed, captureDuration, type World } from '../index.js';
import { counterBonus } from './effects.js';
const run=(w:World,count:number)=>{for(let i=0;i<count;i++)w=stepWorld(w);return w;};
function fixture():World {
  const w=createMatchWorld('sector-01');w.guardians=[];w.nodes=[];w.augmentMatch!.started=true;
  for(const p of ['p1','p2'] as const){w.augmentMatch!.players[p].offer=null;w.augmentMatch!.players[p].nextChoice=3;}
  w.players.p1.base={x:2,y:2};w.players.p2.base={x:18,y:18};w.players.p1.metal=100;
  w.surface={width:20,height:20,walkable:Array(400).fill(true),level:Array(400).fill(0),ramp:Array(400).fill(null)};w.width=w.height=20;
  w.squads=['explorer','interceptor','frigate','bomber'].map((kind,i)=>createSquad(`u${i}`,'p1',kind as 'explorer',{x:2+i,y:3},w));return w;
}
describe('catalog and exact effects',()=>{
  it('has 44 unique cards, 10 initial per tier, 14 unlocks and a downside on every prism',()=>{
    expect(AUGMENT_CATALOG).toHaveLength(44);expect(new Set(AUGMENT_CATALOG.map(a=>a.id)).size).toBe(44);
    expect(AUGMENT_CATALOG.filter(a=>a.unlock!=='initial')).toHaveLength(14);
    for(const tier of ['silver','gold','prismatic'])expect(AUGMENT_CATALOG.filter(a=>a.unlock==='initial'&&a.tier===tier)).toHaveLength(10);
    for(const a of AUGMENT_CATALOG){expect(a.text.es.name).toBeTruthy();expect(a.text.en.name).toBeTruthy();if(a.tier==='prismatic')expect(a.text.es.disadvantage).toBeTruthy();}
  });
  const checks:Record<string,(w:World)=>void>={
    's-reservas':w=>expect(w.players.p1.metal).toBe(108),
    's-optica':w=>expect(statsFor(w,'p1','explorer').vision).toBe(8),
    's-blindaje':w=>expect(statsFor(w,'p1','interceptor').armor).toBe(2),
    's-hangar':w=>{w=applyCommand(w,'p1',{seq:1,type:'produce',kind:'frigate'}).world;expect(w.production.p1!.readyTick).toBe(30);expect(w.augmentMatch!.players.p1.fastBuilds).toBe(1);},
    's-exploradores':w=>expect(statsFor(w,'p1','explorer')).toMatchObject({cost:3,speed:3}),
    's-nanorep':w=>{w.squads[1]!.hp=10;w.squads[1]!.x=5;w.squads[1]!.y=2;expect(run(w,10).squads[1]!.hp).toBe(13);},
    's-aceleradores':w=>expect(statsFor(w,'p1','interceptor').speed).toBeCloseTo(1.9),
    's-refuerzos':w=>expect(statsFor(w,'p1','bomber').maxHp).toBe(165),
    's-mantenimiento':w=>expect(statsFor(w,'p1','frigate').buildTicks).toBe(54),
    's-carga':w=>expect(statsFor(w,'p1','frigate').damage).toBe(9),
    's-contratos':w=>{w.nodes=[{id:'node',guardianId:'none',kind:'metal',ownerId:null,x:3,y:3,progress:{p1:0,p2:0}}];w=run(w,30);expect(w.players.p1.metal).toBe(113.5);expect(w.augmentMatch!.players.p1.captureBounties).toBe(0);},
    's-cartografia':w=>expect(w.augmentMatch!.players.p1.chart).toEqual({nodes:[],guardians:[]}),
    's-mamparos':w=>expect(statsFor(w,'p1','frigate').maxHp).toBe(225),
    's-espoletas':w=>expect(statsFor(w,'p1','bomber').splashFactor).toBe(0.65),
    'g-mineria':w=>{w.nodes=[{id:'node',guardianId:'none',kind:'metal',ownerId:'p1',x:15,y:15,progress:{p1:0,p2:0}}];expect(run(w,40).players.p1.metal).toBeCloseTo(104.6);},
    'g-cazadores':w=>{expect(statsFor(w,'p1','interceptor').speed).toBe(2);expect(counterBonus(w,w.squads[1]!,'bomber')).toBe(2);expect(counterBonus(w,w.squads[1]!,'frigate')).toBe(0);},
    'g-linea':w=>{w.squads.push(createSquad('buddy','p1','frigate',{x:5,y:3},w));expect(statsForUnit(w,w.squads[2]!).armor).toBe(3);w.squads.at(-1)!.x=10;expect(statsForUnit(w,w.squads[2]!).armor).toBe(1);},
    'g-campo':w=>{w.squads[3]!.hp=10;w.squads[3]!.x=10;expect(run(w,49).squads[3]!.hp).toBe(10);expect(run(w,50).squads[3]!.hp).toBe(12);},
    'g-serie':w=>{expect(statsFor(w,'p1','bomber').cost).toBe(11);expect(statsFor(w,'p1','explorer').cost).toBe(3);},
    'g-impulso':w=>expect(statsFor(w,'p1','bomber').speed).toBe(1),
    'g-corazas':w=>expect(statsFor(w,'p1','bomber').armor).toBe(2),
    'g-calibracion':w=>expect(statsFor(w,'p1','bomber').damage).toBe(36),
    'g-tripulacion':w=>{expect(statsFor(w,'p1','frigate').maxHp).toBe(240);expect(statsFor(w,'p1','interceptor').maxHp).toBe(115);},
    'g-logistica':w=>{expect(effectiveFleetCap(w,'p1')).toBe(14);expect(statsFor(w,'p1','frigate').buildTicks).toBe(51);},
    'g-sensores':w=>expect(visionSources(w,'p1')[0]!.radius).toBe(8),
    'g-chatarra':w=>{const victim=createSquad('victim','p2','bomber',{x:3,y:4},w);victim.hp=1;w.squads.push(victim);w.tick=4;w=stepWorld(w);expect(w.players.p1.metal).toBe(103);},
    'g-senuelos':w=>{expect(w.squads.at(-1)).toMatchObject({kind:'bomber',isDecoy:true,hp:30,damage:0,expiresAt:600});expect(w.squads.filter(s=>!s.isDecoy)).toHaveLength(4);expect(run(w,600).squads.find(s=>s.isDecoy)!.hp).toBe(0);},
    'g-escolta':w=>expect(statsForUnit(w,w.squads[3]!).armor).toBe(4),
    'g-veteranos':w=>{w.squads[1]!.kills=3;w=stepWorld(w);expect(w.squads[1]).toMatchObject({maxHp:120,damage:7,veteran:true});expect(stepWorld(w).squads[1]!.maxHp).toBe(120);},
    'p-asalto':w=>{expect(w.squads.filter(s=>s.kind==='bomber')).toHaveLength(2);expect(run(w,599).players.p1.metal).toBe(100);expect(run(w,600).players.p1.metal).toBe(100.5);},
    'p-enjambre':w=>{expect(statsFor(w,'p1','interceptor')).toMatchObject({cost:4,buildTicks:20,maxHp:80});expect(statsFor(w,'p1','bomber').maxHp).toBe(130);expect(w.squads[0]!.hp).toBe(30);},
    'p-fortaleza':w=>{expect(statsForUnit(w,w.squads[1]!).armor).toBe(4);expect(effectiveBaseDamage(w,'p1')).toBe(10);expect(statsFor(w,'p1','bomber').speed).toBe(0.5);},
    'p-artilleria':w=>expect(statsFor(w,'p1','bomber')).toMatchObject({range:6,splashRadius:2,attackTicks:45,cost:15}),
    'p-todo':w=>{expect(w.players.p1.metal).toBe(115);expect(statsFor(w,'p1','frigate').damage).toBe(10);expect(effectiveFleetCap(w,'p1')).toBe(9);},
    'p-titanes':w=>{expect(statsFor(w,'p1','interceptor').maxHp).toBe(160);expect(statsFor(w,'p1','bomber').speed).toBeCloseTo(0.6);},
    'p-sobrecarga':w=>{expect(statsFor(w,'p1','bomber').damage).toBeCloseTo(39);expect(statsFor(w,'p1','interceptor').armor).toBe(0);},
    'p-expansion':w=>{expect(effectiveFleetCap(w,'p1')).toBe(18);expect(statsFor(w,'p1','frigate')).toMatchObject({cost:10,buildTicks:45});},
    'p-dominio':w=>{expect(captureDuration(w,'p1',30,false)).toBe(18);expect(captureDuration(w,'p1',450,true)).toBe(270);expect(statsFor(w,'p1','bomber').maxHp).toBe(125);},
    'p-escuadra':w=>{expect(w.squads.filter(s=>s.kind==='frigate')).toHaveLength(3);expect(run(w,899).players.p1.metal).toBe(100);expect(run(w,900).players.p1.metal).toBe(100.5);},
    'p-guerra':w=>{w.nodes=[{id:'n',guardianId:'none',kind:'metal',ownerId:'p1',x:15,y:15,progress:{p1:0,p2:0}}];expect(run(w,20).players.p1.metal).toBeCloseTo(101.6);expect(captureDuration(w,'p1',30,false)).toBe(45);},
    'p-relampago':w=>{expect(captureDuration(w,'p1',450,true)).toBe(270);expect(captureDuration(w,'p1',30,false)).toBe(30);Object.assign(w.squads[1]!,w.core);expect(statsForUnit(w,w.squads[1]!).armor).toBe(-2);},
    'p-camuflaje':w=>{expect(statsFor(w,'p1','interceptor').maxHp).toBe(70);w.tick=30;expect(isConcealed(w,w.squads[1]!)).toBe(true);w.squads[1]!.lastAttackTick=30;expect(isConcealed(w,w.squads[1]!)).toBe(false);},
    'p-reciclaje':w=>{const victim=w.squads[1]!;victim.hp=1;w.squads=[victim,createSquad('enemy','p2','bomber',{x:4,y:3},w)];w.tick=29;w=stepWorld(w);expect(w.players.p1.metal).toBe(105);expect(victim.hp).toBe(1);
      const parked=fixture();grantAugment(parked,'p1','p-reciclaje');parked.squads[1]!.hp=10;expect(run(parked,10).squads[1]!.hp).toBe(10);},
    'p-mercenarios':w=>{expect(effectiveFleetCap(w,'p1')).toBe(8);expect(w.squads.filter(s=>s.kind==='interceptor')).toHaveLength(2);expect(applyCommand(w,'p1',{seq:1,type:'produce',kind:'interceptor'})).toMatchObject({accepted:false,reason:'production_forbidden'});},
  };
  it.each(AUGMENT_CATALOG.map(a=>a.id))('%s applies its exact advantage and downside',id=>{const w=fixture();grantAugment(w,'p1',id);checks[id]!(w);});
  it('stacks base capacity above the changed limit without destroying excess ships',()=>{
    const w=fixture();grantAugment(w,'p1','p-todo');w.players.p1.baseUpgrades={damage:2,capacity:3};
    expect(effectiveFleetCap(w,'p1')).toBe(21);grantAugment(w,'p1','p-fortaleza');expect(effectiveBaseDamage(w,'p1')).toBe(30);
    w.players.p1.statModifiers!.push({stat:'maxHp',operation:'add',value:-1000},{stat:'speed',operation:'add',value:-100});
    expect(statsFor(w,'p1','bomber')).toMatchObject({maxHp:20,speed:0.4});
  });
  it('stacks production discounts on fixed artillery costs in either grant order',()=>{
    for(const order of [['g-serie','p-artilleria'],['p-artilleria','g-serie']]) {
      const world=fixture();for(const id of order)grantAugment(world,'p1',id);
      expect(statsFor(world,'p1','bomber').cost).toBe(14);
    }
  });
});
