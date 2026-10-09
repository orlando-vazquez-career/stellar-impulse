import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageForCosmetic } from './catalog';

const keys = ['aurora-andina', 'pulso-violeta', 'primera-victoria', 'exploracion', 'voz-comandante', 'voz-analista', 'musica-iron-vanguard', 'musica-gravity-final-path'];
describe('cosmetic illustrations', () => {
  it.each(keys)('%s points to its own standalone 512px SVG', key => {
    const root = new URL('../../../public/cosmetics/', import.meta.url);
    const data = JSON.parse(readFileSync(new URL(`${key}.json`, root), 'utf8'));
    expect(data.image).toBe(`/cosmetics/img/${key}.svg`);
    expect(imageForCosmetic({ id: key })).toBe(data.image);
    const svg = readFileSync(new URL(`img/${key}.svg`, root), 'utf8');
    expect(svg).toContain('width="512" height="512" viewBox="0 0 512 512"');
    expect(svg).toContain('#070B14'); expect(svg).toContain('#71E5DC');
    expect(svg).not.toMatch(/<text|<script|<image|href=/i);
  });
  it('keeps the current swatch when no illustration exists', () => {
    expect(imageForCosmetic({ id: 'aegis', image: null })).toBeNull();
    expect(imageForCosmetic({ id: 'custom', image: '/custom.svg' })).toBe('/custom.svg');
  });
});
