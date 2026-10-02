export type LoginAction = 'create' | 'join' | 'wallet';

export interface LoginUiState {
  /** El formulario de código solo se muestra cuando el piloto lo pide. */
  joinOpen: boolean;
  /** Acción en vuelo; bloquea el resto de botones hasta que el padre avisa. */
  pending: LoginAction | null;
}

export type LoginUiEvent =
  | { type: 'toggle-join' }
  | { type: 'start'; action: LoginAction }
  | { type: 'settle' };

export function initialLoginUi(): LoginUiState {
  return { joinOpen: false, pending: null };
}

export function reduceLoginUi(state: LoginUiState, event: LoginUiEvent): LoginUiState {
  if (event.type === 'toggle-join') {
    if (state.pending !== null) return state;
    return { ...state, joinOpen: !state.joinOpen };
  }
  if (event.type === 'start') {
    if (state.pending !== null) return state;
    return { ...state, pending: event.action };
  }
  return { joinOpen: state.joinOpen, pending: null };
}
