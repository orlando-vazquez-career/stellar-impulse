import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DevelopmentControls } from './DevelopmentControls';
import { Hud } from './Hud';
import { createMockGameplayAdapter } from './mock-adapter';
import type { VisualPreferences } from '../settings/preferences';
import type { CameraView } from './model';
import type { PhaserBattlefieldHandle } from './phaser/PhaserBattlefield';

const PhaserBattlefield = lazy(() => import('./phaser/PhaserBattlefield').then((module) => ({ default: module.PhaserBattlefield })));

export function GameplayScreen({ preferences, onLeave }: { preferences: VisualPreferences; onLeave(): void }) {
  const adapter = useMemo(() => createMockGameplayAdapter(), []);
  const view = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const [developmentOpen, setDevelopmentOpen] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView | null>(null);
  const battlefieldRef = useRef<PhaserBattlefieldHandle>(null);
  useEffect(() => () => adapter.destroy(), [adapter]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
      const key = event.key === ' ' ? 'Space' : event.key === 'Escape' ? 'Esc' : event.key;
      if (key.toLowerCase() === preferences.controls.cancel.toLowerCase()) adapter.dispatch({ type: 'set-action', action: null });
      else if (key.toLowerCase() === preferences.controls.move.toLowerCase() && !event.repeat) adapter.dispatch({ type: 'set-action', action: 'move' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adapter, preferences.controls]);
  return <main className="vi-gameplay vi-screen">
    <Suspense fallback={<div className="vi-phaser" aria-busy="true" />}>
      <PhaserBattlefield ref={battlefieldRef} onCameraChange={setCameraView} />
    </Suspense>
    <Hud view={view} adapter={adapter} controls={preferences.controls} cameraView={cameraView} onPanMap={(x, y) => battlefieldRef.current?.centerOnCell(x, y)} onResetCamera={() => battlefieldRef.current?.resetCamera()} onDevelopment={() => setDevelopmentOpen(true)} onLeave={onLeave} />
    {developmentOpen && <DevelopmentControls view={view} adapter={adapter} onClose={() => setDevelopmentOpen(false)} />}
  </main>;
}
