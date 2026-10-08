import { describe, expect, it, vi } from 'vitest';
import { createBattlefieldWorld, BATTLEFIELD_MAP } from '@impulso/sim';
import { battlefieldViewFor, type CampaignPhaseView } from '@impulso/state';
import type { CommandIntent, MultiplayerSession, MultiplayerSnapshot } from '../../multiplayer/session';
import { decodeBattlefieldMask } from '@impulso/state';
import { createCampaignGameplayAdapter } from './campaign-adapter';

function initial(): MultiplayerSnapshot {
  const phase: CampaignPhaseView = {
    protocolVersion: 2, playerId: 'p1', renderMap: 'sector-01', phase: 'sector', sector: 1, sectors: 3,
    remainingMs: null, seats: { p1: { name: 'Ana', ready: true, connected: true }, p2: { name: 'Beto', ready: true, connected: true } },
    pause: null, resumeInMs: null, sectorResults: [], offers: null, myTech: null,
    rivalChoseTech: false, myTechnologies: [], result: null,
  };
  const view = battlefieldViewFor(createBattlefieldWorld(BATTLEFIELD_MAP), 'p1');
  return { connection: 'online', roomId: 'ROOM', phase, view, map: null, error: null, acknowledgedSequence: 0 };
}
function controller(snapshot = initial()) {
  const listeners = new Set<() => void>();
  const commands: CommandIntent[] = [];
  const session: MultiplayerSession = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    command(command) { commands.push(command); },
    create: vi.fn(), join: vi.fn(), restore: vi.fn(), ready: vi.fn(), chooseTech: vi.fn(), leave: vi.fn(), destroy: vi.fn(),
  };
  return {
    session, commands,
    update(patch: Partial<MultiplayerSnapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); },
    subscribers: () => listeners.size,
  };
}

describe('campaign gameplay presentation', () => {
  it('renders a retained battlefield view and decodes fog when mounted after the sector began', () => {
    const { session } = controller();
    const adapter = createCampaignGameplayAdapter(session);
    const view = adapter.getSnapshot();
    const source = session.getSnapshot().view!;
    expect(view.connection).toBe('online');
    expect(view.canProduce).toBe(false);
    expect(view.squads.some((squad) => squad.owner === 'blue')).toBe(true);
    expect(view.visibleCells).toHaveLength(source.width * source.height);
    expect(view.visibleCells!.filter(Boolean).length).toBeGreaterThan(0);
    expect(view.visibleCells!.filter(Boolean).length).toBeLessThan(source.width * source.height);
    expect(view.resources.fleet).toBe(1);
    expect(adapter.getSnapshot()).toBe(view);
    adapter.destroy();
  });

  it('sends grouped move, attack and stop intentions for owned selections and refuses production', () => {
    const { session, commands } = controller();
    const adapter = createCampaignGameplayAdapter(session);
    const ship = adapter.getSnapshot().squads.find((squad) => squad.owner === 'blue')!;
    adapter.dispatch({ type: 'select-squads', squadIds: [ship.id, 'rival', ship.id] });
    adapter.dispatch({ type: 'move-selected', x: ship.gridX + 1.1, y: ship.gridY });
    adapter.dispatch({ type: 'attack-selected', targetId: 'guardian' });
    adapter.dispatch({ type: 'set-action', action: 'hold' });
    expect(commands).toEqual([
      { type: 'move_group', squadIds: [ship.id], x: ship.gridX + 1, y: ship.gridY },
      { type: 'attack_group', squadIds: [ship.id], targetId: 'guardian' },
      { type: 'stop', squadIds: [ship.id] },
    ]);
    adapter.dispatch({ type: 'produce', kind: 'interceptor' });
    expect(commands).toHaveLength(3);
    expect(adapter.getSnapshot().notice).toMatch(/producción/i);
    adapter.destroy();
  });

  it('blocks combat commands while paused or offline and takes the forfeit result from the campaign', () => {
    const { session, update, commands } = controller();
    const adapter = createCampaignGameplayAdapter(session);
    const ship = adapter.getSnapshot().squads.find((squad) => squad.owner === 'blue')!;
    adapter.dispatch({ type: 'select-squad', squadId: ship.id });
    update({ phase: { ...session.getSnapshot().phase!, pause: { by: 'p2', remainingMs: 30_000 } } });
    expect(adapter.getSnapshot().clockRunning).toBe(false);
    expect(adapter.getSnapshot().notice).toMatch(/pausada/i);
    adapter.dispatch({ type: 'move-selected', x: 10, y: 10 });
    expect(commands).toHaveLength(0);
    update({ connection: 'reconnecting' });
    adapter.dispatch({ type: 'set-action', action: 'hold' });
    expect(commands).toHaveLength(0);
    update({ connection: 'online', phase: { ...session.getSnapshot().phase!, phase: 'results', pause: null,
      result: { winner: 'p1', reason: 'forfeit' } } });
    expect(adapter.getSnapshot().result).toBe('victory');
    expect(session.getSnapshot().view!.winner).toBeNull();
    adapter.destroy();
  });

  it('unsubscribes on screen teardown while preserving the app-owned room and a new screen can mount', () => {
    const { session, subscribers } = controller();
    const adapter = createCampaignGameplayAdapter(session);
    expect(subscribers()).toBe(1);
    adapter.destroy();
    expect(subscribers()).toBe(0);
    expect(session.destroy).not.toHaveBeenCalled();
    expect(session.leave).not.toHaveBeenCalled();
    const next = createCampaignGameplayAdapter(session);
    expect(next.getSnapshot().squads).toHaveLength(adapter.getSnapshot().squads.length);
    next.destroy();
  });

  it('keeps sector victory from hiding a transition and presents an annulment without declaring defeat', () => {
    const { session, update } = controller();
    const adapter = createCampaignGameplayAdapter(session);
    update({ view: { ...session.getSnapshot().view!, winner: 'p1' },
      phase: { ...session.getSnapshot().phase!, phase: 'transition', offers: ['interceptor-speed'] } });
    expect(adapter.getSnapshot().result).toBeNull();
    expect(adapter.getSnapshot().notice).toMatch(/siguiente sector/i);
    update({ phase: { ...session.getSnapshot().phase!, phase: 'results', result: { winner: null, reason: 'annulled' } } });
    expect(adapter.getSnapshot().result).toBeNull();
    expect(adapter.getSnapshot().notice).toMatch(/anulada/i);
    adapter.destroy();
  });

  it('restores a final result from phase alone when the server no longer sends battlefield views', () => {
    const snapshot = initial();
    snapshot.view = null;
    snapshot.phase = { ...snapshot.phase!, phase: 'results', result: { winner: 'p1', reason: 'forfeit' } };
    const { session } = controller(snapshot);
    const adapter = createCampaignGameplayAdapter(session);
    expect(adapter.getSnapshot().result).toBe('victory');
    expect(adapter.getSnapshot().notice).toMatch(/abandono/i);
    expect(adapter.getSnapshot().clockRunning).toBe(false);
    adapter.destroy();
  });
});


it('sends formation choices to the server for the whole multiplayer selection', () => {
  const source = initial();
  const first = source.view!.squads.find((s) => s.ownerId === 'p1')!;
  source.view!.squads.push({ ...first, id: 'p1-extra', x: first.x + 1 });
  const { session, commands } = controller(source);
  const adapter = createCampaignGameplayAdapter(session);
  adapter.dispatch({ type: 'select-squads', squadIds: [first.id, 'p1-extra'] });
  adapter.dispatch({ type: 'set-formation', formation: 'wedge' });
  adapter.dispatch({ type: 'move-selected', x: first.x, y: first.y });
  expect(commands).toEqual([{ type: 'move_formation', squadIds: [first.id, 'p1-extra'], x: first.x, y: first.y, formation: 'wedge' }]);
  expect(adapter.getSnapshot().exploredCells).toEqual(decodeBattlefieldMask(source.view!.explored));
  adapter.destroy();
});

it('remembers nodes without learning their hidden owner and resets them between sectors', () => {
  const source = initial();
  const node = { id: 'remembered', kind: 'metal' as const, guardianId: 'g', x: 5, y: 5, ownerId: 'p2' as const, progress: { p1: 0, p2: 0 } };
  source.view!.nodes = [node];
  const { session, update } = controller(source);
  const adapter = createCampaignGameplayAdapter(session);
  update({ view: { ...source.view!, nodes: [] } });
  expect(adapter.getSnapshot().nodes).toEqual([expect.objectContaining({ id: 'remembered', owner: 'red', stale: true })]);
  update({ phase: { ...source.phase!, sector: 2 }, view: { ...source.view!, nodes: [] } });
  expect(adapter.getSnapshot().nodes).toEqual([]);
  adapter.destroy();
});
