import type { DurationMode } from '@impulso/sim';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DevelopmentControls } from './DevelopmentControls';
import { Hud } from './Hud';
import { AugmentHud } from './AugmentHud';
import { MatchProgress } from '../profile/MatchProgress';
import { createMockGameplayAdapter } from './mock-adapter';
import { createServerGameplayAdapter } from './server-adapter';
import { campaignTransport } from '../../multiplayer/campaign-transport';
import { useMatchShortcuts } from './useMatchShortcuts';
import type { MultiplayerSession } from '../../multiplayer/session';
import { MatchAudio, playEvent, type Announcement } from './audio';
import { useI18n } from '../i18n';
import type { VisualPreferences } from '../settings/preferences';
import type { RivalDifficulty } from '../lobby/PreparationLobby';
import { DEFAULT_PLAYABLE_MAP, selectMap, type TrainingMapId } from '../map/sector-map';
import type { CameraView, GameplayPresentationAdapter } from './model';
import type { PhaserBattlefieldHandle } from './phaser/PhaserBattlefield';

const PhaserBattlefield = lazy(() => import('./phaser/PhaserBattlefield').then((module) => ({ default: module.PhaserBattlefield })));

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567';
/** `?adapter=mock` keeps the offline visual sandbox (used by the visual E2E tests). */
const wantsLocalMock = () => new URLSearchParams(window.location.search).get('adapter') === 'mock';
const emptySubscribe = () => () => {};
const emptyMultiplayer = () => null;

export function GameplayScreen({ preferences, difficulty = 'medium', map = DEFAULT_PLAYABLE_MAP, duration = 'skirmish', multiplayerSession, onLeave, onAudioChange }: { preferences: VisualPreferences; difficulty?: RivalDifficulty; map?: TrainingMapId; duration?: DurationMode; multiplayerSession?: MultiplayerSession; onLeave(): void; onAudioChange?(audio: VisualPreferences['audio']): void }) {
  const [match, setMatch] = useState(0);
  // The campaign plays on the map its room announces; the offline mock keeps Sector 01.
  const chosen = multiplayerSession ? multiplayerSession.getSnapshot().phase?.renderMap ?? 'espiral'
    : wantsLocalMock() ? 'sector-01' : map;
  selectMap(chosen);
  return <GameplayMatch key={match} preferences={preferences} difficulty={difficulty} map={chosen} duration={duration} multiplayerSession={multiplayerSession} onLeave={onLeave} onAudioChange={onAudioChange} onRestart={multiplayerSession ? onLeave : () => setMatch((count) => count + 1)} />;
}

/** The adapter lives exactly as long as the mounted match, so a server room is never left orphaned. */
function GameplayMatch({ preferences, difficulty, map, duration, multiplayerSession, onLeave, onRestart, onAudioChange }: { preferences: VisualPreferences; difficulty: RivalDifficulty; map: TrainingMapId; duration: DurationMode; multiplayerSession?: MultiplayerSession; onLeave(): void; onRestart(): void; onAudioChange?(audio: VisualPreferences['audio']): void }) {
  const [adapter, setAdapter] = useState<GameplayPresentationAdapter | null>(null);
  useEffect(() => {
    const created = multiplayerSession ? createServerGameplayAdapter(SERVER_URL, difficulty, map, 'skirmish', campaignTransport(multiplayerSession))
      : wantsLocalMock() ? createMockGameplayAdapter() : createServerGameplayAdapter(SERVER_URL, difficulty, map, duration);
    setAdapter(created);
    return () => created.destroy();
  }, []);
  if (!adapter) return <main className="vi-gameplay vi-screen" aria-busy="true" />;
  return <GameplayView adapter={adapter} preferences={preferences} multiplayerSession={multiplayerSession} onLeave={onLeave} onRestart={onRestart} onAudioChange={onAudioChange} />;
}

function GameplayView({ adapter, preferences, multiplayerSession, onLeave, onRestart, onAudioChange }: { adapter: GameplayPresentationAdapter; preferences: VisualPreferences; multiplayerSession?: MultiplayerSession; onLeave(): void; onRestart(): void; onAudioChange?(audio: VisualPreferences['audio']): void }) {
  const view = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const roomState = useSyncExternalStore(multiplayerSession?.subscribe ?? emptySubscribe, multiplayerSession?.getSnapshot ?? emptyMultiplayer);
  const { locale } = useI18n();
  const english = locale === 'en';
  const finalPhase = roomState?.phase?.phase === 'results' || roomState?.phase?.phase === 'closed';
  const resultReason = roomState?.phase?.result?.reason;
  const [announcement, setAnnouncement] = useState<(Announcement & { id: number }) | null>(null);
  // Sounds and spoken calls for server events; the banner fades after a few seconds.
  useEffect(() => {
    if (!adapter.subscribeEvents) return;
    const audio = new MatchAudio(locale);
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
  }, [adapter, locale]);
  const [developmentOpen, setDevelopmentOpen] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView | null>(null);
  const battlefieldRef = useRef<PhaserBattlefieldHandle>(null);
  const previewBaseRange=useCallback((enabled:boolean)=>battlefieldRef.current?.previewBaseRange(enabled),[]);
  const centered = useRef(false);
  // Open the match looking at your own fleet, not at the map origin.
  useEffect(() => {
    if (centered.current || view.connection === 'local') return;
    const own = view.squads.find((squad) => squad.owner === 'blue');
    if (!own || !battlefieldRef.current) return;
    centered.current = battlefieldRef.current.focusFleet(Math.round(own.gridX), Math.round(own.gridY));
  }, [view]);
  const bindings = preferences.keybindings;
  const { groups, selectGroup, toast } = useMatchShortcuts({ adapter, view, bindings, battlefield: battlefieldRef });
  const panKeys = useMemo(() => ({ up: bindings['camera-up'], down: bindings['camera-down'], left: bindings['camera-left'], right: bindings['camera-right'] }),
    [bindings]);
  return <main className="vi-gameplay vi-screen" data-room-id={roomState?.roomId} data-player-id={roomState?.phase?.playerId} data-connection={roomState?.connection} data-sequence={roomState?.acknowledgedSequence} data-tick={view.tick}>
    <Suspense fallback={<div className="vi-phaser" aria-busy="true" />}>
      <PhaserBattlefield ref={battlefieldRef} view={view}
        onSelectSquads={(squadIds) => adapter.dispatch({ type: 'select-squads', squadIds })}
        onMoveSelected={(x, y) => adapter.dispatch({ type: 'move-selected', x, y })}
        onAttackSelected={(targetId) => adapter.dispatch({ type: 'attack-selected', targetId })}
        onCameraChange={setCameraView} panKeys={panKeys} />
    </Suspense>
    <Hud view={view} adapter={adapter} keybindings={bindings} groups={groups} onSelectGroup={selectGroup} cameraView={cameraView} onBaseRange={previewBaseRange} onPanMap={(x, y) => battlefieldRef.current?.centerOnCell(x, y)} onResetCamera={() => battlefieldRef.current?.resetCamera()} onDevelopment={() => setDevelopmentOpen(true)} onLeave={onLeave} multiplayer={Boolean(multiplayerSession)} audio={preferences.audio} onAudioChange={onAudioChange} />
    {developmentOpen && <DevelopmentControls view={view} adapter={adapter} onClose={() => setDevelopmentOpen(false)} />}
    <AugmentHud view={view} adapter={adapter} sound={!preferences.audio.muted && preferences.audio.effects > 0 && preferences.audio.master > 0} />
    {toast && <div key={toast.id} className="vi-shortcut-toast" role="status">{toast.text}</div>}
    {announcement && !view.result && <div key={announcement.id} className={`vi-announcement vi-announcement--${announcement.tone}`} role="status">{announcement.text}</div>}
    {roomState?.phase?.phase === 'transition' && <div className="vi-result" role="dialog" aria-label={english ? 'Next sector' : 'Siguiente sector'}><div className="vi-result__card">
      <h2>{english ? 'Preparing sector' : 'Preparando sector'} {roomState.phase.sector + 1}</h2>
      <p>{english ? 'The next sector starts in' : 'El siguiente sector comienza en'} {Math.ceil((roomState.phase.remainingMs ?? 0) / 1000)} s.</p>
      <button onClick={onLeave}>{english ? 'Leave' : 'Salir'}</button>
    </div></div>}
    {finalPhase && !view.result && <div className="vi-result" role="dialog" aria-label={english ? 'Match ended' : 'Partida finalizada'}><div className="vi-result__card">
      <h2>{resultReason === 'annulled' ? (english ? 'Match cancelled' : 'Partida anulada') : (english ? 'Draw' : 'Empate')}</h2>
      <button className="vi-primary" onClick={onLeave}>{english ? 'Back to command center' : 'Volver al mando'}</button>
    </div></div>}
    {view.result && <div className="vi-result" role="dialog" aria-label={view.result === 'victory' ? 'Victoria' : 'Derrota'}>
      <div className={`vi-result__card vi-result__card--${view.result}`}>
        <div className="vi-result__crest" aria-hidden="true">{view.result === 'victory'?'✦':'⌁'}</div>
        <h2>{multiplayerSession ? (view.result === 'victory' ? (english ? 'Victory' : 'Victoria') : (english ? 'Defeat' : 'Derrota')) : view.result === 'victory' ? 'VICTORIA' : 'DERROTA'}</h2>
        <p>{multiplayerSession ? (resultReason === 'forfeit' ? (english ? 'A player left the match.' : 'Un jugador abandonó la partida.') : (english ? 'The campaign has ended.' : 'La campaña ha terminado.')) : view.result === 'victory' ? 'Victoria. Tu flota controla el sector.' : 'Derrota. Reagrupa la flota y vuelve a intentarlo.'}</p>
        {view.reward&&<MatchProgress reward={view.reward}/>}
        <div><button className="vi-primary" onClick={onRestart}>{multiplayerSession ? (english ? 'Back to command center' : 'Volver al mando') : 'Jugar de nuevo'}</button><button onClick={onLeave}>{english ? 'Leave' : 'Salir'}</button></div>
      </div>
    </div>}
  </main>;
}
