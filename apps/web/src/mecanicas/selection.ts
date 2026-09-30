export const CONTROL_GROUP_COUNT = 9;
export const DOUBLE_TAP_MS = 300;

export interface ControlGroups {
  readonly slots: ReadonlyMap<number, readonly string[]>;
  readonly lastDigit: number | null;
  readonly lastDigitAt: number;
}

export interface Recall {
  readonly groups: ControlGroups;
  readonly ids: readonly string[];
  readonly center: boolean;
}

export interface ScreenUnit {
  readonly id: string;
  readonly ownerId: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

export function emptyGroups(): ControlGroups {
  return { slots: new Map(), lastDigit: null, lastDigitAt: 0 };
}

export function controlDigit(key: string): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const digit = Number(key);
  return digit >= 1 && digit <= CONTROL_GROUP_COUNT ? digit : null;
}

export function storeGroup(groups: ControlGroups, digit: number, ids: readonly string[]): ControlGroups {
  const slots = new Map(groups.slots);
  slots.set(digit, [...ids]);
  return { slots, lastDigit: groups.lastDigit, lastDigitAt: groups.lastDigitAt };
}

export function recallGroup(groups: ControlGroups, digit: number, now: number): Recall {
  const center = groups.lastDigit === digit && now - groups.lastDigitAt <= DOUBLE_TAP_MS;
  return {
    groups: { slots: groups.slots, lastDigit: digit, lastDigitAt: now },
    ids: groups.slots.get(digit) ?? [],
    center,
  };
}

/** Same kind, same owner, and only cells the player can currently see. */
export function sameKindOnScreen(units: readonly ScreenUnit[], request: { ownerId: string; kind: string; visible: ReadonlySet<string> }): string[] {
  return units
    .filter((unit) => unit.ownerId === request.ownerId && unit.kind === request.kind && request.visible.has(`${unit.x},${unit.y}`))
    .map((unit) => unit.id);
}
