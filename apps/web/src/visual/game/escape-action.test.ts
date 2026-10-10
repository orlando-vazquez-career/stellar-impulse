import { describe, expect, it } from 'vitest';
import { escapeAction, isEscapeKey } from './escape-action';

describe('isEscapeKey', () => {
  it('recognizes Escape by physical code or by key value', () => {
    expect(isEscapeKey({ code: 'Escape', key: 'Escape' })).toBe(true);
    expect(isEscapeKey({ code: 'Escape', key: 'Unidentified' })).toBe(true);
    expect(isEscapeKey({ code: '', key: 'Escape' })).toBe(true);
    expect(isEscapeKey({ key: 'Esc' })).toBe(true);
  });

  it('ignores every other key, whatever the bindings say', () => {
    expect(isEscapeKey({ code: 'KeyQ', key: 'q' })).toBe(false);
    expect(isEscapeKey({ code: 'Backspace', key: 'Backspace' })).toBe(false);
    expect(isEscapeKey({})).toBe(false);
  });
});

describe('escapeAction', () => {
  it('closes the menu first', () => {
    expect(escapeAction({ menuOpen: true, panelOpen: true, activeAction: 'attack' })).toBe('close-menu');
  });

  it('then closes an open panel', () => {
    expect(escapeAction({ menuOpen: false, panelOpen: true, activeAction: 'move' })).toBe('close-panel');
  });

  it('then cancels the armed action', () => {
    expect(escapeAction({ menuOpen: false, panelOpen: false, activeAction: 'capture' })).toBe('cancel');
  });

  it('opens the menu when there is nothing to back out of', () => {
    expect(escapeAction({ menuOpen: false, panelOpen: false, activeAction: null })).toBe('open-menu');
  });
});
