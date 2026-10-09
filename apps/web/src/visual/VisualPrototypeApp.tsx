import type { DurationMode } from '@impulso/sim';
import { useEffect, useRef, useState } from 'react';
import { MusicPlayer, getMusicPlayer } from './music';
import { setAudioMix } from './audio-mix';
import { AccessScreen } from './access/AccessScreen';
import { clearSession, logoutAccount, restoreAccount, sessionToken, type AccountUser } from '../auth/client';
import { createMultiplayerSession, type MultiplayerSession } from '../multiplayer/session';
import { accountAlias, readPilotAlias, writePilotAlias } from '../login/pilot-alias';
import { GameplayScreen } from './game/GameplayScreen';
import { RunScreen } from './run/RunScreen';
import { HangarScreen } from './hangar/HangarScreen';
import { LanguageProvider, useI18n } from './i18n';
import { PreparationLobby, type LobbyMode, type RivalDifficulty } from './lobby/PreparationLobby';
import { MultiplayerLobby } from './lobby/MultiplayerLobby';
import { SectorMapScreen } from './map/SectorMapScreen';
import { DEFAULT_PLAYABLE_MAP, selectMap, type TrainingMapId } from './map/sector-map';
import { CommandCenter } from './menu/CommandCenter';
import { loadVisualPreferences, saveVisualPreferences } from './settings/preferences';
import { SettingsScreen } from './settings/SettingsScreen';
import { Brand } from './shared/Brand';
import { ProfileScreen } from './profile/ProfileScreen';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './visual.css';

type Screen = 'access' | 'command' | 'lobby' | 'multiplayer' | 'map' | 'hangar' | 'settings' | 'gameplay' | 'profile';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567';

function VisualPrototypeContent() {
  const { t } = useI18n();
  const [screen, setScreen] = useState<Screen>('access');
  const [alias, setAlias] = useState('');
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [sessionBusy, setSessionBusy] = useState(() => Boolean(sessionToken()));
  const [sessionNotice, setSessionNotice] = useState<'' | 'accountUnavailable' | 'accountLogoutFailed' | 'multiplayerRequiresAccount'>('');
  const [multiplayer, setMultiplayer] = useState<MultiplayerSession | null>(null);
  const [multiplayerMatch, setMultiplayerMatch] = useState(false);
  const [pendingMultiplayer, setPendingMultiplayer] = useState<LobbyMode | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('create');
  const [preferences, setPreferences] = useState(loadVisualPreferences);
  const [duration, setDuration] = useState<DurationMode>('skirmish');
  const [difficulty, setDifficulty] = useState<RivalDifficulty>('medium');
  const [map, setMap] = useState<TrainingMapId>(DEFAULT_PLAYABLE_MAP);
  const [runMode, setRunMode] = useState(false);
  const music = useRef<MusicPlayer | null>(null);

  useEffect(() => {
    let active = true;
    const connection = createMultiplayerSession(SERVER_URL, sessionStorage);
    setMultiplayer(connection);
    void restoreAccount().then(async (user) => {
      if (!active || !user) return;
      setAccount(user);
      // The account's alias wins over the one this device remembers.
      const commander = accountAlias(user, readPilotAlias());
      if (user.displayName) writePilotAlias(commander);
      setAlias(commander);
      const restored = await connection.restore();
      if (!active) return;
      setMultiplayerMatch(restored);
      setLobbyMode(restored ? 'join' : 'create');
      setScreen(restored ? 'multiplayer' : 'command');
    }).catch(() => {
      if (!active) return;
      clearSession();
      setSessionNotice('accountUnavailable');
    }).finally(() => { if (active) setSessionBusy(false); });
    return () => { active = false; connection.destroy(); };
  }, []);

  useEffect(() => {
    if (!multiplayer) return;
    const update = () => {
      const phase = multiplayer.getSnapshot().phase?.phase;
      if (phase === 'sector' || phase === 'transition' || phase === 'results') {
        setMultiplayerMatch(true);
        setScreen((current) => current === 'multiplayer' || current === 'gameplay' ? 'gameplay' : current);
      }
    };
    update();
    return multiplayer.subscribe(update);
  }, [multiplayer]);

  async function openMultiplayer(mode: LobbyMode, code = '') {
    setLobbyMode(mode);
    setJoinCode(code.trim().toUpperCase());
    if (!sessionToken()) {
      setPendingMultiplayer(mode);
      setSessionNotice('multiplayerRequiresAccount');
      setScreen('access');
      return;
    }
    setMultiplayerMatch(true);
    setScreen('multiplayer');
  }

  async function leaveMultiplayer() {
    await multiplayer?.leave();
    setMultiplayerMatch(false);
    setJoinCode('');
    setScreen('command');
  }

  async function signOut() {
    setSessionBusy(true);
    await multiplayer?.leave();
    setMultiplayerMatch(false);
    setPendingMultiplayer(null);
    setAccount(null);
    setAlias('');
    setJoinCode('');
    setSessionNotice('');
    setScreen('access');
    try { await logoutAccount(); }
    catch { setSessionNotice('accountLogoutFailed'); }
    finally { setSessionBusy(false); }
  }

  // One background player for the whole app; browsers only start audio after a gesture.
  useEffect(() => {
    const player = getMusicPlayer(loadVisualPreferences().audio);
    music.current = player;
    player.play('menu');
    player.resume();
    const wake = () => player.resume();
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('mousedown', wake, { passive: true });
    window.addEventListener('keydown', wake, { passive: true });
    window.addEventListener('click', wake, { passive: true });
    window.addEventListener('touchstart', wake, { passive: true });
    window.addEventListener('focusin', wake, { passive: true });
    window.addEventListener('pointermove', wake, { passive: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('click', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('focusin', wake);
      window.removeEventListener('pointermove', wake);
    };
  }, []);
  // Every sound source reads this live mix; the saved preferences are its resting value.
  useEffect(() => { setAudioMix(preferences.audio); }, [preferences.audio]);
  const changeAudio = (audio: typeof preferences.audio) => {
    const next = { ...preferences, audio };
    saveVisualPreferences(next);
    setPreferences(next);
  };
  useEffect(() => { music.current?.play(screen === 'gameplay' ? 'match' : 'menu'); }, [screen]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Stellar Impulse · Interfaz visual';
    return () => { document.title = previousTitle; };
  }, []);

  const accessibilityClasses = [
    preferences.accessibility.highContrast && 'is-high-contrast',
    preferences.accessibility.reducedMotion && 'is-reduced-motion',
    preferences.accessibility.largeText && 'is-large-text',
  ].filter(Boolean).join(' ');

  const updateLoginMusic = (change: Partial<Pick<typeof preferences.audio, 'music' | 'musicMuted'>>) => {
    const audio = { ...preferences.audio, ...change };
    const next = { ...preferences, audio };
    saveVisualPreferences(next);
    setPreferences(next);
    setAudioMix(audio);
  };

  return <div className={`visual-app ${accessibilityClasses}`} data-color-profile={preferences.accessibility.colorProfile}>
    {screen === 'access' && <AccessScreen
      sessionBusy={sessionBusy}
      sessionNotice={sessionNotice ? t(sessionNotice) : ''}
      musicVolume={preferences.audio.music}
      musicMuted={preferences.audio.musicMuted}
      onMusicVolumeChange={(music) => updateLoginMusic({ music })}
      onMusicMuteChange={(musicMuted) => updateLoginMusic({ musicMuted })}
      onSignedIn={(user, value) => { setAccount(user); setAlias(value); setSessionNotice(''); setScreen(pendingMultiplayer ? 'multiplayer' : 'command'); setPendingMultiplayer(null); }}
      onContinue={(value) => {
        setAlias(value);
        setAccount(null);
        setPendingMultiplayer(null);
        setSessionNotice('');
        setMultiplayerMatch(false);
        setScreen('command');
      }}
      onCreateTraining={(value) => {
        setAlias(value);
        setAccount(null);
        setPendingMultiplayer(null);
        setSessionNotice('');
        setMultiplayerMatch(false);
        setLobbyMode('create');
        setScreen('lobby');
      }}
      onJoinRoom={(code, value) => { setAlias(value); void openMultiplayer('join', code); }}
    />}
    {screen === 'command' && <CommandCenter alias={alias} accountEmail={account?.email} account={account} onAccountChange={setAccount} preferences={preferences} onSavePreferences={(next) => { saveVisualPreferences(next); setPreferences(next); }} onProfile={()=>setScreen('profile')} onCreateRoom={() => { setMultiplayerMatch(false); setLobbyMode('create'); setScreen('lobby'); }} onCampaign={() => { setMultiplayerMatch(false); setRunMode(true); setScreen('gameplay'); }} onCreateMultiplayer={() => openMultiplayer('create')} onJoinRoom={() => openMultiplayer('join')} onSignOut={() => void signOut()} onBack={() => void signOut()} />}
    {screen==='profile'&&<ProfileScreen onBack={()=>setScreen('command')}/>}
    {screen === 'lobby' && <PreparationLobby alias={alias} mode={lobbyMode} initialJoinCode={joinCode} onBack={() => setScreen('command')} onExploreMap={() => { selectMap('sector-01'); setScreen('map'); }} onDeploy={(chosen, chosenMap, chosenDuration) => { setDuration(chosenDuration); setDifficulty(chosen); setMap(chosenMap); setRunMode(false); setScreen('gameplay'); }} />}
    {screen === 'multiplayer' && multiplayer && <MultiplayerLobby alias={alias} token={sessionToken() || ''} mode={lobbyMode} session={multiplayer} initialJoinCode={joinCode} onBack={() => { setMultiplayerMatch(false); setJoinCode(''); setScreen('command'); }} />}
    {screen === 'map' && <SectorMapScreen onBack={() => setScreen('lobby')} />}
    {screen === 'hangar' && <HangarScreen onBack={() => setScreen('command')} account={account} onAccountChange={setAccount} />}
    {screen === 'settings' && <SettingsScreen preferences={preferences} onPreviewAudio={setAudioMix}
      onBack={() => { setAudioMix(preferences.audio); setScreen('command'); }}
      onSave={(nextPreferences) => { saveVisualPreferences(nextPreferences); setPreferences(nextPreferences); }} />}
    {screen === 'gameplay' && runMode && !multiplayerMatch && <RunScreen preferences={preferences} onAudioChange={changeAudio} difficulty={difficulty} duration={duration} onLeave={() => setScreen('command')} />}
    {screen === 'gameplay' && !(runMode && !multiplayerMatch) && <GameplayScreen preferences={preferences} onAudioChange={changeAudio} difficulty={difficulty} map={map} duration={duration} multiplayerSession={multiplayerMatch ? multiplayer ?? undefined : undefined} onLeave={() => multiplayerMatch ? void leaveMultiplayer() : setScreen('command')} />}
    <div className="vi-resolution-warning" role="alert"><div><Brand /><h1>{t('resolutionWarningTitle')}</h1><p>{t('resolutionWarningBody')}</p></div></div>
  </div>;
}

export default function VisualPrototypeApp() {
  return <LanguageProvider><VisualPrototypeContent /></LanguageProvider>;
}
