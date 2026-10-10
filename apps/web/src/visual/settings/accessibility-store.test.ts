import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
