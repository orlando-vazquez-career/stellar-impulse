import { Room, ServerError, type Client } from '@colyseus/core';
import {
  CAMPAIGN_PROTOCOL_VERSION,
  openCampaignEnvelope,
  parseBattlefieldCommand,
  parseCampaignJoinOptions,
} from '@impulso/input';
import {
  applyBattlefieldCommand,
  cloneBattlefieldWorld,
  createBattlefieldWorld,
  SECTOR_01_BATTLEFIELD_MAP,
  stepBattlefieldWorld,
  type BattlefieldRejection,
  type BattlefieldWorld,
  type PlayerId,
} from '@impulso/sim';
import { battlefieldViewFor } from '@impulso/state';
import { publicMapMetadata } from './map-catalog';

const TICK_MS = 100;
const SQUAD_ACTIONS_PER_SECOND = 32;
const MAX_SEARCH_EXPANSIONS_PER_TICK = 32_768;
const RECONNECT_WINDOW_SECONDS = 60;
const IDLE_ROOM_TIMEOUT_MS = 15 * 60_000;

/** Development battlefield adapter: transport and admission only; simulation stays in packages/sim. */
export class BattlefieldRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 40;
  private world: BattlefieldWorld = createBattlefieldWorld(SECTOR_01_BATTLEFIELD_MAP);
  private seats = new Map<string, PlayerId>();
  private usedSeats = new Set<PlayerId>();
  private rates = new Map<PlayerId, { second: number; count: number }>();
  private remainingExpansions = MAX_SEARCH_EXPANSIONS_PER_TICK;
  private forfeited = false;
  private readySeats = new Set<PlayerId>();
  private simulationStarted = false;

  onCreate() {
    this.onMessage('ready', (client) => {
      const player = this.seats.get(client.sessionId);
      if (!player) return;
      this.readySeats.add(player);
      this.sendMapAndView(client, player);
      if (!this.simulationStarted && this.readySeats.size === 2) {
        this.simulationStarted = true;
        this.setSimulationInterval(() => this.step(), TICK_MS);
      }
    });
    this.onMessage('command', (client, message) => {
      const player = this.seats.get(client.sessionId);
      if (!player) return;
      const opened = openCampaignEnvelope(message);
      if (!opened.ok) {
        this.reject(client, opened.reason);
        return;
      }
      const parsed = parseBattlefieldCommand(opened.body);
      const cost = parsed.ok ? parsed.command.squadIds.length : 1;
      if (!this.withinRate(player, cost)) {
        this.reject(client, 'rate_limit');
        return;
      }
      const result = applyBattlefieldCommand(this.world, player, opened.body, this.remainingExpansions);
      this.remainingExpansions -= result.expansions;
      if (!result.accepted) {
        this.reject(client, result.reason);
        return;
      }
      this.world = result.world;
      if (parsed.ok) client.send('ack', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, seq: parsed.command.seq });
      this.broadcastViews();
    });
    this.clock.setTimeout(() => {
      if (!this.simulationStarted) void this.disconnect();
    }, IDLE_ROOM_TIMEOUT_MS);
  }

  onAuth(_client: Client, options: unknown) {
    const parsed = parseCampaignJoinOptions(options);
    if (!parsed.ok) throw new ServerError(4002, parsed.reason);
    return { name: parsed.name };
  }

  onJoin(client: Client) {
    const player = !this.usedSeats.has('p1') ? 'p1' : !this.usedSeats.has('p2') ? 'p2' : undefined;
    if (!player) {
      void client.leave(4001);
      return;
    }
    this.usedSeats.add(player);
    this.seats.set(client.sessionId, player);
    if (this.usedSeats.size === 2) void this.lock();
  }

  onLeave(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (!player) return;
    this.seats.delete(client.sessionId);
    this.rates.delete(player);
    this.readySeats.delete(player);
    if (!this.forfeited) this.forfeit(player);
  }

  onDrop(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (!player || this.forfeited) return;
    void this.allowReconnection(client, RECONNECT_WINDOW_SECONDS).catch(() => this.forfeit(player));
  }

  onReconnect(client: Client) {
    const player = this.seats.get(client.sessionId);
    if (player && !this.forfeited) this.sendMapAndView(client, player);
  }

  private forfeit(player: PlayerId) {
    if (this.forfeited || this.world.winner !== null) return;
    this.forfeited = true;
    const next = cloneBattlefieldWorld(this.world);
    next.winner = player === 'p1' ? 'p2' : 'p1';
    this.world = next;
    this.broadcastViews();
    this.clock.setTimeout(() => void this.disconnect(), 1_000);
  }

  private step() {
    if (this.world.winner === null) {
      this.world = stepBattlefieldWorld(this.world);
      this.remainingExpansions = MAX_SEARCH_EXPANSIONS_PER_TICK;
    }
    this.broadcastViews();
  }

  private broadcastViews() {
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      if (player) client.send('view', battlefieldViewFor(this.world, player));
    }
  }

  private sendMapAndView(client: Client, player: PlayerId) {
    client.send('map', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, ...publicMapMetadata(this.world.map) });
    client.send('view', battlefieldViewFor(this.world, player));
  }

  private withinRate(player: PlayerId, cost: number): boolean {
    const second = Math.floor(Date.now() / 1_000);
    const current = this.rates.get(player);
    const bucket = current && current.second === second ? current : { second, count: 0 };
    bucket.count += cost;
    this.rates.set(player, bucket);
    return bucket.count <= SQUAD_ACTIONS_PER_SECOND;
  }

  private reject(client: Client, reason: BattlefieldRejection | 'invalid_envelope' | 'unsupported_version' | 'rate_limit') {
    const messages: Record<string, string> = {
      invalid_envelope: 'No puedo procesar esa orden.',
      unsupported_version: 'La versión del cliente no es compatible.',
      invalid_command: 'No puedo hacer eso.',
      stale_sequence: 'Esa orden ya fue procesada.',
      unit_unavailable: 'Esta nave ya no puede actuar.',
      out_of_bounds: 'No puedo ir ahí.',
      blocked: 'No puedo ir ahí.',
      unreachable: 'No puedo llegar ahí.',
      budget_exceeded: 'No puedo calcular esa ruta ahora.',
      unknown_target: 'No puedo atacar ese objetivo.',
      friendly_target: 'No puedo atacar una nave aliada.',
      target_destroyed: 'Ese objetivo ya fue destruido.',
      target_not_visible: 'No puedo atacar un objetivo que no veo.',
      target_unavailable: 'Ese objetivo todavía no está disponible.',
      cannot_attack: 'Esta nave no puede atacar.',
      match_finished: 'La batalla ya terminó.',
      unknown_player: 'No puedo hacer eso.',
      rate_limit: 'No puedo hacer eso tan rápido.',
    };
    client.send('rejected', {
      protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
      reason,
      message: messages[reason] ?? 'No puedo hacer eso.',
    });
  }
}
