import type { GameMode } from './modes';

export interface LobbyState {
  modeId: string;
  entered: boolean;
  optionIndex: number | null;
  deployed: boolean;
}

export type LobbyAction =
  | { type: 'preview'; modeId: string }
  | { type: 'enter'; modeId: string }
  | { type: 'back' }
  | { type: 'pick'; optionIndex: number }
  | { type: 'deploy' };

const CHOOSE_OPTION = 'ELIGE UNA OPCIÓN';
const IN_ORBIT = 'T+00:00 · EN ÓRBITA';
const BROWSE_HINT = 'PASA EL CURSOR · CLIC PARA ENTRAR';

export function initialLobby(modeId: string): LobbyState {
  return { modeId, entered: false, optionIndex: null, deployed: false };
}

export function reduceLobby(state: LobbyState, action: LobbyAction): LobbyState {
  if (action.type === 'preview') return preview(state, action.modeId);
  if (action.type === 'enter') return { modeId: action.modeId, entered: true, optionIndex: null, deployed: false };
  if (action.type === 'back') return { ...state, entered: false, optionIndex: null, deployed: false };
  if (action.type === 'pick') return { ...state, optionIndex: action.optionIndex, deployed: false };
  if (state.optionIndex === null) return state;
  return { ...state, deployed: true };
}

export function describeRoute(mode: GameMode, state: LobbyState): string {
  if (!state.entered) return `${mode.code} · ${mode.name.toUpperCase()}`;
  if (state.optionIndex === null) return CHOOSE_OPTION;
  const choice = mode.options[state.optionIndex]?.name.toUpperCase() ?? '';
  return state.deployed ? `SALTANDO A ${choice}` : `LISTO · ${choice}`;
}

export function routeHint(entered: boolean): string {
  return entered ? IN_ORBIT : BROWSE_HINT;
}

function preview(state: LobbyState, modeId: string): LobbyState {
  if (state.entered || state.modeId === modeId) return state;
  return { ...state, modeId };
}
