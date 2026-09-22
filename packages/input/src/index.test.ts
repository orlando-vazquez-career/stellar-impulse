import { describe, expect, it } from 'vitest';
import { parseCommand } from './index.js';

const valid = { seq: 1, type: 'move', squadId: 'p1-interceptor', x: 3, y: 4 };
describe('command boundary', () => {
  it('accepts only the serializable move intention', () => {
    expect(parseCommand(valid)).toEqual({ ok: true, command: valid });
    const source = { ...valid };
    const result = parseCommand(source);
    source.x = 9;
    if (result.ok) expect(result.command.x).toBe(3);
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
