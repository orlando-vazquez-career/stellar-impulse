/**
 * Every keyboard shortcut of a match, rebindable from Settings → Controls.
 *
 * A binding is a physical key (`KeyboardEvent.code`, so it is the same key on a Spanish or an
 * English keyboard) plus optional modifiers, stored as text: `KeyZ`, `Ctrl+Digit1`, `Shift+F5`.
 * An empty string leaves an action without a key.
 */

export const CONTROL_GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const CAMERA_SLOTS = [1, 2, 3, 4] as const;
export type ControlGroup = typeof CONTROL_GROUPS[number];
export type CameraSlot = typeof CAMERA_SLOTS[number];

export type ShortcutAction =
  | 'hold' | 'stop' | 'formation' | 'disband'
  | 'produce-interceptor' | 'produce-frigate' | 'produce-bomber' | 'produce-explorer'
  | 'camera-up' | 'camera-down' | 'camera-left' | 'camera-right' | 'camera-selection' | 'camera-base'
  | `camera-save-${CameraSlot}` | `camera-go-${CameraSlot}`
  | 'select-all'
  | `group-select-${ControlGroup}` | `group-set-${ControlGroup}` | `group-add-${ControlGroup}`;

export type ShortcutCategory = 'orders' | 'production' | 'camera' | 'selection' | 'groups';
export type Keybindings = Record<ShortcutAction, string>;

/** Camera panning follows a held key, so its bindings are a bare key without modifiers. */
export const PAN_ACTIONS = ['camera-up', 'camera-down', 'camera-left', 'camera-right'] as const;

const groupDefaults = Object.fromEntries(CONTROL_GROUPS.flatMap((group) => [
  [`group-select-${group}`, `Digit${group}`],
  [`group-set-${group}`, `Ctrl+Digit${group}`],
  [`group-add-${group}`, `Shift+Digit${group}`],
])) as Record<`group-${'select' | 'set' | 'add'}-${ControlGroup}`, string>;
const cameraSlotDefaults = Object.fromEntries(CAMERA_SLOTS.flatMap((slot) => [
  [`camera-save-${slot}`, `Ctrl+F${slot + 4}`],
  [`camera-go-${slot}`, `F${slot + 4}`],
])) as Record<`camera-${'save' | 'go'}-${CameraSlot}`, string>;

export const DEFAULT_KEYBINDINGS: Keybindings = {
  hold: 'KeyZ',
  stop: 'Escape',
  formation: 'KeyF',
  disband: 'Delete',
  'produce-interceptor': 'KeyX',
  'produce-frigate': 'KeyC',
  'produce-bomber': 'KeyV',
  'produce-explorer': 'KeyB',
  'camera-up': 'KeyW',
  'camera-down': 'KeyS',
  'camera-left': 'KeyA',
  'camera-right': 'KeyD',
  'camera-selection': 'Space',
  'camera-base': 'Home',
  'select-all': 'Ctrl+KeyA',
  ...cameraSlotDefaults,
  ...groupDefaults,
};

export const SHORTCUT_CATEGORIES: Array<{ id: ShortcutCategory; actions: ShortcutAction[] }> = [
  { id: 'orders', actions: ['hold', 'stop', 'formation', 'disband'] },
  { id: 'production', actions: ['produce-interceptor', 'produce-frigate', 'produce-bomber', 'produce-explorer'] },
  { id: 'camera', actions: ['camera-up', 'camera-down', 'camera-left', 'camera-right', 'camera-selection', 'camera-base',
    ...CAMERA_SLOTS.flatMap((slot) => [`camera-save-${slot}`, `camera-go-${slot}`] as const)] },
  { id: 'selection', actions: ['select-all'] },
  { id: 'groups', actions: CONTROL_GROUPS.flatMap((group) => [`group-select-${group}`, `group-set-${group}`, `group-add-${group}`] as const) },
];

const ACTIONS = new Set(Object.keys(DEFAULT_KEYBINDINGS));
/** Keys that only change another key, plus the browser's own full screen and developer tools. */
const UNBINDABLE = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$|^(ContextMenu|CapsLock|NumLock|ScrollLock|Fn|FnLock|F11|F12|Unidentified)$/;
const COMBO = /^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Za-z0-9]+)$/;

export function freshKeybindings(): Keybindings {
  return { ...DEFAULT_KEYBINDINGS };
}

/** The binding a key press stands for, or null for a lone modifier and keys the game never takes. */
export function comboFromEvent(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (!event.code || UNBINDABLE.test(event.code) || event.metaKey) return null;
  return `${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.code}`;
}

export function isValidCombo(combo: string): boolean {
  const match = COMBO.exec(combo);
  return Boolean(match && !UNBINDABLE.test(match[4]!));
}

/** The physical key of a binding, without its modifiers. */
export function keyOf(combo: string): string {
  return COMBO.exec(combo)?.[4] ?? '';
}

export function isPanAction(action: ShortcutAction): action is typeof PAN_ACTIONS[number] {
  return (PAN_ACTIONS as readonly string[]).includes(action);
}

/** The action bound to a key press. Camera panning is not an action: it follows held keys. */
export function actionForCombo(bindings: Keybindings, combo: string): ShortcutAction | null {
  for (const action of Object.keys(bindings) as ShortcutAction[]) {
    if (!isPanAction(action) && bindings[action] === combo) return action;
  }
  return null;
}

/** The other action that already uses a binding, if any. */
export function conflictFor(bindings: Keybindings, action: ShortcutAction, combo: string): ShortcutAction | null {
  if (!combo) return null;
  return (Object.keys(bindings) as ShortcutAction[]).find((other) => other !== action && bindings[other] === combo) ?? null;
}

/**
 * Bind `combo` to `action`. When another action already had it, the two trade keys so no
 * shortcut is ever lost; `swapped` names that action so the player can be told.
 */
export function assignBinding(bindings: Keybindings, action: ShortcutAction, combo: string): { bindings: Keybindings; swapped: ShortcutAction | null } {
  const key = isPanAction(action) ? keyOf(combo) : combo;
  const swapped = conflictFor(bindings, action, key);
  const next = { ...bindings, [action]: key };
  if (swapped) next[swapped] = isPanAction(swapped) && bindings[action] ? keyOf(bindings[action]) : bindings[action];
  return { bindings: next, swapped };
}

/** Saved bindings over the defaults; unknown actions and malformed keys are dropped. */
export function readKeybindings(stored: unknown): Keybindings {
  const bindings = freshKeybindings();
  if (!stored || typeof stored !== 'object') return bindings;
  for (const [action, combo] of Object.entries(stored as Record<string, unknown>)) {
    if (!ACTIONS.has(action) || typeof combo !== 'string') continue;
    if (combo === '' || isValidCombo(combo)) bindings[action as ShortcutAction] = isPanAction(action as ShortcutAction) ? keyOf(combo) : combo;
  }
  return bindings;
}

type Locale = 'es' | 'en';
const NAMED: Record<string, { es: string; en: string }> = {
  Space: { es: 'Espacio', en: 'Space' },
  Escape: { es: 'Esc', en: 'Esc' },
  Delete: { es: 'Supr', en: 'Del' },
  Insert: { es: 'Insert', en: 'Ins' },
  Home: { es: 'Inicio', en: 'Home' },
  End: { es: 'Fin', en: 'End' },
  PageUp: { es: 'RePág', en: 'PgUp' },
  PageDown: { es: 'AvPág', en: 'PgDn' },
  Backspace: { es: 'Retroceso', en: 'Backspace' },
  Enter: { es: 'Intro', en: 'Enter' },
  NumpadEnter: { es: 'Intro num.', en: 'Num Enter' },
  Tab: { es: 'Tab', en: 'Tab' },
  ArrowUp: { es: '↑', en: '↑' },
  ArrowDown: { es: '↓', en: '↓' },
  ArrowLeft: { es: '←', en: '←' },
  ArrowRight: { es: '→', en: '→' },
  Minus: { es: '-', en: '-' },
  Equal: { es: '=', en: '=' },
  BracketLeft: { es: '[', en: '[' },
  BracketRight: { es: ']', en: ']' },
  Semicolon: { es: ';', en: ';' },
  Quote: { es: "'", en: "'" },
  Backquote: { es: '`', en: '`' },
  Backslash: { es: '\\', en: '\\' },
  IntlBackslash: { es: '<', en: '<' },
  Comma: { es: ',', en: ',' },
  Period: { es: '.', en: '.' },
  Slash: { es: '/', en: '/' },
};

/** Printed labels of the player's real keyboard layout, when the browser shares them (Chrome). */
let layoutLabels: ReadonlyMap<string, string> | null = null;
export async function loadKeyboardLayout(): Promise<void> {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?(): Promise<ReadonlyMap<string, string>> } }).keyboard;
  try {
    if (keyboard?.getLayoutMap) layoutLabels = await keyboard.getLayoutMap();
  } catch {
    layoutLabels = null;
  }
}

function keyLabel(code: string, locale: Locale): string {
  const printed = layoutLabels?.get(code);
  if (printed && printed.trim()) return printed.toUpperCase();
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1]!;
  const numpad = /^Numpad(.+)$/.exec(code);
  if (numpad && code !== 'NumpadEnter') return `Num ${numpad[1]}`;
  return NAMED[code]?.[locale] ?? code;
}

/** "Ctrl+Digit1" → "Ctrl+1"; an unbound action reads as an em dash. */
export function formatCombo(combo: string, locale: Locale): string {
  const match = COMBO.exec(combo);
  if (!match) return '—';
  return `${match[1] ? 'Ctrl+' : ''}${match[2] ? 'Alt+' : ''}${match[3] ? 'Shift+' : ''}${keyLabel(match[4]!, locale)}`;
}
