import type { GameplayViewModel, PresentationIntent } from './model';

type PauseIntent = Extract<PresentationIntent, { type: 'set-paused' }>;

/** Whether the in-match menu is open, and whether opening it asked the match to pause. */
export interface MenuState { open: boolean; paused: boolean }
export const MENU_CLOSED: MenuState = Object.freeze({ open: false, paused: false });

/**
 * Opening the in-match menu. Never over a finished match (the result dialog already offers every way out). Where the
 * room takes pause requests the match pauses while the menu is open; elsewhere the match keeps running.
 */
export function openGameMenu(state: MenuState, view: Pick<GameplayViewModel, 'result' | 'canPause'>): { state: MenuState; intent: PauseIntent | null } {
  if (view.result || state.open) return { state, intent: null };
  return view.canPause
    ? { state: { open: true, paused: true }, intent: { type: 'set-paused', paused: true } }
    : { state: { open: true, paused: false }, intent: null };
}

/** Closing it restarts the match clock only if opening it stopped the clock. */
export function closeGameMenu(state: MenuState): { state: MenuState; intent: PauseIntent | null } {
  return { state: MENU_CLOSED, intent: state.paused ? { type: 'set-paused', paused: false } : null };
}

/**
 * Controls that Space or Enter would press. Space is a match shortcut and the match lets it through to a focused
 * control, so focus never goes back to one of these when the menu closes: Space on the menu button would reopen
 * the menu (and pause the practice again), Space on a build button would order a ship.
 */
const PRESSABLE = 'button, a, summary, input, select, textarea, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], [role="slider"]';

/** Where focus goes once the menu closes: back where it was, unless that is a pressable control (then the page). */
export function focusAfterMenu<T extends { isConnected: boolean; closest(selectors: string): unknown }>(previous: T | null): T | null {
  return previous?.isConnected && !previous.closest(PRESSABLE) ? previous : null;
}

/**
 * Tab inside a modal: from the last stop it wraps to the first and back, and focus outside the modal comes back
 * into it. Null when the browser's own move stays inside.
 */
export function wrapTab<T>(stops: readonly T[], active: T | null, backwards: boolean): T | null {
  if (!stops.length) return null;
  const first = stops[0]!, last = stops[stops.length - 1]!;
  const index = active === null ? -1 : stops.indexOf(active);
  if (index === -1) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === stops.length - 1) return first;
  return null;
}
