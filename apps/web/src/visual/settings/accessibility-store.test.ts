import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitSavedAccessibility,
  getEffectiveAccessibility,
  isReducedMotion,
  publishSavedAccessibility,
  setAccessibilityPreview,
  subscribeAccessibility,
} from './accessibility-store';
import { defaultVisualPreferences } from './preferences';

const saved = { ...defaultVisualPreferences.accessibility, highContrast: true };
const preview = { ...defaultVisualPreferences.accessibility, largeText: true, reducedMotion: true };

describe('accessibility store', () => {
  afterEach(() => {
    setAccessibilityPreview(null);
    publishSavedAccessibility(defaultVisualPreferences.accessibility);
  });

  it('shows what is saved', () => {
    publishSavedAccessibility(saved);
    expect(getEffectiveAccessibility()).toEqual(saved);
    expect(isReducedMotion()).toBe(false);
  });

  it('lets a preview win over what is saved', () => {
    publishSavedAccessibility(saved);
    setAccessibilityPreview(preview);
    expect(getEffectiveAccessibility()).toEqual(preview);
    expect(isReducedMotion()).toBe(true);
  });

  it('goes back to what is saved when the preview is cleared', () => {
    publishSavedAccessibility(saved);
    setAccessibilityPreview(preview);
    setAccessibilityPreview(null);
    expect(getEffectiveAccessibility()).toEqual(saved);
  });

  it('keeps the same snapshot while nothing changes', () => {
    publishSavedAccessibility(saved);
    const first = getEffectiveAccessibility();
    publishSavedAccessibility({ ...saved });
    expect(getEffectiveAccessibility()).toBe(first);
  });

  it('makes a saved preview the accessibility in effect at once, without passing through the old one', () => {
    publishSavedAccessibility(saved);
    setAccessibilityPreview(preview);
    const seen: Array<ReturnType<typeof getEffectiveAccessibility>> = [];
    const stop = subscribeAccessibility(() => seen.push(getEffectiveAccessibility()));
    // What the settings panel does on save, before the host re-renders with the new preferences.
    commitSavedAccessibility(preview);
    stop();
    expect(getEffectiveAccessibility()).toEqual(preview);
    expect(seen).not.toContainEqual(saved);
    // A later publish of the same saved value by the host changes nothing.
    publishSavedAccessibility({ ...preview });
    expect(getEffectiveAccessibility()).toEqual(preview);
  });

  it('holds motion still for a system that asks for it, even over an older saved "off"', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }) });
    const stored = JSON.stringify({ accessibility: { reducedMotion: false } });
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem() {} });
    try {
      const fresh = await import('./accessibility-store');
      expect(fresh.isReducedMotion()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('notifies subscribers of every change until they unsubscribe', () => {
    const listener = vi.fn();
    const stop = subscribeAccessibility(listener);
    publishSavedAccessibility(saved);
    setAccessibilityPreview(preview);
    setAccessibilityPreview(null);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    setAccessibilityPreview(preview);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
