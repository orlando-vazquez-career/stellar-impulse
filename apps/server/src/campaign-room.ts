import { Room, ServerError, type Client } from '@colyseus/core';
import { randomBytes } from 'node:crypto';
import {
  CAMPAIGN_PROTOCOL_VERSION, openCampaignEnvelope, parseBattlefieldCommand,
  parseCampaignJoinOptions, parseReady, parseTechChoice,
} from '@impulso/input';
import { createBattlefieldWorld, SECTOR_01_BATTLEFIELD_MAP, type MatchReward, type PlayerId } from '@impulso/sim';
import { battlefieldViewFor } from '@impulso/state';
import * as campaigns from './campaign/machine';
import { publicMapMetadata } from './map-catalog';
import type { AuthService } from './auth';

const TICK_MS = 100;
const LOBBY_TIMEOUT_MS = 15 * 60_000;
const SQUAD_ACTIONS_PER_SECOND = 32;
const SEARCH_EXPANSIONS_PER_TICK = 32768;

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
  private remainingExpansions = SEARCH_EXPANSIONS_PER_TICK;
  private budgetSector = -1;
  private budgetTick = -1;
  private ticks = 0;
  private announcedEnd = false;
  private renderMap?: 'sector-01';

  onCreate(options?: unknown) {
    this.roomId = randomBytes(6).toString('hex').toUpperCase();
    const parsed = parseCampaignJoinOptions(options);
    this.renderMap = parsed.ok && parsed.map === 'sector-01' && !this.overrides.createSector ? 'sector-01' : undefined;
    this.campaign = campaigns.createCampaign({
      ...(this.renderMap ? { createSector: () => createBattlefieldWorld(SECTOR_01_BATTLEFIELD_MAP) } : {}),
      ...this.overrides,
    });
    void this.setPrivate(true);
    this.onMessage('ready', (client, message) => this.withEnvelope(client, message, (player, body) => {
      if (!parseReady(body)) return this.reject(client, 'invalid_ready');
      campaigns.ready(this.campaign, player, Date.now());
      this.sendPhase();
    }));
    this.onMessage('tech', (client, message) => this.withEnvelope(client, message, (player, body) => {
      const parsed = parseTechChoice(body);
      if (!parsed.ok) return this.reject(client, parsed.reason);
      const chosen = campaigns.chooseTech(this.campaign, player, parsed.techId);
      if (!chosen.ok) return this.reject(client, chosen.reason);
      this.sendPhase();
    }));
    this.onMessage('command', (client, message) => this.withEnvelope(client, message, (player, body) => {
      const parsed = parseBattlefieldCommand(body);
      const cost = parsed.ok ? parsed.command.squadIds.length : 1;
      if (!this.withinRate(player, cost)) return this.reject(client, 'rate_limit');
      const result = this.runCommand(player, body);
      if (!result.accepted) this.reject(client, result.reason);
      else if (parsed.ok) client.send('ack', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, seq: parsed.command.seq });
    }));
    this.setSimulationInterval(() => this.step(), TICK_MS);
    this.clock.setTimeout(() => {
      if (this.campaign.phase === 'lobby' || this.campaign.phase === 'countdown') void this.disconnect();
    }, LOBBY_TIMEOUT_MS);
  }

  /** Admission: the client must speak this protocol version. A wallet is never an identity here. */
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
    if (this.campaign.phase === 'sector' && this.campaign.world) {
      this.sendMap(client);
      client.send('view', battlefieldViewFor(this.campaign.world, player));
    }
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
    this.syncSearchBudget();
    const newSector = phase === 'sector' && world && (before !== 'sector' || beforeSector !== this.campaign.sector);
    if (newSector) {
      for (const client of this.clients) {
        const player = this.seats.get(client.sessionId);
        if (player) { this.sendMap(client); client.send('view', battlefieldViewFor(world, player)); }
      }
    }
    if (phase === 'sector' && world && !pause && resumeAt === null && !newSector) {
      for (const client of this.clients) {
        const player = this.seats.get(client.sessionId);
        if (player) client.send('view', battlefieldViewFor(world, player));
      }
    }
    this.ticks += 1;
    if (phase !== before || this.ticks % 10 === 0) this.sendPhase(now);
    if (phase === 'results' && !this.announcedEnd) {
      this.announcedEnd = true;
      this.announceEnd();
    }
    if (phase === 'closed') void this.disconnect();
  }

  /** Saves each seated account's campaign XP once, then tells every player its own reward. */
  private announceEnd() {
    const { result, sectorResults } = this.campaign;
    const rewards = new Map<PlayerId, MatchReward>();
    for (const [userId, player] of this.users) {
      rewards.set(player, this.auth.awardCampaign(userId, `campaign:${this.roomId}`, result!, sectorResults.length, player));
    }
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      const reward = player ? rewards.get(player) : undefined;
      client.send('campaign_end', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, result, sectorResults, ...(reward ? { reward } : {}) });
    }
  }

  /** Each player gets its own phase view: technology picks stay private until they activate. */
  private sendPhase(now = Date.now()) {
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      if (player) client.send('phase', {
        protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
        ...campaigns.phaseView(this.campaign, player, now),
        ...(this.renderMap ? { renderMap: this.renderMap } : {}),
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

  private runCommand(player: PlayerId, body: unknown): ReturnType<typeof campaigns.command> {
    this.syncSearchBudget();
    const result = campaigns.command(this.campaign, player, body, this.remainingExpansions);
    this.remainingExpansions -= result.expansions;
    return result;
  }

  /** Reset only when the authoritative world advances or a new sector starts. */
  private syncSearchBudget(): void {
    const world = this.campaign.world;
    if (this.campaign.phase !== 'sector' || !world) return;
    if (this.budgetSector !== this.campaign.sector || this.budgetTick !== world.tick) {
      this.budgetSector = this.campaign.sector;
      this.budgetTick = world.tick;
      this.remainingExpansions = SEARCH_EXPANSIONS_PER_TICK;
    }
  }

  private sendMap(client: Client): void {
    const world = this.campaign.world;
    if (world) client.send('map', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, ...publicMapMetadata(world.map) });
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
