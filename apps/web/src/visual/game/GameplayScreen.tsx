import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DevelopmentControls } from './DevelopmentControls';
import { Hud } from './Hud';
import { createMockGameplayAdapter } from './mock-adapter';
import { createServerGameplayAdapter } from './server-adapter';
import { MatchAudio, playEvent, type Announcement } from './audio';
import { useI18n } from '../i18n';
import type { VisualPreferences } from '../settings/preferences';
import type { RivalDifficulty } from '../lobby/PreparationLobby';
import type { CameraView, GameplayPresentationAdapter } from './model';
import type { PhaserBattlefieldHandle } from './phaser/PhaserBattlefield';

const PhaserBattlefield = lazy(() => import('./phaser/PhaserBattlefield').then((module) => ({ default: module.PhaserBattlefield })));

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567';
/** `?adapter=mock` keeps the offline visual sandbox (used by the visual E2E tests). */
const wantsLocalMock = () => new URLSearchParams(window.location.search).get('adapter') === 'mock';
const PRODUCTION_KEYS: Record<string, 'explorer' | 'interceptor' | 'frigate' | 'bomber'> = { '1': 'interceptor', '2': 'frigate', '3': 'bomber', '4': 'explorer' };

export function GameplayScreen({ preferences, difficulty = 'medium', onLeave }: { preferences: VisualPreferences; difficulty?: RivalDifficulty; onLeave(): void }) {
  const [match, setMatch] = useState(0);
  return <GameplayMatch key={match} preferences={preferences} difficulty={difficulty} onLeave={onLeave} onRestart={() => setMatch((count) => count + 1)} />;
}

/** The adapter lives exactly as long as the mounted match, so a server room is never left orphaned. */
function GameplayMatch({ preferences, difficulty, onLeave, onRestart }: { preferences: VisualPreferences; difficulty: RivalDifficulty; onLeave(): void; onRestart(): void }) {
  const [adapter, setAdapter] = useState<GameplayPresentationAdapter | null>(null);
  useEffect(() => {
    const created = wantsLocalMock() ? createMockGameplayAdapter() : createServerGameplayAdapter(SERVER_URL, difficulty);
    setAdapter(created);
    return () => created.destroy();
  }, []);
  if (!adapter) return <main className="vi-gameplay vi-screen" aria-busy="true" />;
  return <GameplayView adapter={adapter} preferences={preferences} onLeave={onLeave} onRestart={onRestart} />;
}

function GameplayView({ adapter, preferences, onLeave, onRestart }: { adapter: GameplayPresentationAdapter; preferences: VisualPreferences; onLeave(): void; onRestart(): void }) {
  const view = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const { locale } = useI18n();
  const [announcement, setAnnouncement] = useState<(Announcement & { id: number }) | null>(null);
  // Sounds and spoken calls for server events; the banner fades after a few seconds.
  useEffect(() => {
    if (!adapter.subscribeEvents) return;
    const audio = new MatchAudio(preferences.audio, locale);
    let counter = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = adapter.subscribeEvents((event) => {
      const banner = playEvent(audio, event, locale);
      if (!banner) return;
      counter += 1;
      setAnnouncement({ ...banner, id: counter });
      clearTimeout(timer);
      timer = setTimeout(() => setAnnouncement(null), 3200);
    });
    return () => { unsubscribe(); clearTimeout(timer); audio.dispose(); };
  }, [adapter, preferences.audio, locale]);
  const [developmentOpen, setDevelopmentOpen] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView | null>(null);
  const battlefieldRef = useRef<PhaserBattlefieldHandle>(null);
  const centered = useRef(false);
  // Open the match looking at your own fleet, not at the map origin.
  useEffect(() => {
    if (centered.current || view.connection === 'local') return;
    const own = view.squads.find((squad) => squad.owner === 'blue');
    if (!own || !battlefieldRef.current) return;
    centered.current = battlefieldRef.current.centerOnCell(Math.round(own.gridX), Math.round(own.gridY));
  }, [view]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
      const key = event.key === ' ' ? 'Space' : event.key === 'Escape' ? 'Esc' : event.key;
      if (/^[wasd]$/i.test(key)) return; // Camera navigation is never an action shortcut.
      if (PRODUCTION_KEYS[key] && !event.repeat) { adapter.dispatch({ type: 'produce', kind: PRODUCTION_KEYS[key] }); return; }
      if (key.toLowerCase() === preferences.controls.cancel.toLowerCase()) adapter.dispatch({ type: 'set-action', action: null });
      else if (key.toLowerCase() === preferences.controls.move.toLowerCase() && !event.repeat) adapter.dispatch({ type: 'set-action', action: 'move' });
      else if (key.toLowerCase() === preferences.controls.attack.toLowerCase() && !event.repeat) adapter.dispatch({ type: 'set-action', action: 'attack' });
      else if (key.toLowerCase() === preferences.controls.hold.toLowerCase() && !event.repeat) adapter.dispatch({ type: 'set-action', action: 'hold' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adapter, preferences.controls]);
  return <main className="vi-gameplay vi-screen">
    <Suspense fallback={<div className="vi-phaser" aria-busy="true" />}>
      <PhaserBattlefield ref={battlefieldRef} view={view}
        onSelectSquads={(squadIds) => adapter.dispatch({ type: 'select-squads', squadIds })}
        onMoveSelected={(x, y) => adapter.dispatch({ type: 'move-selected', x, y })}
        onAttackSelected={(targetId) => adapter.dispatch({ type: 'attack-selected', targetId })}
        onCameraChange={setCameraView} />
    </Suspense>
    <Hud view={view} adapter={adapter} controls={preferences.controls} cameraView={cameraView} onPanMap={(x, y) => battlefieldRef.current?.centerOnCell(x, y)} onResetCamera={() => battlefieldRef.current?.resetCamera()} onDevelopment={() => setDevelopmentOpen(true)} onLeave={onLeave} />
    {developmentOpen && <DevelopmentControls view={view} adapter={adapter} onClose={() => setDevelopmentOpen(false)} />}
    {announcement && !view.result && <div key={announcement.id} className={`vi-announcement vi-announcement--${announcement.tone}`} role="status">{announcement.text}</div>}
    {view.result && <div className="vi-result" role="dialog" aria-label={view.result === 'victory' ? 'Victoria' : 'Derrota'}>
      <div className={`vi-result__card vi-result__card--${view.result}`}>
        <h2>{view.result === 'victory' ? 'Núcleo asegurado' : 'El rival tomó el Núcleo'}</h2>
        <p>{view.result === 'victory' ? 'Victoria. Tu flota controla el sector.' : 'Derrota. Reagrupa la flota y vuelve a intentarlo.'}</p>
        <div><button className="vi-primary" onClick={onRestart}>Jugar de nuevo</button><button onClick={onLeave}>Salir</button></div>
      </div>
    </div>}
  </main>;
}
