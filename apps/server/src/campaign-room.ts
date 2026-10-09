import { Room, ServerError, type Client } from '@colyseus/core';
import { randomBytes, randomInt } from 'node:crypto';
import {
  CAMPAIGN_PROTOCOL_VERSION, DEFAULT_CAMPAIGN_MAP, openCampaignEnvelope, parseAugmentPick, parseAugmentReroll,
  parseCampaignJoinOptions, parseCommand, parseReady, type CampaignMap,
} from '@impulso/input';
import { createMatchWorld, type MatchReward, type PlayerId } from '@impulso/sim';
import { viewFor } from '@impulso/state';
import * as campaigns from './campaign/machine';
import type { AuthService } from './auth';
import { savedReward } from './rewards';

const TICK_MS = 100;
const LOBBY_TIMEOUT_MS = 15 * 60_000;
/** Squad-weighted actions per player and second: a group order costs one per squad. */
const SQUAD_ACTIONS_PER_SECOND = 32;

/** Colyseus adapter for the campaign machine: admission, messages, reconnection and per-player views. */
export class CampaignRoom extends Room {
  maxClients = 2;
  /** Hard cut: Colyseus disconnects above this. The per-command soft limit below only rejects. */
  maxMessagesPerSecond = 40;
  protected overrides: Partial<campaigns.CampaignConfig> = {};
  protected auth!: AuthService;
  private campaign!: campaigns.Campaign;
  private seats = new Map<string, PlayerId>();
  private users = new Map<string, PlayerId>();
  private rates = new Map<PlayerId, { second: number; count: number }>();
  private ticks = 0;
  private announcedEnd = false;
  /** Every sector of this campaign is played on this map. */
  private map: CampaignMap = DEFAULT_CAMPAIGN_MAP;

  onCreate(options?: unknown) {
    this.roomId = randomBytes(6).toString('hex').toUpperCase();
    const parsed = parseCampaignJoinOptions(options);
    this.map = parsed.ok && parsed.map ? parsed.map : DEFAULT_CAMPAIGN_MAP;
    const map = this.map;
    this.campaign = campaigns.createCampaign({
      createSector: (_sector, seed) => createMatchWorld(map, 'skirmish', seed),
      ...this.overrides,
    }, randomInt(0x100000000));
    void this.setPrivate(true);
    this.onMessage('ready', (client, message) => this.withEnvelope(client, message, (player, body) => {
      if (!parseReady(body)) return this.reject(client, 'invalid_ready');
      campaigns.ready(this.campaign, player, Date.now());
      this.sendPhase();
    }));
    this.onMessage('command', (client, message) => this.withEnvelope(client, message, (player, body) => {
      const parsed = parseCommand(body);
      const cost = parsed.ok && 'squadIds' in parsed.command ? parsed.command.squadIds.length : 1;
      if (!this.withinRate(player, cost)) return this.reject(client, 'rate_limit');
      const result = campaigns.command(this.campaign, player, body);
      if (!result.accepted) return this.reject(client, result.reason);
      if (parsed.ok) client.send('ack', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, seq: parsed.command.seq });
    }));
    this.onMessage('augmentPick', (client, message) => this.withEnvelope(client, message, (player, body) => {
      const parsed = parseAugmentPick(body);
      if (!parsed.ok) return this.reject(client, parsed.reason);
      const result = campaigns.augmentPick(this.campaign, player, parsed.choice, parsed.id);
      if (!result.ok) this.reject(client, result.reason);
    }));
    this.onMessage('augmentReroll', (client, message) => this.withEnvelope(client, message, (player, body) => {
      const parsed = parseAugmentReroll(body);
      if (!parsed.ok) return this.reject(client, parsed.reason);
      const result = campaigns.augmentReroll(this.campaign, player, parsed.choice);
      if (!result.ok) this.reject(client, result.reason);
    }));
    this.setSimulationInterval(() => this.step(), TICK_MS);
    this.clock.setTimeout(() => {
      if (this.campaign.phase === 'lobby' || this.campaign.phase === 'countdown') void this.disconnect();
    }, LOBBY_TIMEOUT_MS);
  }

  /** Admission: the client must speak this protocol version and hold an account session. */
  onAuth(_client: Client, options: unknown) {
    const parsed = parseCampaignJoinOptions(options);
    if (!parsed.ok) throw new ServerError(4002, parsed.reason);
    const user = this.auth.getUser(parsed.token);
    if (!user) throw new ServerError(4003, 'authentication_required');
    if (this.users.has(user.id)) throw new ServerError(4004, 'already_in_room');
    return { name: parsed.name, userId: user.id };
  }

  onJoin(client: Client) {
    const name = (client.auth as { name?: string } | undefined)?.name ?? 'Comandante';
    const seated = campaigns.join(this.campaign, name);
    if (!seated.ok) { client.leave(4001); return; }
    this.seats.set(client.sessionId, seated.player);
    const userId = (client.auth as { userId: string }).userId;
    this.users.set(userId, seated.player);
    // The account's unlocked augments feed every sector offer.
    this.campaign.pools[seated.player] = this.auth.profile(userId).unlocked;
    if (this.campaign.seats.p1 && this.campaign.seats.p2) void this.lock();
    this.sendPhase();
  }

  /** Lost connection without consent: reserve the seat and pause the sector. */
  onDrop(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    const now = Date.now();
    campaigns.drop(this.campaign, player, now);
    // Expiry and room disposal reject this reservation; onLeave owns the seat lifecycle.
    void this.allowReconnection(client, Math.ceil(this.campaign.config.reconnectWindowMs / 1000)).catch(() => {});
    if (this.campaign.pause?.by === player) {
      this.broadcast('paused', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, by: player, remainingMs: this.campaign.pause.until - now });
    }
    this.sendPhase(now);
  }

  onReconnect(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    campaigns.reconnect(this.campaign, player, Date.now());
    if (this.campaign.phase === 'sector' && this.campaign.world) client.send('view', this.viewOf(player));
    this.sendPhase();
  }

  /** Consented exit or expired reconnection window. A seat never passes to a stranger mid-campaign. */
  onLeave(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    campaigns.leave(this.campaign, player, Date.now());
    if (this.campaign.seats[player] === null) {
      this.seats.delete(client.sessionId);
      const userId = (client.auth as { userId: string }).userId;
      this.users.delete(userId);
      delete this.campaign.pools[player];
      void this.unlock();
    }
    this.sendPhase();
  }

  private step() {
    const now = Date.now();
    const before = this.campaign.phase;
    const beforeSector = this.campaign.sector;
    campaigns.tick(this.campaign, now);
    const { world, phase, pause, resumeAt } = this.campaign;
    // A new sector shows its opening offer at once, even while a dropped player keeps it paused.
    const newSector = phase === 'sector' && (before !== 'sector' || beforeSector !== this.campaign.sector);
    if (world && phase === 'sector' && (newSector || (!pause && resumeAt === null))) {
      for (const client of this.clients) {
        const player = this.seats.get(client.sessionId);
        if (player) client.send('view', this.viewOf(player));
      }
    }
    this.ticks += 1;
    if (phase !== before || this.ticks % 10 === 0) this.sendPhase(now);
    if (phase === 'results' && !this.announcedEnd) {
      this.announcedEnd = true;
      void this.announceEnd();
    }
    if (phase === 'closed') void this.disconnect();
  }

  /** The player's private view of the current sector, from the same projection training uses. */
  private viewOf(player: PlayerId) {
    return { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, ...viewFor(this.campaign.world!, player) };
  }

  /** Saves each seated account's campaign reward once, then tells every player its own reward. */
  private async announceEnd() {
    const { result, sectorResults, sectorProgress } = this.campaign;
    const rewards = new Map<PlayerId, MatchReward>();
    await Promise.all([...this.users].map(async ([userId, player]) => {
      const sectors = sectorProgress.map((progress) => progress[player]);
      rewards.set(player, await savedReward(this.auth, userId,
        () => this.auth.awardCampaign(userId, `campaign:${this.roomId}`, result!, sectorResults.length, player, sectors)));
    }));
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      const reward = player ? rewards.get(player) : undefined;
      client.send('campaign_end', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, result, sectorResults, ...(reward ? { reward } : {}) });
    }
  }

  /** Each player gets its own phase view. */
  private sendPhase(now = Date.now()) {
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      if (player) client.send('phase', {
        protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
        ...campaigns.phaseView(this.campaign, player, now),
        renderMap: this.map,
      });
    }
  }

  private withEnvelope(client: Client, message: unknown, handle: (player: PlayerId, body: unknown) => void) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    const opened = openCampaignEnvelope(message);
    if (!opened.ok) { this.reject(client, opened.reason); return; }
    handle(player, opened.body);
  }

  private withinRate(player: PlayerId, cost: number): boolean {
    const second = Math.floor(Date.now() / 1000);
    const bucket = this.rates.get(player);
    const current = bucket && bucket.second === second ? bucket : { second, count: 0 };
    current.count += cost;
    this.rates.set(player, current);
    return current.count <= SQUAD_ACTIONS_PER_SECOND;
  }

  private reject(client: Client, reason: string) {
    client.send('rejected', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, reason });
  }
}

/** Timing overrides come from server code (tests, future modes), never from client join options. */
export function campaignRoomWith(overrides: Partial<campaigns.CampaignConfig>, auth: AuthService): typeof CampaignRoom {
  return class extends CampaignRoom {
    protected overrides = overrides;
    protected auth = auth;
  };
}
