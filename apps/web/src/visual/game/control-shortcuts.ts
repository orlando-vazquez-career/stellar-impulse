import type { SquadOwner, SquadType } from './model';
import type { ControlAction } from '../settings/control-bindings';
import { normalizeKeyBinding } from '../settings/control-bindings';

export const PRODUCTION_ORDER = [
  { kind: 'interceptor', control: 'produceInterceptor', key: 'Q' },
  { kind: 'frigate', control: 'produceFrigate', key: 'E' },
  { kind: 'bomber', control: 'produceBomber', key: 'R' },
  { kind: 'explorer', control: 'produceExplorer', key: 'T' },
] as const satisfies readonly { kind: SquadType; control: ControlAction; key: string }[];

export function productionKindForKey(key: string): SquadType | null {
  const binding = normalizeKeyBinding(key);
  return PRODUCTION_ORDER.find((entry) => normalizeKeyBinding(entry.key) === binding)?.kind ?? null;
}

export function productionKindForControl(action: ControlAction): SquadType | null {
  return PRODUCTION_ORDER.find((entry) => entry.control === action)?.kind ?? null;
}

export function controlGroupForAction(action: ControlAction): ControlGroupShortcut | null {
  const match = /^group(Assign|Recall)([1-9])$/.exec(action);
  if (!match) return null;
  return { group: Number(match[2]) as ControlGroupNumber, mode: match[1] === 'Assign' ? 'assign' : 'recall' };
}

export type ControlGroupNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ControlGroupMode = 'assign' | 'recall';
export type ControlGroupAssignments = Partial<Record<ControlGroupNumber, string[]>>;

export interface ControlGroupShortcut {
  group: ControlGroupNumber;
  mode: ControlGroupMode;
}

export interface ControlGroupModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface ControlGroupSquad {
  id: string;
  owner: SquadOwner;
  visible: boolean;
  healthPercent: number;
  gridX: number;
  gridY: number;
}

export function controlGroupShortcut(key: string, modifiers: ControlGroupModifiers): ControlGroupShortcut | null {
  if (!/^[1-9]$/.test(key) || modifiers.altKey || modifiers.shiftKey) return null;
  return {
    group: Number(key) as ControlGroupNumber,
    mode: modifiers.ctrlKey || modifiers.metaKey ? 'assign' : 'recall',
  };
}

const isAvailableFriendly = (squad: ControlGroupSquad) =>
  squad.owner === 'blue' && squad.visible && squad.healthPercent > 0;

export function assignControlGroup(
  assignments: ControlGroupAssignments,
  group: ControlGroupNumber,
  selectedIds: readonly string[],
  squads: readonly ControlGroupSquad[],
): ControlGroupAssignments {
  const selected = new Set(selectedIds);
  const ids = squads.filter((squad) => selected.has(squad.id) && isAvailableFriendly(squad)).map((squad) => squad.id);
  return ids.length ? { ...assignments, [group]: ids } : assignments;
}

export function recallControlGroup(
  assignments: ControlGroupAssignments,
  group: ControlGroupNumber,
  squads: readonly ControlGroupSquad[],
): string[] {
  const available = new Set(squads.filter(isAvailableFriendly).map((squad) => squad.id));
  return (assignments[group] ?? []).filter((id) => available.has(id));
}

export function focusSelectedSquads(
  squads: readonly ControlGroupSquad[],
  selectedIds: readonly string[],
): { x: number; y: number } | null {
  const selected = new Set(selectedIds);
  const available = squads.filter((squad) => selected.has(squad.id) && isAvailableFriendly(squad));
  if (!available.length) return null;
  return {
    x: available.reduce((sum, squad) => sum + squad.gridX, 0) / available.length,
    y: available.reduce((sum, squad) => sum + squad.gridY, 0) / available.length,
  };
}
