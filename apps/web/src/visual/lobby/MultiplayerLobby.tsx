import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { DEFAULT_CAMPAIGN_MAP, PLAYABLE_MAPS, type PlayableMapId } from '@impulso/input';
import type { MultiplayerSession } from '../../multiplayer/session';
import { useSpaceSound } from '../../login/sound';
import { useI18n } from '../i18n';
import { createCommandSpaceScene } from '../menu/command-space';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';
import './lobby.css';
import './multiplayer-lobby.css';

const messages = {
  es: {
    eyebrow: 'PREPARACIÓN MULTIJUGADOR',
    createTitle: 'Reúne a tu rival.',
    joinTitle: 'Entra a la operación.',
    body: 'Comparte el código de sala. La partida comienza cuando los dos comandantes están conectados y listos.',
    room: 'Sala privada',
    roomName: 'Nombre en la sala',
    roomNameHint: 'Usa de 1 a 24 letras, números, espacios, guion, punto o guion bajo.',
    create: 'Crear sala',
    createHint: 'Crea una sala para dos jugadores y comparte su código con otro comandante.',
    join: 'Unirse a sala',
    joinHint: 'Pega el código compartido. Puedes usar mayúsculas o minúsculas.',
    joinPlaceholder: 'Pega el código de sala',
    roomCode: 'Código de sala',
    shareHint: 'Comparte este código para que el segundo jugador entre.',
    copy: 'Copiar código',
    copied: 'Código copiado.',
    copyFailed: 'No se pudo copiar. Selecciona el código y cópialo manualmente.',
    waitingRoom: 'Esperando datos de sala…',
    idle: 'Sin conexión a sala',
    connecting: 'Conectando con la sala…',
    online: 'Conectado a la sala',
    reconnecting: 'Reconectando con la sala…',
    offline: 'Conexión interrumpida',
    leaving: 'Saliendo de la sala…',
    participants: 'Comandantes',
    you: 'Tú',
    blueFleet: 'Flota azul',
    redFleet: 'Flota roja',
    ready: 'Listo',
    notReady: 'No listo',
    disconnected: 'Desconectado',
    emptySeat: 'Esperando comandante',
    availableSeat: 'Asiento disponible',
    readyButton: 'Estoy listo',
    readyConfirmed: 'Estás listo',
    waitingPlayer: 'Esperando al segundo jugador. Puedes confirmar que estás listo mientras llega.',
    waitingReady: 'Esperando al otro jugador. Debe confirmar que está listo.',
    confirmReady: 'Los dos están en la sala. Confirma que estás listo para comenzar.',
    waitingConnected: 'Esperando a que el otro comandante vuelva a conectarse.',
    waitingConnection: 'Recupera la conexión para confirmar que estás listo.',
    waitingCountdown: 'Preparando el despliegue de ambos jugadores…',
    countdown: 'Despliegue en',
    countdownHint: 'Ambos comandantes están listos. La partida está por comenzar.',
    operationBrief: 'Campo de batalla',
    map: 'Mapa',
    format: 'Formato',
    formatValue: '1 contra 1',
    seats: 'Asignación de flota',
    seatsValue: 'Automática al entrar',
    objective: 'Objetivo',
    objectiveValue: 'Capturar y mantener el Núcleo',
    rules: 'Cada comandante dirige su propia flota. Los movimientos y el estado de la partida se comparten en tiempo real.',
    back: 'Volver al mando',
    commander: 'Comandante',
    errorFull: 'La sala está completa. Pide otro código o crea una nueva sala.',
    errorCode: 'No se encontró esa sala. Revisa el código y vuelve a intentarlo.',
    errorName: 'Revisa el nombre en la sala y el código. Puedes corregirlos antes de volver a intentarlo.',
    errorMap: 'Esta sala usa un mapa que aún no está disponible en esta interfaz. Crea una sala multijugador desde el centro de mando.',
    errorSession: 'Tu sesión caducó. Vuelve al centro de mando e inicia sesión de nuevo.',
    errorNetwork: 'No se pudo conectar con la sala. Revisa tu conexión y vuelve a intentarlo.',
    errorActive: 'La partida ya comenzó. Pide el código de una nueva sala.',
    errorMembership: 'Tu cuenta ya está en otra sala. Sal de ella antes de volver a intentarlo.',
  },
  en: {
    eyebrow: 'MULTIPLAYER PREPARATION',
    createTitle: 'Gather your opponent.',
    joinTitle: 'Enter the operation.',
    body: 'Share the room code. The match begins when both commanders are connected and ready.',
    room: 'Private room',
    roomName: 'Room name',
    roomNameHint: 'Use 1 to 24 letters, numbers, spaces, hyphens, periods or underscores.',
    create: 'Create room',
    createHint: 'Create a room for two players and share its code with another commander.',
    join: 'Join room',
    joinHint: 'Paste the shared code. You can use uppercase or lowercase letters.',
    joinPlaceholder: 'Paste the room code',
    roomCode: 'Room code',
    shareHint: 'Share this code so the second player can join.',
    copy: 'Copy code',
    copied: 'Code copied.',
    copyFailed: 'Could not copy. Select the code and copy it manually.',
    waitingRoom: 'Waiting for room data…',
    idle: 'No room connection',
    connecting: 'Connecting to the room…',
    online: 'Connected to the room',
    reconnecting: 'Reconnecting to the room…',
    offline: 'Connection interrupted',
    leaving: 'Leaving the room…',
    participants: 'Commanders',
    you: 'You',
    blueFleet: 'Blue fleet',
    redFleet: 'Red fleet',
    ready: 'Ready',
    notReady: 'Not ready',
    disconnected: 'Disconnected',
    emptySeat: 'Waiting for commander',
    availableSeat: 'Available seat',
    readyButton: 'I am ready',
    readyConfirmed: 'You are ready',
    waitingPlayer: 'Waiting for the second player. You can confirm you are ready while they join.',
    waitingReady: 'Waiting for the other commander to confirm they are ready.',
    confirmReady: 'Both players are in the room. Confirm you are ready to begin.',
    waitingConnected: 'Waiting for the other commander to reconnect.',
    waitingConnection: 'Restore your connection to confirm you are ready.',
    waitingCountdown: 'Preparing deployment for both players…',
    countdown: 'Deployment in',
    countdownHint: 'Both commanders are ready. The match is about to begin.',
    operationBrief: 'Battlefield',
    map: 'Map',
    format: 'Format',
    formatValue: '1 versus 1',
    seats: 'Fleet assignment',
    seatsValue: 'Automatic on entry',
    objective: 'Objective',
    objectiveValue: 'Capture and hold the Core',
    rules: 'Each commander leads their own fleet. Movements and match state are shared in real time.',
    back: 'Back to command center',
    commander: 'Commander',
    errorFull: 'The room is full. Ask for another code or create a new room.',
    errorCode: 'That room could not be found. Check the code and try again.',
    errorName: 'Check the room name and code. You can edit them before trying again.',
    errorMap: 'This room uses a map that is not available in this interface yet. Create a multiplayer room from the command center.',
    errorSession: 'Your session expired. Return to the command center and sign in again.',
    errorNetwork: 'Could not connect to the room. Check your connection and try again.',
    errorActive: 'The match has already begun. Ask for a new room code.',
    errorMembership: 'Your account is already in another room. Leave it before trying again.',
  },
} as const;

type LobbyMessages = (typeof messages)[keyof typeof messages];

function roomError(error: string, copy: LobbyMessages): string {
  const normalized = error.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/full|completa|capacity|maxclients/.test(normalized)) return copy.errorFull;
  if (/already_in_room|ya.+(?:otra|una|la) sala/.test(normalized)) return copy.errorMembership;
  if (/started|ya comenzo|en curso|partida.+comenz/.test(normalized)) return copy.errorActive;
  if (/session|sesion|authentication|unauthorized|expired|token/.test(normalized)) return copy.errorSession;
  if (/mapa|\bmap\b/.test(normalized)) return copy.errorMap;
  if (/invalid_join|nombre|room name|player name/.test(normalized)) return copy.errorName;
  if (/not_found|not found|no se encontro|codigo|code|invalid.*room/.test(normalized)) return copy.errorCode;
  return copy.errorNetwork;
}

export interface MultiplayerLobbyProps {
  alias: string;
  token: string;
  mode: 'create' | 'join';
  session: MultiplayerSession;
  initialJoinCode?: string;
  onBack(): void;
}

export function MultiplayerLobby({ alias, token, mode, session, initialJoinCode = '', onBack }: MultiplayerLobbyProps) {
  const { locale } = useI18n();
  const copy = messages[locale];
  const sound = useSpaceSound();
  const canvas = useRef<HTMLCanvasElement>(null);
  const leavingRef = useRef(false);
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getSnapshot = useCallback(() => session.getSnapshot(), [session]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [roomName, setRoomName] = useState(alias);
  const [map, setMap] = useState<PlayableMapId>(DEFAULT_CAMPAIGN_MAP);
  const validRoomName = /^[\p{L}\p{N} _.-]{1,24}$/u.test(roomName.trim());
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const phase = snapshot.phase;
  const selectedMap = PLAYABLE_MAPS.find((option) => option.id === (phase?.renderMap ?? map)) ?? PLAYABLE_MAPS[0];
  const joined = Boolean(snapshot.roomId);
  const busy = pending || leaving || snapshot.connection === 'connecting' || snapshot.connection === 'reconnecting';
  const ownSeat = phase ? phase.seats[phase.playerId] : null;
  const rivalSeat = phase ? phase.seats[phase.playerId === 'p1' ? 'p2' : 'p1'] : null;
  const occupiedSeats = phase ? Object.values(phase.seats).filter(Boolean).length : 0;
  const canReady = snapshot.connection === 'online' && phase?.phase === 'lobby' && Boolean(ownSeat?.connected) && !ownSeat?.ready && !leaving;
  const connectionMessage = leaving ? copy.leaving : copy[snapshot.connection];

  useEffect(() => {
    const element = canvas.current;
    if (!element || element.closest('.is-reduced-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const scene = createCommandSpaceScene(element);
    scene.start();
    const onResize = () => scene.resize();
    const onPointer = (event: PointerEvent) => scene.setPointer(
      (event.clientX / window.innerWidth) * 2 - 1,
      (event.clientY / window.innerHeight) * 2 - 1,
    );
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointer);
    return () => {
      scene.stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  useEffect(() => setCopyState('idle'), [snapshot.roomId]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy || joined || leavingRef.current || !validRoomName || (mode === 'join' && !joinCode.trim())) return;
    sound.playSelect();
    setPending(true);
    try {
      if (mode === 'create') await session.create(roomName.trim(), token, map);
      else await session.join(joinCode.trim(), roomName.trim(), token);
    } catch {
      // The session publishes the connection error for this operation.
    } finally {
      if (!leavingRef.current) setPending(false);
    }
  }

  async function leave() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    sound.playSelect();
    try {
      await session.leave();
    } catch {
      // Local cancellation still lets the commander return to the menu.
    } finally {
      onBack();
    }
  }

  async function copyRoomCode() {
    if (!snapshot.roomId) return;
    sound.playSelect();
    try {
      await navigator.clipboard.writeText(snapshot.roomId);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  const preparationHint = snapshot.connection !== 'online' ? copy.waitingConnection
    : occupiedSeats < 2 ? copy.waitingPlayer
      : !rivalSeat?.connected ? copy.waitingConnected
        : !ownSeat?.ready ? copy.confirmReady
          : !rivalSeat?.ready ? copy.waitingReady
            : copy.waitingCountdown;

  return (
    <main className="vi-lobby vi-screen vi-multiplayer-lobby">
      <canvas ref={canvas} className="vi-lobby-canvas" aria-hidden="true" />
      <header className="vi-screen__header">
        <Brand />
        <div className="vi-header-actions">
          <LanguageToggle />
          <button className="vi-text-button" disabled={leaving} onClick={() => void leave()}>
            ← {copy.back}
          </button>
        </div>
      </header>

      <section className="vi-lobby__content">
        <div className="vi-lobby__heading">
          <div>
            <p className="vi-eyebrow">{copy.eyebrow}</p>
            <h1>{mode === 'create' ? copy.createTitle : copy.joinTitle}</h1>
          </div>
          <p>{copy.body}</p>
        </div>

        <div className="vi-lobby__grid">
          <section className="vi-lobby-card vi-briefing" aria-labelledby="multiplayer-brief-title">
            <header><h2 id="multiplayer-brief-title">{copy.operationBrief}</h2></header>
            <div className="vi-map-preview" aria-hidden="true">
              <div className="vi-map-preview__field">
                <i className="vi-map-preview__core" />
                <i className="vi-map-preview__blue" />
                <i className="vi-map-preview__red" />
              </div>
              <span>{selectedMap.name[locale]}</span>
            </div>
            <p className="vi-multiplayer-map-hint">{selectedMap.description[locale]}</p>
            <dl className="vi-briefing__data">
              <div><dt>{copy.map}</dt><dd>{selectedMap.name[locale]}</dd></div>
              <div><dt>{copy.format}</dt><dd>{copy.formatValue}</dd></div>
              <div><dt>{copy.seats}</dt><dd>{copy.seatsValue}</dd></div>
              <div><dt>{copy.objective}</dt><dd>{copy.objectiveValue}</dd></div>
            </dl>
            <p className="vi-multiplayer-rules">{copy.rules}</p>
            {mode === 'create' && !joined && (
              <fieldset className="vi-difficulty vi-map-select" disabled={busy}>
                <legend>{copy.map}</legend>
                {PLAYABLE_MAPS.map((option) => (
                  <button key={option.id} type="button" className={map === option.id ? 'is-selected' : ''}
                    aria-pressed={map === option.id} onClick={() => { sound.playSelect(); setMap(option.id); }}>
                    <strong>{option.name[locale]}</strong>
                    <small>{option.description[locale]}</small>
                  </button>
                ))}
              </fieldset>
            )}
          </section>

          <section className="vi-lobby-card vi-room vi-multiplayer-room" aria-labelledby="multiplayer-room-title">
            <header>
              <h2 id="multiplayer-room-title">{copy.room}</h2>
              <span className={`vi-room__status vi-multiplayer-connection is-${snapshot.connection}`} role="status" aria-live="polite">
                <i aria-hidden="true" />{connectionMessage}
              </span>
            </header>

            {snapshot.error && <p className="vi-multiplayer-error" role="alert">{roomError(snapshot.error, copy)}</p>}

            {!joined ? (
              <form className="vi-room__join vi-multiplayer-entry" aria-busy={busy} onSubmit={(event) => void connect(event)}>
                <div className="vi-multiplayer-name">
                  <label htmlFor="multiplayer-room-name">{copy.roomName}</label>
                  <input
                    id="multiplayer-room-name"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    aria-describedby="multiplayer-name-hint"
                    aria-invalid={!validRoomName}
                    autoComplete="nickname"
                    spellCheck={false}
                    disabled={busy}
                    maxLength={24}
                  />
                  <p id="multiplayer-name-hint">{copy.roomNameHint}</p>
                </div>
                {mode === 'join' ? (
                  <>
                    <label htmlFor="multiplayer-join-code">{copy.roomCode}</label>
                    <div>
                      <input
                        id="multiplayer-join-code"
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value)}
                        placeholder={copy.joinPlaceholder}
                        aria-describedby="multiplayer-entry-hint"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={busy}
                        maxLength={12}
                        autoFocus
                      />
                      <button type="submit" disabled={busy || !validRoomName || !joinCode.trim()}>{copy.join}</button>
                    </div>
                    <p id="multiplayer-entry-hint">{copy.joinHint}</p>
                  </>
                ) : (
                  <>
                    <p id="multiplayer-entry-hint">{copy.createHint}</p>
                    <button className="vi-primary" type="submit" disabled={busy || !validRoomName} aria-describedby="multiplayer-entry-hint">
                      {copy.create}<span aria-hidden="true">＋</span>
                    </button>
                  </>
                )}
              </form>
            ) : (
              <>
                <div className="vi-multiplayer-share">
                  <span>{copy.roomCode}</span>
                  <div>
                    <code data-testid="multiplayer-room-code">{snapshot.roomId}</code>
                    <button type="button" onClick={() => void copyRoomCode()}>{copy.copy}</button>
                  </div>
                  <p>{copy.shareHint}</p>
                  <p className="vi-multiplayer-copy-feedback" aria-live="polite">
                    {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
                  </p>
                </div>

                {phase ? (
                  <>
                    <section className="vi-room__section" aria-labelledby="multiplayer-participants-title">
                      <h3 id="multiplayer-participants-title">{copy.participants} <span>{occupiedSeats}/2</span></h3>
                      <div className="vi-commanders">
                        {(['p1', 'p2'] as const).map((playerId) => {
                          const seat = phase.seats[playerId];
                          const own = phase.playerId === playerId;
                          return (
                            <article
                              key={playerId}
                              className={`vi-commander vi-commander--${playerId === 'p1' ? 'blue' : 'red'}${!seat ? ' is-muted' : ''}`}
                              data-testid={`multiplayer-seat-${playerId}`}
                            >
                              <span className="vi-commander__mark" aria-hidden="true">{seat ? seat.name.slice(0, 1).toUpperCase() : '?'}</span>
                              <div>
                                <strong>{seat ? seat.name : copy.emptySeat}</strong>
                                <small>{own ? `${copy.you} · ` : ''}{playerId === 'p1' ? copy.blueFleet : copy.redFleet}</small>
                              </div>
                              <em className={seat?.connected && seat.ready ? 'is-ready' : ''}>
                                {!seat ? copy.availableSeat : !seat.connected ? copy.disconnected : seat.ready ? copy.ready : copy.notReady}
                              </em>
                            </article>
                          );
                        })}
                      </div>
                    </section>

                    {phase.phase === 'countdown' ? (
                      <section className="vi-multiplayer-countdown" aria-live="polite" aria-atomic="true">
                        <p>{copy.countdown} <strong>{Math.ceil((phase.remainingMs ?? 0) / 1000)}</strong></p>
                        <p>{copy.countdownHint}</p>
                      </section>
                    ) : (
                      <div className="vi-multiplayer-ready">
                        <p aria-live="polite">{preparationHint}</p>
                        <button
                          className="vi-primary"
                          type="button"
                          disabled={!canReady}
                          onClick={() => { sound.playSelect(); session.ready(); }}
                        >
                          {ownSeat?.ready ? copy.readyConfirmed : copy.readyButton}<span aria-hidden="true">{ownSeat?.ready ? '✓' : '→'}</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : <p className="vi-multiplayer-waiting">{copy.waitingRoom}</p>}
              </>
            )}
          </section>
        </div>
      </section>

      <footer className="vi-screen__footer">
        <span>{copy.commander} // {alias.toUpperCase()}</span>
        <span>{copy.formatValue} // {selectedMap.name[locale]}</span>
      </footer>
    </main>
  );
}
