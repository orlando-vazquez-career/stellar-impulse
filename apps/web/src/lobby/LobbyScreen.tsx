import { useReducer, useState, type CSSProperties } from 'react';
import { AliasControl, LobbyTicker, ModeDetail, ModeList, PlanetStage, SoundButton } from '@impulso/ui';
import { describeRoute, initialLobby, reduceLobby, routeHint } from './lobby-state';
import { findMode, MODES, openingMode, opensCurrentArena } from './modes';
import { normalizeAlias, readPilotAlias, writePilotAlias } from './pilot-alias';
import { useSpaceSound } from './sound';
import { Starfield } from './StarfieldLayers';
import { randomOtherStarfield, STARFIELD_IMAGES } from './starfield';
import { useStageScale } from './use-stage-scale';
import hostCss from './lobby-host.css?inline';
import lobbyCss from './lobby.css?inline';

interface LobbyScreenProps {
  onOpenArena: () => void;
}

export function LobbyScreen({ onOpenArena }: LobbyScreenProps) {
  const scale = useStageScale();
  const sound = useSpaceSound();
  const [alias, setAlias] = useState(readPilotAlias);
  const [sky, setSky] = useState(0);
  const [shock, setShock] = useState(0);
  const [lobby, dispatch] = useReducer(reduceLobby, openingMode().id, initialLobby);
  const mode = findMode(lobby.modeId);
  const stageStyle = {
    transform: `translate(-50%, -50%) scale(${scale})`,
    '--accent': mode.accent,
  } as CSSProperties;

  function preview(modeId: string) {
    if (lobby.entered || lobby.modeId === modeId) return;
    sound.playHover(findMode(modeId));
    dispatch({ type: 'preview', modeId });
  }

  function enter(modeId: string) {
    sound.playEnter(findMode(modeId));
    shiftSky();
    setShock((value) => value + 1);
    dispatch({ type: 'enter', modeId });
  }

  function back() {
    shiftSky();
    dispatch({ type: 'back' });
  }

  function pick(optionIndex: number) {
    sound.playSelect();
    dispatch({ type: 'pick', optionIndex });
  }

  function deploy() {
    if (lobby.optionIndex === null) return;
    if (opensCurrentArena(mode, lobby.optionIndex)) {
      onOpenArena();
      return;
    }
    dispatch({ type: 'deploy' });
  }

  function saveAlias(value: string) {
    const next = normalizeAlias(value);
    writePilotAlias(next);
    setAlias(next);
    sound.playSelect();
  }

  function shiftSky() {
    setSky((current) => randomOtherStarfield(current, STARFIELD_IMAGES.length, Math.random));
  }

  return (
    <main className="viewport">
      <style>{`${lobbyCss}\n${hostCss}`}</style>
      <div className="stage" style={stageStyle}>
        <Starfield index={sky} />
        <div className="twinkle-layer" aria-hidden="true" />
        <div className="nebula" aria-hidden="true" />
        <div className="brand-glow" aria-hidden="true" />
        <PlanetStage modes={MODES} active={mode} entered={lobby.entered} shock={shock} onPreview={preview} onEnter={enter} />
        <header className="brand">
          <div className="eyebrow">ATLAS DE MANDO</div>
          <h1 className="brand-title">IMPULSO STELLAR</h1>
          <div className="brand-tagline serif">Explora, combate, defiende.</div>
          <div className="brand-rule" />
        </header>
        <ModeList modes={MODES} activeId={lobby.modeId} hidden={lobby.entered} onPreview={preview} onEnter={enter} />
        <ModeDetail mode={mode} optionIndex={lobby.optionIndex} deployed={lobby.deployed} hidden={!lobby.entered} onBack={back} onPick={pick} onDeploy={deploy} />
        <div className="topbar">
          <span>LOGIN</span>
          <SoundButton enabled={sound.enabled} onToggle={sound.toggle} />
          <AliasControl alias={alias} onSave={saveAlias} />
        </div>
        <LobbyTicker status={describeRoute(mode, lobby)} hint={routeHint(lobby.entered)} />
      </div>
    </main>
  );
}
