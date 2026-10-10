import { describe, expect, it } from 'vitest';
import { CONTRACT_CODES, contractText, MARKET_COPY_KEYS, marketText } from './market-copy';

describe('market copy', () => {
  it('writes English without Spanish accents or inverted marks', () => {
    for (const key of MARKET_COPY_KEYS) {
      expect(marketText('en', key), key).not.toMatch(/[áéíóúñ¿¡]/u);
      expect(marketText('en', key), key).not.toBe('');
    }
  });

  it('describes the menu card without naming the Hangar', () => {
    expect(marketText('es', 'cardTitle')).toBe('Mercado');
    expect(marketText('en', 'cardTitle')).toBe('Market');
    expect(marketText('es', 'cardDetail')).toBe('Compra y vende piezas NFT · Stellar Testnet');
    expect(marketText('en', 'cardDetail')).toBe('Buy and sell NFT pieces · Stellar Testnet');
    for (const locale of ['es', 'en'] as const) expect(marketText(locale, 'cardDetail')).not.toMatch(/hangar/i);
  });

  it('fills placeholders', () => {
    expect(marketText('es', 'listingsOfPiece', { count: 2 })).toContain('2');
  });

  it('words every contract refusal in both languages without its number', () => {
    for (const code of CONTRACT_CODES) {
      for (const locale of ['es', 'en'] as const) {
        const text = contractText(locale, code);
        expect(text, `${locale} #${code}`).toBeTruthy();
        expect(text).not.toContain('#');
      }
    }
    expect(contractText('es', 105)).toBe('El vendedor ya no tiene esta pieza.');
    expect(contractText('en', 42)).toBeNull();
  });
});
