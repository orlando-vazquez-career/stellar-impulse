import type { DurationMode } from '@impulso/sim';
import { useEffect, useRef, useState } from 'react';
import { MusicPlayer } from './music';
import { AccessScreen } from './access/AccessScreen';
import { clearSession, logoutAccount, restoreAccount, sessionToken, type AccountUser } from '../auth/client';
import { createMultiplayerSession, type MultiplayerSession } from '../multiplayer/session';
import { readPilotAlias } from '../login/pilot-alias';
import { GameplayScreen } from './game/GameplayScreen';
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
  const music = useRef<MusicPlayer | null>(null);

  useEffect(() => {
    let active = true;
    const connection = createMultiplayerSession(SERVER_URL, sessionStorage);
    setMultiplayer(connection);
    void restoreAccount().then(async (user) => {
      if (!active || !user) return;
      setAccount(user);
      setAlias(readPilotAlias() || user.email.split('@')[0]!.slice(0, 24));
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

  function openMultiplayer(mode: LobbyMode, code = '') {
    setLobbyMode(mode);
    setJoinCode(code.trim().toUpperCase());
    setMultiplayerMatch(true);
    if (account && sessionToken()) {
      setScreen('multiplayer');
    } else {
      setPendingMultiplayer(mode);
      setSessionNotice('multiplayerRequiresAccount');
      setScreen('access');
    }
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
    const player = new MusicPlayer(loadVisualPreferences().audio);
    music.current = player;
    player.resume();
    const wake = () => player.resume();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('click', wake);
    window.addEventListener('touchstart', wake);
    window.addEventListener('focusin', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('click', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('focusin', wake);
      player.dispose();
      music.current = null;
    };
  }, []);
  useEffect(() => { music.current?.setPreferences(preferences.audio); }, [preferences.audio]);
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

  return <div className={`visual-app ${accessibilityClasses}`} data-color-profile={preferences.accessibility.colorProfile}>
    {screen === 'access' && <AccessScreen
      sessionBusy={sessionBusy}
      sessionNotice={sessionNotice ? t(sessionNotice) : ''}
      onSignedIn={(user, value) => { setAccount(user); setAlias(value); setSessionNotice(''); setScreen(pendingMultiplayer ? 'multiplayer' : 'command'); setPendingMultiplayer(null); }}
      onContinue={(value) => { setAlias(value); setPendingMultiplayer(null); setSessionNotice(''); setMultiplayerMatch(false); setScreen('command'); }}
      onCreateTraining={(value) => { setAlias(value); setPendingMultiplayer(null); setSessionNotice(''); setMultiplayerMatch(false); setLobbyMode('create'); setScreen('lobby'); }}
      onJoinRoom={(code, value) => { setAlias(value); openMultiplayer('join', code); }}
    />}
    {screen === 'command' && <CommandCenter alias={alias} accountEmail={account?.email} onProfile={()=>setScreen('profile')} onCreateRoom={() => { setMultiplayerMatch(false); setLobbyMode('create'); setScreen('lobby'); }} onCreateMultiplayer={() => openMultiplayer('create')} onJoinRoom={() => openMultiplayer('join')} onHangar={() => setScreen('hangar')} onSettings={() => setScreen('settings')} onSignOut={() => void signOut()} />}
    {screen==='profile'&&<ProfileScreen onBack={()=>setScreen('command')}/>}
    {screen === 'lobby' && <PreparationLobby alias={alias} mode={lobbyMode} initialJoinCode={joinCode} onBack={() => setScreen('command')} onExploreMap={() => { selectMap('sector-01'); setScreen('map'); }} onDeploy={(chosen, chosenMap, chosenDuration) => { setDuration(chosenDuration); setDifficulty(chosen); setMap(chosenMap); setScreen('gameplay'); }} />}
    {screen === 'multiplayer' && multiplayer && <MultiplayerLobby alias={alias} token={sessionToken() || ''} mode={lobbyMode} session={multiplayer} initialJoinCode={joinCode} onBack={() => { setMultiplayerMatch(false); setJoinCode(''); setScreen('command'); }} />}
    {screen === 'map' && <SectorMapScreen onBack={() => setScreen('lobby')} />}
    {screen === 'hangar' && <HangarScreen onBack={() => setScreen('command')} />}
    {screen === 'settings' && <SettingsScreen preferences={preferences} onBack={() => setScreen('command')} onSave={(nextPreferences) => { saveVisualPreferences(nextPreferences); setPreferences(nextPreferences); }} />}
    {screen === 'gameplay' && <GameplayScreen preferences={preferences} difficulty={difficulty} map={map} duration={duration} multiplayerSession={multiplayerMatch ? multiplayer ?? undefined : undefined} onLeave={() => multiplayerMatch ? void leaveMultiplayer() : setScreen('command')} />}
    <div className="vi-resolution-warning" role="alert"><div><Brand /><h1>{t('resolutionWarningTitle')}</h1><p>{t('resolutionWarningBody')}</p></div></div>
  </div>;
}

export default function VisualPrototypeApp() {
  return <LanguageProvider><VisualPrototypeContent /></LanguageProvider>;
}
