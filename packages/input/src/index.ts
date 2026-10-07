/** Serializable intentions. The server owns all game outcomes. */
export interface MoveCommand {
  seq: number;
  type: 'move';
  squadId: string;
  x: number;
  y: number;
}
/** Formation shapes a group order can take. The sim owns their geometry. */
export const FORMATION_KINDS = ['line', 'column', 'wedge', 'box', 'ranks', 'circle'] as const;
export type FormationKindName = typeof FORMATION_KINDS[number];
/** Several ships march to one point and settle into a shape facing the march. */
export interface MoveFormationCommand {
  seq: number;
  type: 'move_formation';
  squadIds: string[];
  x: number;
  y: number;
  formation: FormationKindName;
}
export interface AttackCommand {
  seq: number;
  type: 'attack';
  squadId: string;
  targetId: string;
}
export interface StopCommand {
  seq: number;
  type: 'stop';
  squadId: string;
}
export interface EnqueueCommand {
  seq: number;
  type: 'enqueue';
  squadId: string;
  x: number;
  y: number;
}
export interface StanceCommand {
  seq: number;
  type: 'stance';
  squadId: string;
  stance: 'guard' | 'patrol' | 'attack';
}
/** Ask the base hangar for one ship. The server checks Metal, fleet cap and queue. */
export interface ProduceCommand {
  seq: number;
  type: 'produce';
  kind: 'explorer' | 'interceptor' | 'frigate' | 'bomber';
}
export interface DisbandCommand { seq: number; type: 'disband'; squadIds: string[] }
export interface UpgradeBaseCommand { seq: number; type: 'upgrade_base'; upgrade: 'damage' | 'capacity' }
/** Build one base module. Slot rules and costs are checked by the server. */
export interface BuildModuleCommand { seq: number; type: 'build_module'; module: 'refinery' | 'refinery2' | 'shipyard' | 'bastion' | 'radar' }
export interface SurrenderCommand { seq: number; type: 'surrender' }
export type Command = MoveCommand | MoveFormationCommand | AttackCommand | StopCommand | EnqueueCommand | StanceCommand | ProduceCommand | DisbandCommand
  | UpgradeBaseCommand | BuildModuleCommand | SurrenderCommand;
export type ParseResult = { ok: true; command: Command } | { ok: false; reason: 'invalid_command' };

/** Strict validation at the JSON boundary. No coercion or extra properties. */
export function parseCommand(value: unknown): ParseResult {
  const invalid = { ok: false, reason: 'invalid_command' } as const;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid;
  const fields = Object.getOwnPropertyDescriptors(value);
  const type: unknown = fields.type?.value;
  const expected = type === 'move' || type === 'enqueue' ? ['seq', 'type', 'squadId', 'x', 'y']
    : type === 'attack' ? ['seq', 'type', 'squadId', 'targetId']
    : type === 'stop' ? ['seq', 'type', 'squadId']
    : type === 'disband' ? ['seq', 'type', 'squadIds']
    : type === 'move_formation' ? ['seq', 'type', 'squadIds', 'x', 'y', 'formation']
    : type === 'stance' ? ['seq', 'type', 'squadId', 'stance']
    : type === 'produce' ? ['seq', 'type', 'kind']
    : type === 'upgrade_base' ? ['seq', 'type', 'upgrade']
    : type === 'build_module' ? ['seq', 'type', 'module']
    : type === 'surrender' ? ['seq', 'type'] : [];
  if (!expected.length || Reflect.ownKeys(value).length !== expected.length) return invalid;
  if (expected.some((key) => !fields[key] || !('value' in fields[key]))) return invalid;
  const seq: unknown = fields.seq!.value;
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return invalid;
  if (type === 'disband' || type === 'move_formation') {
    const value = fields.squadIds!.value;
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return invalid;
    const length = Object.getOwnPropertyDescriptor(value, 'length')!.value;
    if (length < 1 || length > 24 || Reflect.ownKeys(value).length !== length + 1) return invalid;
    const squadIds: string[] = [];
    for (let i = 0; i < length; i++) {
      const field = Object.getOwnPropertyDescriptor(value, String(i));
      if (!field || !('value' in field) || typeof field.value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(field.value)
        || squadIds.includes(field.value)) return invalid;
      squadIds.push(field.value);
    }
    if (type === 'disband') return { ok: true, command: { seq, type, squadIds } };
    const x: unknown = fields.x!.value;
    const y: unknown = fields.y!.value;
    const formation: unknown = fields.formation!.value;
    if (typeof x !== 'number' || !Number.isSafeInteger(x) || typeof y !== 'number' || !Number.isSafeInteger(y)) return invalid;
    if (typeof formation !== 'string' || !(FORMATION_KINDS as readonly string[]).includes(formation)) return invalid;
    return { ok: true, command: { seq, type, squadIds, x, y, formation: formation as FormationKindName } };
  }
  if (type === 'surrender') return { ok: true, command: { seq, type } };
  if (type === 'build_module') {
    const module = fields.module!.value;
    if (module !== 'refinery' && module !== 'refinery2' && module !== 'shipyard' && module !== 'bastion' && module !== 'radar') return invalid;
    return { ok: true, command: { seq, type, module } };
  }
  if (type === 'upgrade_base') {
    const upgrade = fields.upgrade!.value;
    if (upgrade !== 'damage' && upgrade !== 'capacity') return invalid;
    return { ok: true, command: { seq, type, upgrade } };
  }
  if (type === 'produce') {
    const kind: unknown = fields.kind!.value;
    if (kind !== 'explorer' && kind !== 'interceptor' && kind !== 'frigate' && kind !== 'bomber') return invalid;
    return { ok: true, command: { seq, type, kind } };
  }
  const squadId: unknown = fields.squadId!.value;
  if (typeof squadId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(squadId)) return invalid;
  if (type === 'stance') {
    const stance: unknown = fields.stance!.value;
    if (stance !== 'guard' && stance !== 'patrol' && stance !== 'attack') return invalid;
    return { ok: true, command: { seq, type, squadId, stance } };
  }
  if (type === 'attack') {
    const targetId: unknown = fields.targetId!.value;
    if (typeof targetId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(targetId)) return invalid;
    return { ok: true, command: { seq, type, squadId, targetId } };
  }
  if (type === 'stop') return { ok: true, command: { seq, type, squadId } };
  if (type !== 'move' && type !== 'enqueue') return invalid;
  const x: unknown = fields.x!.value;
  const y: unknown = fields.y!.value;
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) return invalid;
  if (typeof y !== 'number' || !Number.isSafeInteger(y)) return invalid;
  return { ok: true, command: { seq, type, squadId, x, y } };
}

export * from './protocol.js';
export * from './battlefield.js';
