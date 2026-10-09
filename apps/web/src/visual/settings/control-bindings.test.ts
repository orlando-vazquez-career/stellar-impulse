import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTROL_BINDINGS,
  controlActionForEvent,
  findBindingConflict,
  formatKeyBinding,
  keyBindingFromEvent,
  normalizeKeyBinding,
  readControlBindings,
  shouldReleaseKeyBinding,
} from './control-bindings';

describe('rebindable control bindings', () => {
  it('normalizes arbitrary keys and modifier chords into stable keyboard codes', () => {
    expect(normalizeKeyBinding('Ctrl+1')).toBe('Ctrl+Digit1');
    expect(normalizeKeyBinding('Alt+ArrowDown')).toBe('Alt+ArrowDown');
    expect(formatKeyBinding('Ctrl+Digit5')).toBe('Ctrl+5');
  });

  it('captures and matches the exact modifier combination', () => {
    const modified = { key: 'z', code: 'KeyZ', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    const plain = { key: 'z', code: 'KeyZ', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    expect(keyBindingFromEvent(modified)).toBe('Ctrl+KeyZ');
    expect(controlActionForEvent(modified, { ...DEFAULT_CONTROL_BINDINGS, move: ['Ctrl+KeyZ'] })).toBe('move');
    expect(controlActionForEvent(plain, { ...DEFAULT_CONTROL_BINDINGS, move: ['Ctrl+KeyZ'] })).toBeNull();
    const modifierOnly = { key: 'Shift', code: 'ShiftLeft', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false } as KeyboardEvent;
    expect(keyBindingFromEvent(modifierOnly)).toBeNull();
  });

  it('releases a held chord when its main key or a released modifier goes up', () => {
    const shiftReleased = { code: 'ShiftLeft', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    const shiftStillHeld = { code: 'ShiftLeft', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false } as KeyboardEvent;
    const mainReleased = { code: 'KeyW', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false } as KeyboardEvent;
    expect(shouldReleaseKeyBinding('Shift+KeyW', shiftReleased)).toBe(true);
    expect(shouldReleaseKeyBinding('Shift+KeyW', shiftStillHeld)).toBe(false);
    expect(shouldReleaseKeyBinding('Shift+KeyW', mainReleased)).toBe(true);
    expect(shouldReleaseKeyBinding('KeyW', shiftReleased)).toBe(false);
  });

  it('detects duplicate bindings so each key can invoke one action only', () => {
    expect(findBindingConflict(DEFAULT_CONTROL_BINDINGS, 'KeyG', 'move')).toBe('attack');
    expect(findBindingConflict(DEFAULT_CONTROL_BINDINGS, 'Ctrl+KeyZ', 'move')).toBeNull();
  });

  it('migrates legacy keys while keeping default camera, production, and group controls', () => {
    const controls = readControlBindings({ move: 'M', cancel: 'Esc', camera: 'Space' });
    expect(controls.move).toEqual(['KeyM']);
    expect(controls.cancel).toEqual(['Escape']);
    expect(controls.cameraFocus).toEqual(['Space']);
    expect(controls.panUp).toEqual(['KeyW', 'ArrowUp']);
    expect(controls.produceInterceptor).toEqual(['KeyQ']);
    expect(controls.groupAssign1).toEqual(['Ctrl+Digit1']);
    expect(controls.groupRecall1).toEqual(['Digit1']);
  });
});
