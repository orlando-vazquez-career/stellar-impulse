import { afterAll, describe, expect, it } from 'vitest';
import { drawableMapObjects, drawsNexusDisc, NEXUS_STYLE, objectCell, type DrawableMapObject, type NexusStyle } from './map-objects';
import { selectMap, sectorMap, sectorSurface, type TrainingMapId } from './sector-map';

const imageStem = (entry: DrawableMapObject) =>
  entry.tileset.tiles?.find((tile) => tile.id === entry.tile)?.image?.split('/').pop()?.replace(/\.png$/, '');
const named = (entries: DrawableMapObject[], ...names: string[]) => entries.filter((entry) => names.includes(entry.object.name ?? ''));

/** Beacons (satelite_baliza) and broken reactors (reactor_averiado) are the animated tiles of the kits. */
const MAPS: { id: TrainingMapId; beaconsAndReactors: number }[] = [
  { id: 'espiral', beaconsAndReactors: 4 },
  { id: 'espiral-2', beaconsAndReactors: 2 },
  { id: 'trascendencia', beaconsAndReactors: 8 },
];

describe('drawableMapObjects', () => {
  afterAll(() => selectMap('espiral'));

  it('draws the nexus as the map pillar and shield by default', () => {
    expect(NEXUS_STYLE).toBe('pillar');
  });

  it('leaves the top-down nexus disc to the disc style only', () => {
    expect(drawsNexusDisc('pillar')).toBe(false);
    expect(drawsNexusDisc('disc')).toBe(true);
    // The default nexus is the pillar: the scene keeps only its ring and capture progress.
    expect(drawsNexusDisc(NEXUS_STYLE)).toBe(false);
  });

  for (const { id, beaconsAndReactors } of MAPS) {
    describe(id, () => {
      const read = (nexusStyle?: 'pillar' | 'disc') => {
        selectMap(id);
        return drawableMapObjects(sectorMap, sectorSurface, nexusStyle ? { nexusStyle } : undefined);
      };

      it('skips the robots, which are animated apart, and the obstacle preview made for Tiled', () => {
        const layers = new Set(read().map((entry) => entry.layer.name));
        expect(layers.has('robots')).toBe(false);
        expect(layers.has('obstaculos-vista')).toBe(false);
        expect(layers.has('estructuras')).toBe(true);
      });

      it('keeps every structure still: only the far background may animate', () => {
        const entries = read();
        expect(entries.filter((entry) => entry.animate).every((entry) => entry.layer.name === 'fondo-espacio')).toBe(true);
        const animatedTiles = entries.filter((entry) => entry.layer.name !== 'fondo-espacio'
          && entry.tileset.tiles?.find((tile) => tile.id === entry.tile)?.animation?.length);
        // The beacons and reactors declare a Tiled animation, and are still drawn still.
        expect(animatedTiles.length).toBeGreaterThan(0);
        expect(animatedTiles.every((entry) => !entry.animate)).toBe(true);
      });

      it('still draws the beacons and the broken reactors', () => {
        expect(named(read(), 'satelite_baliza', 'reactor_averiado')).toHaveLength(beaconsAndReactors);
      });

      it('never draws a Tiled base: the scene draws the live bases', () => {
        const entries = read();
        const bases = ['base_jugador', 'base_enemiga'];
        expect(entries.some((entry) => bases.includes(entry.object.name ?? '') || bases.includes(imageStem(entry) ?? ''))).toBe(false);
      });

      it('draws pillar and shield only for the pillar nexus', () => {
        expect(named(read('pillar'), 'pilar')).toHaveLength(1);
        expect(named(read('pillar'), 'escudo')).toHaveLength(1);
        expect(named(read(), 'pilar', 'escudo')).toHaveLength(2);
        const disc = read('disc');
        expect(named(disc, 'pilar', 'escudo')).toHaveLength(0);
        expect(disc.some((entry) => imageStem(entry) === 'pilar' || imageStem(entry) === 'escudo')).toBe(false);
      });

      it('shows the nexus once: either the map pillar or the scene disc, never both', () => {
        for (const style of ['pillar', 'disc'] as NexusStyle[]) {
          const pillarDrawn = named(read(style), 'pilar').length > 0;
          expect(pillarDrawn).toBe(!drawsNexusDisc(style));
        }
      });

      it('only draws tile objects that resolve to an image tile', () => {
        for (const entry of read()) {
          expect(entry.object.gid).toBeTruthy();
          expect(entry.tileset.image).toBeUndefined();
          expect(imageStem(entry)).toBeTruthy();
          expect(entry.layer.objects?.[entry.order]).toBe(entry.object);
        }
      });
    });
  }

  it('animates the comets and pulsars of the Trascendencia background', () => {
    selectMap('trascendencia');
    const sky = drawableMapObjects(sectorMap, sectorSurface).filter((entry) => entry.layer.name === 'fondo-espacio');
    expect(sky.length).toBeGreaterThan(0);
    expect(named(sky, 'cometa', 'pulsar').every((entry) => entry.animate)).toBe(true);
    expect(named(sky, 'cometa', 'pulsar')).toHaveLength(8);
    expect(named(sky, 'nube_azul').every((entry) => !entry.animate)).toBe(true);
  });

  it('keeps only the Stellar base emblems painted next to a base', () => {
    selectMap('trascendencia');
    const logos = drawableMapObjects(sectorMap, sectorSurface).filter((entry) => entry.layer.name === 'logos');
    const kept = named(logos, 'logo_stellar_base');
    expect(kept).toHaveLength(2);
    for (const entry of kept) {
      const cell = objectCell(entry.object);
      const nearest = Math.min(...[sectorSurface.bases.p1, sectorSurface.bases.p2]
        .map((base) => Math.max(Math.abs(cell.x - base.x), Math.abs(cell.y - base.y))));
      expect(nearest).toBeLessThanOrEqual(8);
    }
    expect(named(logos, 'logo_stellar_pronexo')).toHaveLength(4);
    expect(named(logos, 'logo_stellar_nucleo')).toHaveLength(1);
  });

  it('turns Tiled object pixels into cells along both isometric axes', () => {
    expect(objectCell({ x: 752, y: 2928 })).toEqual({ x: 23.5, y: 91.5 });
  });
});
