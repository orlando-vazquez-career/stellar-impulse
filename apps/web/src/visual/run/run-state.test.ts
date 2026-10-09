import { describe, expect, it } from 'vitest';
import { RUN_SECTORS, afterVictory, formatTime, isLastSector, newRun, totalSeconds, type SectorSummary } from './run-state';

const card = (id: string) => ({ id, tier: 'silver' as const, icon: '✦', text: { es: { name: id, advantage: '' }, en: { name: id, advantage: '' } } });
const summary = (sector: number, seconds: number, ids: string[]): SectorSummary =>
  ({ sector, name: RUN_SECTORS[sector - 1]!.name, seconds, nodesOwned: 2, nodesTotal: 4, augments: ids.map(card) });

describe('run of sectors', () => {
  it('goes Espiral, Caos, Trascendencia', () => {
    expect(RUN_SECTORS.map((sector) => sector.map)).toEqual(['espiral', 'espiral-2', 'trascendencia']);
  });

  it('advances on victory and keeps every augment owned when the sector ended', () => {
    const second = afterVictory(newRun(), summary(1, 300, ['s-optica', 'g-impulso']));
    expect(second.sector).toBe(1);
    expect(second.augments.map((augment) => augment.id)).toEqual(['s-optica', 'g-impulso']);
    expect(isLastSector(second)).toBe(false);
  });

  it('stays on the last sector once it is won, with the whole history', () => {
    let run = newRun();
    for (let sector = 1; sector <= RUN_SECTORS.length; sector += 1) run = afterVictory(run, summary(sector, 100 * sector, []));
    expect(run.sector).toBe(RUN_SECTORS.length - 1);
    expect(run.history).toHaveLength(RUN_SECTORS.length);
    expect(totalSeconds(run)).toBe(600);
  });

  it('formats match time as mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(125.9)).toBe('02:05');
  });
});
