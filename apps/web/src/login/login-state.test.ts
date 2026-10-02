import { describe, expect, it } from 'vitest';
import { initialLoginUi, reduceLoginUi } from './login-state';

describe('login ui state', () => {
  it('opens and closes the join form only when idle', () => {
    const opened = reduceLoginUi(initialLoginUi(), { type: 'toggle-join' });
    expect(opened.joinOpen).toBe(true);
    expect(reduceLoginUi(opened, { type: 'toggle-join' }).joinOpen).toBe(false);
    const busy = reduceLoginUi(initialLoginUi(), { type: 'start', action: 'create' });
    expect(reduceLoginUi(busy, { type: 'toggle-join' })).toEqual(busy);
  });

  it('locks buttons while an action is pending', () => {
    const busy = reduceLoginUi(initialLoginUi(), { type: 'start', action: 'join' });
    expect(busy.pending).toBe('join');
    expect(reduceLoginUi(busy, { type: 'start', action: 'wallet' })).toEqual(busy);
  });

  it('settles back to idle keeping the join form as it was', () => {
    const opened = reduceLoginUi(initialLoginUi(), { type: 'toggle-join' });
    const busy = reduceLoginUi(opened, { type: 'start', action: 'join' });
    const settled = reduceLoginUi(busy, { type: 'settle' });
    expect(settled).toEqual({ joinOpen: true, pending: null });
  });
});
