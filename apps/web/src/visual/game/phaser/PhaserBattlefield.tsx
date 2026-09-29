import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useI18n } from '../../i18n';
import type { CameraView } from '../model';
import { MainScene } from './MainScene';

export interface PhaserBattlefieldHandle {
  resetCamera(): void;
  centerOnCell(x: number, y: number): void;
}

export const PhaserBattlefield = forwardRef<PhaserBattlefieldHandle, { onCameraChange(view: CameraView): void }>(function PhaserBattlefield({ onCameraChange }, forwardedRef) {
  const { t } = useI18n();
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<MainScene | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cameraCallbackRef = useRef(onCameraChange);
  cameraCallbackRef.current = onCameraChange;

  useImperativeHandle(forwardedRef, () => ({
    resetCamera: () => sceneRef.current?.resetCamera(),
    centerOnCell: (x, y) => sceneRef.current?.centerOnCell(x, y),
  }), []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || gameRef.current) return;
    let disposed = false;
    const scene = new MainScene(
      (cameraView) => { if (!disposed) cameraCallbackRef.current(cameraView); },
      () => {
        if (disposed) return;
        setLoadError(null);
        host.parentElement?.setAttribute('data-ready', 'true');
      },
      (message) => { if (!disposed) setLoadError(message); },
    );
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
      sceneRef.current = null;
      gameRef.current = null;
      game.destroy(true);
      // Phaser completes destruction on its next frame. Detach this canvas now
      // so React StrictMode cannot briefly display two canvases on remount.
      game.canvas?.remove();
    };
  }, []);

  return <div className="vi-phaser" aria-label={t('battlefieldReady')}>
    <div className="vi-phaser__canvas" ref={canvasHostRef} />
    <div className="vi-phaser__status"><strong>{t('battlefieldStatus')}</strong><span>{t('cameraHint')}</span></div>
    {loadError && <div className="vi-phaser__error" role="alert">{loadError}</div>}
  </div>;
});
