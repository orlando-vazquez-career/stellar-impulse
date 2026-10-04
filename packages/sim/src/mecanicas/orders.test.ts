import { describe, expect, it } from 'vitest';
import { applyCommand, applyEnemyOrders, createSquad, createWorld, findPath, planTrainingEnemy, stepWorld, type World } from '../index.js';
import { assignArrival, blockedCells } from './orders.js';

function ticks(world: World, count: number): World {
  let next = world;
  for (let step = 0; step < count; step += 1) next = stepWorld(next);
  return next;
}
function enqueue(seq: number, x: number, y: number) {
  return { seq, type: 'enqueue' as const, squadId: 'p1-interceptor', x, y };
}

describe('finite shift route', () => {
  it('stops on the last cell and does not repeat the route', () => {
    let world = createWorld();
    world = applyCommand(world, 'p1', enqueue(1, 3, 17)).world;
    world = applyCommand(world, 'p1', enqueue(2, 4, 17)).world;
    world = applyCommand(world, 'p1', enqueue(3, 5, 17)).world;
    const arrived = ticks(world, 18);
    expect(arrived.squads[0]).toMatchObject({ x: 5, y: 17, target: null, stance: 'march' });
    expect(arrived.squads[0]!.route).toEqual([]);
    const later = ticks(arrived, 30);
    expect(later.squads[0]).toMatchObject({ x: 5, y: 17, target: null });
  });

  it('rejects a ninth point without spending the sequence', () => {
    let world = createWorld();
    for (let seq = 1; seq <= 8; seq += 1) {
      const accepted = applyCommand(world, 'p1', enqueue(seq, 2 + seq, 17));
      expect(accepted.accepted).toBe(true);
      world = accepted.world;
    }
    const rejected = applyCommand(world, 'p1', enqueue(9, 11, 17));
    expect(rejected).toMatchObject({ accepted: false, reason: 'route_full' });
    expect(rejected.world.players.p1.lastSequence).toBe(8);
    expect(world.players.p1.lastSequence).toBe(8);
  });

  it('lets a plain move replace the queue', () => {
    let world = createWorld();
    world = applyCommand(world, 'p1', enqueue(1, 3, 17)).world;
    world = applyCommand(world, 'p1', enqueue(2, 4, 17)).world;
    const replaced = applyCommand(world, 'p1', { seq: 3, type: 'move', squadId: 'p1-interceptor', x: 2, y: 15 });
    expect(replaced.world.squads[0]).toMatchObject({ target: { x: 2, y: 15 }, stance: 'march' });
    expect(replaced.world.squads[0]!.route).toEqual([]);
  });
});

describe('arrival ring', () => {
  it('keeps a lone ship on the clicked cell', () => {
    const ordered = applyCommand(createWorld(), 'p1', { seq: 1, type: 'move', squadId: 'p1-interceptor', x: 4, y: 4 });
    expect(ordered.world.squads[0]!.target).toEqual({ x: 4, y: 4 });
  });

  it('spreads ships that share a cell around a one-cell ring, lowest id first', () => {
    const world = createWorld();
    world.squads.push(createSquad('p1-wing', 'p1', 'interceptor', { x: 2, y: 16 }));
    const first = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: 'p1-wing', x: 8, y: 17 });
    const second = applyCommand(first.world, 'p1', { seq: 2, type: 'move', squadId: 'p1-interceptor', x: 8, y: 17 });
    const wing = second.world.squads.find((unit) => unit.id === 'p1-wing');
    const lead = second.world.squads.find((unit) => unit.id === 'p1-interceptor');
    expect(lead?.target).toEqual({ x: 9, y: 17 });
    expect(wing?.target).toEqual({ x: 9, y: 18 });
  });

  it('assigns ring seats in id order', () => {
    const board = { width: 20, height: 20, blocked: blockedCells([]) };
    const seats = assignArrival(['p1-wing', 'p1-interceptor'], { x: 8, y: 17 }, board);
    expect(seats.get('p1-interceptor')).toEqual({ x: 9, y: 17 });
    expect(seats.get('p1-wing')).toEqual({ x: 9, y: 18 });
  });
});

describe('command card stances', () => {
  it('returns a guard to the anchor along the existing path', () => {
    const held = applyCommand(createWorld(), 'p1', { seq: 1, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' }).world;
    held.squads[0]!.x = 5;
    const home = { x: 2, y: 17 };
    const stepped = ticks(held, 6);
    expect(stepped.squads[0]).toMatchObject(findPath({ x: 5, y: 17 }, home, held.width, held.height, held.obstacles)[1]!);
    expect(ticks(stepped, 12).squads[0]).toMatchObject({ x: home.x, y: home.y, stance: 'guard' });
  });

  it('loops only after patrol is chosen', () => {
    let world = applyCommand(createWorld(), 'p1', enqueue(1, 3, 17)).world;
    world = applyCommand(world, 'p1', { seq: 2, type: 'stance', squadId: 'p1-interceptor', stance: 'patrol' }).world;
    const later = ticks(world, 24);
    expect(later.squads[0]!.stance).toBe('patrol');
    expect(later.squads[0]!.target).not.toBeNull();
  });

  it('attacks along the way without chasing during a plain march', () => {
    const world = createWorld();
    world.squads[1]!.x = 4;
    world.squads[1]!.y = 17;
    const marching = applyCommand(world, 'p1', { seq: 1, type: 'move', squadId: 'p1-interceptor', x: 2, y: 14 }).world;
    expect(ticks(marching, 6).squads[0]!.attackTargetId).toBeNull();
    const armed = applyCommand(world, 'p1', { seq: 1, type: 'stance', squadId: 'p1-interceptor', stance: 'attack' }).world;
    expect(stepWorld(armed).squads[0]!.attackTargetId).toBe('p2-interceptor');
  });
});

describe('training enemy', () => {
  it('patrols the rival base when that seat is unmanned', () => {
    const planned = planTrainingEnemy(createWorld(), new Map());
    expect(planned.orders[0]).toMatchObject({ kind: 'move', unitId: 'p2-interceptor' });
    const moved = applyEnemyOrders(createWorld(), planned.orders);
    expect(moved.squads[1]!.target).toEqual({ x: 16, y: 2 });
    expect(moved.players.p2.lastSequence).toBe(0);
  });

  it('ignores orders for the human seat', () => {
    const world = applyEnemyOrders(createWorld(), [{ kind: 'move', unitId: 'p1-interceptor', destination: { x: 4, y: 4 } }]);
    expect(world.squads[0]!.target).toBeNull();
  });
});
