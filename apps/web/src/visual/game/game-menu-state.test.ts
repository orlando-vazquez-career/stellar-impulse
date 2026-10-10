import { describe, expect, it } from 'vitest';
import { closeGameMenu, focusAfterMenu, MENU_CLOSED, openGameMenu, wrapTab } from './game-menu-state';

describe('in-match menu pause', () => {
  it('pauses a match that takes pauses when it opens and restarts it when it closes', () => {
    const opened = openGameMenu(MENU_CLOSED, { result: null, canPause: true });
    expect(opened).toEqual({ state: { open: true, paused: true }, intent: { type: 'set-paused', paused: true } });
    const closed = closeGameMenu(opened.state);
    expect(closed).toEqual({ state: MENU_CLOSED, intent: { type: 'set-paused', paused: false } });
  });

  it('opens over a match that cannot pause without asking for a pause, and closes without restarting it', () => {
    const opened = openGameMenu(MENU_CLOSED, { result: null, canPause: false });
    expect(opened).toEqual({ state: { open: true, paused: false }, intent: null });
    expect(closeGameMenu(opened.state)).toEqual({ state: MENU_CLOSED, intent: null });
  });

  it('restarts the clock only when this menu stopped it, even if the room stops taking pauses meanwhile', () => {
    const opened = openGameMenu(MENU_CLOSED, { result: null, canPause: true });
    expect(closeGameMenu(opened.state).intent).toEqual({ type: 'set-paused', paused: false });
    expect(closeGameMenu(MENU_CLOSED)).toEqual({ state: MENU_CLOSED, intent: null });
  });

  it('never opens over a finished match: the result dialog offers every way out', () => {
    expect(openGameMenu(MENU_CLOSED, { result: 'victory', canPause: true })).toEqual({ state: MENU_CLOSED, intent: null });
    expect(openGameMenu(MENU_CLOSED, { result: 'defeat', canPause: false })).toEqual({ state: MENU_CLOSED, intent: null });
  });

  it('asks for one pause however many times it is opened, and restarts once', () => {
    const first = openGameMenu(MENU_CLOSED, { result: null, canPause: true });
    const again = openGameMenu(first.state, { result: null, canPause: true });
    expect(again).toEqual({ state: first.state, intent: null });
    const closed = closeGameMenu(again.state);
    expect(closed.intent).toEqual({ type: 'set-paused', paused: false });
    expect(closeGameMenu(closed.state).intent).toBeNull();
  });
});

/** A stand-in for an element: `closest` matches tag names and `[role="…"]` parts of a selector list. */
function element(tag: string, options: { role?: string; connected?: boolean } = {}) {
  return {
    isConnected: options.connected ?? true,
    closest(selectors: string) {
      const parts = selectors.split(',').map((part) => part.trim());
      return parts.includes(tag) || (options.role !== undefined && parts.includes(`[role="${options.role}"]`)) ? this : null;
    },
  };
}

describe('focus once the menu closes', () => {
  it('never goes back to a control Space would press, since Space is a match shortcut', () => {
    // Opened with a click on the menu button: giving it focus back would let Space press it and reopen the menu.
    expect(focusAfterMenu(element('button'))).toBeNull();
    expect(focusAfterMenu(element('div', { role: 'tab' }))).toBeNull();
    expect(focusAfterMenu(element('div', { role: 'button' }))).toBeNull();
    expect(focusAfterMenu(element('select'))).toBeNull();
    expect(focusAfterMenu(element('input'))).toBeNull();
  });

  it('goes back to the battlefield or the page it came from', () => {
    const canvas = element('canvas');
    expect(focusAfterMenu(canvas)).toBe(canvas);
    const body = element('body');
    expect(focusAfterMenu(body)).toBe(body);
    expect(focusAfterMenu(element('canvas', { connected: false }))).toBeNull();
    expect(focusAfterMenu(null)).toBeNull();
  });
});

describe('Tab inside the menu', () => {
  const stops = ['resume', 'settings', 'leave'];

  it('wraps from the last stop to the first and back', () => {
    expect(wrapTab(stops, 'leave', false)).toBe('resume');
    expect(wrapTab(stops, 'resume', true)).toBe('leave');
  });

  it('lets the browser move between stops inside the menu', () => {
    expect(wrapTab(stops, 'resume', false)).toBeNull();
    expect(wrapTab(stops, 'settings', true)).toBeNull();
  });

  it('brings focus that is outside the menu back into it', () => {
    expect(wrapTab(stops, 'hud-button', false)).toBe('resume');
    expect(wrapTab(stops, null, true)).toBe('leave');
    expect(wrapTab([], 'hud-button', false)).toBeNull();
  });
});
