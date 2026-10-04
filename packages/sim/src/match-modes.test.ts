import { expect, it } from 'vitest';
import { createMatchWorld, DURATION_MODES, stepWorld } from './index.js';
import { rivalGoals } from './inteligencia-enemiga/estrategia.js';
it.each(['complete', 'skirmish'] as const)('opens and captures the core on %s timings', (mode) => {
  let world = createMatchWorld('sector-01', mode, 42);
  world.augmentMatch = undefined;
  expect(world.duration).toBe(mode); expect(world.seed).toBe(42);
  const config = DURATION_MODES[mode];
  expect(config.choices).toEqual(mode === 'complete' ? [0, 3000, 6000] : [0, 1200, 2400]);
  world.tick = config.coreOpenTick - 2;
  world = stepWorld(world); expect(world.core.open).toBe(false);
  world = stepWorld(world); expect(world.core.open).toBe(true);
  world.guardians = []; world.squads = [world.squads[0]!]; world.economy = false;
  Object.assign(world.squads[0]!, { x: world.core.x, y: world.core.y });
  for (let tick = 0; tick < config.coreCaptureTicks - 1; tick++) world = stepWorld(world);
  expect(world.winner).toBeNull(); world = stepWorld(world); expect(world.winner).toBe('p1');
});
it('prioritizes nodes instead of the open core while behind on economy', () => {
  const world = createMatchWorld(); world.core.open = true;
  world.nodes.filter((n) => n.kind === 'metal').slice(0, 4).forEach((n) => { n.ownerId = 'p1'; });
  // The strategic decision uses discovered ownership, not hidden enemy income.
  world.knowledge!.p2.nodes=world.nodes.map(n=>({...n,progress:{...n.progress}}));
  const goals = rivalGoals(world, 'p2', () => false);
  expect(goals.get('p2-interceptor')).not.toEqual({ x: world.core.x, y: world.core.y });
});
it.each(['complete','skirmish'] as const)('starts sudden death on %s and an uncontested core wins immediately',mode=>{
  let world=createMatchWorld('sector-01',mode);world.augmentMatch=undefined;world.economy=false;world.guardians=[];
  world.squads=[world.squads.find(s=>s.ownerId==='p1'&&s.kind==='interceptor')!];
  world.tick=DURATION_MODES[mode].suddenDeathTick-2;
  world=stepWorld(world);expect(world.suddenDeath).not.toBe(true);expect(world.winner).toBeNull();
  Object.assign(world.squads[0]!,{x:world.core.x,y:world.core.y});
  world=stepWorld(world);expect(world.suddenDeath).toBe(true);expect(world.winner).toBe('p1');
});
it('a contested core cannot win sudden death and the AI prioritizes it even when losing nodes',()=>{
  let world=createMatchWorld('sector-01','skirmish');world.augmentMatch=undefined;world.economy=false;world.guardians=[];
  world.squads=['p1','p2'].map(p=>world.squads.find(s=>s.ownerId===p&&s.kind==='interceptor')!);
  world.squads.forEach(s=>Object.assign(s,{x:world.core.x,y:world.core.y,hp:1000}));world.tick=4800;
  world=stepWorld(world);expect(world.winner).toBeNull();
  expect(rivalGoals(world,'p2',()=>false).get(world.squads[1]!.id)).toEqual({x:world.core.x,y:world.core.y});
  world.squads=world.squads.slice(0,1);world=stepWorld(world);expect(world.winner).toBe('p1');
});
