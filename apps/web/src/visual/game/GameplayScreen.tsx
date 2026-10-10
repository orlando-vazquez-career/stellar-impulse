import type { DurationMode } from '@impulso/sim';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DevelopmentControls } from './DevelopmentControls';
import { Hud } from './Hud';
import { AugmentHud } from './AugmentHud';
import { FirstMatchTutorial } from './FirstMatchTutorial';
import { MatchProgress } from '../profile/MatchProgress';
import { createMockGameplayAdapter } from './mock-adapter';
import { createServerGameplayAdapter } from './server-adapter';
import { campaignTransport } from '../../multiplayer/campaign-transport';
import { nextFormation } from './formation';
import { assignControlGroup, controlGroupForAction, focusSelectedSquads, productionKindForControl, recallControlGroup, type ControlGroupAssignments } from './control-shortcuts';
import type { MultiplayerSession } from '../../multiplayer/session';
import { MatchAudio, playEvent, type Announcement } from './audio';
import { useI18n } from '../i18n';
import type { VisualPreferences } from '../settings/preferences';
import type { RivalDifficulty } from '../lobby/PreparationLobby';
import { activeMapSourceFile, DEFAULT_PLAYABLE_MAP, selectMap, type TrainingMapId } from '../map/sector-map';
import type { CameraView, GameplayPresentationAdapter } from './model';
import type { PhaserBattlefieldHandle } from './phaser/PhaserBattlefield';
import { controlActionForEvent, keyBindingFromEvent, panDirectionForControl, shouldReleaseKeyBinding, type CameraPanDirection, type ControlAction } from '../settings/control-bindings';
import { RunOutcome, type RunLink } from '../run/RunOutcome';
import { RUN_SECTORS } from '../run/run-state';
import { GameMenu, type GameMenuHandle } from './GameMenu';
import { closeGameMenu, MENU_CLOSED, openGameMenu, type MenuState } from './game-menu-state';
import { escapeAction, isEscapeKey } from './escape-action';
import { gameText, type GameTextKey } from './game-copy';
import { mapName } from '../map/map-name';

const PhaserBattlefield = lazy(() => import('./phaser/PhaserBattlefield').then((module) => ({ default: module.PhaserBattlefield })));

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567';
/** `?adapter=mock` keeps the offline visual sandbox (used by the visual E2E tests). */
const wantsLocalMock = () => new URLSearchParams(window.location.search).get('adapter') === 'mock';
/** The development panel exists only in the offline sandbox and in development builds. */
const developmentAvailable = () => wantsLocalMock() || import.meta.env.DEV;
const emptySubscribe = () => () => {};
const emptyMultiplayer = () => null;

export function GameplayScreen({ preferences, difficulty = 'medium', map = DEFAULT_PLAYABLE_MAP, duration = 'skirmish', multiplayerSession, run, onLeave, onAudioChange }: { preferences: VisualPreferences; difficulty?: RivalDifficulty; map?: TrainingMapId; duration?: DurationMode; multiplayerSession?: MultiplayerSession; run?: RunLink; onLeave(): void; onAudioChange?(audio: VisualPreferences['audio']): void }) {
  const [match, setMatch] = useState(0);
  // The campaign plays on the map its room announces; the offline mock keeps Sector 01.
  const chosen = multiplayerSession ? multiplayerSession.getSnapshot().phase?.renderMap ?? 'espiral'
    : wantsLocalMock() ? 'sector-01' : map;
  selectMap(chosen);
  return <GameplayMatch key={match} preferences={preferences} difficulty={difficulty} map={chosen} duration={duration} multiplayerSession={multiplayerSession} run={multiplayerSession ? undefined : run} onLeave={onLeave} onAudioChange={onAudioChange} onRestart={multiplayerSession ? onLeave : () => setMatch((count) => count + 1)} />;
}

/** The adapter lives exactly as long as the mounted match, so a server room is never left orphaned. */
function GameplayMatch({ preferences, difficulty, map, duration, multiplayerSession, run, onLeave, onRestart, onAudioChange }: { preferences: VisualPreferences; difficulty: RivalDifficulty; map: TrainingMapId; duration: DurationMode; multiplayerSession?: MultiplayerSession; run?: RunLink; onLeave(): void; onRestart(): void; onAudioChange?(audio: VisualPreferences['audio']): void }) {
  const [adapter, setAdapter] = useState<GameplayPresentationAdapter | null>(null);
  useEffect(() => {
    const created = multiplayerSession ? createServerGameplayAdapter(SERVER_URL, difficulty, map, 'skirmish', campaignTransport(multiplayerSession))
      : wantsLocalMock() ? createMockGameplayAdapter() : createServerGameplayAdapter(SERVER_URL, difficulty, map, duration, undefined, run?.state.augments.map((augment) => augment.id));
    setAdapter(created);
    return () => created.destroy();
  }, []);
  if (!adapter) return <main className="vi-gameplay vi-screen" aria-busy="true" />;
  return <GameplayView adapter={adapter} preferences={preferences} multiplayerSession={multiplayerSession} run={run} onLeave={onLeave} onRestart={onRestart} onAudioChange={onAudioChange} />;
}

function GameplayView({ adapter, preferences, multiplayerSession, run, onLeave, onRestart, onAudioChange }: { adapter: GameplayPresentationAdapter; preferences: VisualPreferences; multiplayerSession?: MultiplayerSession; run?: RunLink; onLeave(): void; onRestart(): void; onAudioChange?(audio: VisualPreferences['audio']): void }) {
  const view = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const viewRef = useRef(view);
  viewRef.current = view;
  const controlGroupsRef = useRef<ControlGroupAssignments>({});
  const pressedPanBindings = useRef(new Set<string>());
  const roomState = useSyncExternalStore(multiplayerSession?.subscribe ?? emptySubscribe, multiplayerSession?.getSnapshot ?? emptyMultiplayer);
  const { locale } = useI18n();
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
  // The in-match menu pauses the match where it can; the sound panel never does.
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const menuRef = useRef<GameMenuHandle>(null);
  // Whether the menu is open and whether opening it paused the match, so closing it restarts only its own pause.
  const menuState = useRef<MenuState>(MENU_CLOSED);
  const escapeState = useRef({ menuOpen, soundOpen });
  escapeState.current = { menuOpen, soundOpen };
  const openMenu = useCallback(() => {
    // Never over a finished match: the result dialog already offers every way out.
    const next = openGameMenu(menuState.current, viewRef.current);
    menuState.current = next.state;
    if (!next.state.open) return;
    setSoundOpen(false);
    setMenuOpen(true);
    if (next.intent) adapter.dispatch(next.intent);
  }, [adapter]);
  const closeMenu = useCallback(() => {
    const next = closeGameMenu(menuState.current);
    menuState.current = next.state;
    setMenuOpen(false);
    if (next.intent) adapter.dispatch(next.intent);
  }, [adapter]);
  // A match that ends with the menu open hands the keyboard back to the result dialog.
  useEffect(() => {
    if (!view.result) return;
    menuState.current = MENU_CLOSED;
    setMenuOpen(false);
  }, [view.result]);
  const selectOwnBase = useCallback(() => {
    adapter.dispatch({ type: 'select-base', base: 'own' });
    const base = viewRef.current.base?.position;
    if (base) battlefieldRef.current?.centerOnCell(base.x, base.y);
  }, [adapter]);
  const centered = useRef(false);
  // Open the match looking at your own fleet, not at the map origin.
  useEffect(() => {
    if (centered.current || view.connection === 'local') return;
    const own = view.squads.find((squad) => squad.owner === 'blue');
    if (!own || !battlefieldRef.current) return;
    centered.current = battlefieldRef.current.focusFleet(Math.round(own.gridX), Math.round(own.gridY));
  }, [view]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape is fixed, not a binding, and backs out of the innermost thing open: the menu, the sound panel, the
      // pending order, and otherwise opens the menu. It wins over a 'cancel' binding on the same key.
      if (isEscapeKey(event)) {
        event.preventDefault();
        if (event.repeat) return;
        const action = escapeAction({ menuOpen: escapeState.current.menuOpen, panelOpen: escapeState.current.soundOpen, activeAction: viewRef.current.activeAction });
        if (action === 'close-menu') {
          if (menuRef.current) menuRef.current.requestClose(); else closeMenu();
        } else if (action === 'close-panel') setSoundOpen(false);
        else if (action === 'cancel') adapter.dispatch({ type: 'set-action', action: null });
        else openMenu();
        return;
      }
      // With the menu open the match takes no other shortcut.
      if (escapeState.current.menuOpen) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
      if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button, a')) return;
      const action = controlActionForEvent(event, preferences.controls);
      if (!action) return;
      event.preventDefault();
      const panDirection = panDirectionForControl(action);
      if (panDirection) {
        const binding = keyBindingFromEvent(event);
        if (binding) {
          pressedPanBindings.current.add(binding);
          battlefieldRef.current?.setCameraPan(panDirection, true);
        }
        return;
      }
      if (event.repeat) return;
      const current = viewRef.current;
      const groupShortcut = controlGroupForAction(action);
      if (groupShortcut) {
        if (groupShortcut.mode === 'assign') {
          controlGroupsRef.current = assignControlGroup(controlGroupsRef.current, groupShortcut.group,
            current.selectedSquadIds, current.squads);
        } else if (controlGroupsRef.current[groupShortcut.group]) {
          adapter.dispatch({ type: 'select-squads', squadIds: recallControlGroup(controlGroupsRef.current,
            groupShortcut.group, current.squads) });
        }
        return;
      }
      if (action === 'move' || action === 'attack' || action === 'hold' || action === 'capture') {
        adapter.dispatch({ type: 'set-action', action });
        return;
      }
      if (action === 'cancel') {
        adapter.dispatch({ type: 'set-action', action: null });
        return;
      }
      if (action === 'selectBase') {
        selectOwnBase();
        return;
      }
      if (action === 'cameraFocus') {
        const focus = focusSelectedSquads(current.squads, current.selectedSquadIds);
        if (focus) battlefieldRef.current?.centerOnCell(focus.x, focus.y);
        else battlefieldRef.current?.resetCamera();
        return;
      }
      if (action === 'cycleFormation') {
        if (current.formation && current.selectedSquadIds.length > 1) adapter.dispatch({ type: 'set-formation', formation: nextFormation(current.formation) });
        return;
      }
      if (action === 'disband') {
        adapter.dispatch({ type: 'disband-selected' });
        return;
      }
      const productionKind = productionKindForControl(action);
      if (productionKind && current.canProduce !== false) {
        adapter.dispatch({ type: 'produce', kind: productionKind });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!pressedPanBindings.current.size) return;
      for (const binding of pressedPanBindings.current) {
        if (shouldReleaseKeyBinding(binding, event)) pressedPanBindings.current.delete(binding);
      }
      const panControls: Array<[ControlAction, CameraPanDirection]> = [
        ['panUp', 'up'], ['panDown', 'down'], ['panLeft', 'left'], ['panRight', 'right'],
      ];
      for (const [control, direction] of panControls) {
        const active = preferences.controls[control].some((binding) => pressedPanBindings.current.has(binding));
        battlefieldRef.current?.setCameraPan(direction, active);
      }
    };
    const clearCameraPan = () => {
      pressedPanBindings.current.clear();
      for (const direction of ['up', 'down', 'left', 'right'] as const) battlefieldRef.current?.setCameraPan(direction, false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', clearCameraPan);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', clearCameraPan);
      clearCameraPan();
    };
  }, [adapter, preferences.controls, openMenu, closeMenu, selectOwnBase]);
  const text = (key: GameTextKey, values?: Record<string, string | number>) => gameText(locale, key, values);
  return <main className="vi-gameplay vi-screen" data-room-id={roomState?.roomId} data-player-id={roomState?.phase?.playerId} data-connection={roomState?.connection} data-sequence={roomState?.acknowledgedSequence} data-tick={view.tick} data-active-action={view.activeAction ?? ''} data-selected-base={view.selectedBase ?? ''}>
    <Suspense fallback={<div className="vi-phaser" aria-busy="true" data-map-source={activeMapSourceFile()} />}>
      <PhaserBattlefield ref={battlefieldRef} view={view}
        onSelectSquads={(squadIds) => adapter.dispatch({ type: 'select-squads', squadIds })}
        onSelectBase={(base) => adapter.dispatch({ type: 'select-base', base })}
        onMoveSelected={(x, y) => adapter.dispatch({ type: 'move-selected', x, y })}
        onAttackSelected={(targetId) => adapter.dispatch({ type: 'attack-selected', targetId })}
        onCameraChange={setCameraView} />
    </Suspense>
    <Hud view={view} adapter={adapter} controls={preferences.controls} cameraView={cameraView} onBaseRange={previewBaseRange} onPanMap={(x, y) => battlefieldRef.current?.centerOnCell(x, y)}
      match={{
        onResetCamera: () => battlefieldRef.current?.resetCamera(),
        onMenu: () => (menuOpen ? closeMenu() : openMenu()),
        onDevelopment: developmentAvailable() ? () => setDevelopmentOpen(!developmentOpen) : undefined,
        developmentOpen,
        onLeave,
        soundOpen,
        onSoundOpenChange: setSoundOpen,
      }}
      multiplayer={Boolean(multiplayerSession)} audio={preferences.audio} onAudioChange={onAudioChange} />
    {developmentOpen && developmentAvailable() && <DevelopmentControls view={view} adapter={adapter} onClose={() => setDevelopmentOpen(false)} />}
    <AugmentHud view={view} adapter={adapter} sound={!preferences.audio.muted && preferences.audio.effects > 0 && preferences.audio.master > 0} />
    {!multiplayerSession && <FirstMatchTutorial view={view} />}
    {announcement && !view.result && <div key={announcement.id} className={`vi-announcement vi-announcement--${announcement.tone}`} role="status">{announcement.text}</div>}
    {menuOpen && !view.result && <GameMenu ref={menuRef} canPause={view.canPause} onResume={closeMenu} onLeave={onLeave} />}
    {roomState?.phase?.phase === 'transition' && <div className="vi-result" role="dialog" aria-label={text('nextSector')}><div className="vi-result__card">
      <h2>{text('preparingSector', { sector: roomState.phase.sector + 1 })}</h2>
      <p>{text('nextSectorIn', { seconds: Math.ceil((roomState.phase.remainingMs ?? 0) / 1000) })}</p>
      <button onClick={onLeave}>{text('leave')}</button>
    </div></div>}
    {finalPhase && !view.result && <div className="vi-result" role="dialog" aria-label={text('matchEnded')}><div className="vi-result__card">
      <h2>{text(resultReason === 'annulled' ? 'matchAnnulled' : 'matchDraw')}</h2>
      <button className="vi-primary" onClick={onLeave}>{text('backToCommand')}</button>
    </div></div>}
    {view.result && run && <RunOutcome won={view.result === 'victory'} run={run} locale={locale} onLeave={onLeave}
      summary={{ sector: run.state.sector + 1, name: mapName(RUN_SECTORS[run.state.sector]!.map, locale), seconds: view.elapsedSeconds,
        nodesOwned: view.nodes.filter((node) => node.owner === 'blue').length, nodesTotal: view.nodes.length, augments: view.augments?.own ?? run.state.augments }}>
      {view.reward && <MatchProgress reward={view.reward} />}
    </RunOutcome>}
    {view.result && !run && <div className="vi-result" role="dialog" aria-label={text(view.result === 'victory' ? 'resultVictory' : 'resultDefeat')}>
      <div className={`vi-result__card vi-result__card--${view.result}`}>
        <div className="vi-result__crest" aria-hidden="true">{view.result === 'victory'?'✦':'⌁'}</div>
        <h2>{multiplayerSession ? text(view.result === 'victory' ? 'resultVictory' : 'resultDefeat') : text(view.result === 'victory' ? 'resultVictoryTitle' : 'resultDefeatTitle')}</h2>
        <p>{multiplayerSession ? text(resultReason === 'forfeit' ? 'resultForfeit' : 'resultCampaignOver') : text(view.result === 'victory' ? 'resultVictoryBody' : 'resultDefeatBody')}</p>
        {view.reward&&<MatchProgress reward={view.reward}/>}
        <div><button className="vi-primary" onClick={onRestart}>{text(multiplayerSession ? 'backToCommand' : 'playAgain')}</button><button onClick={onLeave}>{text('leave')}</button></div>
      </div>
    </div>}
  </main>;
}
