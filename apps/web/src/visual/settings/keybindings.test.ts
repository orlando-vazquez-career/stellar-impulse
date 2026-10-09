import { describe, expect, it } from 'vitest';
import {
  actionForCombo, assignBinding, comboFromEvent, DEFAULT_KEYBINDINGS, formatCombo, freshKeybindings, readKeybindings,
} from './keybindings';

const press = (code: string, modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers });

describe('keybindings', () => {
  it('ships the agreed defaults', () => {
    expect(DEFAULT_KEYBINDINGS).toMatchObject({
      hold: 'KeyZ', stop: 'Escape', 'camera-selection': 'Space', 'camera-base': 'Home',
      'produce-interceptor': 'KeyX', 'produce-frigate': 'KeyC', 'produce-bomber': 'KeyV', 'produce-explorer': 'KeyB',
      'group-select-1': 'Digit1', 'group-set-1': 'Ctrl+Digit1', 'group-add-1': 'Shift+Digit1',
      'camera-save-1': 'Ctrl+F5', 'camera-go-4': 'F8',
    });
  });

  it('gives every action its own key by default', () => {
    const used = Object.values(DEFAULT_KEYBINDINGS);
    expect(new Set(used).size).toBe(used.length);
  });

  it('reads a key press by physical key, so Shift+1 stays Digit1 on any layout', () => {
    expect(comboFromEvent(press('Digit1', { shiftKey: true }))).toBe('Shift+Digit1');
    expect(comboFromEvent(press('Digit3', { ctrlKey: true }))).toBe('Ctrl+Digit3');
    expect(comboFromEvent(press('KeyZ', { ctrlKey: true, altKey: true, shiftKey: true }))).toBe('Ctrl+Alt+Shift+KeyZ');
  });

  it('waits for a real key: lone modifiers, the Windows key, F11 and F12 are never bound', () => {
    expect(comboFromEvent(press('ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(comboFromEvent(press('ShiftRight', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(press('KeyA', { metaKey: true }))).toBeNull();
    expect(comboFromEvent(press('F11'))).toBeNull();
    expect(comboFromEvent(press('F12'))).toBeNull();
  });

  it('finds the action of a key press, but never a camera pan key', () => {
    const bindings = freshKeybindings();
    expect(actionForCombo(bindings, 'Ctrl+Digit2')).toBe('group-set-2');
    expect(actionForCombo(bindings, 'Digit2')).toBe('group-select-2');
    expect(actionForCombo(bindings, 'KeyZ')).toBe('hold');
    expect(actionForCombo(bindings, 'KeyW')).toBeNull();
    expect(actionForCombo(bindings, 'KeyQ')).toBeNull();
  });

  it('trades keys when the new one is already taken', () => {
    const { bindings, swapped } = assignBinding(freshKeybindings(), 'hold', 'KeyX');
    expect(swapped).toBe('produce-interceptor');
    expect(bindings.hold).toBe('KeyX');
    expect(bindings['produce-interceptor']).toBe('KeyZ');
    expect(new Set(Object.values(bindings)).size).toBe(Object.values(bindings).length);
  });

  it('keeps camera panning on a bare key', () => {
    const { bindings, swapped } = assignBinding(freshKeybindings(), 'camera-up', 'Shift+KeyI');
    expect(bindings['camera-up']).toBe('KeyI');
    expect(swapped).toBeNull();
    // Moving W onto an action hands that action's key to the pan, without modifiers.
    const traded = assignBinding(freshKeybindings(), 'select-all', 'KeyW');
    expect(traded.swapped).toBe('camera-up');
    expect(traded.bindings['camera-up']).toBe('KeyA');
  });

  it('restores defaults for unknown actions and malformed saved keys', () => {
    const bindings = readKeybindings({ hold: 'KeyH', stop: 'not a key!', ghost: 'KeyG', 'camera-left': 'Ctrl+KeyJ', disband: '' });
    expect(bindings.hold).toBe('KeyH');
    expect(bindings.stop).toBe('Escape');
    expect(bindings).not.toHaveProperty('ghost');
    expect(bindings['camera-left']).toBe('KeyJ');
    expect(bindings.disband).toBe('');
    expect(readKeybindings(null)).toEqual(DEFAULT_KEYBINDINGS);
  });

  it('prints keys the way the keyboard shows them', () => {
    expect(formatCombo('Ctrl+Digit1', 'es')).toBe('Ctrl+1');
    expect(formatCombo('Space', 'es')).toBe('Espacio');
    expect(formatCombo('Space', 'en')).toBe('Space');
    expect(formatCombo('Home', 'es')).toBe('Inicio');
    expect(formatCombo('Escape', 'en')).toBe('Esc');
    expect(formatCombo('Shift+Numpad4', 'en')).toBe('Shift+Num 4');
    expect(formatCombo('', 'es')).toBe('—');
  });
});
