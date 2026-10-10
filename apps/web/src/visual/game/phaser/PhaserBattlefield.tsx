import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useI18n } from '../../i18n';
import type { CameraView, GameplayViewModel } from '../model';
import type { CameraPanDirection } from '../../settings/control-bindings';
import { MainScene } from './MainScene';
import { activeMapId, activeMapSourceFile } from '../../map/sector-map';
import { mapName } from '../../map/map-name';

export interface PhaserBattlefieldHandle {
  resetCamera(): void;
  previewBaseRange(enabled:boolean):void;
  /** False while the Phaser scene is still loading. */
  centerOnCell(x: number, y: number): boolean;
  /** Opening view on the player's fleet (kept whole when the sector fits). False while loading. */
  focusFleet(x: number, y: number): boolean;
  setCameraPan(direction: CameraPanDirection, active: boolean): void;
}

interface PhaserBattlefieldProps {
  view: GameplayViewModel;
  onSelectSquads(ids: string[]): void;
  onMoveSelected(x: number, y: number): void;
  onAttackSelected(targetId: string): void;
  onCameraChange(view: CameraView): void;
}

export const PhaserBattlefield = forwardRef<PhaserBattlefieldHandle, PhaserBattlefieldProps>(function PhaserBattlefield({ view, onSelectSquads, onMoveSelected, onAttackSelected, onCameraChange }, forwardedRef) {
  const { t, locale } = useI18n();
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<MainScene | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cameraCallbackRef = useRef(onCameraChange);
  cameraCallbackRef.current = onCameraChange;
  const selectCallbackRef = useRef(onSelectSquads);
  selectCallbackRef.current = onSelectSquads;
  const moveCallbackRef = useRef(onMoveSelected);
  moveCallbackRef.current = onMoveSelected;
  const attackCallbackRef = useRef(onAttackSelected);
  attackCallbackRef.current = onAttackSelected;
  const snapshotRef = useRef(view);
  snapshotRef.current = view;

  useEffect(() => { sceneRef.current?.sync(view); }, [view]);
  // The scene draws guardian labels, the Core tag and the belt and fog countdowns in the player's language.
  useEffect(() => { sceneRef.current?.setLocale(locale); }, [locale]);

  useImperativeHandle(forwardedRef, () => ({
    resetCamera: () => sceneRef.current?.resetCamera(),
    previewBaseRange:enabled=>sceneRef.current?.previewBaseRange(enabled),
    centerOnCell: (x, y) => sceneRef.current?.centerOnCell(x, y) ?? false,
    focusFleet: (x, y) => sceneRef.current?.focusFleet(x, y) ?? false,
    setCameraPan: (direction, active) => sceneRef.current?.setCameraPan(direction, active),
  }), []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || gameRef.current) return;
    let disposed = false;
    const scene = new MainScene(
      snapshotRef.current,
      (ids) => { if (!disposed) selectCallbackRef.current(ids); },
      (x, y) => { if (!disposed) moveCallbackRef.current(x, y); },
      (targetId) => { if (!disposed) attackCallbackRef.current(targetId); },
      (cameraView) => { if (!disposed) cameraCallbackRef.current(cameraView); },
      () => {
        if (disposed) return;
        setLoadError(null);
        host.parentElement?.setAttribute('data-ready', 'true');
        host.parentElement?.setAttribute('data-atlas-ready', 'true');
      },
      (message) => { if (!disposed) setLoadError(message); },
    );
    scene.setLocale(localeRef.current);
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      backgroundColor: '#080e18',
      transparent: false,
      render: { antialias: true, pixelArt: false, roundPixels: false },
      scale: { mode: Phaser.Scale.RESIZE, width: host.clientWidth, height: host.clientHeight },
      scene: [scene],
    });
    gameRef.current = game;
    return () => {
      disposed = true;
      host.parentElement?.removeAttribute('data-ready');
      host.parentElement?.removeAttribute('data-atlas-ready');
      sceneRef.current = null;
      gameRef.current = null;
      game.destroy(true);
      // Phaser completes destruction on its next frame. Detach this canvas now
      // so React StrictMode cannot briefly display two canvases on remount.
      game.canvas?.remove();
    };
  }, []);

  return <div className="vi-phaser" data-map-source={activeMapSourceFile()} aria-label={t('battlefieldReady')}>
    <div className="vi-phaser__canvas" ref={canvasHostRef} />
    <div className="vi-phaser__status"><strong>{mapName(activeMapId, locale).toUpperCase()}</strong><span>{t('cameraHint')}</span><span>{t('controlGroupsHint')}</span></div>
    {loadError && <div className="vi-phaser__error" role="alert">{loadError}</div>}
  </div>;
});
