import { describe, expect, it } from 'vitest';
import { RobotBrain, type RobotFrame, type RobotPhase } from './robot-brain';

const exit: RobotFrame[] = [0, 1, 2, 3, 4, 5, 6, 7].map((tileid) => ({ tileid, duration: tileid === 7 ? 1500 : 110 }));
const enter: RobotFrame[] = [7, 6, 5, 4, 3, 2, 1, 0].map((tileid) => ({ tileid, duration: tileid === 0 ? 1500 : 110 }));
function robot(capsule = true) {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return new RobotBrain({ x: 10.5, y: 10.5 }, { exit, enter, capsule, walkable: () => true, random });
}
function run(brain: RobotBrain, ms: number, ships: { x: number; y: number }[] = []): RobotPhase[] {
  const phases: RobotPhase[] = [brain.phase];
  for (let clock = 0; clock < ms; clock += 50) {
    brain.update(50, ships);
    if (phases.at(-1) !== brain.phase) phases.push(brain.phase);
  }
  return phases;
}
const crowd = (count: number) => Array.from({ length: count }, (_, index) => ({ x: 12 + index * 0.5, y: 11 }));

describe('capsule robot', () => {
  it('leaves the capsule, walks a little and goes back in', () => {
    const brain = robot();
    const phases = run(brain, 40000);
    expect(phases.slice(0, 6)).toEqual(['inside', 'exiting', 'walking', 'returning', 'entering', 'inside']);
    expect(brain.alert).toBe(false);
  });

  it('keeps its routine with five ships in sight', () => {
    const brain = robot();
    expect(run(brain, 12000, crowd(5))).toContain('walking');
    expect(brain.alert).toBe(false);
  });

  it('raises the alert and runs home when more than five ships show up', () => {
    const brain = robot();
    while (brain.phase !== 'walking' || !brain.moving) brain.update(50, []);
    run(brain, 1500);
    const from = { ...brain.position };
    brain.update(50, crowd(6));
    expect(brain.phase).toBe('fleeing');
    expect(brain.alert).toBe(true);
    brain.update(1000, crowd(6));
    // Three times the walking pace.
    const covered = Math.hypot(brain.position.x - from.x, brain.position.y - from.y);
    const left = Math.hypot(brain.position.x - 10.5, brain.position.y - 10.5);
    expect(left === 0 || covered > 2).toBe(true);
    expect(run(brain, 6000, crowd(6)).at(-1)).toBe('inside');
    expect(brain.alert).toBe(false);
    // It stays in while the crowd remains and comes out again once they leave.
    expect(run(brain, 15000, crowd(6))).toEqual(['inside']);
    expect(run(brain, 12000)).toContain('exiting');
  });

  it('ignores ships that are far away', () => {
    const brain = robot();
    run(brain, 8000, Array.from({ length: 9 }, () => ({ x: 30, y: 30 })));
    expect(brain.alert).toBe(false);
  });
});

describe('robot without a capsule', () => {
  it('wanders, and waits at its spot while alarmed', () => {
    const brain = robot(false);
    expect(run(brain, 5000)).toEqual(['walking']);
    run(brain, 6000, crowd(7));
    expect(brain.phase).toBe('fleeing');
    expect(brain.position).toEqual({ x: 10.5, y: 10.5 });
    expect(run(brain, 6000).at(-1)).toBe('walking');
  });
});
