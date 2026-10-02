import { useState } from 'react';
import { LoginScreen } from '../../login/LoginScreen';
import { AuthRequestError, loginAccount, type AccountUser } from '../../auth/client';
import { readPilotAlias, writePilotAlias } from '../../login/pilot-alias';
import { useI18n } from '../i18n';

export interface AccessScreenProps {
  onContinue: (alias: string) => void;
  onCreateTraining?: (alias: string) => void;
  onJoinRoom?: (code: string, alias: string) => void;
  onSignedIn: (user: AccountUser, alias: string) => void;
  sessionBusy?: boolean;
  sessionNotice?: string;
}

export function AccessScreen({ onContinue, onCreateTraining, onJoinRoom, onSignedIn, sessionBusy = false, sessionNotice = '' }: AccessScreenProps) {
  const { t } = useI18n();
  const [alias, setAlias] = useState(readPilotAlias);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [chainStatus, setChainStatus] = useState('Stellar Testnet');
  const [chainBusy, setChainBusy] = useState(false);

  async function handleLogin(email: string, password: string) {
    setBusy(true);
    setNotice('');
    try {
      const user = await loginAccount(email, password);
      const commander = alias.trim() || user.email.split('@')[0]!.slice(0, 24);
      writePilotAlias(commander);
      onSignedIn(user, commander);
    } catch (error) {
      setNotice(error instanceof AuthRequestError && (error.status === 400 || error.status === 401)
        ? t('accountInvalid') : t('accountUnavailable'));
    } finally { setBusy(false); }
  }

  async function handleConnectWallet() {
    setChainBusy(true);
    try {
      const chain = await import('@impulso/chain');
      const result = await chain.connectFreighterTestnet();
      setChainStatus(`Wallet conectada · ${result.address.slice(0, 8)}…${result.address.slice(-8)}`);
    } catch (error) {
      setChainStatus(error instanceof Error ? error.message : 'No se pudo consultar la red.');
    } finally {
      setChainBusy(false);
    }
  }

  return (
    <LoginScreen
      alias={alias}
      busy={busy || sessionBusy}
      notice={notice || sessionNotice}
      onLogin={handleLogin}
      onAliasChange={setAlias}
      onContinueGuest={onContinue}
      onCreateTraining={onCreateTraining ?? onContinue}
      onJoinRoom={onJoinRoom}
      onConnectWallet={() => void handleConnectWallet()}
      chainStatus={chainStatus}
      chainBusy={chainBusy}
      onOpenAtlas={() => onContinue(alias.trim() || 'Vega')}
    />
  );
}
