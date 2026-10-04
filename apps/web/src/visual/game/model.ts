import type { AugmentView } from '@impulso/state';
export type SquadOwner = 'blue' | 'red' | 'neutral';
import type { ShipStats } from '@impulso/sim';
import type { UnitKind } from '@impulso/state';
import type { BaseUpgradeKind, BaseUpgrades } from '@impulso/sim';
export type SquadType = UnitKind;

export interface SquadViewModel {
  id: string;
  callSign: string;
  owner: SquadOwner;
  unitType: SquadType;
  speedCellsPerSecond?: number;
  isDecoy?: boolean;
  hp?: number; maxHp?: number; stats?: ShipStats;
  // Continuous map coordinates; integer values are tile centers.
  gridX: number;
  gridY: number;
  healthPercent: number;
  attackTargetId?: string | null;
  selected: boolean;
  visible: boolean;
  composition: { interceptors: number; frigates: number; bombers?: number; explorers?: number };
  status: 'idle' | 'moving' | 'holding' | 'capturing' | 'attacking' | 'destroyed';
}

export type CoreState =
  | 'locked'
  | 'available'
  | 'blue-capturing'
  | 'red-capturing'
  | 'contested'
  | 'blue-controlled'
  | 'red-controlled';

export interface CoreViewModel {
  state: CoreState;
  progress: number;
  opensInSeconds: number;
}

export type GameplayAction = 'move' | 'attack' | 'hold' | 'capture' | null;

export interface MoveOrder {
  squadId: string;
  destination: { x: number; y: number };
  route: { x: number; y: number }[];
}

/** Visible world area. x/y/width/height are fractions of the isometric world; the raw fields are pixels. */
export interface CameraView {
  x: number;
  y: number;
  width: number;
  height: number;
  worldX: number;
  worldY: number;
  zoom: number;
}

export interface NodeViewModel {
  id: string;
  kind: 'metal' | 'capture';
  x: number;
  y: number;
  owner: SquadOwner | null;
}

export interface ProductionViewModel {
  kind: SquadType;
  remainingSeconds: number;
}

/** local: the in-browser mock; the rest describe the link to the authoritative server. */
export type ConnectionState = 'local' | 'connecting' | 'online' | 'offline';

export interface GameplayViewModel {
  tick: number;
  sector: number;
  elapsedSeconds: number;
  suddenDeath?: boolean;
  selectedSquadId: string | null;
  selectedSquadIds: string[];
  activeAction: GameplayAction;
  moveOrder: MoveOrder | null;
  resources: {
    metal: number;
    metalRate: number;
    energy: number;
    energyRate: number;
    fleet: number;
    fleetCap: number;
  };
  squads: SquadViewModel[];
  core: CoreViewModel;
  enemiesVisible: boolean;
  clockRunning: boolean;
  nodes: NodeViewModel[];
  production: ProductionViewModel | null;
  /** The campaign battlefield currently provides a fixed starting fleet. */
  canProduce?: boolean;
  unitStats?: Record<SquadType, ShipStats>;
  augments?: AugmentView;
  chart?: {nodes:{x:number;y:number}[];guardians:{x:number;y:number}[]};
  productionForbidden?: SquadType[];
  base?: { upgrades: BaseUpgrades; damage: number; range: number; position?:{x:number;y:number}; upgradeCosts: Record<BaseUpgradeKind, number | null> };
  result: 'victory' | 'defeat' | null;
  /** Last server rejection or connection message, already localized by key. */
  notice: string | null;
  connection: ConnectionState;
  /** Row-major cells inside the player's vision; null when there is no fog (local mock). */
  visibleCells: boolean[] | null;
}

/** Things that happened between two server views, for sounds and announcements. */
export type GameplayEvent =
  | { kind: 'match-start' | 'ship-launched' | 'guardian-down' | 'node-lost' | 'under-attack'
      | 'core-soon' | 'core-open' | 'core-own-capturing' | 'core-rival-capturing' | 'victory' | 'defeat' }
  | { kind: 'ship-destroyed' | 'node-captured'; own: boolean };

export type PresentationIntent =
  | { type: 'select-squad'; squadId: string }
  | { type: 'select-squads'; squadIds: string[] }
  | { type: 'set-action'; action: GameplayAction }
  | { type: 'move-squad'; squadId: string; x: number; y: number }
  | { type: 'move-selected'; x: number; y: number }
  | { type: 'attack-squad'; squadId: string; targetId: string }
  | { type: 'attack-selected'; targetId: string }
  | { type: 'set-core-state'; state: CoreState }
  | { type: 'set-core-progress'; progress: number }
  | { type: 'set-selected-health'; healthPercent: number }
  | { type: 'set-resource'; resource: 'metal' | 'energy'; value: number }
  | { type: 'set-enemy-visibility'; visible: boolean }
  | { type: 'set-clock-running'; running: boolean }
  | { type: 'produce'; kind: SquadType }
  | { type: 'disband-selected' }
  | { type: 'upgrade-base'; upgrade: BaseUpgradeKind }
  | {type:'augment-pick';choice:number;id:string}
  | {type:'augment-reroll';choice:number};

export interface GameplayPresentationAdapter {
  getSnapshot(): GameplayViewModel;
  subscribe(listener: () => void): () => void;
  dispatch(intent: PresentationIntent): void;
  destroy(): void;
  /** Server-backed adapters report match events; the local mock does not. */
  subscribeEvents?(listener: (event: GameplayEvent) => void): () => void;
}
