/** Serializable intentions. The server owns all game outcomes. */
export interface MoveCommand {
  seq: number;
  type: 'move';
  squadId: string;
  x: number;
  y: number;
}
export type Command = MoveCommand;
export type ParseResult = { ok: true; command: Command } | { ok: false; reason: 'invalid_command' };

/** Strict validation at the JSON boundary. No coercion or extra properties. */
export function parseCommand(value: unknown): ParseResult {
  const invalid = { ok: false, reason: 'invalid_command' } as const;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid;
  const fields = Object.getOwnPropertyDescriptors(value);
  const expected = ['seq', 'type', 'squadId', 'x', 'y'];
  if (Reflect.ownKeys(value).length !== expected.length) return invalid;
  if (expected.some((key) => !fields[key] || !('value' in fields[key]))) return invalid;
  const seq: unknown = fields.seq!.value;
  const type: unknown = fields.type!.value;
  const squadId: unknown = fields.squadId!.value;
  const x: unknown = fields.x!.value;
  const y: unknown = fields.y!.value;
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return invalid;
  if (type !== 'move' || typeof squadId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(squadId)) return invalid;
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) return invalid;
  if (typeof y !== 'number' || !Number.isSafeInteger(y)) return invalid;
  return { ok: true, command: { seq, type, squadId, x, y } };
}

export * from './protocol.js';
