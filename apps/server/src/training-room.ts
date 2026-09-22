import { Room, type Client } from '@colyseus/core';
import { createWorld, applyCommand, stepWorld, type PlayerId } from '@impulso/sim';
import { viewFor } from '@impulso/state';

export class TrainingRoom extends Room {
  maxClients = 2;
  private world = createWorld();
  private seats = new Map<string, PlayerId>();
  private usedSeats = new Set<PlayerId>();
  private rates = new Map<string, { tick: number; count: number }>();

  onCreate() {
    this.setPrivate(true);
    this.onMessage('command', (client, command: unknown) => {
      const player = this.seats.get(client.sessionId);
      if (!player) return;
      const bucket = this.rates.get(client.sessionId) ?? { tick: this.world.tick, count: 0 };
      if (this.world.tick - bucket.tick >= 10) { bucket.tick = this.world.tick; bucket.count = 0; }
      bucket.count += 1;
      this.rates.set(client.sessionId, bucket);
      if (bucket.count > 20) { client.send('rejected', { reason: 'rate_limit' }); return; }
      const result = applyCommand(this.world, player, command);
      if (result.accepted) this.world = result.world;
      else client.send('rejected', { reason: result.reason });
    });
    this.setSimulationInterval(() => {
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
