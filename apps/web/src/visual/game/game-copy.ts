import { formatMessage, type Locale, type MessageValues } from '../i18n';
import type { CoreHud } from './hud-logic';
import type { SquadViewModel } from './model';

/**
 * Match copy that lives next to the battlefield: server rejections and connection notices (keyed by their code, so a
 * `noticeCode` reads straight from here), labels the scene draws on the map, the hangar, the in-match menu and the
 * result dialog. The Spanish rejections are exactly the adapter's REJECTION_TEXT.
 */
const es = {
  // Server rejections, by code.
  insufficient_metal: 'No alcanza el Metal.',
  not_owner: 'Eso no es tuyo.',
  fleet_full: 'Flota completa.',
  production_busy: 'El hangar ya está construyendo.',
  upgrade_maxed: 'Esta mejora ya está al máximo.',
  module_busy: 'La base ya está construyendo un módulo.',
  module_built: 'Ese módulo ya está construido.',
  module_locked: 'Primero construye la Refinería.',
  module_slots_full: 'No quedan espacios para módulos.',
  surrender_locked: 'Todavía no puedes rendirte.',
  blocked_destination: 'No se puede volar a ese punto.',
  unreachable_destination: 'No hay ruta hasta ese punto.',
  target_not_visible: 'El objetivo no está a la vista.',
  target_unavailable: 'Ese guardián todavía no se puede atacar.',
  cannot_attack: 'El Explorador no ataca.',
  route_full: 'Ruta llena.',
  rate_limit: 'Demasiadas órdenes seguidas.',
  production_queue_full: 'Cola del hangar llena.',
  paused: 'Partida en pausa.',
  pause_unavailable: 'La pausa no está disponible en esta partida.',
  unknown_squad: 'Esa nave ya no existe.',
  squad_destroyed: 'Esa nave fue destruida.',
  target_destroyed: 'El objetivo ya fue destruido.',
  friendly_target: 'No puedes atacar a tu propia flota.',
  out_of_bounds: 'Ese punto está fuera del mapa.',
  match_finished: 'La partida ya terminó.',
  invalid_command: 'Orden no válida.',
  budget_exceeded: 'No se puede calcular esa ruta ahora.',
  // Connection notices, by code.
  connecting: 'Conectando con el servidor…',
  connection_lost: 'Se perdió la conexión con el servidor.',
  connect_failed: 'No se pudo conectar con el servidor.',
  // Labels the scene draws on the map.
  guardianTurret: 'TORRETA',
  guardianBarrier: 'BARRERA',
  guardianCore: 'GUARDIÁN Ω',
  guardianNode: 'GUARDIÁN',
  beltWarning: '⚠ CINTURÓN {seconds}',
  nebulaWarning: '⚠ NIEBLA {seconds}',
  mapSizeError: 'El mapa del sector no tiene el tamaño esperado.',
  coreTagContested: 'DISPUTADO',
  coreTagGuardian: 'Guardián Ω',
  coreTagProgress: '{percent}% · {seconds} s',
  coreTagPercent: '{percent}%',
  // Core panel of the HUD.
  coreHintGuardian: 'Derriba al Guardián Ω',
  coreHintContested: 'Ambos bandos dentro',
  coreHintCapture: 'Captura en {seconds} s',
  matchPaused: 'EN PAUSA',
  // Hangar.
  hangarReady: 'Listo para construir',
  hangarFull: 'Flota completa',
  hangarBuilding: '{ship} · {seconds} s',
  hangarQueue: 'Cola del hangar',
  cancelOrder: 'Cancelar {ship} (reembolso +{refund} Metal)',
  blockQueueFull: 'Cola del hangar llena',
  blockFleetFull: 'Flota completa',
  blockMetal: 'Falta Metal',
  blockForbidden: 'No disponible en este sector',
  blockFinished: 'La partida terminó',
  stationHeader: 'Estación {n} · entrega inmediata',
  stationPrice: '{cost} M · ×3',
  // Top controls and in-match menu.
  menu: 'Menú',
  development: 'Desarrollo',
  menuPausedTitle: 'Partida en pausa',
  menuLiveTitle: 'Menú · la partida sigue en curso',
  menuResume: 'Reanudar',
  menuSettings: 'Configuración',
  menuLeave: 'Salir',
  menuEscapeHint: 'Esc vuelve a la partida',
  // Results.
  resultVictory: 'Victoria',
  resultDefeat: 'Derrota',
  resultVictoryTitle: 'VICTORIA',
  resultDefeatTitle: 'DERROTA',
  resultVictoryBody: 'Victoria. Tu flota controla el sector.',
  resultDefeatBody: 'Derrota. Reagrupa la flota y vuelve a intentarlo.',
  resultForfeit: 'Un jugador abandonó la partida.',
  resultCampaignOver: 'La campaña ha terminado.',
  playAgain: 'Jugar de nuevo',
  backToCommand: 'Volver al mando',
  leave: 'Salir',
  nextSector: 'Siguiente sector',
  preparingSector: 'Preparando sector {sector}',
  nextSectorIn: 'El siguiente sector comienza en {seconds} s.',
  matchEnded: 'Partida finalizada',
  matchAnnulled: 'Partida anulada',
  matchDraw: 'Empate',
} as const;

export type GameTextKey = keyof typeof es;

const en: Record<GameTextKey, string> = {
  insufficient_metal: 'Not enough Metal.',
  not_owner: 'That is not yours.',
  fleet_full: 'Fleet full.',
  production_busy: 'The hangar is already building.',
  upgrade_maxed: 'This upgrade is already at its maximum.',
  module_busy: 'The base is already building a module.',
  module_built: 'That module is already built.',
  module_locked: 'Build the Refinery first.',
  module_slots_full: 'No module slots left.',
  surrender_locked: 'You cannot surrender yet.',
  blocked_destination: 'Ships cannot fly to that point.',
  unreachable_destination: 'There is no route to that point.',
  target_not_visible: 'The target is out of sight.',
  target_unavailable: 'That guardian cannot be attacked yet.',
  cannot_attack: 'The Explorer does not attack.',
  route_full: 'Route full.',
  rate_limit: 'Too many orders in a row.',
  production_queue_full: 'Hangar queue is full.',
  paused: 'Match paused.',
  pause_unavailable: 'Pause is not available in this match.',
  unknown_squad: 'That ship no longer exists.',
  squad_destroyed: 'That ship was destroyed.',
  target_destroyed: 'The target is already destroyed.',
  friendly_target: 'You cannot attack your own fleet.',
  out_of_bounds: 'That point is off the map.',
  match_finished: 'The match is over.',
  invalid_command: 'Invalid order.',
  budget_exceeded: 'That route cannot be worked out right now.',
  connecting: 'Connecting to the server…',
  connection_lost: 'Lost the connection to the server.',
  connect_failed: 'Could not connect to the server.',
  guardianTurret: 'TURRET',
  guardianBarrier: 'BARRIER',
  guardianCore: 'GUARDIAN Ω',
  guardianNode: 'GUARDIAN',
  beltWarning: '⚠ BELT {seconds}',
  nebulaWarning: '⚠ FOG {seconds}',
  mapSizeError: 'The sector map does not have the expected size.',
  coreTagContested: 'CONTESTED',
  coreTagGuardian: 'Guardian Ω',
  coreTagProgress: '{percent}% · {seconds} s',
  coreTagPercent: '{percent}%',
  coreHintGuardian: 'Take down Guardian Ω',
  coreHintContested: 'Both sides inside',
  coreHintCapture: 'Captured in {seconds} s',
  matchPaused: 'PAUSED',
  hangarReady: 'Ready to build',
  hangarFull: 'Fleet full',
  hangarBuilding: '{ship} · {seconds} s',
  hangarQueue: 'Hangar queue',
  cancelOrder: 'Cancel {ship} (refund +{refund} Metal)',
  blockQueueFull: 'Hangar queue full',
  blockFleetFull: 'Fleet full',
  blockMetal: 'Not enough Metal',
  blockForbidden: 'Not available in this sector',
  blockFinished: 'The match is over',
  stationHeader: 'Station {n} · instant delivery',
  stationPrice: '{cost} M · ×3',
  menu: 'Menu',
  development: 'Development',
  menuPausedTitle: 'Match paused',
  menuLiveTitle: 'Menu · the match is still running',
  menuResume: 'Resume',
  menuSettings: 'Settings',
  menuLeave: 'Leave',
  menuEscapeHint: 'Esc returns to the match',
  resultVictory: 'Victory',
  resultDefeat: 'Defeat',
  resultVictoryTitle: 'VICTORY',
  resultDefeatTitle: 'DEFEAT',
  resultVictoryBody: 'Victory. Your fleet holds the sector.',
  resultDefeatBody: 'Defeat. Regroup the fleet and try again.',
  resultForfeit: 'A player left the match.',
  resultCampaignOver: 'The campaign has ended.',
  playAgain: 'Play again',
  backToCommand: 'Back to command center',
  leave: 'Leave',
  nextSector: 'Next sector',
  preparingSector: 'Preparing sector {sector}',
  nextSectorIn: 'The next sector starts in {seconds} s.',
  matchEnded: 'Match ended',
  matchAnnulled: 'Match cancelled',
  matchDraw: 'Draw',
};

export const GAME_TEXT: { readonly es: Record<GameTextKey, string>; readonly en: Record<GameTextKey, string> } = { es, en };

/** The match text for `key` in `locale`, with its `{placeholders}` filled. */
export function gameText(locale: Locale, key: GameTextKey, values?: MessageValues): string {
  return formatMessage((locale === 'es' ? es : en)[key], values);
}

/** Whether a code (a server rejection or connection notice) has its own text here. */
export function hasGameText(code: string): code is GameTextKey {
  return Object.hasOwn(es, code);
}

/** A notice in the player's language when its code is known; the text it came with otherwise. */
export function noticeText(locale: Locale, code: string | null, fallback: string): string {
  return code && hasGameText(code) ? gameText(locale, code) : fallback;
}

/**
 * The tag floating by the Core on the map, from what the HUD says about it: nothing while it is locked; the dispute
 * or the guardian that stops a capture; the captor's progress and countdown; otherwise any progress left on it.
 */
export function coreTag(locale: Locale, hud: CoreHud): string | null {
  if (hud.status === 'locked') return null;
  if (hud.hint === 'contested') return gameText(locale, 'coreTagContested');
  if (hud.hint === 'guardian') return gameText(locale, 'coreTagGuardian');
  if (hud.secondsLeft !== null) return gameText(locale, 'coreTagProgress', { percent: hud.percent, seconds: Math.ceil(hud.secondsLeft) });
  return hud.percent > 0 ? gameText(locale, 'coreTagPercent', { percent: hud.percent }) : null;
}

/** The Core panel's hint: why nobody is taking an open Core, or when the captor takes it. Null while locked or idle. */
export function coreHint(locale: Locale, hud: CoreHud): string | null {
  if (hud.status === 'locked') return null;
  if (hud.hint === 'contested') return gameText(locale, 'coreHintContested');
  if (hud.hint === 'guardian') return gameText(locale, 'coreHintGuardian');
  return hud.secondsLeft === null ? null : gameText(locale, 'coreHintCapture', { seconds: Math.ceil(hud.secondsLeft) });
}

const GUARDIAN_LABEL: Record<NonNullable<SquadViewModel['guardianKind']>, GameTextKey> = {
  turret: 'guardianTurret', barrier: 'guardianBarrier', core: 'guardianCore', node: 'guardianNode',
};

/** What the map writes under a neutral guardian: the post it holds. */
export function guardianLabel(locale: Locale, kind: NonNullable<SquadViewModel['guardianKind']>): string {
  return gameText(locale, GUARDIAN_LABEL[kind]);
}
