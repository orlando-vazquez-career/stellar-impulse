import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Room } from '@colyseus/sdk';
import type { PlayerView } from '@impulso/state';
import type { GameplayEvent } from './model';
import { createServerGameplayAdapter, diffViews, nearestOpenCell, rememberView, type FogMemory, type MatchTransport, type TransportEvents } from './server-adapter';
import { selectMap } from '../map/sector-map';

const ship = (id: string, ownerId: 'p1' | 'p2', x: number, y: number, hp = 100) =>
  ({ id, ownerId, kind: 'interceptor' as const, x, y, hp, maxHp: 120, damage: 12 });

function view(patch: Partial<PlayerView> = {}): PlayerView {
  return {
    schemaVersion: 1, mode: 'training', tick: 100, playerId: 'p1', width: 29, height: 29, obstacles: [],
    rules: { tickRate: 10, moveEveryTicks: 3, attackEveryTicks: 10, visionRadius: 4, captureRadius: 1, nodeCaptureTicks: 30, coreOpenTick: 1200, coreCaptureTicks: 300 },
    players: { p1: { id: 'p1', base: { x: 3, y: 3 }, metal: 6 }, p2: { id: 'p2', base: { x: 25, y: 25 } } },
    squads: [], guardians: [], nodes: [],
    core: { id: 'core', guardianId: 'core-guardian', x: 14, y: 14, open: false, progress: { p1: 0, p2: 0 } },
    visibleCells: [{ x: 5, y: 5 }], winner: null,
    ...patch,
  };
}

type BaseView = NonNullable<PlayerView['base']>;
const base = (patch: Partial<BaseView> = {}): BaseView =>
  ({ damage: 12, fleetCap: 12, upgradeCosts: { damage: 12, capacity: 10 }, hp: 2500, maxHp: 2500, vulnerableTick: 3000, ...patch });
const augments = (patch: Partial<NonNullable<PlayerView['augments']>> = {}): NonNullable<PlayerView['augments']> =>
  ({ started: true, own: [], rival: [], nextChoiceTick: null, offer: null, ...patch });
const offer = (choice: number) => ({ choice, tier: 'silver' as const, cards: [], remainingSeconds: 30, rerolls: 0, rerollLimit: 1 });

describe('match events from server views', () => {
  it('starts the battle on the first view when no augment choice holds it back', () => {
    expect(diffViews(null, view())).toEqual([{ kind: 'match-start' }, { kind: 'battle-start' }]);
  });

  it('waits for the opening augment choice before starting the battle', () => {
    const choosing = view({ augments: augments({ started: false, offer: offer(0) }) });
    expect(diffViews(null, choosing)).toEqual([{ kind: 'match-start' }, { kind: 'augment-offer' }]);
    const started = view({ tick: 400, augments: augments({ started: true }) });
    expect(diffViews(choosing, started).map((event) => event.kind)).toEqual(['battle-start']);
  });

  it('announces a new augment offer during the match', () => {
    const before = view({ augments: augments() });
    expect(diffViews(before, view({ augments: augments({ offer: offer(1) }) })).map((event) => event.kind)).toEqual(['augment-offer']);
  });

  it('tells a hit on the base apart from a hit on the fleet', () => {
    const before = view({ base: base(), squads: [ship('p1-a', 'p1', 3, 3)] });
    expect(diffViews(before, view({ base: base({ hp: 2400 }), squads: [ship('p1-a', 'p1', 3, 3)] })).map((event) => event.kind))
      .toEqual(['base-under-attack']);
    expect(diffViews(before, view({ base: base(), squads: [ship('p1-a', 'p1', 3, 3, 80)] })).map((event) => event.kind))
      .toEqual(['under-attack']);
  });

  it('does not take a lower maximum hull from an augment for an attack', () => {
    const before = view({ squads: [{ ...ship('p1-a', 'p1', 3, 3, 100), maxHp: 120 }] });
    const after = view({ squads: [{ ...ship('p1-a', 'p1', 3, 3, 75), maxHp: 90 }] });
    expect(diffViews(before, after)).toEqual([]);
  });

  it('warns when the base hull falls below 30 percent', () => {
    const before = view({ base: base({ hp: 800 }) });
    expect(diffViews(before, view({ base: base({ hp: 700 }) })).map((event) => event.kind)).toEqual(['base-hull-critical', 'base-under-attack']);
    expect(diffViews(view({ base: base({ hp: 700 }) }), view({ base: base({ hp: 650 }) })).map((event) => event.kind)).toEqual(['base-under-attack']);
  });

  it('reports the shields falling, sudden death and a finished module', () => {
    const building = { refinery: 0 as const, extras: [], building: { kind: 'refinery' as const, remainingTicks: 5 } };
    const before = view({ tick: 2995, base: base({ modules: building }) });
    const after = view({ tick: 3000, suddenDeath: true, base: base({ modules: { refinery: 1, extras: [], building: null } }) });
    expect(diffViews(before, after).map((event) => event.kind)).toEqual(['shields-down', 'sudden-death', 'module-online']);
  });

  it('names the fall of the Core guardian and a contested Core', () => {
    const guardian = { id: 'core-guardian', objectiveId: 'core', x: 5, y: 5, hp: 10, maxHp: 400, damage: 20 };
    const open = { id: 'core', guardianId: 'core-guardian', x: 14, y: 14, open: true, progress: { p1: 0, p2: 0 } };
    const before = view({ guardians: [guardian], core: open });
    const after = view({ guardians: [{ ...guardian, hp: 0 }], core: open });
    expect(diffViews(before, after).map((event) => event.kind)).toEqual(['core-guardian-down']);
    const contested = view({ core: { ...open, progress: { p1: 5, p2: 5 } } });
    expect(diffViews(view({ core: { ...open, progress: { p1: 5, p2: 0 } } }), contested).map((event) => event.kind))
      .toEqual(['core-rival-capturing', 'core-contested']);
  });

  it('warns when the rival starts taking one of our nodes', () => {
    const node = { id: 'metal-1', kind: 'metal' as const, guardianId: 'g', x: 5, y: 5, ownerId: 'p1' as const, progress: { p1: 30, p2: 0 } };
    const after = view({ nodes: [{ ...node, progress: { p1: 30, p2: 3 } }] });
    expect(diffViews(view({ nodes: [node] }), after).map((event) => event.kind)).toEqual(['node-threatened']);
  });

  it('does not mourn an own decoy that expires', () => {
    const before = view({ squads: [{ ...ship('p1-d', 'p1', 3, 3), isDecoy: true }] });
    expect(diffViews(before, view({ squads: [] }))).toEqual([]);
  });

  it('stays quiet about hits once the match is decided', () => {
    const before = view({ base: base(), squads: [ship('p1-a', 'p1', 3, 3)] });
    const after = view({ base: base({ hp: 0 }), squads: [ship('p1-a', 'p1', 3, 3, 50)], winner: 'p2' });
    expect(diffViews(before, after).map((event) => event.kind)).toEqual(['defeat']);
  });

  it('counts an enemy as destroyed only when its cell is still in sight', () => {
    const before = view({ squads: [ship('p2-a', 'p2', 5, 5), ship('p2-b', 'p2', 9, 9)] });
    const events = diffViews(before, view({ squads: [] }));
    expect(events).toEqual([{ kind: 'ship-destroyed', own: false }]);
  });

  it('reports own losses, node captures, the core opening and the result', () => {
    const before = view({
      squads: [ship('p1-a', 'p1', 3, 3)],
      nodes: [{ id: 'metal-1', kind: 'metal', guardianId: 'g', x: 5, y: 2, ownerId: null, progress: { p1: 0, p2: 0 } }],
    });
    const after = view({
      tick: 1200, squads: [ship('p1-a', 'p1', 3, 3, 0)],
      nodes: [{ id: 'metal-1', kind: 'metal', guardianId: 'g', x: 5, y: 2, ownerId: 'p1', progress: { p1: 30, p2: 0 } }],
      core: { id: 'core', guardianId: 'core-guardian', x: 14, y: 14, open: true, progress: { p1: 0, p2: 4 } },
      winner: 'p2',
    });
    expect(diffViews(before, after).map((event) => event.kind)).toEqual([
      'ship-destroyed', 'node-captured', 'core-soon', 'core-open', 'core-rival-capturing', 'defeat',
    ]);
  });
});

describe('click snapping', () => {
  beforeEach(() => {
    selectMap('sector-01');
  });
  afterEach(() => {
    selectMap('espiral');
  });

  it('moves an edge click onto the nearest open cell and ignores the void', () => {
    expect(nearestOpenCell(2.4, 11)).toEqual({ x: 3, y: 11 });
    expect(nearestOpenCell(9, 0.2)).toBeNull();
  });
});

describe('fog memory', () => {
  it('keeps explored cells and the last seen owner of nodes that leave sight', () => {
    const memory: FogMemory = { explored: null, nodes: new Map() };
    const node = { id: 'metal-1', kind: 'metal' as const, guardianId: 'g', x: 5, y: 5, ownerId: 'p2' as const, progress: { p1: 0, p2: 30 } };
    expect(rememberView(memory, view({ visibleCells: [{ x: 5, y: 5 }], nodes: [node] }))).toBe(true);
    expect(rememberView(memory, view({ visibleCells: [{ x: 3, y: 3 }], nodes: [] }))).toBe(true);
    expect(memory.explored![5 * 29 + 5]).toBe(true);
    expect(memory.explored![3 * 29 + 3]).toBe(true);
    expect(memory.explored![0]).toBe(false);
    expect(memory.nodes.get('metal-1')).toMatchObject({ owner: 'red', stale: true });
    // Seeing only explored cells again adds nothing new to remember.
    expect(rememberView(memory, view({ visibleCells: [{ x: 5, y: 5 }], nodes: [{ ...node, ownerId: 'p1' }] }))).toBe(false);
    expect(memory.nodes.get('metal-1')).toMatchObject({ owner: 'blue', stale: false });
  });
});


it('sends every selected ship in a 26-ship formation to the server', () => {
  selectMap('sector-01');
  const handlers = new Map<string, (message: PlayerView) => void>();
  const room = {
    onMessage(type: string, handler: (message: PlayerView) => void) { handlers.set(type, handler); },
    onLeave: vi.fn(), leave: vi.fn(async () => {}), send: vi.fn(),
  };
  const adapter = createServerGameplayAdapter('http://localhost', 'easy', 'sector-01', 'skirmish', room as unknown as Room);
  try {
    const ships = Array.from({ length: 26 }, (_, index) => ship(`p1-${index}`, 'p1', 3 + index % 4, 3 + Math.floor(index / 4)));
    handlers.get('view')!(view({ squads: ships }));
    adapter.dispatch({ type: 'select-squads', squadIds: ships.map((unit) => unit.id) });
    adapter.dispatch({ type: 'move-selected', x: 3, y: 11 });
    expect(room.send).toHaveBeenCalledTimes(1);
    expect(room.send.mock.calls[0]).toEqual(['command', expect.objectContaining({
      type: 'move_formation', squadIds: ships.map((unit) => unit.id), x: 3, y: 11,
    })]);
  } finally { adapter.destroy(); selectMap('espiral'); }
});

describe('campaign transport', () => {
  function fakeTransport() {
    let events: TransportEvents | null = null;
    let closed = 0;
    let sector = 1;
    let final: ReturnType<NonNullable<MatchTransport['outcome']>> = null;
    const sent: unknown[][] = [];
    const transport: MatchTransport = {
      open(next) { events = next; return () => { events = null; closed += 1; }; },
      command: (command) => sent.push(['command', command]),
      augmentPick: (choice, id) => sent.push(['pick', choice, id]),
      augmentReroll: (choice) => sent.push(['reroll', choice]),
      sector: () => sector,
      outcome: () => final,
    };
    return {
      transport, sent, events: () => events!, closed: () => closed,
      setSector(value: number) { sector = value; }, setOutcome(value: typeof final) { final = value; },
    };
  }
  beforeEach(() => selectMap('sector-01'));
  afterEach(() => selectMap('espiral'));

  it('sends orders and augment choices through the transport, which owns the sequence', () => {
    const fake = fakeTransport();
    const adapter = createServerGameplayAdapter('http://localhost', 'medium', 'sector-01', 'skirmish', fake.transport);
    try {
      fake.events().view(view({ squads: [ship('p1-a', 'p1', 3, 3)] }));
      adapter.dispatch({ type: 'select-squads', squadIds: ['p1-a'] });
      adapter.dispatch({ type: 'move-selected', x: 5, y: 3 });
      adapter.dispatch({ type: 'augment-pick', choice: 0, id: 's-optica' });
      adapter.dispatch({ type: 'augment-reroll', choice: 0 });
      expect(fake.sent).toEqual([
        ['command', { type: 'move', squadId: 'p1-a', x: 5, y: 3 }],
        ['pick', 0, 's-optica'],
        ['reroll', 0],
      ]);
    } finally { adapter.destroy(); }
  });

  it('ignores a sector winner and shows only the campaign outcome with its reward', () => {
    const fake = fakeTransport();
    const adapter = createServerGameplayAdapter('http://localhost', 'medium', 'sector-01', 'skirmish', fake.transport);
    try {
      fake.events().view(view({ winner: 'p2' }));
      expect(adapter.getSnapshot().result).toBeNull();
      const reward = { xpGained: 40, beforeXp: 0, challenges: [], unlocked: [], profile: { xp: 40, level: 1, levelXp: 40, nextLevelXp: 300, completed: [], best: {}, unlocked: [], merits: [] } };
      fake.setOutcome({ result: 'defeat', reward });
      fake.events().refresh();
      expect(adapter.getSnapshot()).toMatchObject({ result: 'defeat', reward });
    } finally { adapter.destroy(); }
  });

  it('reports refused orders, a lost link and its return as match events', () => {
    const fake = fakeTransport();
    const adapter = createServerGameplayAdapter('http://localhost', 'medium', 'sector-01', 'skirmish', fake.transport);
    const events: GameplayEvent[] = [];
    adapter.subscribeEvents!((event) => events.push(event));
    try {
      fake.events().view(view());
      events.length = 0;
      fake.events().rejected('insufficient_metal');
      fake.events().connection('offline');
      fake.events().connection('connecting');
      fake.events().view(view({ tick: 101 }));
      expect(events).toEqual([{ kind: 'order-rejected', reason: 'insufficient_metal' }, { kind: 'link-lost' }, { kind: 'link-restored' }]);
    } finally { adapter.destroy(); }
  });

  it('spaces out repeated hits on the base like hits on the fleet', () => {
    const fake = fakeTransport();
    const adapter = createServerGameplayAdapter('http://localhost', 'medium', 'sector-01', 'skirmish', fake.transport);
    const kinds: string[] = [];
    adapter.subscribeEvents!((event) => kinds.push(event.kind));
    try {
      const hull = { damage: 12, fleetCap: 12, upgradeCosts: { damage: 12, capacity: 10 }, maxHp: 2500, vulnerableTick: 9000 };
      for (let tick = 100; tick < 105; tick += 1) fake.events().view(view({ tick, base: { ...hull, hp: 2500 - tick } }));
      expect(kinds.filter((kind) => kind === 'base-under-attack')).toHaveLength(1);
    } finally { adapter.destroy(); }
  });

  it('starts over when the next sector world arrives', () => {
    const fake = fakeTransport();
    const adapter = createServerGameplayAdapter('http://localhost', 'medium', 'sector-01', 'skirmish', fake.transport);
    const events: string[] = [];
    adapter.subscribeEvents!((event) => events.push(event.kind));
    try {
      fake.events().view(view({ tick: 900, squads: [ship('p1-a', 'p1', 3, 3)], visibleCells: [{ x: 3, y: 3 }] }));
      adapter.dispatch({ type: 'select-squads', squadIds: ['p1-a'] });
      expect(adapter.getSnapshot().exploredCells?.[3 * 29 + 3]).toBe(true);
      fake.setSector(2);
      fake.events().view(view({ tick: 0, squads: [ship('p1-a', 'p1', 20, 20)], visibleCells: [{ x: 20, y: 20 }] }));
      const snapshot = adapter.getSnapshot();
      expect(snapshot.sector).toBe(2);
      expect(snapshot.selectedSquadIds).toEqual([]);
      expect(snapshot.exploredCells?.[3 * 29 + 3]).toBe(false);
      expect(events.filter((kind) => kind === 'match-start')).toHaveLength(2);
    } finally { adapter.destroy(); }
  });

  it('shows the campaign outcome after a reload into the results, before any view arrives', () => {
    const fake = fakeTransport();
    fake.setOutcome({ result: 'victory' });
    const adapter = createServerGameplayAdapter('http://localhost', 'medium', 'sector-01', 'skirmish', fake.transport);
    try {
      fake.events().refresh();
      expect(adapter.getSnapshot().result).toBe('victory');
    } finally { adapter.destroy(); }
  });

  it('only stops listening on destroy and never leaves the session room', () => {
    const fake = fakeTransport();
    const adapter = createServerGameplayAdapter('http://localhost', 'medium', 'sector-01', 'skirmish', fake.transport);
    adapter.destroy();
    expect(fake.closed()).toBe(1);
    expect(fake.sent).toEqual([]);
  });
});
