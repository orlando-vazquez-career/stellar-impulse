import { applyCommand, createWorld, stepWorld, type CommandRejection, type PlayerId, type World } from '@impulso/sim';

/**
 * Campaign lifecycle: lobby → countdown → sector 1..N (with transitions) → results → closed.
 * Pure orchestration around the simulator. Time always comes in as `now` (ms); nothing here reads a clock.
 */
export type Phase = 'lobby' | 'countdown' | 'sector' | 'transition' | 'results' | 'closed';

export interface CampaignConfig {
  sectors: number;
  countdownMs: number;
  transitionMs: number;
  resultsMs: number;
  resumeCountdownMs: number;
  reconnectWindowMs: number;
  maxPausesPerPlayer: number;
  /** Safety cap per sector. Sector timing and tiebreak rules belong to the simulator (D03). */
  sectorLimitTicks: number;
  maxCampaignMs: number;
  /** Options offered after sector n are `techOffers[n - 1]`; the first one is the visible default. */
  techOffers: readonly (readonly string[])[];
  createSector: (sector: number) => World;
}

/** The training world and these technology ids are placeholders until the sector templates and D06 land. */
export const DEFAULT_CONFIG: Readonly<CampaignConfig> = Object.freeze({
  sectors: 3,
  countdownMs: 5_000,
  transitionMs: 25_000,
  resultsMs: 60_000,
  resumeCountdownMs: 3_000,
  reconnectWindowMs: 60_000,
  maxPausesPerPlayer: 2,
  sectorLimitTicks: 8 * 60 * 10,
  maxCampaignMs: 30 * 60_000,
  techOffers: [['interceptor-speed', 'frigate-shield', 'bomber-siege'], ['vision-range', 'field-repair', 'node-activation']],
  createSector: () => createWorld(),
});

export interface Seat { name: string; ready: boolean; connected: boolean; pausesUsed: number; droppedAt: number | null }
export interface SectorResult { sector: number; winner: PlayerId | null }
export interface CampaignResult { winner: PlayerId | null; reason: 'core' | 'draw' | 'forfeit' | 'annulled' }
export interface Campaign {
  config: CampaignConfig;
  phase: Phase;
  sector: number;
  phaseEndsAt: number | null;
  seats: Record<PlayerId, Seat | null>;
  world: World | null;
  sectorResults: SectorResult[];
  techChoices: Record<PlayerId, string[]>;
  pendingTech: Record<PlayerId, string | null>;
  pause: { by: PlayerId; until: number } | null;
  resumeAt: number | null;
  startedAt: number | null;
  result: CampaignResult | null;
}
export interface PhaseView {
  phase: Phase;
  sector: number;
  sectors: number;
  remainingMs: number | null;
  seats: Record<PlayerId, { name: string; ready: boolean; connected: boolean } | null>;
  pause: { by: PlayerId; remainingMs: number } | null;
  resumeInMs: number | null;
  sectorResults: SectorResult[];
  offers: string[] | null;
  myTech: string | null;
  rivalChoseTech: boolean;
  myTechnologies: string[];
  result: CampaignResult | null;
}

const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
const rivalOf = (player: PlayerId): PlayerId => (player === 'p1' ? 'p2' : 'p1');
const inCampaign = (campaign: Campaign): boolean => campaign.phase === 'sector' || campaign.phase === 'transition';
const currentOffers = (campaign: Campaign): readonly string[] => campaign.config.techOffers[campaign.sector - 1] ?? [];

export function createCampaign(overrides: Partial<CampaignConfig> = {}): Campaign {
  return {
    config: { ...DEFAULT_CONFIG, ...overrides },
    phase: 'lobby', sector: 0, phaseEndsAt: null,
    seats: { p1: null, p2: null },
    world: null, sectorResults: [],
    techChoices: { p1: [], p2: [] }, pendingTech: { p1: null, p2: null },
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

export function command(campaign: Campaign, player: PlayerId, raw: unknown):
  { accepted: true } | { accepted: false; reason: CommandRejection | 'not_in_sector' | 'paused' } {
  if (campaign.phase !== 'sector' || !campaign.world) return { accepted: false, reason: 'not_in_sector' };
  if (campaign.pause || campaign.resumeAt !== null) return { accepted: false, reason: 'paused' };
  const result = applyCommand(campaign.world, player, raw);
  if (!result.accepted) return { accepted: false, reason: result.reason };
  campaign.world = result.world;
  return { accepted: true };
}

export function chooseTech(campaign: Campaign, player: PlayerId, techId: string):
  { ok: true } | { ok: false; reason: 'not_in_transition' | 'unknown_tech' } {
  if (campaign.phase !== 'transition') return { ok: false, reason: 'not_in_transition' };
  if (!currentOffers(campaign).includes(techId)) return { ok: false, reason: 'unknown_tech' };
  campaign.pendingTech[player] = techId;
  return { ok: true };
}

export function tick(campaign: Campaign, now: number): void {
  if (campaign.startedAt !== null && campaign.result === null && now - campaign.startedAt >= campaign.config.maxCampaignMs) {
    finish(campaign, { winner: null, reason: 'annulled' }, now);
    return;
  }
  switch (campaign.phase) {
    case 'countdown':
      if (now >= campaign.phaseEndsAt!) { campaign.startedAt = now; startSector(campaign, 1); }
      return;
    case 'sector': {
      if (campaign.pause) { if (now >= campaign.pause.until) forfeit(campaign, campaign.pause.by, now); return; }
      if (campaign.resumeAt !== null) { if (now < campaign.resumeAt) return; campaign.resumeAt = null; }
      const world = stepWorld(campaign.world!);
      campaign.world = world;
      if (world.winner !== null || world.tick >= campaign.config.sectorLimitTicks) endSector(campaign, world.winner, now);
      return;
    }
    case 'transition':
      if (now >= campaign.phaseEndsAt!) { commitTechnologies(campaign); startSector(campaign, campaign.sector + 1); }
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
  if (campaign.phase === 'sector' && !campaign.pause) pauseFor(campaign, player, now);
}

export function reconnect(campaign: Campaign, player: PlayerId, now: number): void {
  const seat = campaign.seats[player];
  if (!seat) return;
  seat.connected = true;
  seat.droppedAt = null;
  if (campaign.pause?.by !== player) return;
  campaign.pause = null;
  const rival = rivalOf(player);
  const rivalSeat = campaign.seats[rival];
  if (rivalSeat && !rivalSeat.connected && pauseFor(campaign, rival, rivalSeat.droppedAt ?? now)) return;
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
    phase: campaign.phase,
    sector: campaign.sector,
    sectors: campaign.config.sectors,
    remainingMs: campaign.phaseEndsAt === null ? null : Math.max(0, campaign.phaseEndsAt - now),
    seats: { p1: publicSeat(campaign.seats.p1), p2: publicSeat(campaign.seats.p2) },
    pause: campaign.pause ? { by: campaign.pause.by, remainingMs: Math.max(0, campaign.pause.until - now) } : null,
    resumeInMs: campaign.resumeAt === null ? null : Math.max(0, campaign.resumeAt - now),
    sectorResults: campaign.sectorResults.map((result) => ({ ...result })),
    offers: campaign.phase === 'transition' ? [...currentOffers(campaign)] : null,
    myTech: campaign.pendingTech[player],
    rivalChoseTech: campaign.pendingTech[rivalOf(player)] !== null,
    myTechnologies: [...campaign.techChoices[player]],
    result: campaign.result ? { ...campaign.result } : null,
  };
}

function pauseFor(campaign: Campaign, player: PlayerId, droppedAt: number): boolean {
  const seat = campaign.seats[player]!;
  if (seat.pausesUsed >= campaign.config.maxPausesPerPlayer) return false;
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

function startSector(campaign: Campaign, sector: number): void {
  campaign.phase = 'sector';
  campaign.sector = sector;
  campaign.phaseEndsAt = null;
  campaign.world = campaign.config.createSector(sector);
  campaign.pendingTech = { p1: null, p2: null };
  campaign.resumeAt = null;
}

function endSector(campaign: Campaign, winner: PlayerId | null, now: number): void {
  campaign.sectorResults.push({ sector: campaign.sector, winner });
  if (campaign.sector >= campaign.config.sectors) {
    // The final core decides the campaign; earlier sectors are not victory points.
    finish(campaign, { winner, reason: winner ? 'core' : 'draw' }, now);
    return;
  }
  campaign.phase = 'transition';
  campaign.phaseEndsAt = now + campaign.config.transitionMs;
  campaign.pendingTech = { p1: null, p2: null };
}

function commitTechnologies(campaign: Campaign): void {
  const fallback = currentOffers(campaign)[0];
  for (const player of PLAYERS) {
    const choice = campaign.pendingTech[player] ?? fallback;
    if (choice) campaign.techChoices[player].push(choice);
  }
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
