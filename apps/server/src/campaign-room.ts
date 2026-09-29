import { Room, ServerError, type Client } from '@colyseus/core';
import { openEnvelope, parseJoinOptions, parseReady, parseTechChoice, PROTOCOL_VERSION } from '@impulso/input';
import type { PlayerId } from '@impulso/sim';
import { viewFor } from '@impulso/state';
import * as campaigns from './campaign/machine';

const TICK_MS = 100;
const LOBBY_TIMEOUT_MS = 15 * 60_000;
const COMMANDS_PER_SECOND = 20;

/** Colyseus adapter for the campaign machine: admission, messages, reconnection and per-player views. */
export class CampaignRoom extends Room {
  maxClients = 2;
  /** Hard cut: Colyseus disconnects above this. The per-command soft limit below only rejects. */
  maxMessagesPerSecond = 40;
  protected overrides: Partial<campaigns.CampaignConfig> = {};
  private campaign!: campaigns.Campaign;
  private seats = new Map<string, PlayerId>();
  private rates = new Map<string, { second: number; count: number }>();
  private ticks = 0;
  private announcedEnd = false;

  onCreate() {
    this.campaign = campaigns.createCampaign(this.overrides);
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
      if (!this.withinRate(client)) return this.reject(client, 'rate_limit');
      const result = campaigns.command(this.campaign, player, body);
      if (!result.accepted) this.reject(client, result.reason);
    }));
    this.setSimulationInterval(() => this.step(), TICK_MS);
    this.clock.setTimeout(() => {
      if (this.campaign.phase === 'lobby' || this.campaign.phase === 'countdown') void this.disconnect();
    }, LOBBY_TIMEOUT_MS);
  }

  /** Admission: the client must speak this protocol version. A wallet is never an identity here. */
  onAuth(_client: Client, options: unknown) {
    const parsed = parseJoinOptions(options);
    if (!parsed.ok) throw new ServerError(4002, parsed.reason);
    return { name: parsed.name };
  }

  onJoin(client: Client) {
    const name = (client.auth as { name?: string } | undefined)?.name ?? 'Comandante';
    const seated = campaigns.join(this.campaign, name);
    if (!seated.ok) { client.leave(4001); return; }
    this.seats.set(client.sessionId, seated.player);
    if (this.campaign.seats.p1 && this.campaign.seats.p2) void this.lock();
    this.sendPhase();
  }

  /** Lost connection without consent: reserve the seat and pause the sector. */
  onDrop(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    const now = Date.now();
    campaigns.drop(this.campaign, player, now);
    void this.allowReconnection(client, Math.ceil(this.campaign.config.reconnectWindowMs / 1000));
    if (this.campaign.pause?.by === player) {
      this.broadcast('paused', { protocolVersion: PROTOCOL_VERSION, by: player, remainingMs: this.campaign.pause.until - now });
    }
    this.sendPhase(now);
  }

  onReconnect(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    campaigns.reconnect(this.campaign, player, Date.now());
    if (this.campaign.world) client.send('view', viewFor(this.campaign.world, player));
    this.sendPhase();
  }

  /** Consented exit or expired reconnection window. A seat never passes to a stranger mid-campaign. */
  onLeave(client: Client) {
    const player = this.seats.get(client.sessionId);
    this.rates.delete(client.sessionId);
    if (!player) return;
    campaigns.leave(this.campaign, player, Date.now());
    if (this.campaign.seats[player] === null) {
      this.seats.delete(client.sessionId);
      void this.unlock();
    }
    this.sendPhase();
  }

  private step() {
    const now = Date.now();
    const before = this.campaign.phase;
    campaigns.tick(this.campaign, now);
    const { world, phase, pause, resumeAt } = this.campaign;
    if (phase === 'sector' && world && !pause && resumeAt === null) {
      for (const client of this.clients) {
        const player = this.seats.get(client.sessionId);
        if (player) client.send('view', viewFor(world, player));
      }
    }
    this.ticks += 1;
    if (phase !== before || this.ticks % 10 === 0) this.sendPhase(now);
    if (phase === 'results' && !this.announcedEnd) {
      this.announcedEnd = true;
      this.broadcast('campaign_end', { protocolVersion: PROTOCOL_VERSION, result: this.campaign.result, sectorResults: this.campaign.sectorResults });
    }
    if (phase === 'closed') void this.disconnect();
  }

  /** Each player gets its own phase view: technology picks stay private until they activate. */
  private sendPhase(now = Date.now()) {
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      if (player) client.send('phase', { protocolVersion: PROTOCOL_VERSION, ...campaigns.phaseView(this.campaign, player, now) });
    }
  }

  private withEnvelope(client: Client, message: unknown, handle: (player: PlayerId, body: unknown) => void) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    const opened = openEnvelope(message);
    if (!opened.ok) { this.reject(client, opened.reason); return; }
    handle(player, opened.body);
  }

  private withinRate(client: Client): boolean {
    const second = Math.floor(Date.now() / 1000);
    const bucket = this.rates.get(client.sessionId);
    const current = bucket && bucket.second === second ? bucket : { second, count: 0 };
    current.count += 1;
    this.rates.set(client.sessionId, current);
    return current.count <= COMMANDS_PER_SECOND;
  }

  private reject(client: Client, reason: string) {
    client.send('rejected', { protocolVersion: PROTOCOL_VERSION, reason });
  }
}

/** Timing overrides come from server code (tests, future modes), never from client join options. */
export function campaignRoomWith(overrides: Partial<campaigns.CampaignConfig>): typeof CampaignRoom {
  return class extends CampaignRoom {
    protected overrides = overrides;
  };
}
