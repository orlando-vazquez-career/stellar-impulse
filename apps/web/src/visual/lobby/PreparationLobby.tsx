import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import './lobby.css';

export type LobbyMode = 'create' | 'join';
type FleetSide = 'blue' | 'red';

export function PreparationLobby({ alias, mode, onBack, onExploreMap, onDeploy, onDeployServer }: { alias: string; mode: LobbyMode; onBack(): void; onExploreMap(): void; onDeploy(): void; onDeployServer(): void }) {
  const { t } = useI18n();
  const [side, setSide] = useState<FleetSide>('blue');
  const [ready, setReady] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinedCode, setJoinedCode] = useState(mode === 'create' ? 'ST-0427' : '');
  const joined = Boolean(joinedCode);

  const joinRoom = (event: FormEvent) => {
    event.preventDefault();
    const normalized = joinCode.trim().toUpperCase();
    if (normalized.length >= 4) setJoinedCode(normalized);
  };

  return <main className="vi-lobby vi-screen">
    <header className="vi-screen__header">
      <Brand />
      <div className="vi-header-actions"><LanguageToggle /><button className="vi-text-button" onClick={onBack}>← {t('backToCommand')}</button></div>
    </header>

    <section className="vi-lobby__content">
      <div className="vi-lobby__heading">
        <div><p className="vi-eyebrow">{t('lobbyEyebrow')}</p><h1>{t(mode === 'create' ? 'lobbyCreateTitle' : 'lobbyJoinTitle')}</h1></div>
        <p>{t('lobbyBody')}</p>
      </div>

      <div className="vi-lobby__grid">
        <section className="vi-lobby-card vi-briefing" aria-labelledby="operation-brief-title">
          <header><span>01</span><h2 id="operation-brief-title">{t('operationBrief')}</h2></header>
          <div className="vi-map-preview" aria-hidden="true">
            <div className="vi-map-preview__field"><i className="vi-map-preview__core" /><i className="vi-map-preview__blue" /><i className="vi-map-preview__red" /></div>
            <span>SECTOR 01 // {t('mapValue')}</span>
          </div>
          <dl className="vi-briefing__data">
            <div><dt>{t('map')}</dt><dd>{t('mapValue')}</dd></div>
            <div><dt>{t('objective')}</dt><dd>{t('objectiveValue')}</dd></div>
            <div><dt>{t('duration')}</dt><dd>{t('durationValue')}</dd></div>
            <div><dt>{t('fleetFormat')}</dt><dd>{t('fleetFormatValue')}</dd></div>
          </dl>
          <button className="vi-map-explore" onClick={onExploreMap}>Explorar mapa Tiled</button>
        </section>

        <section className="vi-lobby-card vi-room" aria-labelledby="room-title">
          <header><div><span>{t('simulatedRoom')}</span><h2 id="room-title">{joined ? joinedCode : t('joinRoom')}</h2></div>{joined && <span className="vi-room__status"><i />LOCAL</span>}</header>

          {!joined ? <form className="vi-room__join" onSubmit={joinRoom}>
            <label htmlFor="room-code">{t('roomCode')}</label>
            <div><input id="room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder={t('roomCodePlaceholder')} maxLength={12} autoFocus /><button disabled={joinCode.trim().length < 4}>{t('joinOperation')} →</button></div>
            <p>{t('joinInstructions')}</p>
          </form> : <>
            <div className="vi-room__section">
              <h3>{t('participants')}</h3>
              <div className="vi-commanders">
                <article className={`vi-commander vi-commander--${side}`}><span className="vi-commander__mark">{alias.slice(0, 1).toUpperCase()}</span><div><strong>{alias}</strong><small>{t('you')} · {t(side === 'blue' ? 'blueSide' : 'redSide')}</small></div><em className={ready ? 'is-ready' : ''}>{ready ? t('ready') : t('notReady')}</em></article>
                <article className={`vi-commander vi-commander--${side === 'blue' ? 'red' : 'blue'} is-muted`}><span className="vi-commander__mark">?</span><div><strong>{t('rivalCommander')}</strong><small>{t('waitingOpponent')}</small></div><em>{t('ready')}</em></article>
              </div>
            </div>

            <fieldset className="vi-side-select">
              <legend>{t('sideSelection')}</legend>
              <button className={side === 'blue' ? 'is-selected' : ''} aria-pressed={side === 'blue'} onClick={() => setSide('blue')}><i className="is-blue" /><span><strong>{t('blueSide')}</strong><small>{t('sideAvailable')}</small></span><b>01</b></button>
              <button className={side === 'red' ? 'is-selected' : ''} aria-pressed={side === 'red'} onClick={() => setSide('red')}><i className="is-red" /><span><strong>{t('redSide')}</strong><small>{t('sideAvailable')}</small></span><b>02</b></button>
            </fieldset>

            <div className="vi-ready-controls">
              <label><input type="checkbox" checked={ready} onChange={(event) => setReady(event.target.checked)} /><span><strong>{t('readyConfirmation')}</strong><small>{t('launchHint')}</small></span></label>
              <button className="vi-primary" disabled={!ready} onClick={onDeploy}>{t('launchOperation')}<span aria-hidden="true">→</span></button>
              <button className="vi-server-deploy" disabled={!ready} onClick={onDeployServer}>Probar nave autoritativa <span aria-hidden="true">↗</span></button>
            </div>
          </>}
        </section>
      </div>
    </section>
    <footer className="vi-screen__footer"><span>{t('commander')} // {alias.toUpperCase()}</span><span>{t('preparation')} // 01</span></footer>
  </main>;
}
