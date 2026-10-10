import { describe, expect, it } from 'vitest';
import { findPath } from '../maps/pathfinding.js';
import { createMatchWorld, createSectorWorld, createSquad, stepWorld } from '../index.js';
import { launchCell } from '../economia.js';
import mapa from '../tiled-maps/espiral-estelar/espiral-estelar.json';
import { CORE_CAPTURE_RADIUS, ESPIRAL, leerEspiral, METAL_CAPTURE_RADIUS } from './espiral.js';
import { ESPIRAL_2 } from './espiral-2.js';
import { TRASCENDENCIA } from './trascendencia.js';

describe('espiral estelar', () => {
  it('walks the open ground and blocks asteroids and wrecks', () => {
    expect(ESPIRAL.width).toBe(96);
    expect(ESPIRAL.height).toBe(96);
    expect(ESPIRAL.bases).toEqual({ p1: { x: 11, y: 10 }, p2: { x: 82, y: 86 } });
    expect(ESPIRAL.core).toEqual({ x: 48, y: 48, radius: 2 });
    expect(ESPIRAL.captures.map((cell) => [cell.x, cell.y])).toEqual([[30, 31], [63, 20], [32, 75], [65, 64]]);
    expect(ESPIRAL.captures.map((cell) => cell.radius)).toEqual([3, 3, 3, 3]);
    expect(ESPIRAL.metals[0]).toEqual({ x: 60, y: 20, radius: 2 });
    expect(ESPIRAL.metals).toHaveLength(10);
    expect(ESPIRAL.walkable.filter(Boolean).length).toBeGreaterThan(1000);
    expect(ESPIRAL.walkable.filter((open) => !open).length).toBeGreaterThan(100);
    expect(ESPIRAL.walkable[ESPIRAL.core.y * ESPIRAL.width + ESPIRAL.core.x]).toBe(true);
    for (const goal of [ESPIRAL.core, ...ESPIRAL.metals, ...ESPIRAL.captures]) {
      expect(findPath(ESPIRAL, ESPIRAL.bases.p2, goal).status).toBe('found');
    }
    const world = createSectorWorld('espiral');
    expect(world.core).toMatchObject({ x: 48, y: 48 });
    expect(world.nodes.filter((node) => node.kind === 'capture')).toHaveLength(4);
    expect(world.nodes.filter((node) => node.kind === 'metal')).toHaveLength(10);
    const taken = new Set([`${ESPIRAL.bases.p1.x},${ESPIRAL.bases.p1.y}`, `${ESPIRAL.bases.p1.x + 1},${ESPIRAL.bases.p1.y + 1}`]);
    expect(launchCell(ESPIRAL.bases.p1, ESPIRAL.width, ESPIRAL.height,
      (cell) => ESPIRAL.walkable[cell.y * ESPIRAL.width + cell.x] === true,
      (cell) => taken.has(`${cell.x},${cell.y}`))).not.toBeNull();
  });

  it('gives the pillar and every resource a capture radius of 2 unless the marker sets its own', () => {
    expect([CORE_CAPTURE_RADIUS, METAL_CAPTURE_RADIUS]).toEqual([2, 2]);
    for (const map of [ESPIRAL, ESPIRAL_2, TRASCENDENCIA]) {
      expect(map.core.radius).toBe(2);
      expect(map.metals).toHaveLength(10);
      expect(map.metals.every((metal) => metal.radius === 2)).toBe(true);
    }
    const marked = (kind: string, radio: unknown) => {
      const copy = structuredClone(mapa) as { layers: { name: string; objects?: { type: string; properties?: { name: string; type: string; value: unknown }[] }[] }[] };
      const target = copy.layers.find((layer) => layer.name === 'objetos')!.objects!.find((object) => object.type === kind)!;
      target.properties = [...(target.properties ?? []).filter((entry) => entry.name !== 'radio'), { name: 'radio', type: 'int', value: radio }];
      return copy;
    };
    expect(leerEspiral(marked('pilar', 4)).core.radius).toBe(4);
    expect(leerEspiral(marked('recurso', 4)).metals.filter((metal) => metal.radius === 4)).toHaveLength(1);
    for (const kind of ['pilar', 'recurso']) {
      expect(() => leerEspiral(marked(kind, 9))).toThrow(/Invalid map marker/);
      expect(() => leerEspiral(marked(kind, 1.5))).toThrow(/Invalid map marker/);
    }
  });

  it('captures the Core and a Metal node from anywhere inside a disc of radius 2', () => {
    const advances = (objective: 'core' | 'metal-1', dx: number, dy: number): boolean => {
      let world = createMatchWorld('espiral', 'skirmish', 3);
      world.augmentMatch!.started = true;
      for (const player of ['p1', 'p2'] as const) { world.augmentMatch!.players[player].offer = null; world.augmentMatch!.players[player].nextChoice = 3; }
      const target = objective === 'core' ? world.core : world.nodes.find((node) => node.id === objective)!;
      expect(target.radius).toBe(2);
      world.guardians = world.guardians.filter((guardian) => guardian.objectiveId !== target.id);
      world.rules = { ...world.rules, coreOpenTick: 0 };
      world.squads = [createSquad('p1-capturer', 'p1', 'interceptor', { x: target.x + dx, y: target.y + dy }, world)];
      world = stepWorld(world);
      const after = objective === 'core' ? world.core : world.nodes.find((node) => node.id === objective)!;
      return after.progress.p1 > 0;
    };
    for (const objective of ['core', 'metal-1'] as const) {
      expect(advances(objective, 2, 0), `${objective} 2,0`).toBe(true);
      expect(advances(objective, 1, 1), `${objective} 1,1`).toBe(true);
      expect(advances(objective, 2, 1), `${objective} 2,1`).toBe(false);
    }
  });

  it('rejects a map without its logic layer', () => {
    expect(() => leerEspiral({})).toThrow(/Invalid tiled map/);
  });

  it('reads walkability when Tiled exports tilesets as external tsx', () => {
    const tilesets = (mapa as { tilesets: { source?: string }[] }).tilesets;
    expect(tilesets.some((set) => typeof set.source === 'string' && set.source.includes('logica.tsx'))).toBe(true);
    expect(ESPIRAL.walkable.some((open) => !open)).toBe(true);
  });

  it('ignores Tiled objects that are not match objectives', () => {
    const copy = structuredClone(mapa) as {
      layers: { name: string; objects?: { type: string; x: number; y: number; properties?: unknown[] }[] }[];
    };
    const layer = copy.layers.find((entry) => entry.name === 'objetos');
    if (!layer?.objects) throw new Error('Missing objetos layer');
    layer.objects.push({ type: '', x: 10, y: 10, properties: [] });
    layer.objects.push({ type: 'valla_laser', x: -40, y: 500, properties: [] });
    expect(leerEspiral(copy).bases).toEqual(ESPIRAL.bases);
  });
});
