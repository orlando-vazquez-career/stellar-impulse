import { DEFAULT_CAMPAIGN_MAP, PRACTICE_MAPS } from '@impulso/input';
import type { DurationMode } from '@impulso/sim';
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import { useSpaceSound } from '../../login/sound';
import { createCommandSpaceScene } from '../menu/command-space';
import { createAnomalyScene } from './anomaly-scene';
import type { TrainingMapId } from '../map/sector-map';
import './lobby.css';

export type LobbyMode = 'create' | 'join';
export type RivalDifficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTIES: { value: RivalDifficulty; label: string; hint: string }[] = [
  { value: 'easy', label: 'Fácil', hint: 'Flota chica y lenta. No ataca tus nodos.' },
  { value: 'medium', label: 'Media', hint: 'Se expande rápido y pelea por todo.' },
  { value: 'hard', label: 'Difícil', hint: 'Toma dos nodos a la vez y asalta los tuyos.' },
];
type FleetSide = 'blue' | 'red';
/** How much of the interference's sideways slip each lobby panel takes, so they do not move as one block. */
const PANEL_SLIP = [0.5, 1, -0.7, 1.3, -1];

export function PreparationLobby({
  alias,
  mode,
  onBack,
  onExploreMap,
  onDeploy,
  initialJoinCode = '',
}: {
  alias: string;
  mode: LobbyMode;
  onBack(): void;
  onExploreMap(): void;
  onDeploy(difficulty: RivalDifficulty, map: TrainingMapId, duration: DurationMode): void;
  initialJoinCode?: string;
}) {
  const { locale, t } = useI18n();
  const sound = useSpaceSound();
  const canvas = useRef<HTMLCanvasElement>(null);

  const [duration, setDuration] = useState<DurationMode>('skirmish');
  const [difficulty, setDifficulty] = useState<RivalDifficulty>('medium');
  const [map, setMap] = useState<TrainingMapId>(DEFAULT_CAMPAIGN_MAP);
  const selectedMap = PRACTICE_MAPS.find((option) => option.id === map) ?? PRACTICE_MAPS[0];
  const [side, setSide] = useState<FleetSide>('blue');
  const [ready, setReady] = useState(false);
  const [joinCode, setJoinCode] = useState(initialJoinCode.toUpperCase());
  const [joinedCode, setJoinedCode] = useState(mode === 'create' ? 'ST-0427' : '');
  const joined = Boolean(joinedCode);

  // Trascendencia Estelar takes over the backdrop: a black hole and a signal breaking into the lobby.
  const anomaly = map === 'trascendencia';
  const root = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const soundOn = useRef(sound.enabled);
  soundOn.current = sound.enabled;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let calm = 0;
    let panels: HTMLElement[] = [];
    const scene = anomaly
      ? createAnomalyScene(el, overlay.current, {
        soundEnabled: () => soundOn.current,
        // The panels split into colours for as long as the interference lasts.
        onBurst: (seconds) => {
          const main = root.current;
          if (!main) return;
          panels = [...main.querySelectorAll<HTMLElement>('.vi-lobby-card, .vi-lobby__heading, .vi-screen__header')];
          main.classList.add('is-glitching');
          window.clearTimeout(calm);
          calm = window.setTimeout(() => main.classList.remove('is-glitching'), seconds * 1000);
        },
        // ...and move with the picture behind them, each by its own amount: only transforms, so nothing is repainted.
        onWarp: (slip, pulse) => {
          panels.forEach((panel, index) => {
            const share = PANEL_SLIP[index % PANEL_SLIP.length]!;
            panel.style.transform = slip === 0 && pulse === 0 ? ''
              : `translate3d(${(slip * share).toFixed(2)}px, ${(pulse * 3 * share).toFixed(2)}px, 0) skewX(${(slip * share * 0.07).toFixed(3)}deg) scale(${(1 + pulse * 0.012).toFixed(4)})`;
          });
        },
      })
      : createCommandSpaceScene(el);
    scene.start();

    const onResize = () => scene.resize();
    const onPointer = (event: PointerEvent) => {
      scene.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointer);
    return () => {
      scene.stop();
      window.clearTimeout(calm);
      root.current?.classList.remove('is-glitching');
      for (const panel of panels) panel.style.transform = '';
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [anomaly]);

  const joinRoom = (event: FormEvent) => {
    event.preventDefault();
    const normalized = joinCode.trim().toUpperCase();
    if (normalized.length >= 4) {
      sound.playSelect();
      setJoinedCode(normalized);
    }
  };

  function hover(pitch = 560) {
    sound.playHover({ pitch });
  }

  return (
    <main ref={root} className={`vi-lobby vi-screen${anomaly ? ' is-anomaly' : ''}`}>
      {/* A fresh canvas per backdrop: the two scenes never share drawing state. */}
      <canvas key={anomaly ? 'anomaly' : 'space'} ref={canvas} className="vi-lobby-canvas" aria-hidden="true" />
      {anomaly && <canvas ref={overlay} className="vi-lobby-overlay" aria-hidden="true" />}
      <header className="vi-screen__header">
        <Brand />
        <div className="vi-screen__header-center">
          <span className="vi-screen__header-tag">{t('lobbyEyebrow')}</span>
        </div>
        <div className="vi-header-actions">
          <LanguageToggle />
        </div>
      </header>

      <section className="vi-lobby__content">
        <div className="vi-lobby__heading">
          <div>
            <button
              type="button"
              className="vi-lobby__back-btn"
              onMouseEnter={() => hover(560)}
              onClick={() => {
                sound.playSelect();
                onBack();
              }}
            >
              <span className="vi-lobby__back-arrow">←</span>
              <span>{t('backToCommand')}</span>
            </button>
            <h1>{t(mode === 'create' ? 'lobbyCreateTitle' : 'lobbyJoinTitle')}</h1>
          </div>
          <p>{t('lobbyBody')}</p>
        </div>

        <div className="vi-lobby__grid">
          <section className="vi-lobby-card vi-briefing" aria-labelledby="operation-brief-title">
            <header>
              <span>01</span>
              <h2 id="operation-brief-title">{t('operationBrief')}</h2>
            </header>
            <div className="vi-map-preview" aria-hidden="true">
              <div className="vi-map-preview__field">
                <i className="vi-map-preview__core" />
                <i className="vi-map-preview__blue" />
                <i className="vi-map-preview__red" />
              </div>
              <span>{selectedMap.name[locale]}</span>
            </div>
            <dl className="vi-briefing__data">
              <div>
                <dt>{t('map')}</dt>
                <dd>{selectedMap.name[locale]}</dd>
              </div>
              <div>
                <dt>{t('objective')}</dt>
                <dd>{t('objectiveValue')}</dd>
              </div>
              <div>
                <dt>{t('duration')}</dt>
                <dd>{duration==='complete'?'~20 min':'~8 min'}</dd>
              </div>
              <div>
                <dt>{t('fleetFormat')}</dt>
                <dd>{t('fleetFormatValue')}</dd>
              </div>
            </dl>
            <button
              className="vi-map-explore"
              onMouseEnter={() => hover(520)}
              onClick={() => {
                sound.playSelect();
                onExploreMap();
              }}
            >
              Explorar mapa Tiled
            </button>
            {mode === 'create' && (
              <fieldset className="vi-difficulty vi-map-select">
                <legend>{t('map')}</legend>
                {PRACTICE_MAPS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`${map === option.id ? 'is-selected' : ''}${option.id === 'trascendencia' ? ' is-anomaly-option' : ''}`}
                    aria-pressed={map === option.id}
                    aria-label={`${option.name[locale]}. ${option.description[locale]}`}
                    onMouseEnter={() => hover(420)}
                    onClick={() => { sound.playSelect(); setMap(option.id); }}
                  >
                    <strong>{option.name[locale]}</strong>
                    <small>{option.description[locale]}</small>
                  </button>
                ))}
              </fieldset>
            )}
          </section>

          <section className="vi-lobby-card vi-room" aria-labelledby="room-title">
            <header>
              <div>
                <span>{t('simulatedRoom')}</span>
                <h2 id="room-title">{joined ? joinedCode : t('joinRoom')}</h2>
              </div>
              {joined && (
                <span className="vi-room__status">
                  <i />LOCAL
                </span>
              )}
            </header>

            {!joined ? (
              <form className="vi-room__join" onSubmit={joinRoom}>
                <label htmlFor="room-code">{t('roomCode')}</label>
                <div>
                  <input
                    id="room-code"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder={t('roomCodePlaceholder')}
                    maxLength={12}
                    autoFocus
                  />
                  <button
                    disabled={joinCode.trim().length < 4}
                    onMouseEnter={() => hover()}
                  >
                    {t('joinOperation')} →
                  </button>
                </div>
                <p>{t('joinInstructions')}</p>
              </form>
            ) : (
              <>
                <div className="vi-room__section">
                  <h3>{t('participants')}</h3>
                  <div className="vi-commanders">
                    <article className={`vi-commander vi-commander--${side}`}>
                      <span className="vi-commander__mark">{alias.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{alias}</strong>
                        <small>{t('you')} · {t(side === 'blue' ? 'blueSide' : 'redSide')}</small>
                      </div>
                      <em className={ready ? 'is-ready' : ''}>
                        {ready ? t('ready') : t('notReady')}
                      </em>
                    </article>
                    <article className={`vi-commander vi-commander--${side === 'blue' ? 'red' : 'blue'} is-muted`}>
                      <span className="vi-commander__mark">?</span>
                      <div>
                        <strong>{t('rivalCommander')}</strong>
                        <small>{t('waitingOpponent')}</small>
                      </div>
                      <em>{t('ready')}</em>
                    </article>
                  </div>
                </div>

                <fieldset className="vi-side-select">
                  <legend>{t('sideSelection')}</legend>
                  <button
                    type="button"
                    className={side === 'blue' ? 'is-selected' : ''}
                    aria-pressed={side === 'blue'}
                    onMouseEnter={() => hover(460)}
                    onClick={() => {
                      sound.playSelect();
                      setSide('blue');
                    }}
                  >
                    <i className="is-blue" />
                    <span>
                      <strong>{t('blueSide')}</strong>
                      <small>{t('sideAvailable')}</small>
                    </span>
                    <b>01</b>
                  </button>
                  <button
                    type="button"
                    className={side === 'red' ? 'is-selected' : ''}
                    aria-pressed={side === 'red'}
                    onMouseEnter={() => hover(460)}
                    onClick={() => {
                      sound.playSelect();
                      setSide('red');
                    }}
                  >
                    <i className="is-red" />
                    <span>
                      <strong>{t('redSide')}</strong>
                      <small>{t('sideAvailable')}</small>
                    </span>
                    <b>02</b>
                  </button>
                </fieldset>

                {mode === 'create' && (
                  <fieldset className="vi-difficulty">
                    <legend>Dificultad de la IA rival</legend>
                    {DIFFICULTIES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={difficulty === option.value ? 'is-selected' : ''}
                        aria-pressed={difficulty === option.value}
                        onMouseEnter={() => hover(420)}
                        onClick={() => {
                          sound.playSelect();
                          setDifficulty(option.value);
                        }}
                      >
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </button>
                    ))}
                  </fieldset>
                )}

                <fieldset className="vi-duration"><legend>{t('durationMode')}</legend>
                  <select aria-label={t('durationMode')} value={duration} onChange={(event) => setDuration(event.target.value as DurationMode)}>
                    <option value="skirmish">{t('skirmishMode')}</option><option value="complete">{t('completeMode')}</option>
                  </select></fieldset>
                <div className="vi-ready-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={ready}
                      onChange={(event) => {
                        sound.playSelect();
                        setReady(event.target.checked);
                      }}
                    />
                    <span>
                      <strong>{t('readyConfirmation')}</strong>
                      <small>{t('launchHint')}</small>
                    </span>
                  </label>
                  <button
                    className="vi-primary"
                    disabled={!ready}
                    onMouseEnter={() => {
                      if (ready) hover(640);
                    }}
                    onClick={() => {
                      sound.playEnter();
                      onDeploy(difficulty, map, duration);
                    }}
                  >
                    {t('launchOperation')}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </section>

      <footer className="vi-screen__footer">
        <span>{t('commander')} // {alias.toUpperCase()}</span>
        <span>{t('preparation')} // 01</span>
      </footer>
    </main>
  );
}
