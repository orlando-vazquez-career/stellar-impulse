import { describe, expect, it } from 'vitest';
import { createBattlefieldWorld, type BattlefieldWorld, type PlayerId } from '@impulso/sim';
import {
  chooseTech, command, createCampaign, drop, join, leave, phaseView, ready, reconnect, tick,
  type Campaign, type CampaignConfig,
} from './machine.js';

const T0 = 1_000_000;
/** A real simulator world one tick away from `winner` capturing the core. */
function nearWin(winner: PlayerId): BattlefieldWorld {
  const world = createBattlefieldWorld();
  world.rules = { ...world.rules, coreOpenTick: 0 };
  world.guardians = world.guardians.map((unit) => (unit.id === world.core.guardianId ? { ...unit, hp: 0 } : unit));
  const squad = world.squads.find((unit) => unit.ownerId === winner)!;
  squad.x = world.core.x; squad.y = world.core.y;
  world.core.progress[winner] = world.rules.coreCaptureTicks - 1;
  return world;
}
const fast = (overrides: Partial<CampaignConfig> = {}): Partial<CampaignConfig> => ({
  countdownMs: 5_000, transitionMs: 25_000, resultsMs: 60_000, resumeCountdownMs: 3_000,
  reconnectWindowMs: 60_000, maxPausesPerPlayer: 2, maxCampaignMs: 30 * 60_000,
  techOffers: [['alpha', 'beta', 'gamma'], ['delta', 'epsilon', 'zeta']],
  ...overrides,
});
/** Two seated, ready players; the countdown has finished and sector 1 is running. */
function started(overrides: Partial<CampaignConfig> = {}): Campaign {
  const campaign = createCampaign(fast(overrides));
  join(campaign, 'Ana'); join(campaign, 'Beto');
  ready(campaign, 'p1', T0); ready(campaign, 'p2', T0);
  tick(campaign, T0 + 5_000);
  return campaign;
}
const move = (seq = 1) => ({ seq, type: 'move_group', squadIds: ['p1-interceptor'], x: 3, y: 3 });

describe('lobby', () => {
  it('seats two players in join order and refuses a third', () => {
    const campaign = createCampaign(fast());
    expect(join(campaign, 'Ana')).toEqual({ ok: true, player: 'p1' });
    expect(join(campaign, 'Beto')).toEqual({ ok: true, player: 'p2' });
    expect(join(campaign, 'Caro')).toEqual({ ok: false, reason: 'full' });
  });
  it('frees a lobby seat when its player leaves before the start', () => {
    const campaign = createCampaign(fast());
    join(campaign, 'Ana'); join(campaign, 'Beto');
    leave(campaign, 'p1', T0);
    expect(join(campaign, 'Caro')).toEqual({ ok: true, player: 'p1' });
  });
  it('starts the countdown only when both seated players are ready', () => {
    const campaign = createCampaign(fast());
    join(campaign, 'Ana'); join(campaign, 'Beto');
    ready(campaign, 'p1', T0);
    expect(campaign.phase).toBe('lobby');
    ready(campaign, 'p2', T0 + 100);
    expect(campaign.phase).toBe('countdown');
    expect(phaseView(campaign, 'p1', T0 + 1_100).remainingMs).toBe(4_000);
  });
  it('returns to the lobby when someone drops during the countdown', () => {
    const campaign = createCampaign(fast());
    join(campaign, 'Ana'); join(campaign, 'Beto');
    ready(campaign, 'p1', T0); ready(campaign, 'p2', T0);
    drop(campaign, 'p2', T0 + 1_000);
    expect(campaign.phase).toBe('lobby');
    expect(campaign.seats.p1?.ready).toBe(false);
  });
});

describe('sectors', () => {
  it('starts sector 1 with a fresh simulator world when the countdown ends', () => {
    const campaign = started();
    expect(campaign.phase).toBe('sector');
    expect(campaign.sector).toBe(1);
    expect(campaign.world?.tick).toBe(0);
    expect(campaign.world?.mode).toBe('battlefield');
    expect(campaign.world?.map.id).toBe('battlefield');
    expect(campaign.world?.width).toBe(72);
  });
  it('rejects orders outside a sector and hands them to the simulator inside one', () => {
    const lobby = createCampaign(fast());
    join(lobby, 'Ana');
    expect(command(lobby, 'p1', move())).toEqual({ accepted: false, reason: 'not_in_sector', expansions: 0 });
    const campaign = started();
    expect(command(campaign, 'p1', move())).toMatchObject({ accepted: true });
    expect(command(campaign, 'p1', move())).toEqual({ accepted: false, reason: 'stale_sequence', expansions: 0 });
    expect(campaign.world?.squads.find((unit) => unit.id === 'p1-interceptor')?.target).toEqual({ x: 3, y: 3 });
  });
  it('keeps sequence unchanged on search-budget and unavailable-unit rejections', () => {
    const campaign = started();
    expect(command(campaign, 'p1', move(), 0)).toEqual({
      accepted: false, reason: 'budget_exceeded', expansions: 0,
    });
    expect(campaign.world!.players.p1.lastSequence).toBe(0);
    expect(command(campaign, 'p1', { ...move(), squadIds: ['missing'] })).toEqual({
      accepted: false, reason: 'unit_unavailable', expansions: 0,
    });
    expect(command(campaign, 'p1', { ...move(), squadIds: ['p2-interceptor'] })).toEqual({
      accepted: false, reason: 'unit_unavailable', expansions: 0,
    });
    expect(campaign.world!.players.p1.lastSequence).toBe(0);
  });
  it('declares a drawn sector when the safety tick limit is reached', () => {
    const campaign = started({ sectorLimitTicks: 3 });
    for (let i = 1; i <= 3; i += 1) tick(campaign, T0 + 5_000 + i * 100);
    expect(campaign.phase).toBe('transition');
    expect(campaign.sectorResults).toEqual([{ sector: 1, winner: null }]);
  });
});

describe('transitions and technologies', () => {
  const byWinners = (winners: PlayerId[]) => started({ createSector: (sector) => nearWin(winners[sector - 1]!) });

  it('closes a sector on core capture and keeps technology choices private', () => {
    const campaign = byWinners(['p1', 'p1', 'p1']);
    tick(campaign, T0 + 5_100);
    expect(campaign.phase).toBe('transition');
    expect(campaign.sectorResults).toEqual([{ sector: 1, winner: 'p1' }]);
    expect(chooseTech(campaign, 'p2', 'omega')).toEqual({ ok: false, reason: 'unknown_tech' });
    expect(chooseTech(campaign, 'p2', 'beta')).toEqual({ ok: true });
    const seenByP1 = phaseView(campaign, 'p1', T0 + 6_000);
    expect(seenByP1.offers).toEqual(['alpha', 'beta', 'gamma']);
    expect(seenByP1.myTech).toBeNull();
    expect(seenByP1.rivalChoseTech).toBe(true);
    expect(Object.values(seenByP1)).not.toContain('beta');
    expect(JSON.stringify(seenByP1.seats)).not.toContain('beta');
  });
  it('applies the default technology on timeout and resets the world for the next sector', () => {
    const campaign = byWinners(['p1', 'p2', 'p1']);
    tick(campaign, T0 + 5_100);
    chooseTech(campaign, 'p2', 'gamma');
    tick(campaign, T0 + 5_100 + 25_000);
    expect(campaign.techChoices).toEqual({ p1: ['alpha'], p2: ['gamma'] });
    expect(campaign.phase).toBe('sector');
    expect(campaign.sector).toBe(2);
    expect(campaign.world?.tick).toBe(0);
    expect(chooseTech(campaign, 'p1', 'delta')).toEqual({ ok: false, reason: 'not_in_transition' });
  });
  it('lets the final sector decide the campaign even after losing the first two', () => {
    const campaign = byWinners(['p1', 'p1', 'p2']);
    let now = T0 + 5_000;
    for (let sector = 1; sector <= 3; sector += 1) {
      now += 100; tick(campaign, now);
      if (sector < 3) { now += 25_000; tick(campaign, now); }
    }
    expect(campaign.phase).toBe('results');
    expect(campaign.result).toEqual({ winner: 'p2', reason: 'core' });
    tick(campaign, now + 60_000);
    expect(campaign.phase).toBe('closed');
  });
  it('starts the next sector paused for a transition drop, retaining the original deadline', () => {
    const campaign = started({ createSector: () => nearWin('p1') });
    tick(campaign, T0 + 5_100);
    expect(campaign.phase).toBe('transition');
    drop(campaign, 'p2', T0 + 5_200);
    tick(campaign, T0 + 30_100);
    expect(campaign.phase).toBe('sector');
    expect(campaign.sector).toBe(2);
    expect(campaign.world?.tick).toBe(0);
    expect(campaign.pause).toEqual({ by: 'p2', until: T0 + 65_200 });
    expect(campaign.seats.p2?.pausesUsed).toBe(1);
    tick(campaign, T0 + 30_200);
    expect(campaign.world?.tick).toBe(0);
    reconnect(campaign, 'p2', T0 + 30_300);
    expect(campaign.resumeAt).toBe(T0 + 33_300);
    tick(campaign, T0 + 33_200);
    expect(campaign.world?.tick).toBe(0);
    tick(campaign, T0 + 33_300);
    expect(campaign.world?.tick).toBe(1);
  });
  it('forfeits expired transition drops and does not grant a fresh pause', () => {
    const campaign = started({ createSector: () => nearWin('p1'), transitionMs: 70_000 });
    tick(campaign, T0 + 5_100);
    drop(campaign, 'p2', T0 + 5_200);
    tick(campaign, T0 + 75_100);
    expect(campaign.phase).toBe('results');
    expect(campaign.result).toEqual({ winner: 'p1', reason: 'forfeit' });
    expect(campaign.seats.p2?.pausesUsed).toBe(0);
    expect(campaign.world?.tick).toBe(0);
    const late = started({ createSector: () => nearWin('p1'), transitionMs: 70_000 });
    tick(late, T0 + 5_100);
    drop(late, 'p2', T0 + 5_200);
    reconnect(late, 'p2', T0 + 65_200);
    expect(late.phase).toBe('results');
    expect(late.result).toEqual({ winner: 'p1', reason: 'forfeit' });
  });
  it('runs without an extra pause after quota exhaustion and annuls when both seats are absent', () => {
    const noQuota = started({ createSector: (sector) => sector === 1 ? nearWin('p1') : createBattlefieldWorld(),
      maxPausesPerPlayer: 0 });
    tick(noQuota, T0 + 5_100);
    drop(noQuota, 'p2', T0 + 5_200);
    tick(noQuota, T0 + 30_100);
    expect(noQuota.phase).toBe('sector');
    expect(noQuota.pause).toBeNull();
    expect(noQuota.world?.tick).toBe(0);
    tick(noQuota, T0 + 30_200);
    expect(noQuota.world?.tick).toBe(1);
    expect(noQuota.phase).toBe('sector');
    tick(noQuota, T0 + 65_200);
    expect(noQuota.result).toEqual({ winner: 'p1', reason: 'forfeit' });
    const both = started({ createSector: () => nearWin('p1') });
    tick(both, T0 + 5_100);
    drop(both, 'p1', T0 + 5_200);
    drop(both, 'p2', T0 + 5_300);
    tick(both, T0 + 30_100);
    expect(both.phase).toBe('sector');
    tick(both, T0 + 65_200);
    expect(both.result).toEqual({ winner: null, reason: 'annulled' });
  });
});

describe('disconnections', () => {
  it('freezes the simulation while a player reconnects and resumes after a short countdown', () => {
    const campaign = started();
    tick(campaign, T0 + 5_100);
    const frozenAt = campaign.world!.tick;
    drop(campaign, 'p2', T0 + 5_200);
    tick(campaign, T0 + 10_000);
    expect(campaign.world!.tick).toBe(frozenAt);
    expect(phaseView(campaign, 'p1', T0 + 10_000).pause).toEqual({ by: 'p2', remainingMs: 55_200 });
    reconnect(campaign, 'p2', T0 + 20_000);
    tick(campaign, T0 + 21_000);
    expect(campaign.world!.tick).toBe(frozenAt);
    tick(campaign, T0 + 23_000);
    expect(campaign.world!.tick).toBe(frozenAt + 1);
  });
  it('stops pausing once a player has used the pause allowance', () => {
    const campaign = started();
    for (let i = 0; i < 2; i += 1) { drop(campaign, 'p2', T0 + 6_000 + i * 10_000); reconnect(campaign, 'p2', T0 + 7_000 + i * 10_000); }
    drop(campaign, 'p2', T0 + 40_000);
    expect(campaign.pause).toBeNull();
    expect(campaign.phase).toBe('sector');
    tick(campaign, T0 + 40_100);
    expect(campaign.world?.tick).toBe(1);
    reconnect(campaign, 'p2', T0 + 40_200);
    expect(campaign.phase).toBe('sector');
    expect(campaign.seats.p2?.connected).toBe(true);
  });
  it('forfeits the absent player when the reconnection window runs out', () => {
    const campaign = started();
    drop(campaign, 'p2', T0 + 6_000);
    tick(campaign, T0 + 66_000);
    expect(campaign.result).toEqual({ winner: 'p1', reason: 'forfeit' });
    expect(campaign.phase).toBe('results');
  });
  it('forfeits a player who leaves in the middle of the campaign', () => {
    const campaign = started();
    leave(campaign, 'p2', T0 + 6_000);
    expect(campaign.result).toEqual({ winner: 'p1', reason: 'forfeit' });
  });
  it('annuls the campaign when both players are gone', () => {
    const campaign = started();
    drop(campaign, 'p1', T0 + 6_000);
    drop(campaign, 'p2', T0 + 6_500);
    leave(campaign, 'p1', T0 + 66_000);
    expect(campaign.result).toEqual({ winner: null, reason: 'annulled' });
  });
  it('rejects orders while the simulation is paused or resuming', () => {
    const campaign = started();
    drop(campaign, 'p2', T0 + 6_000);
    expect(command(campaign, 'p1', move())).toEqual({ accepted: false, reason: 'paused', expansions: 0 });
    reconnect(campaign, 'p2', T0 + 7_000);
    expect(command(campaign, 'p1', move())).toEqual({ accepted: false, reason: 'paused', expansions: 0 });
  });
  it('keeps the game paused for the rival if both dropped and only one came back', () => {
    const campaign = started();
    drop(campaign, 'p1', T0 + 6_000);
    drop(campaign, 'p2', T0 + 8_000);
    reconnect(campaign, 'p1', T0 + 9_000);
    expect(campaign.pause).toEqual({ by: 'p2', until: T0 + 68_000 });
  });
  it('refuses new players once the campaign has started', () => {
    expect(join(started(), 'Caro')).toEqual({ ok: false, reason: 'in_progress' });
  });
  it('records a draw when the final sector hits the safety limit', () => {
    const campaign = started({ sectors: 1, sectorLimitTicks: 1 });
    tick(campaign, T0 + 5_100);
    expect(campaign.result).toEqual({ winner: null, reason: 'draw' });
  });
  it('annuls campaigns that run past the safety cap', () => {
    const campaign = started({ maxCampaignMs: 60_000 });
    tick(campaign, T0 + 5_000 + 60_000);
    expect(campaign.result).toEqual({ winner: null, reason: 'annulled' });
  });
});
