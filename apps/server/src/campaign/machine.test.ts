import { describe, expect, it } from 'vitest';
import { createMatchWorld, type PlayerId, type World } from '@impulso/sim';
import {
  augmentPick, augmentReroll, command, createCampaign, drop, join, leave, phaseView, ready, reconnect, tick,
  type Campaign, type CampaignConfig,
} from './machine.js';

const T0 = 1_000_000;
/** Sector 01 keeps these tests fast; production sectors run on Espiral. */
const small = (_sector: number, seed: number): World => createMatchWorld('sector-01', 'skirmish', seed);
/** Each sector is already decided for `winners[sector - 1]`, so it ends on its first tick. */
const decided = (winners: (PlayerId | null)[]) => (sector: number, seed: number): World => {
  const world = small(sector, seed);
  world.winner = winners[sector - 1] ?? null;
  return world;
};
const fast = (overrides: Partial<CampaignConfig> = {}): Partial<CampaignConfig> => ({
  countdownMs: 5_000, transitionMs: 15_000, resultsMs: 60_000, resumeCountdownMs: 3_000,
  reconnectWindowMs: 60_000, maxPausesPerPlayer: 2, maxCampaignMs: 45 * 60_000, createSector: small,
  ...overrides,
});
/** Two seated, ready players; the countdown has finished and sector 1 is waiting for its augment picks. */
function started(overrides: Partial<CampaignConfig> = {}): Campaign {
  const campaign = createCampaign(fast(overrides), 7);
  join(campaign, 'Ana'); join(campaign, 'Beto');
  ready(campaign, 'p1', T0); ready(campaign, 'p2', T0);
  tick(campaign, T0 + 5_000);
  return campaign;
}
const offerOf = (campaign: Campaign, player: PlayerId) => campaign.world!.augmentMatch!.players[player].offer!;
/** Both players take the first card of the sector's offer. Returns the picks. */
function pickBoth(campaign: Campaign): Record<PlayerId, string> {
  const picks = { p1: offerOf(campaign, 'p1').cards[0]!, p2: offerOf(campaign, 'p2').cards[0]! };
  for (const player of ['p1', 'p2'] as const) {
    expect(augmentPick(campaign, player, offerOf(campaign, player).choice, picks[player])).toEqual({ ok: true });
  }
  return picks;
}
const stance = (seq = 1) => ({ seq, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' });

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
  it('starts sector 1 on a fresh match world that opens with a silver offer', () => {
    const campaign = started();
    expect(campaign.phase).toBe('sector');
    expect(campaign.sector).toBe(1);
    expect(campaign.world?.tick).toBe(0);
    expect(campaign.world?.duration).toBe('skirmish');
    expect(offerOf(campaign, 'p1').tier).toBe('silver');
    expect(offerOf(campaign, 'p2').tier).toBe('silver');
  });
  it('uses the Espiral skirmish match by default', () => {
    const campaign = createCampaign({}, 7);
    join(campaign, 'Ana'); join(campaign, 'Beto');
    ready(campaign, 'p1', T0); ready(campaign, 'p2', T0);
    tick(campaign, T0 + 5_000);
    expect(campaign.world?.duration).toBe('skirmish');
    expect(campaign.world?.width).toBe(createMatchWorld('espiral', 'skirmish', 1).width);
  });
  it('rejects orders outside a sector and before the opening pick, and applies them afterwards', () => {
    const lobby = createCampaign(fast());
    join(lobby, 'Ana');
    expect(command(lobby, 'p1', stance())).toEqual({ accepted: false, reason: 'not_in_sector' });
    const campaign = started();
    expect(command(campaign, 'p1', stance())).toEqual({ accepted: false, reason: 'opening_selection' });
    pickBoth(campaign);
    expect(command(campaign, 'p1', stance())).toEqual({ accepted: true });
    expect(command(campaign, 'p1', stance())).toEqual({ accepted: false, reason: 'stale_sequence' });
    expect(command(campaign, 'p1', { ...stance(2), squadId: 'p2-interceptor' })).toMatchObject({ accepted: false });
  });
  it('declares a drawn sector when the safety tick limit is reached', () => {
    const campaign = started({ sectorLimitTicks: 3 });
    pickBoth(campaign);
    for (let i = 1; i <= 3; i += 1) tick(campaign, T0 + 5_000 + i * 100);
    expect(campaign.phase).toBe('transition');
    expect(campaign.sectorResults).toEqual([{ sector: 1, winner: null }]);
  });
  it('ends only the sector when a player surrenders it once the base shield is down', () => {
    const campaign = started();
    pickBoth(campaign);
    expect(command(campaign, 'p2', { seq: 1, type: 'surrender' })).toEqual({ accepted: false, reason: 'surrender_locked' });
    campaign.world!.baseRules = { ...campaign.world!.baseRules!, vulnerableTick: 0 };
    expect(command(campaign, 'p2', { seq: 2, type: 'surrender' })).toEqual({ accepted: true });
    tick(campaign, T0 + 5_100);
    expect(campaign.sectorResults).toEqual([{ sector: 1, winner: 'p1' }]);
    expect(campaign.phase).toBe('transition');
    expect(campaign.result).toBeNull();
  });
});

describe('augments across sectors', () => {
  it('carries every pick into the next sector, applied again, and offers the next tier', () => {
    const campaign = started();
    const picks = pickBoth(campaign);
    campaign.world!.winner = 'p1';
    tick(campaign, T0 + 5_100);
    expect(campaign.phase).toBe('transition');
    tick(campaign, T0 + 5_100 + 15_000);
    expect(campaign.phase).toBe('sector');
    expect(campaign.sector).toBe(2);
    expect(campaign.world!.tick).toBe(0);
    expect(campaign.world!.players.p1.augments).toEqual([picks.p1]);
    expect(campaign.world!.players.p2.augments).toEqual([picks.p2]);
    expect(offerOf(campaign, 'p1').tier).toBe('gold');
  });
  it('gives the previous sector winner one extra reroll', () => {
    const campaign = started();
    pickBoth(campaign);
    campaign.world!.winner = 'p2';
    tick(campaign, T0 + 5_100);
    tick(campaign, T0 + 5_100 + 15_000);
    expect(augmentReroll(campaign, 'p2', 1)).toEqual({ ok: true });
    expect(augmentReroll(campaign, 'p2', 1)).toEqual({ ok: true });
    expect(augmentReroll(campaign, 'p2', 1)).toEqual({ ok: false, reason: 'augment_reroll_used_or_expired' });
    expect(augmentReroll(campaign, 'p1', 1)).toEqual({ ok: true });
    expect(augmentReroll(campaign, 'p1', 1)).toEqual({ ok: false, reason: 'augment_reroll_used_or_expired' });
  });
  it('refuses augment picks outside a sector or while the game is paused', () => {
    const lobby = createCampaign(fast());
    expect(augmentPick(lobby, 'p1', 0, 's-optica')).toEqual({ ok: false, reason: 'not_in_sector' });
    const campaign = started();
    drop(campaign, 'p2', T0 + 5_100);
    expect(augmentPick(campaign, 'p1', 0, offerOf(campaign, 'p1').cards[0]!)).toEqual({ ok: false, reason: 'paused' });
  });
  it('records each finished sector\'s challenge progress for the rewards', () => {
    const campaign = started();
    pickBoth(campaign);
    campaign.world!.matchRecord!.players.p1.kills = 15;
    campaign.world!.winner = 'p1';
    tick(campaign, T0 + 5_100);
    expect(campaign.sectorProgress).toHaveLength(1);
    expect(campaign.sectorProgress[0]!.p1.scrapper).toBe(15);
    expect(campaign.sectorProgress[0]!.p2.scrapper).toBe(0);
  });
  it('lets the final sector decide the campaign even after losing the first two', () => {
    const campaign = started({ createSector: decided(['p1', 'p1', 'p2']) });
    let now = T0 + 5_000;
    for (let sector = 1; sector <= 3; sector += 1) {
      now += 100; tick(campaign, now);
      if (sector < 3) { now += 15_000; tick(campaign, now); }
    }
    expect(campaign.phase).toBe('results');
    expect(campaign.result).toEqual({ winner: 'p2', reason: 'core' });
    expect(campaign.sectorResults.map((result) => result.winner)).toEqual(['p1', 'p1', 'p2']);
    tick(campaign, now + 60_000);
    expect(campaign.phase).toBe('closed');
  });
});

describe('transitions', () => {
  it('starts the next sector paused for a transition drop, retaining the original deadline', () => {
    const campaign = started({ createSector: decided(['p1']) });
    tick(campaign, T0 + 5_100);
    expect(campaign.phase).toBe('transition');
    drop(campaign, 'p2', T0 + 5_200);
    tick(campaign, T0 + 20_100);
    expect(campaign.phase).toBe('sector');
    expect(campaign.sector).toBe(2);
    expect(campaign.world?.tick).toBe(0);
    expect(campaign.pause).toEqual({ by: 'p2', until: T0 + 65_200 });
    expect(campaign.seats.p2?.pausesUsed).toBe(1);
    reconnect(campaign, 'p2', T0 + 20_300);
    expect(campaign.resumeAt).toBe(T0 + 23_300);
    tick(campaign, T0 + 23_300);
    pickBoth(campaign);
    tick(campaign, T0 + 23_400);
    expect(campaign.world?.tick).toBe(1);
  });
  it('forfeits expired transition drops and does not grant a fresh pause', () => {
    const campaign = started({ createSector: decided(['p1']), transitionMs: 70_000 });
    tick(campaign, T0 + 5_100);
    drop(campaign, 'p2', T0 + 5_200);
    tick(campaign, T0 + 75_100);
    expect(campaign.phase).toBe('results');
    expect(campaign.result).toEqual({ winner: 'p1', reason: 'forfeit' });
    expect(campaign.seats.p2?.pausesUsed).toBe(0);
    const late = started({ createSector: decided(['p1']), transitionMs: 70_000 });
    tick(late, T0 + 5_100);
    drop(late, 'p2', T0 + 5_200);
    reconnect(late, 'p2', T0 + 65_200);
    expect(late.phase).toBe('results');
    expect(late.result).toEqual({ winner: 'p1', reason: 'forfeit' });
  });
  it('runs without an extra pause after quota exhaustion and annuls when both seats are absent', () => {
    const noQuota = started({ createSector: decided(['p1']), maxPausesPerPlayer: 0 });
    tick(noQuota, T0 + 5_100);
    drop(noQuota, 'p2', T0 + 5_200);
    tick(noQuota, T0 + 20_100);
    expect(noQuota.phase).toBe('sector');
    expect(noQuota.pause).toBeNull();
    tick(noQuota, T0 + 65_200);
    expect(noQuota.result).toEqual({ winner: 'p1', reason: 'forfeit' });
    const both = started({ createSector: decided(['p1']) });
    tick(both, T0 + 5_100);
    drop(both, 'p1', T0 + 5_200);
    drop(both, 'p2', T0 + 5_300);
    tick(both, T0 + 20_100);
    expect(both.phase).toBe('sector');
    tick(both, T0 + 65_200);
    expect(both.result).toEqual({ winner: null, reason: 'annulled' });
  });
});

describe('disconnections', () => {
  it('freezes the simulation while a player reconnects and resumes after a short countdown', () => {
    const campaign = started();
    pickBoth(campaign);
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
    pickBoth(campaign);
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
    pickBoth(campaign);
    drop(campaign, 'p2', T0 + 6_000);
    expect(command(campaign, 'p1', stance())).toEqual({ accepted: false, reason: 'paused' });
    reconnect(campaign, 'p2', T0 + 7_000);
    expect(command(campaign, 'p1', stance())).toEqual({ accepted: false, reason: 'paused' });
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
    pickBoth(campaign);
    tick(campaign, T0 + 5_100);
    expect(campaign.result).toEqual({ winner: null, reason: 'draw' });
  });
  it('annuls campaigns that run past the safety cap', () => {
    const campaign = started({ maxCampaignMs: 60_000 });
    tick(campaign, T0 + 5_000 + 60_000);
    expect(campaign.result).toEqual({ winner: null, reason: 'annulled' });
  });
});
