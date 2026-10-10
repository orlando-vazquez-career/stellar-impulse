import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignPhaseView } from '@impulso/state';
import type { TransportEvents } from '../visual/game/server-adapter';
import { campaignTransport } from './campaign-transport';
import type { CampaignView, MultiplayerSession, MultiplayerSnapshot } from './session';

function phase(patch: Partial<CampaignPhaseView> = {}): CampaignPhaseView {
  return {
    protocolVersion: 3, playerId: 'p1', renderMap: 'espiral', phase: 'sector', sector: 1, sectors: 3, remainingMs: null,
    seats: { p1: { name: 'Ana', ready: true, connected: true }, p2: { name: 'Beto', ready: true, connected: true } },
    pause: null, resumeInMs: null, sectorResults: [], result: null, ...patch,
  };
}
function fakeSession(initial: Partial<MultiplayerSnapshot> = {}) {
  let snapshot: MultiplayerSnapshot = {
    connection: 'online', roomId: 'ABCDEF012345', phase: phase(), view: null, reward: null, error: null, acknowledgedSequence: 0, ...initial,
  };
  const listeners = new Set<() => void>();
  const session = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    command: vi.fn(), augmentPick: vi.fn(), augmentReroll: vi.fn(),
  } as unknown as MultiplayerSession;
  return {
    session, listeners,
    set(patch: Partial<MultiplayerSnapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); },
  };
}
function recorder(): TransportEvents & { log: unknown[][] } {
  const log: unknown[][] = [];
  return {
    log,
    view: (view) => log.push(['view', view.tick]),
    rejected: (reason) => log.push(['rejected', reason]),
    notice: (text) => log.push(['notice', text]),
    connection: (state) => log.push(['connection', state]),
    refresh: () => log.push(['refresh']),
  };
}
const view = (tick: number) => ({ tick }) as CampaignView;

describe('campaign transport', () => {
  it('forwards each new view once and the connection state', () => {
    const fake = fakeSession({ view: view(5) });
    const events = recorder();
    const stop = campaignTransport(fake.session).open(events);
    fake.set({ error: null });
    fake.set({ view: view(6), connection: 'reconnecting' });
    expect(events.log.filter(([kind]) => kind === 'view')).toEqual([['view', 5], ['view', 6]]);
    expect(events.log.filter(([kind]) => kind === 'connection')).toEqual([['connection', 'online'], ['connection', 'connecting']]);
    stop();
    expect(fake.listeners.size).toBe(0);
  });

  it('explains pauses, the countdown to resume and errors from the room', () => {
    const fake = fakeSession();
    const events = recorder();
    campaignTransport(fake.session).open(events);
    fake.set({ phase: phase({ pause: { by: 'p2', remainingMs: 40_000 } }) });
    fake.set({ phase: phase({ resumeInMs: 2_100 }) });
    fake.set({ phase: phase(), error: 'Demasiadas órdenes seguidas.' });
    const notices = events.log.filter(([kind]) => kind === 'notice').map(([, text]) => text);
    expect(notices).toEqual([null, 'Partida pausada: esperando la reconexión de Beto.', 'La partida continúa en 3 s…', 'Demasiadas órdenes seguidas.']);
  });

  describe('in English', () => {
    beforeEach(() => {
      const saved = new Map([['impulso.locale', 'en']]);
      vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: () => {}, removeItem: () => {} });
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('explains pauses, the countdown to resume and errors from the room', () => {
      const fake = fakeSession();
      const events = recorder();
      campaignTransport(fake.session).open(events);
      fake.set({ phase: phase({ pause: { by: 'p2', remainingMs: 40_000 } }) });
      fake.set({ phase: phase({ resumeInMs: 2_100 }) });
      fake.set({ phase: phase(), error: 'Demasiadas órdenes seguidas.', errorReason: 'rate_limit' });
      const notices = events.log.filter(([kind]) => kind === 'notice').map(([, text]) => text);
      expect(notices).toEqual([null, 'Match paused: waiting for Beto to reconnect.', 'The match resumes in 3 s…', 'Too many orders in a row.']);
    });

    it('says the connection, the campaign phases and how the campaign ended', () => {
      const fake = fakeSession({ connection: 'reconnecting' });
      const events = recorder();
      campaignTransport(fake.session).open(events);
      fake.set({ connection: 'online', phase: phase({ phase: 'countdown', remainingMs: 4_200, pause: { by: 'p1', remainingMs: 1 } }) });
      fake.set({ phase: phase({ phase: 'countdown', remainingMs: 4_200 }) });
      fake.set({ phase: phase({ phase: 'transition', sector: 2 }) });
      fake.set({ phase: phase({ phase: 'results', result: { winner: null, reason: 'draw' } }) });
      fake.set({ connection: 'offline' });
      const notices = events.log.filter(([kind]) => kind === 'notice').map(([, text]) => text);
      expect(notices).toEqual(['Reconnecting to the room…', 'Match paused: waiting for Ana to reconnect.', 'The match starts in 5 s…',
        'Sector 2 cleared. Preparing the next sector…', 'The campaign ended in a draw.', 'The connection to the room was lost.']);
    });
  });

  it('translates a room error by its reason and keeps an unknown one as the room wrote it', () => {
    const fake = fakeSession();
    const events = recorder();
    campaignTransport(fake.session).open(events);
    fake.set({ error: 'La sala está completa.', errorReason: 'full' });
    fake.set({ error: 'Texto que el cliente no conoce.', errorReason: 'something_new' });
    fake.set({ error: 'Sin motivo.', errorReason: undefined });
    vi.stubGlobal('localStorage', { getItem: () => 'en' });
    try {
      fake.set({ error: 'La sala está completa.', errorReason: 'full' });
      fake.set({ error: 'Texto que el cliente no conoce.', errorReason: 'something_new' });
    } finally { vi.unstubAllGlobals(); }
    const notices = events.log.filter(([kind]) => kind === 'notice').map(([, text]) => text);
    expect(notices).toEqual([null, 'La sala está completa.', 'Texto que el cliente no conoce.', 'Sin motivo.', 'The room is full.', 'Texto que el cliente no conoce.']);
  });

  it('reports the campaign outcome, not a sector winner, with the reward', () => {
    const fake = fakeSession();
    const transport = campaignTransport(fake.session);
    expect(transport.outcome!()).toBeNull();
    fake.set({ phase: phase({ phase: 'transition', sectorResults: [{ sector: 1, winner: 'p1' }] }) });
    expect(transport.outcome!()).toBeNull();
    expect(transport.sector!()).toBe(1);
    const reward = { xpGained: 125 } as MultiplayerSnapshot['reward'];
    fake.set({ phase: phase({ phase: 'results', sector: 3, result: { winner: 'p2', reason: 'core' } }), reward });
    expect(transport.outcome!()).toEqual({ result: 'defeat', reward });
    fake.set({ phase: phase({ phase: 'results', result: { winner: null, reason: 'draw' } }) });
    expect(transport.outcome!()).toBeNull();
  });

  it('hands orders and augment choices to the session', () => {
    const fake = fakeSession();
    const transport = campaignTransport(fake.session);
    transport.command({ type: 'move', squadId: 'p1-a', x: 1, y: 2 });
    transport.augmentPick(1, 'g-asalto');
    transport.augmentReroll(1);
    expect(fake.session.command).toHaveBeenCalledWith({ type: 'move', squadId: 'p1-a', x: 1, y: 2 });
    expect(fake.session.augmentPick).toHaveBeenCalledWith(1, 'g-asalto');
    expect(fake.session.augmentReroll).toHaveBeenCalledWith(1);
  });
});
