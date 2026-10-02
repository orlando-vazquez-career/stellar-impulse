import { useEffect, useRef, useState } from 'react';
import { MusicPlayer } from './music';
import { AccessScreen } from './access/AccessScreen';
import { GameplayScreen } from './game/GameplayScreen';
import { HangarScreen } from './hangar/HangarScreen';
import { LanguageProvider, useI18n } from './i18n';
import { PreparationLobby, type LobbyMode, type RivalDifficulty } from './lobby/PreparationLobby';
import { SectorMapScreen } from './map/SectorMapScreen';
import { selectMap, type TrainingMapId } from './map/sector-map';
import { CommandCenter } from './menu/CommandCenter';
import { loadVisualPreferences, saveVisualPreferences } from './settings/preferences';
import { SettingsScreen } from './settings/SettingsScreen';
import { Brand } from './shared/Brand';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './visual.css';

type Screen = 'access' | 'command' | 'lobby' | 'map' | 'hangar' | 'settings' | 'gameplay';

function VisualPrototypeContent() {
  const { t } = useI18n();
  const [screen, setScreen] = useState<Screen>('access');
  const [alias, setAlias] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('create');
  const [preferences, setPreferences] = useState(loadVisualPreferences);
  const [difficulty, setDifficulty] = useState<RivalDifficulty>('medium');
  const [map, setMap] = useState<TrainingMapId>('espiral');
  const music = useRef<MusicPlayer | null>(null);

  // One background player for the whole app; browsers only start audio after a gesture.
  useEffect(() => {
    const player = new MusicPlayer(loadVisualPreferences().audio);
    music.current = player;
    const wake = () => player.resume();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      player.dispose();
      music.current = null;
    };
  }, []);
  useEffect(() => { music.current?.setPreferences(preferences.audio); }, [preferences.audio]);
  useEffect(() => { music.current?.play(screen === 'gameplay' ? 'match' : 'menu'); }, [screen]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Impulso Stellar · Interfaz visual';
    return () => { document.title = previousTitle; };
  }, []);

  const accessibilityClasses = [
    preferences.accessibility.highContrast && 'is-high-contrast',
    preferences.accessibility.reducedMotion && 'is-reduced-motion',
    preferences.accessibility.largeText && 'is-large-text',
  ].filter(Boolean).join(' ');

  return <div className={`visual-app ${accessibilityClasses}`} data-color-profile={preferences.accessibility.colorProfile}>
    {screen === 'access' && <AccessScreen
      onContinue={(value) => { setAlias(value); setScreen('command'); }}
      onCreateTraining={(value) => { setAlias(value); setLobbyMode('create'); setScreen('lobby'); }}
      onJoinRoom={(code, value) => { setAlias(value); setJoinCode(code); setLobbyMode('join'); setScreen('lobby'); }}
    />}
    {screen === 'command' && <CommandCenter alias={alias} onCreateRoom={() => { setLobbyMode('create'); setScreen('lobby'); }} onJoinRoom={() => { setLobbyMode('join'); setScreen('lobby'); }} onHangar={() => setScreen('hangar')} onSettings={() => setScreen('settings')} onSignOut={() => { setAlias(''); setScreen('access'); }} />}
    {screen === 'lobby' && <PreparationLobby alias={alias} mode={lobbyMode} initialJoinCode={joinCode} onBack={() => setScreen('command')} onExploreMap={() => { selectMap('sector-01'); setScreen('map'); }} onDeploy={(chosen, chosenMap) => { setDifficulty(chosen); setMap(chosenMap); setScreen('gameplay'); }} />}
    {screen === 'map' && <SectorMapScreen onBack={() => setScreen('lobby')} />}
    {screen === 'hangar' && <HangarScreen onBack={() => setScreen('command')} />}
    {screen === 'settings' && <SettingsScreen preferences={preferences} onBack={() => setScreen('command')} onSave={(nextPreferences) => { saveVisualPreferences(nextPreferences); setPreferences(nextPreferences); }} />}
    {screen === 'gameplay' && <GameplayScreen preferences={preferences} difficulty={difficulty} map={map} onLeave={() => setScreen('command')} />}
    <div className="vi-resolution-warning" role="alert"><div><Brand /><h1>{t('resolutionWarningTitle')}</h1><p>{t('resolutionWarningBody')}</p></div></div>
  </div>;
}

export default function VisualPrototypeApp() {
  return <LanguageProvider><VisualPrototypeContent /></LanguageProvider>;
}
