import { useState, type Dispatch, type FormEvent } from 'react';
import { useSpaceSound } from './sound';
import type { LoginUiEvent, LoginUiState } from './login-state';
import { useI18n } from '../visual/i18n';

export interface LoginFormProps {
  alias: string;
  onAliasChange?: (alias: string) => void;
  onContinueGuest?: (alias: string) => void;
  onLogin?: (email: string, password: string) => Promise<void>;
  onLoginError?: () => void;
  busy: boolean;
  notice: string;
  ui?: LoginUiState;
  dispatch?: Dispatch<LoginUiEvent>;
  onCreateTraining?: (alias: string) => void;
  onJoinRoom?: (code: string, alias: string) => void;
  onConnectWallet?: () => void;
  chainStatus?: string;
  chainBusy?: boolean;
  onOpenAtlas?: () => void;
}

const HOVER_PITCH = { pitch: 523 };

export function LoginForm(props: LoginFormProps) {
  const {
    alias,
    onAliasChange,
    onContinueGuest,
    onLogin,
    onLoginError,
    busy,
    notice,
    chainStatus = 'Stellar Testnet',
    onOpenAtlas,
  } = props;
  const { t } = useI18n();
  const sound = useSpaceSound();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const locked = busy;

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

  return (
    <div className="li-form">
      <div className="li-header-row">
        <p className="li-eyebrow li-eyebrow--login">LOGIN</p>
        <span className="li-channel">PROTOCOLO DE ACCESO // CH-01</span>
      </div>

      <h1 className="li-title" data-text="IMPULSO STELLAR">IMPULSO STELLAR</h1>

      {onLogin && (
        <form
          className="li-account"
          onSubmit={async (event) => {
            event.preventDefault();
            if (locked) return;
            sound.playSelect();
            try {
              await onLogin(email, password);
            } catch {
              onLoginError?.();
            } finally {
              setPassword('');
            }
          }}
        >
          <label className="li-alias-label" htmlFor="account-email">{t('accountEmail')}</label>
          <input
            id="account-email"
            className="li-input"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <label className="li-alias-label" htmlFor="account-password">{t('accountPassword')}</label>
          <input
            id="account-password"
            className="li-input"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
          <button className="li-btn li-btn--primary" type="submit" disabled={locked} onMouseEnter={hover}>
            {busy ? t('accountConnecting') : t('accountLogin')} →
          </button>
        </form>
      )}

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
        </div>
      </form>

      <p className="li-notice" role="status">{notice}</p>
      <p className="li-chain">{chainStatus}</p>
    </div>
  );
}

