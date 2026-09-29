import { describe, expect, it } from 'vitest';
import { parseBattlefieldCommand, parseCommand } from './index.js';

const move = { type: 'move_group', seq: 1, squadIds: ['p1-a', 'p1_b'], x: 0, y: 72 };
const stop = { type: 'stop', seq: 2, squadIds: ['p1-a'] };
const invalid = { ok: false, reason: 'invalid_command' };

describe('battlefield command boundary', () => {
  it('accepts group movement and stop, returning detached commands', () => {
    const source = { ...move, squadIds: [...move.squadIds] };
    const result = parseBattlefieldCommand(source);
    expect(result).toEqual({ ok: true, command: move });
    source.squadIds[0] = 'changed';
    source.x = 90;
    expect(result).toEqual({ ok: true, command: move });
    expect(parseBattlefieldCommand(stop)).toEqual({ ok: true, command: stop });
    expect(parseBattlefieldCommand({ ...move, squadIds: Array.from({ length: 16 }, (_, i) => `s${i}`) }).ok).toBe(true);
    expect(parseBattlefieldCommand({ ...move, x: Number.MAX_SAFE_INTEGER, y: 0 }).ok).toBe(true);
    expect(parseBattlefieldCommand({ ...stop, seq: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
  });

  it('parses serialized replay commands deterministically', () => {
    const replay = [move, stop, { ...move, seq: 3, squadIds: ['p1_b'], x: 71, y: 0 }];
    const serialized = JSON.stringify(replay);
    const first = JSON.parse(serialized) as unknown[];
    const second = JSON.parse(serialized) as unknown[];
    expect(first.map(parseBattlefieldCommand)).toEqual(second.map(parseBattlefieldCommand));
    expect(first.map(parseBattlefieldCommand)).toEqual(replay.map((command) => ({ ok: true, command })));
  });

  it.each([
    null, [], 'move_group', {},
    { ...move, seq: 0 }, { ...move, seq: 1.5 }, { ...move, seq: Number.MAX_SAFE_INTEGER + 1 },
    { ...stop, seq: 0 }, { ...stop, seq: Infinity },
    { ...move, x: -1 }, { ...move, y: 1.5 }, { ...move, x: NaN },
    { ...move, y: Number.MAX_SAFE_INTEGER + 1 }, { ...move, x: '0' },
    { ...move, squadIds: [] }, { ...move, squadIds: Array.from({ length: 17 }, (_, i) => `s${i}`) },
    { ...move, squadIds: ['p1-a', 'p1-a'] }, { ...stop, squadIds: ['a', 'a'] },
    { ...move, squadIds: ['../secret'] }, { ...move, squadIds: ['a'.repeat(65)] },
    { ...move, squadIds: ['a', 2] }, { ...move, squadIds: 'a' },
    { ...move, type: 'move' }, { ...move, map: {} },
    { ...stop, x: 0 }, { ...stop, y: 0 }, { ...stop, mapId: 'custom' },
  ])('rejects malformed data: %j', (value) => {
    expect(parseBattlefieldCommand(value)).toEqual(invalid);
  });

  it('rejects sparse, accessor and decorated arrays without running getters', () => {
    const sparse = ['a', , 'c'];
    const accessor = ['a'];
    let getterCalls = 0;
    Object.defineProperty(accessor, '0', { get() { getterCalls++; return 'a'; } });
    const decorated = Object.assign(['a'], { extra: true });
    const symbolic = ['a'];
    Object.defineProperty(symbolic, Symbol('extra'), { value: 1 });
    const subclassed = new (class extends Array<string> {} )();
    subclassed.push('a');
    for (const squadIds of [sparse, accessor, decorated, symbolic, subclassed]) {
      expect(parseBattlefieldCommand({ ...move, squadIds })).toEqual(invalid);
    }
    expect(getterCalls).toBe(0);
  });

  it('rejects object getters, symbols and non-plain prototypes without invoking getters', () => {
    const getter = { ...move };
    let getterCalls = 0;
    Object.defineProperty(getter, 'x', { get() { getterCalls++; return 0; } });
    const extraGetter = { ...move };
    Object.defineProperty(extraGetter, 'extra', { get() { getterCalls++; return true; } });
    const symbolic = { ...move, [Symbol('extra')]: true };
    const inherited = Object.create({ type: 'move_group' });
    Object.assign(inherited, move);
    const nullPrototype = Object.assign(Object.create(null), move);
    expect(parseBattlefieldCommand(nullPrototype)).toEqual({ ok: true, command: move });
    for (const value of [getter, extraGetter, symbolic, inherited]) {
      expect(parseBattlefieldCommand(value)).toEqual(invalid);
    }
    expect(getterCalls).toBe(0);
  });

  it('leaves the legacy move command and parser behavior intact', () => {
    const legacy = { type: 'move', seq: 1, squadId: 'p1-a', x: -2, y: 3 };
    expect(parseCommand(legacy)).toEqual({ ok: true, command: legacy });
    expect(parseBattlefieldCommand(legacy)).toEqual(invalid);
    expect(parseCommand(move)).toEqual(invalid);
    expect(parseCommand(stop)).toEqual(invalid);
  });
});
