import { describe, expect, it } from 'vitest';
import { parseCommand } from './index.js';

const valid = { seq: 1, type: 'move', squadId: 'p1-interceptor', x: 3, y: 4 };
describe('command boundary', () => {
  it('validates retirement groups and base upgrades without trusting costs from the client', () => {
    const disband = { seq: 1, type: 'disband', squadIds: ['p1-explorer', 'p1-interceptor'] };
    expect(parseCommand(disband)).toEqual({ ok: true, command: disband });
    expect(parseCommand({ ...disband, squadIds: [] }).ok).toBe(false);
    expect(parseCommand({ ...disband, squadIds: ['p1-explorer', 'p1-explorer'] }).ok).toBe(false);
    expect(parseCommand({ ...disband, squadIds: Array.from({ length: 25 }, (_, i) => `ship-${i}`) }).ok).toBe(false);
    const ids = ['p1-explorer'];
    Object.defineProperty(ids, '0', { get() { throw new Error('must not execute'); } });
    expect(parseCommand({ ...disband, squadIds: ids }).ok).toBe(false);
    const upgrade = { seq: 2, type: 'upgrade_base', upgrade: 'capacity' };
    expect(parseCommand(upgrade)).toEqual({ ok: true, command: upgrade });
    expect(parseCommand({ ...upgrade, upgrade: 'free_metal' }).ok).toBe(false);
    expect(parseCommand({ ...upgrade, cost: 0 }).ok).toBe(false);
  });
  it('accepts only the serializable move intention', () => {
    expect(parseCommand(valid)).toEqual({ ok: true, command: valid });
    const source = { ...valid };
    const result = parseCommand(source);
    source.x = 9;
    if (result.ok && result.command.type === 'move') expect(result.command.x).toBe(3);
  });
  it('accepts an attack intention with an entity ID and no coordinates', () => {
    const attack = { seq: 2, type: 'attack', squadId: 'p1-interceptor', targetId: 'p2-interceptor' };
    expect(parseCommand(attack)).toEqual({ ok: true, command: attack });
    expect(parseCommand({ ...attack, x: 3 })).toEqual({ ok: false, reason: 'invalid_command' });
    expect(parseCommand({ ...attack, targetId: '../enemy' })).toEqual({ ok: false, reason: 'invalid_command' });
  });
  it('accepts a finite enqueue and a stance from the command card', () => {
    const queued = { seq: 3, type: 'enqueue', squadId: 'p1-interceptor', x: 4, y: 5 };
    const stance = { seq: 4, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' };
    expect(parseCommand(queued)).toEqual({ ok: true, command: queued });
    expect(parseCommand(stance)).toEqual({ ok: true, command: stance });
    expect(parseCommand({ ...stance, stance: 'march' })).toEqual({ ok: false, reason: 'invalid_command' });
    expect(parseCommand({ ...queued, loop: true })).toEqual({ ok: false, reason: 'invalid_command' });
  });
  it('accepts a stop intention for interrupting a ship route', () => {
    const stop = { seq: 5, type: 'stop', squadId: 'p1-interceptor' };
    expect(parseCommand(stop)).toEqual({ ok: true, command: stop });
    expect(parseCommand({ ...stop, x: 3 })).toEqual({ ok: false, reason: 'invalid_command' });
  });
  it.each([null, [], 'move', {}, { ...valid, seq: 0 }, { ...valid, seq: 1.5 },
    { ...valid, seq: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, x: NaN },
    { ...valid, y: Infinity }, { ...valid, x: '3' }, { ...valid, type: 'attack' },
    { ...valid, squadId: '../secret' }, { ...valid, winner: 'p1' },
  ])('rejects malformed or extra data: %j', (value) => {
    expect(parseCommand(value)).toEqual({ ok: false, reason: 'invalid_command' });
  });
  it('does not execute property accessors', () => {
    const value = { ...valid };
    Object.defineProperty(value, 'x', { get() { throw new Error('must not execute'); } });
    expect(parseCommand(value).ok).toBe(false);
  });
});
