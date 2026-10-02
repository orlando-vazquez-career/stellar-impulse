import { Room, type Client } from '@colyseus/core';
import { parseCommand } from '@impulso/input';
import { createSectorWorld, applyCommand, runTrainingRival, stepWorld, type AiMemory, type PlayerId, type RivalDifficulty, type TrainingMapId } from '@impulso/sim';
import { viewFor } from '@impulso/state';

/** Diego's Espiral Estelar is the training map unless the creator asks for Sector 01. */
const DEFAULT_MAP: TrainingMapId = 'espiral';

export class TrainingRoom extends Room {
  maxClients = 2;
  private world = createSectorWorld(DEFAULT_MAP);
  private seats = new Map<string, PlayerId>();
  private usedSeats = new Set<PlayerId>();
  private rates = new Map<string, { tick: number; count: number }>();
  private enemyMemory = new Map<string, AiMemory>();
  private difficulty: RivalDifficulty = 'medium';

  private reject(client: Client, reason: string): void {
    const messages: Record<string, string> = {
      blocked_destination: 'No puedo ir ahí.',
      unreachable_destination: 'No puedo llegar ahí.',
      target_not_visible: 'No puedo atacar un objetivo que no veo.',
      target_destroyed: 'Ese objetivo ya fue destruido.',
      friendly_target: 'No puedo hacer eso.',
      squad_destroyed: 'Esta nave ya no puede actuar.',
      rate_limit: 'No puedo hacer eso tan rápido.',
    };
    client.send('rejected', { reason, message: messages[reason] ?? 'No puedo hacer eso.' });
  }

  /** The room creator picks the map and the rival's difficulty; anything unexpected falls back to the defaults. */
  onCreate(options?: unknown) {
    const fields = typeof options === 'object' && options !== null ? options as { difficulty?: unknown; map?: unknown } : {};
    const requested = fields.difficulty;
    if (requested === 'easy' || requested === 'medium' || requested === 'hard') this.difficulty = requested;
    if (fields.map === 'espiral' || fields.map === 'sector-01') this.world = createSectorWorld(fields.map);
    this.setPrivate(true);
    this.onMessage('command', (client, command: unknown) => {
      const player = this.seats.get(client.sessionId);
      if (!player) return;
      const bucket = this.rates.get(client.sessionId) ?? { tick: this.world.tick, count: 0 };
      if (this.world.tick - bucket.tick >= 10) { bucket.tick = this.world.tick; bucket.count = 0; }
      bucket.count += 1;
      this.rates.set(client.sessionId, bucket);
      if (bucket.count > 20) { this.reject(client, 'rate_limit'); return; }
      const result = applyCommand(this.world, player, command);
      if (result.accepted) this.world = result.world;
      else { this.reject(client, result.reason); return; }
      const parsed = parseCommand(command);
      if (parsed.ok) client.send('ack', { seq: parsed.command.seq });
    });
    this.setSimulationInterval(() => {
      if (!this.usedSeats.has('p2')) {
        const rival = runTrainingRival(this.world, this.enemyMemory, this.difficulty);
        this.enemyMemory = new Map(rival.memories);
        this.world = rival.world;
      }
      this.world = stepWorld(this.world);
      for (const client of this.clients) {
        const player = this.seats.get(client.sessionId);
        if (player) client.send('view', viewFor(this.world, player));
      }
    }, 100);
    // Ephemeral development room. A full campaign/session lifecycle is planned.
    this.clock.setTimeout(() => { void this.disconnect(); }, 15 * 60 * 1000);
  }

  onJoin(client: Client) {
    const player: PlayerId | undefined = !this.usedSeats.has('p1') ? 'p1' : !this.usedSeats.has('p2') ? 'p2' : undefined;
    if (!player) { void client.leave(4001); return; }
    this.usedSeats.add(player);
    this.seats.set(client.sessionId, player);
    client.send('view', viewFor(this.world, player));
    if (this.usedSeats.size === 2) void this.lock();
  }

  onLeave(client: Client) {
    this.seats.delete(client.sessionId);
    this.rates.delete(client.sessionId);
    // Do not give a departed player's authority to a new stranger.
  }
}
