import { FORMATION_KINDS, MAX_GROUP_UNITS, type MoveFormationCommand } from './index.js';

/** Serializable battlefield intentions. The server owns all game outcomes. */
export interface MoveGroupCommand {
  type: 'move_group';
  seq: number;
  squadIds: string[];
  x: number;
  y: number;
}

export interface StopCommand {
  type: 'stop';
  seq: number;
  squadIds: string[];
}

export interface AttackGroupCommand {
  type: 'attack_group';
  seq: number;
  squadIds: string[];
  targetId: string;
}

export type BattlefieldCommand = MoveGroupCommand | MoveFormationCommand | StopCommand | AttackGroupCommand;
export type BattlefieldParseResult =
  | { ok: true; command: BattlefieldCommand }
  | { ok: false; reason: 'invalid_command' };

const SQUAD_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const INVALID = { ok: false, reason: 'invalid_command' } as const;

/** Read only own data properties, rejecting accessors, symbols and extra fields. */
function dataFields(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return null;
  if (Reflect.ownKeys(value).length !== keys.length) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some((key) => !descriptors[key] || !('value' in descriptors[key]))) return null;
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of keys) fields[key] = descriptors[key]!.value;
  return fields;
}

/** Copy a dense, unmodified array without reading indexed getters. */
function squadIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (typeof length !== 'number' || length < 1 || length > MAX_GROUP_UNITS) return null;
  if (Reflect.ownKeys(value).length !== length + 1) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) ||
      typeof descriptor.value !== 'string' || !SQUAD_ID.test(descriptor.value) || seen.has(descriptor.value)) return null;
    ids.push(descriptor.value);
    seen.add(descriptor.value);
  }
  return ids;
}

/** Strict validation at the JSON boundary. No coercion or extra properties. */
export function parseBattlefieldCommand(value: unknown): BattlefieldParseResult {
  try {
    const header = dataFields(value, ['type', 'seq', 'squadIds', 'x', 'y', 'formation']) ??
      dataFields(value, ['type', 'seq', 'squadIds', 'x', 'y']) ??
      dataFields(value, ['type', 'seq', 'squadIds', 'targetId']) ??
      dataFields(value, ['type', 'seq', 'squadIds']);
    if (!header) return INVALID;
    const { type, seq } = header;
    if ((type !== 'move_group' && type !== 'move_formation' && type !== 'stop' && type !== 'attack_group') ||
      typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return INVALID;
    const ids = squadIds(header.squadIds);
    if (!ids) return INVALID;
    if ((type === 'move_formation') !== ('formation' in header)) return INVALID;
    if (type === 'stop') {
      if ('x' in header || 'y' in header) return INVALID;
      return { ok: true, command: { type, seq, squadIds: ids } };
    }
    if (type === 'attack_group') {
      if (typeof header.targetId !== 'string' || !SQUAD_ID.test(header.targetId)) return INVALID;
      return { ok: true, command: { type, seq, squadIds: ids, targetId: header.targetId } };
    }
    const { x, y } = header;
    if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0 ||
      typeof y !== 'number' || !Number.isSafeInteger(y) || y < 0) return INVALID;
    if (type === 'move_formation') {
      const formation = header.formation;
      if (typeof formation !== 'string' || !(FORMATION_KINDS as readonly string[]).includes(formation)) return INVALID;
      return { ok: true, command: { type, seq, squadIds: ids, x, y, formation: formation as MoveFormationCommand['formation'] } };
    }
    return { ok: true, command: { type, seq, squadIds: ids, x, y } };
  } catch {
    return INVALID;
  }
}
