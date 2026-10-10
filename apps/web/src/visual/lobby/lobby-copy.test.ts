import { describe, expect, it } from 'vitest';
import { LOBBY_KEYS, lobbyText } from './lobby-copy';

describe('lobby copy', () => {
  it('keeps the Spanish texts the lobby showed before', () => {
    expect(lobbyText('es', 'difficultyLegend')).toBe('Dificultad de la IA rival');
    expect([lobbyText('es', 'difficultyEasy'), lobbyText('es', 'difficultyEasyHint')]).toEqual(['Fácil', 'Flota chica y lenta. No ataca tus nodos.']);
    expect([lobbyText('es', 'difficultyMedium'), lobbyText('es', 'difficultyMediumHint')]).toEqual(['Media', 'Se expande rápido y pelea por todo.']);
    expect([lobbyText('es', 'difficultyHard'), lobbyText('es', 'difficultyHardHint')]).toEqual(['Difícil', 'Toma dos nodos a la vez y asalta los tuyos.']);
  });

  it('names the map preview in both languages', () => {
    expect(lobbyText('es', 'mapPreview', { map: 'Espiral Estelar' })).toBe('Vista previa de Espiral Estelar');
    expect(lobbyText('en', 'mapPreview', { map: 'Stellar Spiral' })).toBe('Preview of Stellar Spiral');
  });

  it('writes every English text without Spanish characters', () => {
    for (const key of LOBBY_KEYS) {
      expect(lobbyText('en', key)).not.toMatch(/[áéíóúñ¿¡]/u);
      expect(lobbyText('en', key)).not.toBe('');
    }
  });
});
