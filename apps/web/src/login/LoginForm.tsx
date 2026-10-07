import { useState, type Dispatch, type FormEvent } from 'react';
import { useSpaceSound } from './sound';
import type { LoginUiEvent, LoginUiState } from './login-state';
import { useI18n } from '../visual/i18n';

export interface LoginFormProps {
  alias: string;
  onAliasChange?: (alias: string) => void;
  onContinueGuest?: (alias: string) => void;
  onLogin?: (email: string, password: string) => Promise<void>;
  busy: boolean;
  notice: string;
  ui: LoginUiState;
  dispatch: Dispatch<LoginUiEvent>;
  onCreateTraining: (alias: string) => void;
  onJoinRoom: (code: string, alias: string) => void;
  onConnectWallet: () => void;
  chainStatus: string;
  chainBusy: boolean;
  onOpenAtlas?: () => void;
}

const HOVER_PITCH = { pitch: 523 };

export function LoginForm(props: LoginFormProps) {
  const {
    alias,
    onAliasChange,
    onContinueGuest,
    onLogin,
    busy,
    notice,
    ui,
    dispatch,
    onCreateTraining,
    onJoinRoom,
    onConnectWallet,
    chainStatus,
    chainBusy,
    onOpenAtlas,
  } = props;
  const { t } = useI18n();
  const sound = useSpaceSound();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const locked = busy || ui.pending !== null;

  function hover() {
    sound.playHover(HOVER_PITCH);
  }

  function handleContinueGuest(event?: FormEvent) {
    if (event) event.preventDefault();
    const effectiveAlias = alias.trim() || 'Vega';
    sound.playEnter();
    if (onContinueGuest) {
      onContinueGuest(effectiveAlias);
    } else if (onOpenAtlas) {
      onOpenAtlas();
    }
  }

  function create() {
    const effectiveAlias = alias.trim() || 'Vega';
    sound.playEnter({ pitch: 392 });
    dispatch({ type: 'start', action: 'create' });
    onCreateTraining(effectiveAlias);
  }

  function join(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    const effectiveAlias = alias.trim() || 'Vega';
    sound.playSelect();
    dispatch({ type: 'start', action: 'join' });
    onJoinRoom(code.trim(), effectiveAlias);
  }

  function wallet() {
    sound.playSelect();
    dispatch({ type: 'start', action: 'wallet' });
    onConnectWallet();
  }

  return (
    <div className="li-form">
      <div className="li-header-row">
        <p className="li-eyebrow li-eyebrow--login">LOGIN</p>
        <span className="li-channel">PROTOCOLO DE ACCESO // CH-01</span>
      </div>

      <h1 className="li-title" data-text="STELLAR IMPULSE">STELLAR IMPULSE</h1>
      <h2 className="li-heading-call">{t('accessTitle')}</h2>
      <p className="li-subtitle">{t('accessBody')}</p>

      {onLogin && <form className="li-account" onSubmit={(event) => {
        event.preventDefault();
        if (locked) return;
        sound.playSelect();
        void onLogin(email, password).finally(() => setPassword(''));
      }}>
        <label className="li-alias-label" htmlFor="account-email">{t('accountEmail')}</label>
        <input id="account-email" className="li-input" type="email" autoComplete="username"
          required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
        <label className="li-alias-label" htmlFor="account-password">{t('accountPassword')}</label>
        <input id="account-password" className="li-input" type="password" autoComplete="current-password"
          required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        <button className="li-btn li-btn--primary" type="submit" disabled={locked} onMouseEnter={hover}>
          {busy ? t('accountConnecting') : t('accountLogin')} →
        </button>
      </form>}

      <form onSubmit={handleContinueGuest}>
        <div className="li-alias-box">
          <label htmlFor="commander-alias" className="li-alias-label">{t('callsign')}</label>
          <input
            id="commander-alias"
            className="li-input"
            value={alias}
            onChange={(event) => onAliasChange?.(event.target.value)}
            placeholder={t('callsignPlaceholder')}
            maxLength={24}
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="li-actions">
          <button
            type="submit"
            className="li-btn li-btn--primary"
            disabled={locked || !alias.trim()}
            onMouseEnter={hover}
          >
            {t('continueGuest')} →
          </button>

          <button
            type="button"
            className="li-btn"
            disabled={locked || !alias.trim()}
            onMouseEnter={hover}
            onClick={create}
          >
            {ui.pending === 'create' ? 'Conectando…' : 'Crear entrenamiento'}
          </button>

          <button
            type="button"
            className="li-btn"
            disabled={locked}
            aria-expanded={ui.joinOpen}
            onMouseEnter={hover}
            onClick={() => {
              sound.playSelect();
              dispatch({ type: 'toggle-join' });
            }}
          >
            Unirse con código
          </button>

          {ui.joinOpen && (
            <div className="li-join">
              <label htmlFor="li-room-code">Código de sala</label>
              <div className="li-join-row">
                <input
                  id="li-room-code"
                  form="li-join-form"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={64}
                  placeholder="Ingresa un código"
                  autoComplete="off"
                  required
                />
                <button
                  type="submit"
                  form="li-join-form"
                  className="li-btn"
                  disabled={locked || !code.trim()}
                >
                  {ui.pending === 'join' ? 'Entrando…' : 'Entrar'}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="li-btn li-btn--ghost"
            disabled={locked || chainBusy}
            onMouseEnter={hover}
            onClick={wallet}
          >
            {ui.pending === 'wallet' ? 'Consultando…' : 'Conectar Freighter'}
          </button>

          {onOpenAtlas && (
            <button
              type="button"
              className="li-atlas"
              disabled={locked || !alias.trim()}
              onMouseEnter={hover}
              onClick={() => {
                sound.playSelect();
                onOpenAtlas();
              }}
            >
              {t('commandCenter')} →
            </button>
          )}
        </div>
      </form>
      {/* Keep joining independent from the alias form without changing the panel layout. */}
      <form id="li-join-form" onSubmit={join} />

      <p className="li-notice" role="status">{notice}</p>
      <p className="li-chain">{chainStatus}</p>
      <p className="li-fineprint">{t('privacyNote')}</p>
    </div>
  );
}
