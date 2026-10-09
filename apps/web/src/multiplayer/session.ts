import { Client, type Room } from '@colyseus/sdk';
import { DEFAULT_CAMPAIGN_MAP } from '@impulso/input';
import type { MatchReward } from '@impulso/sim';
import type { CampaignPhaseView, PlayerView } from '@impulso/state';

const PROTOCOL_VERSION = 3;
const STORAGE_KEY = 'impulso.multiplayer-room';

/** Any order the match engine accepts (move, move_formation, attack, stance, produce, build_module, …). */
export type CommandIntent = { type: string } & Record<string, unknown>;
/** The private view of the running sector: the same projection training uses. */
export type CampaignView = PlayerView & { protocolVersion: 3 };
export type CampaignMap = NonNullable<CampaignPhaseView['renderMap']>;

export interface MultiplayerSnapshot {
  connection: 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';
  roomId: string | null;
  phase: CampaignPhaseView | null;
  view: CampaignView | null;
  /** This player's campaign reward, once the campaign ends. */
  reward: MatchReward | null;
  error: string | null;
  acknowledgedSequence: number;
}
export interface MultiplayerSession {
  getSnapshot(): MultiplayerSnapshot;
  subscribe(listener: () => void): () => void;
  create(name: string, token: string, map?: CampaignMap): Promise<void>;
  join(code: string, name: string, token: string): Promise<void>;
  restore(): Promise<boolean>;
  ready(): void;
  command(command: CommandIntent): void;
  augmentPick(choice: number, id: string): void;
  augmentReroll(choice: number): void;
  leave(): Promise<void>;
  destroy(): void;
}
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const blank = (): MultiplayerSnapshot => ({
  connection: 'idle', roomId: null, phase: null, view: null, reward: null, error: null, acknowledgedSequence: 0,
});

const REJECTION_TEXT: Record<string, string> = {
  authentication_required: 'Inicia sesión de nuevo para entrar a la sala.',
  already_in_room: 'Esta cuenta ya está en la sala. Usa otra cuenta para el segundo jugador.',
  unsupported_version: 'El cliente y el servidor usan versiones distintas. Recarga la página.',
  invalid_join: 'Revisa el nombre del jugador y el código de la sala.',
  stale_sequence: 'La conexión se está sincronizando. Intenta la orden de nuevo.',
  paused: 'La partida está pausada mientras un jugador se reconecta.',
  not_in_sector: 'Espera a que comience el sector para dar órdenes.',
  opening_selection: 'Elige tu aumento para empezar el sector.',
  rate_limit: 'Demasiadas órdenes seguidas.',
  invalid_augment_pick: 'Esa carta ya no está disponible.',
  augment_reroll_used_or_expired: 'No quedan renovaciones para esta oferta.',
};
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (REJECTION_TEXT[message]) return REJECTION_TEXT[message];
  if (/full|maxClients|capacity/i.test(message)) return 'La sala está completa.';
  if (/locked|started|in_progress/i.test(message)) return 'La partida ya comenzó.';
  if (/not found|not_found|room.*unavailable/i.test(message)) return 'No se encontró la sala. Revisa el código.';
  return 'No se pudo conectar con la sala. Comprueba la conexión e intenta de nuevo.';
}

/** Owns the room for the whole app; screens only subscribe to its retained snapshots. */
export function createMultiplayerSession(serverUrl: string, storage?: SessionStorage): MultiplayerSession {
  const client = new Client(serverUrl);
  let snapshot = blank();
  let room: Room | null = null;
  let sequence = 0;
  let generation = 0;
  let destroyed = false;
  let pending = false;
  let cleanups: (() => void)[] = [];
  const listeners = new Set<() => void>();
  const update = (patch: Partial<MultiplayerSnapshot>) => {
    if (destroyed) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  // Private browsing and full storage must not prevent joining a room.
  const forget = () => { try { storage?.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ } };
  const persist = (active: Room) => {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ serverUrl, reconnectionToken: active.reconnectionToken })); }
    catch { /* The active socket remains usable without persistence. */ }
  };
  const detach = () => { for (const off of cleanups.splice(0)) off(); };
  const closeWithoutLeaving = (active: Room) => {
    active.reconnection.enabled = false;
    active.connection.close();
  };
  const leaveConnected = async (active: Room): Promise<void> => {
    active.reconnection.enabled = false;
    if (!active.connection.isOpen) { active.connection.close(); return; }
    // A drop between checking the socket and receiving the consented close must also settle exit.
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        active.onDrop.remove(done);
        active.onLeave.remove(done);
        resolve();
      };
      active.onDrop(done); active.onLeave(done);
      void active.leave().then(done, done);
      if (!active.connection.isOpen) { active.connection.close(); done(); }
    });
  };

  const attach = (active: Room) => {
    room = active;
    active.reconnection.maxEnqueuedMessages = 0;
    // A network drop immediately after joining should still reserve this seat.
    active.reconnection.minUptime = 0;
    let phaseFresh = false;
    let viewFresh = false;
    const current = () => !destroyed && room === active;
    const reconnectSocket = active.connection.reconnect.bind(active.connection);
    // SDK 0.18 retains its retry timer after disabling reconnection. Keep this public
    // connection guard after screen cleanup so a queued retry cannot reopen a disposed room.
    active.connection.reconnect = (options) => {
      if (current()) reconnectSocket(options);
    };
    const synchronize = () => {
      if (!current() || !phaseFresh) return;
      if (snapshot.phase?.phase === 'sector' && !viewFresh) return;
      if (snapshot.connection !== 'online') update({ connection: 'online' });
    };
    cleanups.push(active.onMessage('phase', (phase: CampaignPhaseView) => {
      if (!current() || phase.protocolVersion !== PROTOCOL_VERSION) return;
      phaseFresh = true;
      update({ phase });
      synchronize();
    }));
    cleanups.push(active.onMessage('view', (view: CampaignView) => {
      if (!current() || view.protocolVersion !== PROTOCOL_VERSION || view.mode !== 'training') return;
      viewFresh = true;
      // Each sector is a new world that counts from zero; this client never reuses a number.
      const accepted = view.players[view.playerId].lastSequence ?? 0;
      sequence = Math.max(sequence, accepted);
      update({ view, acknowledgedSequence: Math.max(snapshot.acknowledgedSequence, accepted) });
      synchronize();
    }));
    cleanups.push(active.onMessage('ack', (ack: { protocolVersion: number; seq: number }) => {
      if (!current() || ack.protocolVersion !== PROTOCOL_VERSION || !Number.isSafeInteger(ack.seq)) return;
      sequence = Math.max(sequence, ack.seq);
      update({ acknowledgedSequence: Math.max(snapshot.acknowledgedSequence, ack.seq), error: null });
    }));
    cleanups.push(active.onMessage('rejected', (message: { protocolVersion: number; reason: string }) => {
      if (current() && message.protocolVersion === PROTOCOL_VERSION) update({ error: errorText(new Error(message.reason)) });
    }));
    // Block orders as soon as the pause arrives; the following phase refresh remains authoritative.
    cleanups.push(active.onMessage('paused', (message: {
      protocolVersion: number; by: 'p1' | 'p2'; remainingMs: number;
    }) => {
      if (current() && message.protocolVersion === PROTOCOL_VERSION && snapshot.phase) {
        update({ phase: { ...snapshot.phase, pause: { by: message.by, remainingMs: message.remainingMs } } });
      }
    }));
    cleanups.push(active.onMessage('campaign_end', (message: { protocolVersion: number; reward?: MatchReward }) => {
      if (current() && message.protocolVersion === PROTOCOL_VERSION && message.reward) update({ reward: message.reward });
    }));
    const drop = () => {
      if (!current()) return;
      phaseFresh = false; viewFresh = false;
      update({ connection: 'reconnecting', error: null });
    };
    const reconnect = () => {
      if (!current()) { closeWithoutLeaving(active); return; }
      // The SDK publishes onReconnect before replacing reconnectionToken in its handshake.
      queueMicrotask(() => { if (current()) persist(active); });
      synchronize();
    };
    const leave = () => {
      if (!current()) return;
      room = null;
      update({ connection: 'offline', error: snapshot.phase?.phase === 'closed'
        ? null : 'Se perdió la conexión con la sala. Intenta reconectar.' });
    };
    active.onDrop(drop); active.onReconnect(reconnect); active.onLeave(leave);
    cleanups.push(() => active.onDrop.remove(drop), () => active.onReconnect.remove(reconnect), () => active.onLeave.remove(leave));
    persist(active);
    update({ roomId: active.roomId });
  };

  const connect = async (admit: () => Promise<Room>, restoring = false): Promise<boolean> => {
    if (destroyed) return false;
    if (pending || room) throw new Error('Ya hay una conexión con una sala.');
    pending = true;
    const operation = ++generation;
    sequence = 0;
    update({ ...blank(), connection: restoring ? 'reconnecting' : 'connecting' });
    try {
      const joined = await admit();
      if (destroyed || operation !== generation) {
        joined.onMessage('*', () => {});
        if (destroyed) { persist(joined); closeWithoutLeaving(joined); }
        else await leaveConnected(joined);
        return false;
      }
      // Attach synchronously in the admission continuation, before the next socket message.
      attach(joined);
      return true;
    } catch (error) {
      if (destroyed || operation !== generation) return false;
      update({ connection: 'offline', error: restoring
        ? 'La sesión de la sala caducó. Crea una sala o entra con su código.' : errorText(error) });
      if (restoring) { forget(); return false; }
      throw error;
    } finally {
      if (operation === generation) pending = false;
    }
  };
  const send = (type: string, body: unknown) => {
    if (destroyed || snapshot.connection !== 'online' || !room?.connection.isOpen) return;
    room.send(type, { protocolVersion: PROTOCOL_VERSION, body });
  };
  /** Orders and augment choices only reach a running, unpaused sector. */
  const running = () => {
    const phase = snapshot.phase;
    return snapshot.connection === 'online' && snapshot.view !== null && phase?.phase === 'sector'
      && phase.pause === null && phase.resumeInMs === null && snapshot.view.winner === null && !destroyed && Boolean(room?.connection.isOpen);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async create(name, token, map = DEFAULT_CAMPAIGN_MAP) {
      await connect(() => client.create('campaign', { protocolVersion: PROTOCOL_VERSION, name, token, map }));
    },
    async join(code, name, token) {
      const normalized = code.trim();
      if (!/^[A-Fa-f0-9]{12}$/.test(normalized)) {
        const error = new Error('El código de sala debe tener 12 caracteres (0–9, A–F).');
        update({ error: error.message });
        throw error;
      }
      await connect(() => client.joinById(normalized.toUpperCase(), { protocolVersion: PROTOCOL_VERSION, name, token }));
    },
    async restore() {
      if (destroyed || room || pending) return false;
      let saved: { serverUrl?: string; reconnectionToken?: string };
      try {
        const value = storage?.getItem(STORAGE_KEY);
        if (!value) return false;
        saved = JSON.parse(value) as typeof saved;
        if (!saved || saved.serverUrl !== serverUrl || typeof saved.reconnectionToken !== 'string') { forget(); return false; }
      } catch { forget(); return false; }
      return connect(() => client.reconnect(saved.reconnectionToken!), true);
    },
    ready() {
      if (snapshot.phase?.phase === 'lobby') send('ready', {});
    },
    command(command) {
      // The sector opening waits for both augment picks; orders sent before it would only bounce.
      if (!running() || !snapshot.view!.augments?.started) return;
      sequence = Math.max(sequence, snapshot.view!.players[snapshot.view!.playerId].lastSequence ?? 0,
        snapshot.acknowledgedSequence) + 1;
      send('command', { ...command, seq: sequence });
    },
    augmentPick(choice, id) {
      if (running() && snapshot.view!.augments?.offer?.choice === choice) send('augmentPick', { choice, id });
    },
    augmentReroll(choice) {
      if (running() && snapshot.view!.augments?.offer?.choice === choice) send('augmentReroll', { choice });
    },
    async leave() {
      ++generation;
      pending = false;
      const active = room;
      room = null;
      detach(); forget();
      sequence = 0;
      update(blank());
      if (active) await leaveConnected(active);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ++generation;
      const active = room;
      room = null;
      detach(); listeners.clear();
      // Component teardown/reload keeps the reserved seat available to restore().
      if (active) closeWithoutLeaving(active);
    },
  };
}
