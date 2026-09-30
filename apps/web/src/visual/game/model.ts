export type SquadOwner = 'blue' | 'red' | 'neutral';
import type { UnitKind } from '@impulso/state';
export type SquadType = UnitKind;

export interface SquadViewModel {
  id: string;
  callSign: string;
  owner: SquadOwner;
  unitType: SquadType;
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

export interface CameraView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameplayViewModel {
  tick: number;
  sector: number;
  elapsedSeconds: number;
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
}

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
  | { type: 'set-clock-running'; running: boolean };

export interface GameplayPresentationAdapter {
  getSnapshot(): GameplayViewModel;
  subscribe(listener: () => void): () => void;
  dispatch(intent: PresentationIntent): void;
  destroy(): void;
}
