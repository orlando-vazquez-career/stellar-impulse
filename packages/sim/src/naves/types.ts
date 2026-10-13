/** Public ship archetypes and combat statistics. */
export type UnitKind = 'explorer' | 'interceptor' | 'frigate' | 'bomber';

export interface ShipStats {
  cost: number;
  buildTicks: number;
  maxHp: number;
  armor: number;
  damage: number;
  attackTicks: number;
  range: number;
  speed: number;
  vision: number;
  canCapture: boolean;
  splashRadius: number;
  splashFactor: number;
}

export type StatKey = Exclude<keyof ShipStats, 'canCapture'>;

export interface StatModifier {
  stat: StatKey;
  value: number;
  operation: 'add' | 'set' | 'multiply';
  kind?: UnitKind;
}
