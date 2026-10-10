import { loadVisualPreferences, type VisualPreferences } from './preferences';

export type Accessibility = VisualPreferences['accessibility'];

/**
 * The accessibility in effect right now: what is saved, unless the settings panel is previewing a
 * change. React reads it with useSyncExternalStore; canvas scenes and Phaser read it directly.
 */
let saved: Accessibility | null = null;
let preview: Accessibility | null = null;
const listeners = new Set<() => void>();

function savedAccessibility(): Accessibility {
  saved ??= loadVisualPreferences().accessibility;
  return saved;
}

function same(a: Accessibility, b: Accessibility): boolean {
  return a.highContrast === b.highContrast && a.reducedMotion === b.reducedMotion
    && a.largeText === b.largeText && a.colorProfile === b.colorProfile;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Records what is saved; the app calls it whenever the saved preferences change. */
export function publishSavedAccessibility(accessibility: Accessibility): void {
  if (saved && same(saved, accessibility)) return;
  saved = { ...accessibility };
  if (!preview) notify();
}

/** Shows unsaved accessibility at once; null drops the preview and goes back to what is saved. */
export function setAccessibilityPreview(accessibility: Accessibility | null): void {
  if (accessibility === null && preview === null) return;
  preview = accessibility ? { ...accessibility } : null;
  notify();
}

/**
 * What the settings panel calls on save: what it just saved becomes the accessibility in effect and
 * the preview goes, in one step, so nothing shows the previous saved value while the host catches up.
 */
export function commitSavedAccessibility(accessibility: Accessibility): void {
  const changed = preview !== null || !saved || !same(saved, accessibility);
  if (!saved || !same(saved, accessibility)) saved = { ...accessibility };
  preview = null;
  if (changed) notify();
}

export function getEffectiveAccessibility(): Accessibility {
  return preview ?? savedAccessibility();
}

export function subscribeAccessibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether animated backdrops and camera shake should hold still. */
export function isReducedMotion(): boolean {
  return getEffectiveAccessibility().reducedMotion;
}
