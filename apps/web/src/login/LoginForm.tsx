import { useState, type Dispatch, type FormEvent } from 'react';
import { useSpaceSound } from './sound';
import type { LoginUiEvent, LoginUiState } from './login-state';

interface LoginFormProps {
  alias: string;
  busy: boolean;
  notice: string;
  ui: LoginUiState;
  dispatch: Dispatch<LoginUiEvent>;
  onCreateTraining: () => void;
  onJoinRoom: (code: string) => void;
  onConnectWallet: () => void;
  chainStatus: string;
  chainBusy: boolean;
  onOpenAtlas?: () => void;
}

const HOVER_PITCH = { pitch: 523 };

export function LoginForm(props: LoginFormProps) {
  const { alias, busy, notice, ui, dispatch, onCreateTraining, onJoinRoom, onConnectWallet, chainStatus, chainBusy, onOpenAtlas } = props;
  const sound = useSpaceSound();
  const [code, setCode] = useState('');
  const locked = busy || ui.pending !== null;

  function hover() {
    sound.playHover(HOVER_PITCH);
  }

  function create() {
    sound.playEnter({ pitch: 392 });
    dispatch({ type: 'start', action: 'create' });
    onCreateTraining();
  }

  function join(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    sound.playSelect();
    dispatch({ type: 'start', action: 'join' });
    onJoinRoom(code.trim());
  }

  function wallet() {
    sound.playSelect();
    dispatch({ type: 'start', action: 'wallet' });
    onConnectWallet();
  }

  return (
    <div className="li-form">
      <p className="li-eyebrow li-eyebrow--login">LOGIN</p>
      <h1 className="li-title" data-text="IMPULSO STELLAR">IMPULSO</h1>
      <h1 className="li-title" data-text="IMPULSO STELLAR">STELLAR</h1>

      <p className="li-alias">
        <span className="li-alias-label">Comandante</span>
      </p>

      <div className="li-actions">
        <button type="button" className="li-btn li-btn--primary" disabled={locked} onMouseEnter={hover} onClick={create}>
          {ui.pending === 'create' ? 'Conectando…' : 'Crear entrenamiento'}
        </button>
        <button
          type="button"
          className="li-btn"
          disabled={busy}
          aria-expanded={ui.joinOpen}
          onMouseEnter={hover}
          onClick={() => { sound.playSelect(); dispatch({ type: 'toggle-join' }); }}
        >
          Unirse con código
        </button>
        {ui.joinOpen && (
          <form className="li-join" onSubmit={join}>
            <label htmlFor="li-room-code">Código de sala</label>
            <div className="li-join-row">
              <input
                id="li-room-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={64}
                placeholder="Ingresa un código"
                autoComplete="off"
                required
              />
              <button type="submit" className="li-btn" disabled={locked}>
                {ui.pending === 'join' ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </form>
        )}
        <button type="button" className="li-btn li-btn--ghost" disabled={locked || chainBusy} onMouseEnter={hover} onClick={wallet}>
          {ui.pending === 'wallet' ? 'Consultando…' : 'Conectar Freighter'}
        </button>
        {onOpenAtlas && (
          <button type="button" className="li-atlas" disabled={locked} onMouseEnter={hover} onClick={() => { sound.playSelect(); onOpenAtlas(); }}>
            Atlas de mando →
          </button>
        )}
      </div>

      <p className="li-notice" role="status">{notice}</p>
      <p className="li-chain">{chainStatus}</p>
      <p className="li-fineprint">Juega, compite, conquista.</p>
    </div>
  );
}
