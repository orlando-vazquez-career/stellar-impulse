import { expect, it } from 'vitest';
import { createMatchWorld, DURATION_MODES, stepWorld } from './index.js';
import { rivalGoals } from './inteligencia-enemiga/estrategia.js';
it.each(['complete', 'skirmish'] as const)('opens and captures the core on %s timings', (mode) => {
  let world = createMatchWorld('sector-01', mode, 42);
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
  const goals = rivalGoals(world, 'p2', () => false);
  expect(goals.get('p2-interceptor')).not.toEqual({ x: world.core.x, y: world.core.y });
});
