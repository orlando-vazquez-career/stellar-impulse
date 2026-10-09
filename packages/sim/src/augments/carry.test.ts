import { describe, expect, it } from 'vitest';
import { carryAugments, createMatchWorld, statsForUnit } from '../index.js';

describe('augments carried into the next sector of a run', () => {
  it('owns them from tick 0 and still deals a fresh opening hand without them', () => {
    const world = createMatchWorld('espiral-2', 'skirmish', 7);
    carryAugments(world, 'p1', ['s-optica', 'g-impulso']);
    const state = world.augmentMatch!.players.p1;
    expect(world.players.p1.augments).toEqual(['s-optica', 'g-impulso']);
    expect(state.chosen).toEqual(['s-optica', 'g-impulso']);
    expect(state.offer?.choice).toBe(0);
    expect(state.offer!.cards).toHaveLength(3);
    expect(state.offer!.cards).not.toContain('s-optica');
    const own = world.squads.find((squad) => squad.ownerId === 'p1')!;
    expect(statsForUnit(world, own).vision).toBe(statsForUnit(createMatchWorld('espiral-2', 'skirmish', 7), own).vision + 1);
    expect(world.augmentMatch!.players.p2.chosen).toEqual([]);
  });

  it('ignores unknown or locked augments and never applies twice', () => {
    const world = createMatchWorld('espiral', 'skirmish', 3);
    carryAugments(world, 'p1', ['nope', 's-contratos', 's-optica']);
    expect(world.players.p1.augments).toEqual(['s-optica']);
    carryAugments(world, 'p1', ['g-impulso']);
    expect(world.players.p1.augments).toEqual(['s-optica']);
  });
});
