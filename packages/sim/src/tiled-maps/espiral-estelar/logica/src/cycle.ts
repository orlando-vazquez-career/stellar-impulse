export interface Cycle {
  readonly periodTicks: number;
  readonly openTicks: number;
  readonly offsetTicks: number;
}

export type PortalPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface PhaseState {
  readonly phase: PortalPhase;
  /** De 0 a 1 dentro de la fase de transición; 1 en las fases estables. */
  readonly progress: number;
}

export function secondsToTicks(seconds: number, ticksPerSecond: number): number {
  return Math.round(seconds * ticksPerSecond);
}

export function cycleFromSeconds(cycleSeconds: number, openSeconds: number, ticksPerSecond: number): Cycle {
  return {
    periodTicks: secondsToTicks(cycleSeconds, ticksPerSecond),
    openTicks: secondsToTicks(openSeconds, ticksPerSecond),
    offsetTicks: 0,
  };
}

export function ticksIntoCycle(cycle: Cycle, tick: number): number {
  const position = (tick + cycle.offsetTicks) % cycle.periodTicks;
  return position < 0 ? position + cycle.periodTicks : position;
}

export function isOpenAt(cycle: Cycle, tick: number): boolean {
  return ticksIntoCycle(cycle, tick) < cycle.openTicks;
}

export function phaseAt(cycle: Cycle, tick: number, transitionTicks: number): PhaseState {
  const elapsed = ticksIntoCycle(cycle, tick);
  if (elapsed >= cycle.openTicks) return { phase: 'closed', progress: 1 };
  if (elapsed < transitionTicks) return { phase: 'opening', progress: elapsed / transitionTicks };
  const remaining = cycle.openTicks - elapsed;
  if (remaining <= transitionTicks) return { phase: 'closing', progress: 1 - remaining / transitionTicks };
  return { phase: 'open', progress: 1 };
}
