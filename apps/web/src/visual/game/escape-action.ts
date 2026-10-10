import type { GameplayAction } from './model';

export type EscapeAction = 'close-menu' | 'close-panel' | 'cancel' | 'open-menu';

/**
 * Escape is fixed, not a rebindable control: it always backs out, so a player can never lock
 * themselves out of the menu. `Esc` is the key value older browsers report.
 */
export function isEscapeKey(event: { code?: string; key?: string }): boolean {
  return event.code === 'Escape' || event.key === 'Escape' || event.key === 'Esc';
}

/** What one press of Escape does in a match: the innermost thing open closes first. */
export function escapeAction(state: { menuOpen: boolean; panelOpen: boolean; activeAction: GameplayAction }): EscapeAction {
  if (state.menuOpen) return 'close-menu';
  if (state.panelOpen) return 'close-panel';
  if (state.activeAction !== null) return 'cancel';
  return 'open-menu';
}
