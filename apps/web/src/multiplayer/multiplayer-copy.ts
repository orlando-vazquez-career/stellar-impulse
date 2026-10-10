import { formatMessage, type Locale } from '../visual/i18n';

/** What the campaign room tells the player: the HUD notices and why a room operation failed. */
const es = {
  noticeReconnecting: 'Reconectando con la sala…',
  noticeConnecting: 'Conectando con la sala…',
  noticeConnectionLost: 'Se perdió la conexión con la sala.',
  noticeSyncing: 'Sincronizando la partida…',
  noticePaused: 'Partida pausada: esperando la reconexión de {name}.',
  noticeSomePlayer: 'un jugador',
  noticeResume: 'La partida continúa en {seconds} s…',
  noticeCountdown: 'La partida comienza en {seconds} s…',
  noticeTransition: 'Sector {sector} completado. Preparando el siguiente sector…',
  noticeAnnulled: 'La partida fue anulada.',
  noticeDraw: 'La campaña terminó en empate.',
  noticeForfeit: 'La campaña terminó por abandono de un jugador.',
  errorAuthentication: 'Inicia sesión de nuevo para entrar a la sala.',
  errorAlreadyInRoom: 'Esta cuenta ya está en la sala. Usa otra cuenta para el segundo jugador.',
  errorVersion: 'El cliente y el servidor usan versiones distintas. Recarga la página.',
  errorInvalidJoin: 'Revisa el nombre del jugador y el código de la sala.',
  errorStaleSequence: 'La conexión se está sincronizando. Intenta la orden de nuevo.',
  errorPaused: 'La partida está pausada mientras un jugador se reconecta.',
  errorNotInSector: 'Espera a que comience el sector para dar órdenes.',
  errorOpeningSelection: 'Elige tu aumento para empezar el sector.',
  errorRateLimit: 'Demasiadas órdenes seguidas.',
  errorAugmentPick: 'Esa carta ya no está disponible.',
  errorAugmentReroll: 'No quedan renovaciones para esta oferta.',
  errorFull: 'La sala está completa.',
  errorStarted: 'La partida ya comenzó.',
  errorNotFound: 'No se encontró la sala. Revisa el código.',
  errorNetwork: 'No se pudo conectar con la sala. Comprueba la conexión e intenta de nuevo.',
  errorExpired: 'La sesión de la sala caducó. Crea una sala o entra con su código.',
  errorRoomCode: 'El código de sala debe tener 12 caracteres (0–9, A–F).',
  errorConnectionLost: 'Se perdió la conexión con la sala. Intenta reconectar.',
} as const;

const en: Record<keyof typeof es, string> = {
  noticeReconnecting: 'Reconnecting to the room…',
  noticeConnecting: 'Connecting to the room…',
  noticeConnectionLost: 'The connection to the room was lost.',
  noticeSyncing: 'Synchronizing the match…',
  noticePaused: 'Match paused: waiting for {name} to reconnect.',
  noticeSomePlayer: 'a player',
  noticeResume: 'The match resumes in {seconds} s…',
  noticeCountdown: 'The match starts in {seconds} s…',
  noticeTransition: 'Sector {sector} cleared. Preparing the next sector…',
  noticeAnnulled: 'The match was annulled.',
  noticeDraw: 'The campaign ended in a draw.',
  noticeForfeit: 'The campaign ended because a player left.',
  errorAuthentication: 'Sign in again to enter the room.',
  errorAlreadyInRoom: 'This account is already in the room. Use another account for the second player.',
  errorVersion: 'The client and the server run different versions. Reload the page.',
  errorInvalidJoin: 'Check the player name and the room code.',
  errorStaleSequence: 'The connection is synchronizing. Try the order again.',
  errorPaused: 'The match is paused while a player reconnects.',
  errorNotInSector: 'Wait for the sector to start before giving orders.',
  errorOpeningSelection: 'Choose your augment to start the sector.',
  errorRateLimit: 'Too many orders in a row.',
  errorAugmentPick: 'That card is no longer available.',
  errorAugmentReroll: 'No rerolls left for this offer.',
  errorFull: 'The room is full.',
  errorStarted: 'The match has already started.',
  errorNotFound: 'The room was not found. Check the code.',
  errorNetwork: 'Could not connect to the room. Check your connection and try again.',
  errorExpired: 'The room session expired. Create a room or join with its code.',
  errorRoomCode: 'The room code must have 12 characters (0–9, A–F).',
  errorConnectionLost: 'The connection to the room was lost. Try reconnecting.',
};

export type MultiplayerKey = keyof typeof es;
export const MULTIPLAYER_KEYS = Object.keys(es) as MultiplayerKey[];

export function multiplayerText(locale: Locale, key: MultiplayerKey, values?: Record<string, string | number>) {
  return formatMessage((locale === 'en' ? en : es)[key], values);
}

/**
 * Why a room operation failed, as `MultiplayerSnapshot.errorReason` carries it: the server's own code when
 * the client knows it (authentication_required, rate_limit…), otherwise the kind of failure the client saw.
 */
const ERROR_KEY = {
  authentication_required: 'errorAuthentication',
  already_in_room: 'errorAlreadyInRoom',
  unsupported_version: 'errorVersion',
  invalid_join: 'errorInvalidJoin',
  stale_sequence: 'errorStaleSequence',
  paused: 'errorPaused',
  not_in_sector: 'errorNotInSector',
  opening_selection: 'errorOpeningSelection',
  rate_limit: 'errorRateLimit',
  invalid_augment_pick: 'errorAugmentPick',
  augment_reroll_used_or_expired: 'errorAugmentReroll',
  full: 'errorFull',
  started: 'errorStarted',
  not_found: 'errorNotFound',
  network: 'errorNetwork',
  expired: 'errorExpired',
  room_code: 'errorRoomCode',
  connection_lost: 'errorConnectionLost',
} as const satisfies Record<string, MultiplayerKey>;

export type MultiplayerErrorReason = keyof typeof ERROR_KEY;
export const MULTIPLAYER_ERROR_REASONS = Object.keys(ERROR_KEY) as MultiplayerErrorReason[];

export function isMultiplayerErrorReason(value: string): value is MultiplayerErrorReason {
  return Object.hasOwn(ERROR_KEY, value);
}

export function multiplayerErrorText(locale: Locale, reason: MultiplayerErrorReason): string {
  return multiplayerText(locale, ERROR_KEY[reason]);
}
