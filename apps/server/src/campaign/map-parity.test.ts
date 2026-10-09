import { expect, it } from 'vitest';
import { DEFAULT_CAMPAIGN_MAP } from '@impulso/input';
import { createMatchWorld } from '@impulso/sim';
import { createCampaign, join, ready, tick } from './machine.js';

it('keeps the campaign default terrain and match rules throughout all three multiplayer sectors', () => {
  const id = DEFAULT_CAMPAIGN_MAP;
  const seed = 42;
  const campaign = createCampaign({}, seed);
  join(campaign, 'Ana'); join(campaign, 'Beto');
  let now = 1000;
  ready(campaign, 'p1', now); ready(campaign, 'p2', now);
  now += campaign.config.countdownMs;
  tick(campaign, now);
  for (let sector = 1; sector <= 3; sector++) {
    const expected = createMatchWorld(id, 'skirmish', (seed + sector * 7919) >>> 0);
    const world = campaign.world!;
    expect(campaign.sector).toBe(sector);
    expect(world.surface).toEqual(expected.surface);
    expect(world.rules).toEqual(expected.rules);
    expect(world.nodes).toEqual(expected.nodes);
    expect(world.guardians).toEqual(expected.guardians);
    expect(world.core).toEqual(expected.core);
    expect(world.squads).toEqual(expected.squads);
    for (const player of ['p1', 'p2'] as const) {
      expect(world.players[player].base).toEqual(expected.players[player].base);
      expect(world.players[player].structure).toEqual(expected.players[player].structure);
      expect(world.players[player].modules).toEqual(expected.players[player].modules);
    }
    world.winner = 'p1';
    tick(campaign, ++now);
    if (sector < 3) { now += campaign.config.transitionMs; tick(campaign, now); }
  }
  expect(campaign.phase).toBe('results');
});
