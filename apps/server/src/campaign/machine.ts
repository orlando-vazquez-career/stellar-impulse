import { DEFAULT_CAMPAIGN_MAP } from '@impulso/input';
import {
  applyCommand, challengeProgress, createMatchWorld, pickAugment, prepareCampaignSector, rerollAugments, stepWorld,
  type ChallengeId, type CommandRejection, type PlayerId, type World,
} from '@impulso/sim';
import type { CampaignPhase, CampaignPhaseView, CampaignSectorResult, CampaignResult } from '@impulso/state';

/**
 * Campaign lifecycle: lobby → countdown → sector 1..N (with transitions) → results → closed.
 * Each sector is a fresh skirmish match; the augments picked in earlier sectors are applied again
 * and each sector offers one more. Pure orchestration around the simulator: time always comes in
 * as `now` (ms); nothing here reads a clock.
 */
export type Phase = CampaignPhase;

export interface CampaignConfig {
  sectors: number;
  countdownMs: number;
  transitionMs: number;
  resultsMs: number;
  resumeCountdownMs: number;
  reconnectWindowMs: number;
  maxPausesPerPlayer: number;
  /** Safety cap per sector; the skirmish sudden death (8 min) normally decides it first. */
  sectorLimitTicks: number;
  maxCampaignMs: number;
  createSector: (sector: number, seed: number) => World;
}

export const DEFAULT_CONFIG: Readonly<CampaignConfig> = Object.freeze({
  sectors: 3,
  countdownMs: 5_000,
  transitionMs: 15_000,
  resultsMs: 60_000,
  resumeCountdownMs: 3_000,
  reconnectWindowMs: 60_000,
  maxPausesPerPlayer: 2,
  sectorLimitTicks: 12 * 60 * 10,
  maxCampaignMs: 45 * 60_000,
  createSector: (_sector: number, seed: number) => createMatchWorld(DEFAULT_CAMPAIGN_MAP, 'skirmish', seed),
});

export interface Seat { name: string; ready: boolean; connected: boolean; pausesUsed: number; droppedAt: number | null }
export type SectorResult = CampaignSectorResult;
export type { CampaignResult } from '@impulso/state';
export type SectorProgress = Record<PlayerId, Partial<Record<ChallengeId, number>>>;
export interface Campaign {
  config: CampaignConfig;
  seed: number;
  phase: Phase;
  sector: number;
  phaseEndsAt: number | null;
  seats: Record<PlayerId, Seat | null>;
  world: World | null;
  sectorResults: SectorResult[];
  /** Augments each player picked in earlier sectors, in order; applied again at every sector start. */
  augments: Record<PlayerId, string[]>;
  /** Augments each account has unlocked, set at admission. */
  pools: Partial<Record<PlayerId, readonly string[]>>;
  /** Challenge progress of every finished sector, for the campaign rewards. */
  sectorProgress: SectorProgress[];
  pause: { by: PlayerId; until: number } | null;
  resumeAt: number | null;
  startedAt: number | null;
  result: CampaignResult | null;
}
export type PhaseView = Omit<CampaignPhaseView, 'protocolVersion'>;

const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
const rivalOf = (player: PlayerId): PlayerId => (player === 'p1' ? 'p2' : 'p1');
const inCampaign = (campaign: Campaign): boolean => campaign.phase === 'sector' || campaign.phase === 'transition';

export function createCampaign(overrides: Partial<CampaignConfig> = {}, seed = 1): Campaign {
  return {
    config: { ...DEFAULT_CONFIG, ...overrides }, seed,
    phase: 'lobby', sector: 0, phaseEndsAt: null,
    seats: { p1: null, p2: null },
    world: null, sectorResults: [],
    augments: { p1: [], p2: [] }, pools: {}, sectorProgress: [],
    pause: null, resumeAt: null, startedAt: null, result: null,
  };
}

export function join(campaign: Campaign, name: string): { ok: true; player: PlayerId } | { ok: false; reason: 'full' | 'in_progress' } {
  if (campaign.phase !== 'lobby') return { ok: false, reason: 'in_progress' };
  const free = PLAYERS.find((player) => campaign.seats[player] === null);
  if (!free) return { ok: false, reason: 'full' };
  campaign.seats[free] = { name, ready: false, connected: true, pausesUsed: 0, droppedAt: null };
  return { ok: true, player: free };
}

export function ready(campaign: Campaign, player: PlayerId, now: number): void {
  const seat = campaign.seats[player];
  if (campaign.phase !== 'lobby' || !seat?.connected) return;
  seat.ready = true;
  if (PLAYERS.every((each) => campaign.seats[each]?.ready && campaign.seats[each]?.connected)) {
    campaign.phase = 'countdown';
    campaign.phaseEndsAt = now + campaign.config.countdownMs;
  }
}

type Blocked = 'not_in_sector' | 'paused';
/** Orders and augment choices only reach a running sector. */
function blocked(campaign: Campaign): Blocked | null {
  if (campaign.phase !== 'sector' || !campaign.world) return 'not_in_sector';
  if (campaign.pause || campaign.resumeAt !== null) return 'paused';
  return null;
}

export function command(campaign: Campaign, player: PlayerId, raw: unknown):
  { accepted: true } | { accepted: false; reason: CommandRejection | Blocked } {
  const refused = blocked(campaign);
  if (refused) return { accepted: false, reason: refused };
  const result = applyCommand(campaign.world!, player, raw);
  if (!result.accepted) return { accepted: false, reason: result.reason };
  campaign.world = result.world;
  return { accepted: true };
}

export function augmentPick(campaign: Campaign, player: PlayerId, choice: number, id: string):
  { ok: true } | { ok: false; reason: string } {
  const refused = blocked(campaign);
  if (refused) return { ok: false, reason: refused };
  const result = pickAugment(campaign.world!, player, choice, id);
  if (!result.accepted) return { ok: false, reason: result.reason };
  campaign.world = result.world;
  return { ok: true };
}

export function augmentReroll(campaign: Campaign, player: PlayerId, choice: number):
  { ok: true } | { ok: false; reason: string } {
  const refused = blocked(campaign);
  if (refused) return { ok: false, reason: refused };
  const result = rerollAugments(campaign.world!, player, choice);
  if (!result.accepted) return { ok: false, reason: result.reason };
  campaign.world = result.world;
  return { ok: true };
}

export function tick(campaign: Campaign, now: number): void {
  if (campaign.startedAt !== null && campaign.result === null && now - campaign.startedAt >= campaign.config.maxCampaignMs) {
    finish(campaign, { winner: null, reason: 'annulled' }, now);
    return;
  }
  switch (campaign.phase) {
    case 'countdown':
      if (now >= campaign.phaseEndsAt!) { campaign.startedAt = now; startSector(campaign, 1, now); }
      return;
    case 'sector': {
      const expired = PLAYERS.find((player) => {
        const seat = campaign.seats[player];
        return seat && !seat.connected && seat.droppedAt !== null
          && now >= seat.droppedAt + campaign.config.reconnectWindowMs;
      });
      if (expired) { forfeit(campaign, expired, now); return; }
      if (campaign.pause) { if (now >= campaign.pause.until) forfeit(campaign, campaign.pause.by, now); return; }
      if (campaign.resumeAt !== null) { if (now < campaign.resumeAt) return; campaign.resumeAt = null; }
      const world = stepWorld(campaign.world!);
      campaign.world = world;
      if (world.winner !== null || world.tick >= campaign.config.sectorLimitTicks) endSector(campaign, world.winner, now);
      return;
    }
    case 'transition':
      if (now >= campaign.phaseEndsAt!) startSector(campaign, campaign.sector + 1, now);
      return;
    case 'results':
      if (now >= campaign.phaseEndsAt!) { campaign.phase = 'closed'; campaign.phaseEndsAt = null; }
      return;
    default:
  }
}

/** The connection dropped without consent. In a sector the simulation pauses while the seat is reserved. */
export function drop(campaign: Campaign, player: PlayerId, now: number): void {
  const seat = campaign.seats[player];
  if (!seat) return;
  seat.connected = false;
  seat.droppedAt = now;
  if (campaign.phase === 'countdown') { backToLobby(campaign); return; }
  if (campaign.phase === 'lobby') { seat.ready = false; return; }
  if (campaign.phase === 'sector' && !campaign.pause) pauseFor(campaign, player, now, now);
}

export function reconnect(campaign: Campaign, player: PlayerId, now: number): void {
  const seat = campaign.seats[player];
  if (!seat) return;
  if (!seat.connected && seat.droppedAt !== null && inCampaign(campaign)
    && now >= seat.droppedAt + campaign.config.reconnectWindowMs) {
    forfeit(campaign, player, now);
    return;
  }
  seat.connected = true;
  seat.droppedAt = null;
  if (campaign.pause?.by !== player) return;
  campaign.pause = null;
  const rival = rivalOf(player);
  const rivalSeat = campaign.seats[rival];
  if (rivalSeat && !rivalSeat.connected) {
    const droppedAt = rivalSeat.droppedAt ?? now;
    if (now >= droppedAt + campaign.config.reconnectWindowMs) {
      forfeit(campaign, rival, now);
      return;
    }
    if (pauseFor(campaign, rival, droppedAt, now)) return;
  }
  campaign.resumeAt = now + campaign.config.resumeCountdownMs;
}

/** The player is gone for good: consented exit or an expired reconnection window. */
export function leave(campaign: Campaign, player: PlayerId, now: number): void {
  const seat = campaign.seats[player];
  if (!seat) return;
  if (campaign.phase === 'lobby' || campaign.phase === 'countdown') {
    campaign.seats[player] = null;
    backToLobby(campaign);
    return;
  }
  seat.connected = false;
  if (inCampaign(campaign)) forfeit(campaign, player, now);
}

export function phaseView(campaign: Campaign, player: PlayerId, now: number): PhaseView {
  const publicSeat = (seat: Seat | null) => (seat ? { name: seat.name, ready: seat.ready, connected: seat.connected } : null);
  return {
    playerId: player,
    phase: campaign.phase,
    sector: campaign.sector,
    sectors: campaign.config.sectors,
    remainingMs: campaign.phaseEndsAt === null ? null : Math.max(0, campaign.phaseEndsAt - now),
    seats: { p1: publicSeat(campaign.seats.p1), p2: publicSeat(campaign.seats.p2) },
    pause: campaign.pause ? { by: campaign.pause.by, remainingMs: Math.max(0, campaign.pause.until - now) } : null,
    resumeInMs: campaign.resumeAt === null ? null : Math.max(0, campaign.resumeAt - now),
    sectorResults: campaign.sectorResults.map((result) => ({ ...result })),
    result: campaign.result ? { ...campaign.result } : null,
  };
}

function pauseFor(campaign: Campaign, player: PlayerId, droppedAt: number, now: number): boolean {
  const seat = campaign.seats[player]!;
  if (seat.pausesUsed >= campaign.config.maxPausesPerPlayer
    || now >= droppedAt + campaign.config.reconnectWindowMs) return false;
  seat.pausesUsed += 1;
  campaign.pause = { by: player, until: droppedAt + campaign.config.reconnectWindowMs };
  campaign.resumeAt = null;
  return true;
}

function backToLobby(campaign: Campaign): void {
  campaign.phase = 'lobby';
  campaign.phaseEndsAt = null;
  for (const player of PLAYERS) { const seat = campaign.seats[player]; if (seat) seat.ready = false; }
}

function startSector(campaign: Campaign, sector: number, now: number): void {
  campaign.phase = 'sector';
  campaign.sector = sector;
  campaign.phaseEndsAt = null;
  const world = campaign.config.createSector(sector, (campaign.seed + sector * 7_919) >>> 0);
  // The previous sector winner gets one extra reroll on this sector's offer.
  const previousWinner = campaign.sectorResults.at(-1)?.winner ?? null;
  prepareCampaignSector(world, {
    choice: Math.min(sector - 1, 2), carried: campaign.augments, pools: campaign.pools,
    extraRerolls: previousWinner ? { [previousWinner]: 1 } : {},
  });
  campaign.world = world;
  campaign.resumeAt = null;
  const absent = PLAYERS.filter((player) => campaign.seats[player] && !campaign.seats[player]!.connected)
    .sort((left, right) => (campaign.seats[left]!.droppedAt ?? now) - (campaign.seats[right]!.droppedAt ?? now))[0];
  if (!absent) return;
  const deadline = (player: PlayerId): number =>
    (campaign.seats[player]!.droppedAt ?? now) + campaign.config.reconnectWindowMs;
  if (now >= deadline(absent)) { forfeit(campaign, absent, now); return; }
  const pausable = [absent, ...PLAYERS.filter((player) => player !== absent && campaign.seats[player] && !campaign.seats[player]!.connected)]
    .find((player) => campaign.seats[player]!.pausesUsed < campaign.config.maxPausesPerPlayer);
  if (pausable) pauseFor(campaign, pausable, campaign.seats[pausable]!.droppedAt ?? now, now);
}

function endSector(campaign: Campaign, winner: PlayerId | null, now: number): void {
  const world = campaign.world!;
  campaign.sectorResults.push({ sector: campaign.sector, winner });
  campaign.sectorProgress.push({ p1: challengeProgress(world, 'p1', 'pvp'), p2: challengeProgress(world, 'p2', 'pvp') });
  for (const player of PLAYERS) {
    campaign.augments[player] = [...(world.augmentMatch?.players[player].chosen ?? campaign.augments[player])];
  }
  if (campaign.sector >= campaign.config.sectors) {
    // The final core decides the campaign; earlier sectors are not victory points.
    finish(campaign, { winner, reason: winner ? 'core' : 'draw' }, now);
    return;
  }
  campaign.phase = 'transition';
  campaign.phaseEndsAt = now + campaign.config.transitionMs;
}

function forfeit(campaign: Campaign, absent: PlayerId, now: number): void {
  const rival = rivalOf(absent);
  const result: CampaignResult = campaign.seats[rival]?.connected
    ? { winner: rival, reason: 'forfeit' }
    : { winner: null, reason: 'annulled' };
  finish(campaign, result, now);
}

function finish(campaign: Campaign, result: CampaignResult, now: number): void {
  campaign.result = result;
  campaign.phase = 'results';
  campaign.phaseEndsAt = now + campaign.config.resultsMs;
  campaign.pause = null;
  campaign.resumeAt = null;
}
