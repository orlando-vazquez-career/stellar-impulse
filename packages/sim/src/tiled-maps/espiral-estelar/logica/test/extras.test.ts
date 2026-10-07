import { describe, expect, it } from 'vitest';
import { CritterBrain, DEFAULT_CRITTER } from '../client/critters';
import { approachLift, ElevationMap, PLATFORM_LIFT_PX } from '../client/elevation';
import { occluderAlpha, OCCLUDING_ALPHA } from '../client/occlusion';
import { phaseAt } from '../src/cycle';
import { createGameMap } from '../src/game-map';
import { towerObservers } from '../src/watchtowers';

describe('aviso de apertura', () => {
  it('anuncia la apertura unos ticks antes', () => {
    const cycle = { periodTicks: 100, openTicks: 30, offsetTicks: 0, warningTicks: 10 };
    expect(phaseAt(cycle, 85, 5).phase).toBe('closed');
    expect(phaseAt(cycle, 95, 5).phase).toBe('warning');
    expect(phaseAt(cycle, 101, 5).phase).toBe('opening');
  });
});

describe('torres de vigilancia', () => {
  const map = createGameMap({
    width: 5, height: 5, terrain: Array(25).fill('empty'), wormholes: [], gates: [],
    markers: [{ kind: 'torre_vigilancia', tile: { x: 2, y: 2 }, properties: { visionRadius: 9 } }],
  });

  it('dan visión solo si hay una nave pegada', () => {
    expect(towerObservers(map, [{ x: 0, y: 0 }])).toHaveLength(0);
    expect(towerObservers(map, [{ x: 3, y: 3 }])[0]?.visionRadius).toBe(9);
  });
});

describe('altura visual', () => {
  it('sube la nave sobre las plataformas de forma gradual', () => {
    const elevation = new ElevationMap({ width: 2, height: 1 }, [0, 1]);
    expect(elevation.liftAt({ x: 1, y: 0 })).toBe(PLATFORM_LIFT_PX);
    const halfway = approachLift(0, PLATFORM_LIFT_PX, 100);
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(PLATFORM_LIFT_PX);
  });
});

describe('oclusión', () => {
  it('transparenta un objeto alto solo si tapa una nave', () => {
    const occluder = { left: 0, top: 0, right: 100, groundY: 80 };
    expect(occluderAlpha(occluder, [{ x: 50, y: 40 }])).toBe(OCCLUDING_ALPHA);
    expect(occluderAlpha(occluder, [{ x: 50, y: 120 }])).toBe(1);
  });
});

describe('drones neutrales', () => {
  const home = { x: 0, y: 0 };

  it('huyen de un ejército grande y vuelven después', () => {
    const critter = new CritterBrain({ ...DEFAULT_CRITTER, home }, () => 0.5);
    const army = Array.from({ length: 6 }, (_, i) => ({ x: 40 + i, y: 0 }));
    critter.update(16, army);
    expect(critter.state).toBe('flee');
    critter.update(DEFAULT_CRITTER.calmDownMs + 1, []);
    expect(critter.state).toBe('return');
  });

  it('no reaccionan a pocas naves', () => {
    const critter = new CritterBrain({ ...DEFAULT_CRITTER, home }, () => 0.5);
    critter.update(16, [{ x: 10, y: 0 }]);
    expect(critter.state).toBe('idle');
  });
});
