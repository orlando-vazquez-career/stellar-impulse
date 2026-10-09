import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_COSMETICS } from '@impulso/chain';
import { canEquip, cosmeticCatalog, formatXlm, itemForClass } from './catalog';
import { parseXlm } from './HangarChainPanels';
import { cachedWallet, readOwnedClasses, writeOwnedClasses } from './ownership';

describe('NFT pieces in the hangar', () => {
  it('mirror every class of the on-chain catalog with the same family and price', () => {
    for (const piece of DEMO_COSMETICS) {
      const item = itemForClass(piece.classId);
      expect(item, piece.key).toBeDefined();
      expect(item!.id).toBe(piece.key);
      expect(item!.chain).toEqual({ classId: piece.classId, family: piece.family, priceStroops: piece.priceStroops });
    }
    expect(cosmeticCatalog.filter((item) => item.chain)).toHaveLength(DEMO_COSMETICS.length);
  });

  it('keeps a free piece in every category for players without a wallet', () => {
    for (const category of new Set(cosmeticCatalog.map((item) => item.category))) {
      expect(cosmeticCatalog.some((item) => item.category === category && canEquip(item, new Set()))).toBe(true);
    }
  });

  it('equips an NFT piece only when its class is owned', () => {
    const aurora = itemForClass(1)!;
    expect(canEquip(aurora, new Set())).toBe(false);
    expect(canEquip(aurora, new Set([1]))).toBe(true);
  });
});

describe('XLM amounts', () => {
  it('formats stroops the way players read prices', () => {
    expect(formatXlm(50_000_000n)).toBe('5 XLM');
    expect(formatXlm(25_000_000n)).toBe('2.5 XLM');
    expect(formatXlm(1n)).toBe('0.0000001 XLM');
  });

  it('parses a typed price and refuses nonsense', () => {
    expect(parseXlm('2.5')).toBe(25_000_000n);
    expect(parseXlm('3,25')).toBe(32_500_000n);
    expect(parseXlm('7')).toBe(70_000_000n);
    for (const bad of ['', '0', '-1', 'abc', '1.12345678', '1e3']) expect(parseXlm(bad)).toBeNull();
  });
});

describe('owned classes cache', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('belongs to one wallet and is cleared on unlink', () => {
    writeOwnedClasses('GA', [1, 5, 5]);
    expect([...readOwnedClasses('GA')]).toEqual([1, 5]);
    expect(readOwnedClasses('GB').size).toBe(0);
    expect(cachedWallet()).toBe('GA');
    writeOwnedClasses(null, []);
    expect(cachedWallet()).toBeNull();
  });
});
