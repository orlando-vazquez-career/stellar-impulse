import type { AugmentView } from '@impulso/state';
export type SquadOwner = 'blue' | 'red' | 'neutral';
import type { ShipStats } from '@impulso/sim';
import type { UnitKind } from '@impulso/state';
import type { BaseUpgradeKind, BaseUpgrades, ExtraModule, FormationKind, ModuleKind, ModuleSpec } from '@impulso/sim';
export type SquadType = UnitKind;

export interface SquadViewModel {
  id: string;
  callSign: string;
  owner: SquadOwner;
  unitType: SquadType;
  speedCellsPerSecond?: number;
  isDecoy?: boolean;
  hp?: number; maxHp?: number; stats?: ShipStats;
  attackCooldown?: { remainingTicks: number; durationTicks: number };
  lastShot?: { tick: number; from: {x:number;y:number}; to: {x:number;y:number}; splashRadius: number };
  // Continuous map coordinates; integer values are tile centers.
  gridX: number;
  gridY: number;
  healthPercent: number;
  attackTargetId?: string | null;
  /** Own ships only: the cell the ship is flying to (its formation seat on a group order). */
  destination?: { x: number; y: number } | null;
  /** A neutral turret: it never moves and fires at any ship within `range` cells. */
  turret?: { range: number };
  /** A destructible barrier: it only stands in the way, and its art comes from the map. */
  barrier?: boolean;
  /** Neutral guardians only: the post it holds. `callSign` stays as the Spanish fallback label. */
  guardianKind?: 'turret' | 'barrier' | 'core' | 'node';
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
  /** Capture shown on the Core, 0 to 100. */
  progress: number;
  opensInSeconds: number;
  /** Cells around the Core that count as its capture area. */
  radius: number;
  /** The side taking the Core right now, from the player's side of the table. */
  captor: 'own' | 'rival' | null;
  /** Each side's progress over its own capture time, 0 to 1. */
  fractions: { own: number; rival: number };
  /** Seconds the captor still needs, or null when nobody is taking the Core. */
  secondsLeft: number | null;
  /** The Core guardian is in sight and still standing, so nobody can take the Core yet. */
  guarded: boolean;
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
  /** Out of sight: `owner` is the last one the player saw, which may have changed since. */
  stale?: boolean;
  /** Seconds until a freshly captured node starts producing. */
  stabilizingSeconds?: number;
  /** Cells around the node that count as its capture area. */
  radius?: number;
  /** A capturable station: its owner buys ships there at once. */
  station?: boolean;
  /** The side taking the node from its owner, and how far along it is (0 to 1). */
  capture?: { by: SquadOwner; fraction: number };
}

/** A drifting purple cloud: it slows and hides ships under it; the route it will take is public. */
export interface NebulaViewModel {
  id: string;
  x: number;
  y: number;
  size: number;
  phase: 'resting' | 'warning' | 'advancing' | 'holding' | 'returning';
  /** Tick on which the current phase ends: the warning counts down to it. */
  phaseEndsAt: number;
  /** Cells of the route it takes (or will take next), home first. */
  path: { x: number; y: number }[];
}

/** A passage of the asteroid belt: clear, about to close or closed until `phaseEndsAt`. */
export interface BeltViewModel {
  id: string;
  phase: 'open' | 'warning' | 'closed';
  phaseEndsAt: number;
}

/** A satellite on its way down: warned from `warnTick`, it hits the cell on `impactTick`. */
export interface SatelliteViewModel {
  id: string;
  x: number;
  y: number;
  radius: number;
  warnTick: number;
  impactTick: number;
}

export interface ProductionViewModel {
  kind: SquadType;
  remainingSeconds: number;
  /** Whole build time of this ship, with the Shipyard and fast builds it started with. */
  totalSeconds?: number;
  /** How far the build has come, 0 to 1. */
  progress?: number;
  /** Metal a cancel gives back: exactly what the order paid. */
  refund?: number;
}
/** A paid order waiting behind the ship in production. */
export interface QueuedProductionViewModel {
  kind: SquadType;
  refund: number;
}

/** local: the in-browser mock; the rest describe the link to the authoritative server. */
export type ConnectionState = 'local' | 'connecting' | 'online' | 'offline';

export interface GameplayViewModel {
  tick: number;
  tickRate?: number;
  sector: number;
  elapsedSeconds: number;
  suddenDeath?: boolean;
  selectedSquadId: string | null;
  selectedSquadIds: string[];
  activeAction: GameplayAction;
  moveOrder: MoveOrder | null;
  /** Shape a group order takes. Only server-backed matches march in formation. */
  formation?: FormationKind;
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
  /** Paid orders waiting behind `production`, in order: a cancel names slot index + 1 (slot 0 is `production`). */
  productionQueue: QueuedProductionViewModel[];
  satellites?: SatelliteViewModel[];
  /** Drifting purple clouds announced by the server; MainScene glides them from the map's own routes. */
  nebulas?: NebulaViewModel[];
  /** Passages of the asteroid belt; their cells come from the map. */
  belts?: BeltViewModel[];
  /** Barriers already shot down: MainScene removes their art. */
  fallenBarriers?: string[];
  /** Stations the player holds and what each ship costs there. */
  stations?: { id: string; x: number; y: number; prices: Record<SquadType, number> }[];
  /** The campaign battlefield currently provides a fixed starting fleet. */
  canProduce?: boolean;
  unitStats?: Record<SquadType, ShipStats>;
  augments?: AugmentView;
  chart?: {nodes:{x:number;y:number}[];guardians:{x:number;y:number}[]};
  productionForbidden?: SquadType[];
  base?: { upgrades: BaseUpgrades; damage: number; range: number; position?:{x:number;y:number}; upgradeCosts: Record<BaseUpgradeKind, number | null>;
    /** Destructible base (match worlds). */
    hp?: number; maxHp?: number; armor?: number; vulnerableInSeconds?: number;
    modules?: { refinery: 0 | 1 | 2; extras: ExtraModule[]; building: { kind: ModuleKind; remainingSeconds: number } | null };
    moduleCosts?: Record<ModuleKind, ModuleSpec> };
  /** The rival base: always located, hull known only while in sight. */
  enemyBase?: { id: string; x: number; y: number; visible: boolean; hp?: number; maxHp?: number };
  result: 'victory' | 'defeat' | null;
  reward?: import('@impulso/sim').MatchReward;
  /** Last server rejection or connection message, already localized by key. */
  notice: string | null;
  /**
   * Stable key of `notice`, for translating it: a server rejection reason, or `connecting`, `connection_lost`
   * or `connect_failed`. Null when there is no notice or it has no key (free text from a campaign phase).
   */
  noticeCode: string | null;
  connection: ConnectionState;
  /** The match clock is stopped by a practice pause: orders are refused until it runs again. */
  paused: boolean;
  /** This match takes a pause request (practice against the AI, alone, while it runs). */
  canPause: boolean;
  /** A base selected on the map: the player's own or the rival's (only while in sight). Ships and bases are never selected together. */
  selectedBase: 'own' | 'enemy' | null;
  /** Row-major cells inside the player's vision; null when there is no fog (local mock). */
  visibleCells: boolean[] | null;
  /** Row-major cells seen at least once this match (always includes visibleCells); null without fog memory. */
  exploredCells?: boolean[] | null;
}

/** Things that happened between two server views, for sounds and announcements. */
export type GameplayEvent =
  | { kind: 'match-start' | 'battle-start' | 'augment-offer' | 'ship-launched' | 'guardian-down' | 'core-guardian-down' | 'node-lost' | 'node-threatened'
      | 'under-attack' | 'base-under-attack' | 'base-hull-critical' | 'shields-down' | 'sudden-death' | 'module-online'
      | 'satellite-warning' | 'satellite-impact' | 'nebula-warning' | 'belt-warning' | 'turret-down' | 'barrier-down' | 'station-captured' | 'station-lost'
      | 'core-soon' | 'core-open' | 'core-own-capturing' | 'core-rival-capturing' | 'core-contested' | 'victory' | 'defeat'
      | 'link-lost' | 'link-restored' }
  | { kind: 'ship-destroyed' | 'node-captured'; own: boolean }
  /** The server refused an order; `reason` is its rejection code. */
  | { kind: 'order-rejected'; reason: string };

export type PresentationIntent =
  | { type: 'select-squad'; squadId: string }
  | { type: 'select-squads'; squadIds: string[] }
  | { type: 'set-action'; action: GameplayAction }
  | { type: 'move-squad'; squadId: string; x: number; y: number }
  | { type: 'move-selected'; x: number; y: number }
  | { type: 'set-formation'; formation: FormationKind }
  | { type: 'attack-squad'; squadId: string; targetId: string }
  | { type: 'attack-selected'; targetId: string }
  | { type: 'set-core-state'; state: CoreState }
  | { type: 'set-core-progress'; progress: number }
  | { type: 'set-selected-health'; healthPercent: number }
  | { type: 'set-resource'; resource: 'metal' | 'energy'; value: number }
  | { type: 'set-enemy-visibility'; visible: boolean }
  | { type: 'set-clock-running'; running: boolean }
  | { type: 'produce'; kind: SquadType }
  | { type: 'station-produce'; stationId: string; kind: SquadType }
  | { type: 'disband-selected' }
  | { type: 'upgrade-base'; upgrade: BaseUpgradeKind }
  | { type: 'build-module'; module: ModuleKind }
  | { type: 'surrender' }
  | {type:'augment-pick';choice:number;id:string}
  | {type:'augment-reroll';choice:number}
  /** Cancel a hangar order: slot 0 is the ship in production, slot n the n-th waiting order. `kind` must match it. */
  | { type: 'cancel-production'; slot: number; kind: SquadType }
  /** Ask to stop or restart the match clock. Ignored unless `canPause`. */
  | { type: 'set-paused'; paused: boolean }
  /** Select a base on the map (null clears it); it clears the ship selection and the pending action. */
  | { type: 'select-base'; base: 'own' | 'enemy' | null };

export interface GameplayPresentationAdapter {
  getSnapshot(): GameplayViewModel;
  subscribe(listener: () => void): () => void;
  dispatch(intent: PresentationIntent): void;
  destroy(): void;
  /** Server-backed adapters report match events; the local mock does not. */
  subscribeEvents?(listener: (event: GameplayEvent) => void): () => void;
}
