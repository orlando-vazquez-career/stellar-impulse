/** Trim floating-point noise without hiding fractional armor, damage or speed. */
export function formatStat(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : String(Number(value.toFixed(2)));
}
