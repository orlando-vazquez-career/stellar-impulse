import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGameServer } from '../../../server/src/app';
import { AuthService } from '../../../server/src/auth';
import { createMultiplayerSession, type MultiplayerSession, type MultiplayerSnapshot } from './session';

const port = 31_000 + Math.floor(Math.random() * 900);
const url = `http://127.0.0.1:${port}`;
const auth = new AuthService();
const tokens = await Promise.all(['ana', 'beto', 'carla']
  .map(async (name) => (await auth.register(`${name}-session@example.com`, 'secret-1234')).token));
const server = createGameServer({ auth, campaign: {
  countdownMs: 100, reconnectWindowMs: 3_000, resumeCountdownMs: 150,
} });
const sessions: MultiplayerSession[] = [];
beforeAll(async () => { await server.listen(port, '127.0.0.1'); });
afterEach(async () => {
  for (const session of sessions.splice(0)) { await session.leave(); session.destroy(); }
});
afterAll(async () => { await server.gracefullyShutdown(false); });

function session(storage?: StorageMemory): MultiplayerSession {
  const created = createMultiplayerSession(url, storage);
  sessions.push(created);
  return created;
}
class StorageMemory {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function waitFor(session: MultiplayerSession, accept: (snapshot: MultiplayerSnapshot) => boolean): Promise<MultiplayerSnapshot> {
  if (accept(session.getSnapshot())) return Promise.resolve(session.getSnapshot());
  return new Promise((resolve, reject) => {
    const off = session.subscribe(() => {
      const value = session.getSnapshot();
      if (accept(value)) { clearTimeout(timeout); off(); resolve(value); }
    });
    const timeout = setTimeout(() => { off(); reject(new Error(`Timed out: ${JSON.stringify(session.getSnapshot().phase)}`)); }, 4_000);
  });
}
/** Both players take the first card of the sector opening and the sector starts running. */
async function openSector(...players: MultiplayerSession[]) {
  for (const player of players) {
    const offer = player.getSnapshot().view!.augments!.offer!;
    player.augmentPick(offer.choice, offer.cards[0]!.id);
  }
  await Promise.all(players.map((player) => waitFor(player, (value) => value.view?.augments?.started === true)));
}
const guard = (squadId: string) => ({ type: 'stance', squadId, stance: 'guard' });
/** Sector 01 keeps these sockets fast; the default campaign map is Espiral. */
async function pair(storage?: StorageMemory) {
  const host = session(storage);
  const guest = session();
  await host.create('Ana', tokens[0]!, 'sector-01');
  await waitFor(host, (snapshot) => snapshot.phase?.phase === 'lobby');
  await guest.join(host.getSnapshot().roomId!.toLowerCase(), 'Beto', tokens[1]!);
  await waitFor(guest, (snapshot) => snapshot.phase?.phase === 'lobby');
  host.ready(); guest.ready();
  await Promise.all([host, guest].map((client) => waitFor(client, (snapshot) =>
    snapshot.phase?.phase === 'sector' && snapshot.view?.augments?.offer !== undefined)));
  await openSector(host, guest);
  return { host, guest };
}

describe('shared multiplayer session over real transport', () => {
  it('retains admission, phase and private match views before the gameplay adapter mounts', async () => {
    const { host, guest } = await pair();
    const first = host.getSnapshot();
    expect(first).toMatchObject({ connection: 'online', phase: { playerId: 'p1', phase: 'sector', renderMap: 'sector-01' } });
    expect(guest.getSnapshot().phase?.playerId).toBe('p2');
    expect(first.view).toMatchObject({ protocolVersion: 3, mode: 'training', playerId: 'p1' });
    expect(first.view?.players.p2).not.toHaveProperty('lastSequence');
    expect(first.view?.players.p2).not.toHaveProperty('metal');
    const ship = first.view!.squads.find((squad) => squad.ownerId === 'p1')!;
    host.command(guard(ship.id));
    expect((await waitFor(host, (value) => value.acknowledgedSequence > 0)).acknowledgedSequence).toBe(1);
    expect(host.getSnapshot()).toBe(host.getSnapshot());
  });

  it('reserves the seat on destruction, restores sequence and never sends commands during pause or resume', async () => {
    const storage = new StorageMemory();
    const { host, guest } = await pair(storage);
    const ship = host.getSnapshot().view!.squads.find((squad) => squad.ownerId === 'p1')!;
    host.command(guard(ship.id));
    await waitFor(host, (value) => value.acknowledgedSequence === 1);
    host.destroy();
    expect(storage.values.size).toBe(1);
    const paused = await waitFor(guest, (value) => value.phase?.pause !== null && value.phase?.pause !== undefined);
    const tick = paused.view!.tick;
    guest.command(guard('p2-interceptor'));
    expect(guest.getSnapshot().acknowledgedSequence).toBe(0);
    const restored = session(storage);
    expect(await restored.restore()).toBe(true);
    const resumed = await waitFor(restored, (value) => value.connection === 'online' && value.view !== null);
    expect(resumed.view!.tick).toBeGreaterThanOrEqual(tick);
    expect(resumed.acknowledgedSequence).toBe(1);
    await waitFor(restored, (value) => value.phase?.resumeInMs === null && value.phase.pause === null);
    restored.command(guard(ship.id));
    expect((await waitFor(restored, (value) => value.acknowledgedSequence === 2)).acknowledgedSequence).toBe(2);
    await restored.leave();
    expect(storage.values.size).toBe(0);
    expect((await waitFor(guest, (value) => value.phase?.phase === 'results')).phase?.result)
      .toMatchObject({ winner: 'p2', reason: 'forfeit' });
    // An instant forfeit pays nothing, but the reward still arrives so the screen can say so.
    expect((await waitFor(guest, (value) => value.reward !== null)).reward).toMatchObject({ xpGained: 0 });
  });

  it('rejects authentication and occupied seats with useful errors without saving credentials', async () => {
    const storage = new StorageMemory();
    const invalid = session(storage);
    await expect(invalid.create('Ana', 'invalid')).rejects.toThrow();
    expect(invalid.getSnapshot().error).toMatch(/sesión/i);
    expect(storage.values.size).toBe(0);
    const { host } = await pair();
    const extra = session();
    await expect(extra.join(host.getSnapshot().roomId!, 'Carla', tokens[2]!)).rejects.toThrow();
    expect(extra.getSnapshot().connection).toBe('offline');
  });

  it('does not create a connection with absent or expired restore data', async () => {
    const storage = new StorageMemory();
    const empty = session(storage);
    expect(await empty.restore()).toBe(false);
    storage.values.set('impulso.multiplayer-room', JSON.stringify({ serverUrl: url, reconnectionToken: 'expired:token' }));
    expect(await empty.restore()).toBe(false);
    expect(storage.values.size).toBe(0);
    expect(empty.getSnapshot().connection).toBe('offline');
  });

  it('cancels pending admission with an explicit exit without reserving a ghost seat', async () => {
    const storage = new StorageMemory();
    const canceled = session(storage);
    const creating = canceled.create('Ana', tokens[0]!);
    await canceled.leave();
    await creating;
    expect(canceled.getSnapshot().roomId).toBeNull();
    expect(storage.values.size).toBe(0);
    const transport = server.transport as unknown as { wss: { clients: Set<unknown> } };
    await vi.waitFor(() => { expect(transport.wss.clients.size).toBe(0); }, { timeout: 1_000, interval: 10 });
    // No socket remains seated after the canceled admission settled.
    const next = session(storage);
    await next.create('Ana', tokens[0]!);
    expect((await waitFor(next, (value) => value.phase?.phase === 'lobby')).phase?.seats.p1?.name).toBe('Ana');
  });

  it('automatically reconnects a dropped socket without replaying orders sent during the drop', async () => {
    const storage = new StorageMemory();
    const { host, guest } = await pair(storage);
    const ship = host.getSnapshot().view!.squads.find((squad) => squad.ownerId === 'p1')!;
    host.command(guard(ship.id));
    await waitFor(host, (value) => value.acknowledgedSequence === 1);
    // Terminate the actual server socket, leaving the SDK transport and retry implementation intact.
    const transport = server.transport as unknown as { wss: { clients: Set<{ terminate(): void }> } };
    const reconnecting = waitFor(host, (value) => value.connection === 'reconnecting');
    [...transport.wss.clients][0]!.terminate();
    await reconnecting;
    host.command(guard(ship.id));
    await waitFor(host, (value) => value.connection === 'online');
    expect(host.getSnapshot().acknowledgedSequence).toBe(1);
    await waitFor(host, (value) => value.phase?.resumeInMs === null && value.phase.pause === null);
    host.command(guard(ship.id));
    await waitFor(host, (value) => value.acknowledgedSequence === 2);
    host.destroy();
    await waitFor(guest, (value) => value.phase?.pause?.by === 'p1');
    const restored = session(storage);
    expect(await restored.restore()).toBe(true);
    expect((await waitFor(restored, (value) => value.connection === 'online')).acknowledgedSequence).toBe(2);
  });

  it('sends augment rerolls and picks only for the offer on screen', async () => {
    const host = session();
    const guest = session();
    await host.create('Ana', tokens[0]!, 'sector-01');
    await waitFor(host, (snapshot) => snapshot.phase?.phase === 'lobby');
    await guest.join(host.getSnapshot().roomId!, 'Beto', tokens[1]!);
    await waitFor(guest, (snapshot) => snapshot.phase?.phase === 'lobby');
    host.ready(); guest.ready();
    const opening = await waitFor(host, (value) => value.view?.augments?.offer !== undefined && value.view.augments.offer !== null);
    const first = opening.view!.augments!.offer!;
    host.augmentPick(first.choice + 1, first.cards[0]!.id);
    host.augmentReroll(first.choice);
    const rerolled = await waitFor(host, (value) => value.view?.augments?.offer?.rerolls === 1);
    expect(rerolled.view!.augments!.offer!.cards.map((card) => card.id)).not.toEqual(first.cards.map((card) => card.id));
    host.command(guard('p1-interceptor'));
    expect(host.getSnapshot().acknowledgedSequence).toBe(0);
    await openSector(host, guest);
    expect(host.getSnapshot().view!.augments!.own).toHaveLength(1);
  });

  it('settles an exit during reconnection and cancels retries without reconnecting a ghost player', async () => {
    const storage = new StorageMemory();
    const { host, guest } = await pair(storage);
    const transport = server.transport as unknown as { wss: { clients: Set<{ terminate(): void }> } };
    const reconnecting = waitFor(host, (value) => value.connection === 'reconnecting');
    [...transport.wss.clients][0]!.terminate();
    await reconnecting;
    const settled = await Promise.race([
      host.leave().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    expect(settled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(host.getSnapshot().connection).toBe('idle');
    expect(storage.values.size).toBe(0);
    expect(transport.wss.clients.size).toBe(1);
    expect(guest.getSnapshot().phase?.seats.p1?.connected).toBe(false);
  });

  it('stops a queued retry on destruction while preserving the token for a different controller', async () => {
    const storage = new StorageMemory();
    const { host, guest } = await pair(storage);
    const transport = server.transport as unknown as { wss: { clients: Set<{ terminate(): void }> } };
    const reconnecting = waitFor(host, (value) => value.connection === 'reconnecting');
    [...transport.wss.clients][0]!.terminate();
    await reconnecting;
    host.destroy();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(storage.values.size).toBe(1);
    expect(transport.wss.clients.size).toBe(1);
    expect(guest.getSnapshot().phase?.seats.p1?.connected).toBe(false);
    const restored = session(storage);
    expect(await restored.restore()).toBe(true);
    expect((await waitFor(restored, (value) => value.connection === 'online')).phase?.playerId).toBe('p1');
  });
});
