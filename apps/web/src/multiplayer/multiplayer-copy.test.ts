import { describe, expect, it } from 'vitest';
import { isMultiplayerErrorReason, MULTIPLAYER_ERROR_REASONS, MULTIPLAYER_KEYS, multiplayerErrorText, multiplayerText } from './multiplayer-copy';

/** The Spanish texts session.ts and campaign-transport.ts showed before they moved here. */
const SPANISH_ERRORS = {
  authentication_required: 'Inicia sesión de nuevo para entrar a la sala.',
  already_in_room: 'Esta cuenta ya está en la sala. Usa otra cuenta para el segundo jugador.',
  unsupported_version: 'El cliente y el servidor usan versiones distintas. Recarga la página.',
  invalid_join: 'Revisa el nombre del jugador y el código de la sala.',
  stale_sequence: 'La conexión se está sincronizando. Intenta la orden de nuevo.',
  paused: 'La partida está pausada mientras un jugador se reconecta.',
  not_in_sector: 'Espera a que comience el sector para dar órdenes.',
  opening_selection: 'Elige tu aumento para empezar el sector.',
  rate_limit: 'Demasiadas órdenes seguidas.',
  invalid_augment_pick: 'Esa carta ya no está disponible.',
  augment_reroll_used_or_expired: 'No quedan renovaciones para esta oferta.',
  full: 'La sala está completa.',
  started: 'La partida ya comenzó.',
  not_found: 'No se encontró la sala. Revisa el código.',
  network: 'No se pudo conectar con la sala. Comprueba la conexión e intenta de nuevo.',
  expired: 'La sesión de la sala caducó. Crea una sala o entra con su código.',
  room_code: 'El código de sala debe tener 12 caracteres (0–9, A–F).',
  connection_lost: 'Se perdió la conexión con la sala. Intenta reconectar.',
} as const;

describe('multiplayer copy', () => {
  it('keeps every Spanish room error byte for byte', () => {
    expect([...MULTIPLAYER_ERROR_REASONS].sort()).toEqual(Object.keys(SPANISH_ERRORS).sort());
    for (const [reason, text] of Object.entries(SPANISH_ERRORS)) {
      expect(isMultiplayerErrorReason(reason)).toBe(true);
      expect(multiplayerErrorText('es', reason as keyof typeof SPANISH_ERRORS)).toBe(text);
    }
    expect(isMultiplayerErrorReason('fleet_full_in_some_future')).toBe(false);
    expect(isMultiplayerErrorReason('constructor')).toBe(false);
  });

  it('keeps the Spanish campaign notices', () => {
    expect(multiplayerText('es', 'noticeReconnecting')).toBe('Reconectando con la sala…');
    expect(multiplayerText('es', 'noticeConnecting')).toBe('Conectando con la sala…');
    expect(multiplayerText('es', 'noticeConnectionLost')).toBe('Se perdió la conexión con la sala.');
    expect(multiplayerText('es', 'noticeSyncing')).toBe('Sincronizando la partida…');
    expect(multiplayerText('es', 'noticePaused', { name: 'Beto' })).toBe('Partida pausada: esperando la reconexión de Beto.');
    expect(multiplayerText('es', 'noticeSomePlayer')).toBe('un jugador');
    expect(multiplayerText('es', 'noticeResume', { seconds: 3 })).toBe('La partida continúa en 3 s…');
    expect(multiplayerText('es', 'noticeCountdown', { seconds: 5 })).toBe('La partida comienza en 5 s…');
    expect(multiplayerText('es', 'noticeTransition', { sector: 2 })).toBe('Sector 2 completado. Preparando el siguiente sector…');
    expect(multiplayerText('es', 'noticeAnnulled')).toBe('La partida fue anulada.');
    expect(multiplayerText('es', 'noticeDraw')).toBe('La campaña terminó en empate.');
    expect(multiplayerText('es', 'noticeForfeit')).toBe('La campaña terminó por abandono de un jugador.');
  });

  it('writes every English text without Spanish characters, placeholders included', () => {
    for (const key of MULTIPLAYER_KEYS) {
      const english = multiplayerText('en', key);
      expect(english).not.toMatch(/[áéíóúñ¿¡]/u);
      expect(english).not.toBe(multiplayerText('es', key));
      expect(english.match(/\{\w+\}/g) ?? []).toEqual(multiplayerText('es', key).match(/\{\w+\}/g) ?? []);
    }
    expect(multiplayerText('en', 'noticePaused', { name: 'Beto' })).toBe('Match paused: waiting for Beto to reconnect.');
    expect(multiplayerErrorText('en', 'full')).toBe('The room is full.');
  });
});
