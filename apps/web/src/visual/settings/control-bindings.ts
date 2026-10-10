export const CONTROL_GROUP_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type ControlGroupSlot = typeof CONTROL_GROUP_SLOTS[number];
type GroupControlAction = `groupAssign${ControlGroupSlot}` | `groupRecall${ControlGroupSlot}`;

export type ControlAction =
  | 'move' | 'attack' | 'hold' | 'capture' | 'cancel' | 'selectBase'
  | 'cameraFocus' | 'panUp' | 'panDown' | 'panLeft' | 'panRight'
  | 'produceInterceptor' | 'produceFrigate' | 'produceBomber' | 'produceExplorer'
  | 'cycleFormation' | 'disband'
  | GroupControlAction;

export type ControlBindings = Record<ControlAction, string[]>;
export type CameraPanDirection = 'up' | 'down' | 'left' | 'right';

const groupDefaults = Object.fromEntries(CONTROL_GROUP_SLOTS.flatMap((slot) => [
  [`groupAssign${slot}`, [`Ctrl+Digit${slot}`]],
  [`groupRecall${slot}`, [`Digit${slot}`]],
])) as Record<GroupControlAction, string[]>;

export const DEFAULT_CONTROL_BINDINGS: ControlBindings = {
  move: ['KeyM'],
  attack: ['KeyG'],
  hold: ['KeyH'],
  capture: ['KeyC'],
  cancel: ['Escape'],
  selectBase: ['KeyB'],
  cameraFocus: ['Space'],
  panUp: ['KeyW', 'ArrowUp'],
  panDown: ['KeyS', 'ArrowDown'],
  panLeft: ['KeyA', 'ArrowLeft'],
  panRight: ['KeyD', 'ArrowRight'],
  produceInterceptor: ['KeyQ'],
  produceFrigate: ['KeyE'],
  produceBomber: ['KeyR'],
  produceExplorer: ['KeyT'],
  cycleFormation: ['KeyF'],
  disband: ['Delete'],
  ...groupDefaults,
};

export const CONTROL_SECTIONS: ReadonlyArray<{ id: 'orders' | 'camera' | 'production' | 'formation' | 'groups'; actions: readonly ControlAction[] }> = [
  { id: 'orders', actions: ['move', 'attack', 'hold', 'capture', 'cancel', 'selectBase'] },
  { id: 'camera', actions: ['cameraFocus', 'panUp', 'panDown', 'panLeft', 'panRight'] },
  { id: 'production', actions: ['produceInterceptor', 'produceFrigate', 'produceBomber', 'produceExplorer'] },
  { id: 'formation', actions: ['cycleFormation', 'disband'] },
  { id: 'groups', actions: CONTROL_GROUP_SLOTS.flatMap((slot) => [`groupAssign${slot}`, `groupRecall${slot}`] as ControlAction[]) },
];

export const CONTROL_ACTIONS: readonly ControlAction[] = CONTROL_SECTIONS.flatMap((section) => [...section.actions]);

const modifierOrder = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
type Modifier = typeof modifierOrder[number];

const modifierCodes = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

function normalizeCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  if (/^[a-z]$/i.test(trimmed)) return `Key${trimmed.toUpperCase()}`;
  if (/^\d$/.test(trimmed)) return `Digit${trimmed}`;
  const aliases: Record<string, string> = {
    Esc: 'Escape', Spacebar: 'Space', ' ': 'Space', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown',
    Control: '', Ctrl: '', Cmd: '', Command: '', Option: '',
  };
  return aliases[trimmed] ?? trimmed;
}

/** Converts stored strings (including the old single-letter format) into one stable chord. */
export function normalizeKeyBinding(value: string): string | null {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean);
  const rawCode = parts.pop();
  if (!rawCode) return null;
  const code = normalizeCode(rawCode);
  if (!code || modifierCodes.has(code) || ['Control', 'Shift', 'Alt', 'Meta'].includes(code)) return null;
  const aliases: Record<string, Modifier> = { Ctrl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Option: 'Alt', Shift: 'Shift', Meta: 'Meta', Cmd: 'Meta', Command: 'Meta' };
  const modifiers = new Set<Modifier>();
  for (const part of parts) {
    const modifier = aliases[part];
    if (!modifier) return null;
    modifiers.add(modifier);
  }
  const prefix = modifierOrder.filter((modifier) => modifiers.has(modifier));
  return [...prefix, code].join('+');
}

/** KeyboardEvent.code lets bindings survive keyboard-layout changes. */
export function keyBindingFromEvent(event: Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  const code = event.code && event.code !== 'Unidentified' ? event.code : event.key;
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode || modifierCodes.has(normalizedCode) || ['Control', 'Shift', 'Alt', 'Meta'].includes(normalizedCode)) return null;
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Meta');
  return [...modifiers, normalizedCode].join('+');
}

/** A held key chord is released when its main key or any required modifier goes up. */
export function shouldReleaseKeyBinding(binding: string, event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): boolean {
  const parts = normalizeKeyBinding(binding)?.split('+');
  if (!parts) return true;
  const code = parts.pop();
  if (code === event.code) return true;
  const stillPressed: Record<Modifier, boolean> = {
    Ctrl: event.ctrlKey,
    Alt: event.altKey,
    Shift: event.shiftKey,
    Meta: event.metaKey,
  };
  return parts.some((modifier) => modifier in stillPressed && !stillPressed[modifier as Modifier]);
}

export function formatKeyBinding(binding: string, spaceLabel = 'Space'): string {
  const normalized = normalizeKeyBinding(binding);
  if (!normalized) return binding;
  return normalized.split('+').map((part) => {
    if (part === 'Space') return spaceLabel;
    if (part === 'Escape') return 'Esc';
    if (part === 'ArrowUp') return '↑';
    if (part === 'ArrowDown') return '↓';
    if (part === 'ArrowLeft') return '←';
    if (part === 'ArrowRight') return '→';
    if (/^Key[A-Z]$/.test(part)) return part.slice(3);
    if (/^Digit\d$/.test(part)) return part.slice(5);
    return part;
  }).join('+');
}

export function controlActionForEvent(event: KeyboardEvent, controls: ControlBindings): ControlAction | null {
  const binding = keyBindingFromEvent(event);
  if (!binding) return null;
  return CONTROL_ACTIONS.find((action) => controls[action].includes(binding)) ?? null;
}

export function controlActionForBinding(binding: string): ControlAction | null {
  const normalized = normalizeKeyBinding(binding);
  if (!normalized) return null;
  return CONTROL_ACTIONS.find((action) => DEFAULT_CONTROL_BINDINGS[action].includes(normalized)) ?? null;
}

export function panDirectionForControl(action: ControlAction): CameraPanDirection | null {
  if (action === 'panUp') return 'up';
  if (action === 'panDown') return 'down';
  if (action === 'panLeft') return 'left';
  if (action === 'panRight') return 'right';
  return null;
}

export function findBindingConflict(controls: ControlBindings, candidate: string, exceptAction?: ControlAction, exceptBinding?: string): ControlAction | null {
  const normalized = normalizeKeyBinding(candidate);
  if (!normalized) return null;
  return CONTROL_ACTIONS.find((action) => action !== exceptAction
    && controls[action].some((binding) => binding !== exceptBinding && normalizeKeyBinding(binding) === normalized)) ?? null;
}

export function readControlBindings(stored: unknown): ControlBindings {
  const controls = Object.fromEntries(CONTROL_ACTIONS.map((action) => [action, []])) as unknown as ControlBindings;
  const fields = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const used = new Set<string>();

  // Respect saved chords first, so defaults cannot silently take over a user's custom key.
  for (const action of CONTROL_ACTIONS) {
    const raw = action === 'cameraFocus' && fields.cameraFocus === undefined ? fields.camera : fields[action];
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    const normalized = values.flatMap((value) => typeof value === 'string' ? [normalizeKeyBinding(value)] : []).filter((value): value is string => Boolean(value));
    controls[action] = normalized.filter((binding) => {
      if (used.has(binding)) return false;
      used.add(binding);
      return true;
    });
  }

  for (const action of CONTROL_ACTIONS) {
    if (controls[action].length || (fields[action] !== undefined && Array.isArray(fields[action]) && fields[action].length === 0)) continue;
    const fallback = DEFAULT_CONTROL_BINDINGS[action].filter((binding) => !used.has(binding));
    controls[action] = fallback;
    fallback.forEach((binding) => used.add(binding));
  }
  return controls;
}
