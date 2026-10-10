import { describe, expect, it } from 'vitest';
import { coreHint, coreTag, GAME_TEXT, gameText, guardianLabel, hasGameText, noticeText } from './game-copy';
import type { CoreHud } from './hud-logic';
import { REJECTION_TEXT } from './server-adapter';

const placeholders = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('match copy', () => {
  it('has the same keys and placeholders in Spanish and English, none of them empty', () => {
    expect(Object.keys(GAME_TEXT.en).sort()).toEqual(Object.keys(GAME_TEXT.es).sort());
    for (const key of Object.keys(GAME_TEXT.es) as (keyof typeof GAME_TEXT.es)[]) {
      expect(GAME_TEXT.es[key].trim(), key).not.toBe('');
      expect(GAME_TEXT.en[key].trim(), key).not.toBe('');
      expect(placeholders(GAME_TEXT.en[key]), key).toEqual(placeholders(GAME_TEXT.es[key]));
    }
  });

  it('keeps Spanish spelling out of the English copy', () => {
    for (const [key, text] of Object.entries(GAME_TEXT.en)) expect(text, key).not.toMatch(/[áéíóúñ¿¡]/u);
  });

  it('says every server rejection exactly as the adapter does in Spanish', () => {
    expect(Object.keys(REJECTION_TEXT).length).toBeGreaterThanOrEqual(17);
    for (const [code, text] of Object.entries(REJECTION_TEXT)) {
      expect(hasGameText(code), code).toBe(true);
      expect(gameText('es', code as keyof typeof GAME_TEXT.es)).toBe(text);
    }
  });

  it('names the rejections the simulation can send that the adapter has no text for', () => {
    for (const code of ['unknown_squad', 'squad_destroyed', 'target_destroyed', 'friendly_target', 'out_of_bounds',
      'match_finished', 'invalid_command', 'budget_exceeded', 'production_queue_full', 'paused', 'pause_unavailable',
      'connecting', 'connection_lost', 'connect_failed']) {
      expect(hasGameText(code), code).toBe(true);
    }
    expect(gameText('en', 'production_queue_full')).toBe('Hangar queue is full.');
    expect(gameText('es', 'connect_failed')).toBe('No se pudo conectar con el servidor.');
  });

  it('fills placeholders and keeps the exact hangar lines the match tests look for', () => {
    expect(gameText('es', 'hangarReady')).toBe('Listo para construir');
    expect(gameText('es', 'hangarFull')).toBe('Flota completa');
    expect(gameText('es', 'hangarBuilding', { ship: 'Interceptor', seconds: 7 })).toBe('Interceptor · 7 s');
    expect(gameText('es', 'cancelOrder', { ship: 'Fragata', refund: 90 })).toBe('Cancelar Fragata (reembolso +90 Metal)');
    expect(gameText('en', 'beltWarning', { seconds: 4 })).toBe('⚠ BELT 4');
    expect(gameText('es', 'nebulaWarning', { seconds: 3 })).toBe('⚠ NIEBLA 3');
  });

  it('keeps the result dialog names the match tests look for', () => {
    expect(gameText('es', 'resultVictory')).toBe('Victoria');
    expect(gameText('es', 'resultDefeat')).toBe('Derrota');
    expect(gameText('es', 'playAgain')).toBe('Jugar de nuevo');
    expect(gameText('en', 'resultVictory')).toBe('Victory');
  });

  it('labels each neutral guardian by the post it holds', () => {
    expect(guardianLabel('es', 'turret')).toBe('TORRETA');
    expect(guardianLabel('en', 'turret')).toBe('TURRET');
    expect(guardianLabel('es', 'barrier')).toBe('BARRERA');
    expect(guardianLabel('en', 'barrier')).toBe('BARRIER');
    expect(guardianLabel('es', 'core')).toBe('GUARDIÁN Ω');
    expect(guardianLabel('en', 'core')).toBe('GUARDIAN Ω');
    expect(guardianLabel('es', 'node')).toBe('GUARDIÁN');
    expect(guardianLabel('en', 'node')).toBe('GUARDIAN');
  });

  it('tags the Core on the map with what the HUD says about it', () => {
    const hud = (change: Partial<CoreHud>): CoreHud => ({ status: 'idle', percent: 0, secondsLeft: null, hint: null, ...change });
    expect(coreTag('es', hud({ status: 'locked', percent: 40, secondsLeft: 30 }))).toBeNull();
    expect(coreTag('es', hud({ status: 'idle' }))).toBeNull();
    expect(coreTag('es', hud({ status: 'idle', percent: 34 }))).toBe('34%');
    expect(coreTag('es', hud({ status: 'capturing-own', percent: 62, secondsLeft: 11.2 }))).toBe('62% · 12 s');
    expect(coreTag('en', hud({ status: 'capturing-rival', percent: 5, secondsLeft: 20 }))).toBe('5% · 20 s');
    expect(coreTag('es', hud({ status: 'contested', percent: 40, hint: 'contested' }))).toBe('DISPUTADO');
    expect(coreTag('en', hud({ status: 'contested', percent: 40, hint: 'contested' }))).toBe('CONTESTED');
    expect(coreTag('es', hud({ status: 'idle', hint: 'guardian' }))).toBe('Guardián Ω');
    expect(coreTag('en', hud({ status: 'capturing-own', percent: 10, secondsLeft: 9, hint: 'guardian' }))).toBe('Guardian Ω');
  });

  it('gives the Core panel a hint for why nobody takes it or when the captor will', () => {
    const hud = (change: Partial<CoreHud>): CoreHud => ({ status: 'idle', percent: 0, secondsLeft: null, hint: null, ...change });
    expect(coreHint('es', hud({ status: 'locked', secondsLeft: 30 }))).toBeNull();
    expect(coreHint('es', hud({ status: 'idle' }))).toBeNull();
    expect(coreHint('es', hud({ status: 'contested', hint: 'contested' }))).toBe('Ambos bandos dentro');
    expect(coreHint('en', hud({ status: 'idle', hint: 'guardian' }))).toBe('Take down Guardian Ω');
    expect(coreHint('es', hud({ status: 'capturing-own', percent: 50, secondsLeft: 7.4 }))).toBe('Captura en 8 s');
  });

  it('translates a notice by its code and falls back to the text it came with', () => {
    expect(noticeText('en', 'paused', 'Partida en pausa.')).toBe('Match paused.');
    expect(noticeText('en', 'connection_lost', 'Se perdió la conexión con el servidor.')).toBe('Lost the connection to the server.');
    expect(noticeText('en', null, 'Fase de campaña')).toBe('Fase de campaña');
    expect(noticeText('en', 'stale_sequence', 'Orden rechazada.')).toBe('Orden rechazada.');
    // A code is never mistaken for an inherited object property.
    expect(hasGameText('toString')).toBe(false);
  });
});
