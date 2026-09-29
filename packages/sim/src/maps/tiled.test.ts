import { describe, expect, it } from 'vitest';
import { MAX_TILED_JSON_BYTES, parseTiledJson } from './tiled.js';

const layer = (name: string, data: unknown) => ({ name, type: 'tilelayer', width: 2, height: 2, data });
const fixture = () => ({
  type: 'map', orientation: 'orthogonal', infinite: false,
  width: 2, height: 2, tilewidth: 72, tileheight: 72,
  tilesets: [{ firstgid: 1, tilecount: 4 }],
  layers: [layer('Terreno', [1, 2, 3, 4])],
});
const parse = (value: unknown) => parseTiledJson(JSON.stringify(value));

describe('finite orthogonal Tiled import', () => {
  it('keeps art separate from gameplay and uses only explicitly named mask layers', () => {
    const map = fixture();
    const artOnly = parse(map);
    expect(artOnly).toMatchObject({ width: 2, height: 2, cellSize: 72 });
    expect(artOnly.walkable).toEqual([true, true, true, true]);
    expect(artOnly.opaque).toEqual([false, false, false, false]);
    map.layers.push(layer('nav-blocked', [0, 1, 0, 0]), layer('vision-opaque', [0, 0, 2, 0]));
    const explicit = parse(map);
    expect(explicit.walkable).toEqual([true, false, true, true]);
    expect(explicit.opaque).toEqual([false, false, true, false]);
    expect(Object.isFrozen(explicit.layers[0]!.data)).toBe(true);
  });

  it('rejects malformed dimensions, layers and encoded/infinite formats', () => {
    for (const change of [
      (map: ReturnType<typeof fixture>) => { map.width = 129; },
      (map: ReturnType<typeof fixture>) => { map.infinite = true; },
      (map: ReturnType<typeof fixture>) => { map.orientation = 'isometric'; },
      (map: ReturnType<typeof fixture>) => { map.layers[0]!.data = [1]; },
      (map: ReturnType<typeof fixture>) => { map.layers.push(layer('Terreno', [1, 1, 1, 1])); },
      (map: ReturnType<typeof fixture>) => { (map.layers[0] as object) = { ...map.layers[0], encoding: 'csv' }; },
      (map: ReturnType<typeof fixture>) => { Object.assign(map.layers[0]!, { offsetx: 72 }); },
      (map: ReturnType<typeof fixture>) => { Object.assign(map.layers[0]!, { starty: 1 }); },
    ]) {
      const map = fixture();
      change(map);
      expect(() => parse(map)).toThrow();
    }
  });

  it('rejects missing, flagged and undeclared GIDs and external tilesets', () => {
    for (const gid of [-1, 5, 0x80000001, 1.5, null]) {
      const map = fixture();
      map.layers[0]!.data = [gid, 0, 0, 0];
      expect(() => parse(map)).toThrow();
    }
    const external = { ...fixture(), tilesets: [{ firstgid: 1, tilecount: 4, source: 'elsewhere.tsx' }] };
    expect(() => parse(external)).toThrow();
  });

  it('never misaligns an explicit collision layer with an offset', () => {
    const map = fixture();
    const collision = layer('nav-blocked', [0, 1, 0, 0]);
    Object.assign(collision, { x: 1 });
    map.layers.push(collision);
    expect(() => parse(map)).toThrow();
  });

  it('enforces UTF-8 byte and layer bounds without reading getters', () => {
    expect(() => parseTiledJson(' '.repeat(MAX_TILED_JSON_BYTES + 1))).toThrow();
    const map = fixture();
    map.layers = Array.from({ length: 17 }, (_, index) => layer(`art-${index}`, [1, 1, 1, 1]));
    expect(() => parse(map)).toThrow();
    let getterRead = false;
    const hostile = { get type() { getterRead = true; return 'map'; } };
    expect(() => parseTiledJson(hostile as unknown as string)).toThrow();
    expect(getterRead).toBe(false);
  });
});
