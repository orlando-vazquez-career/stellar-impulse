import { useState } from 'react';
import { LoginScreen } from '../../login/LoginScreen';
import { accountErrorKey, loginAccount, registerAccount, updateDisplayName, type AccountUser } from '../../auth/client';
import { accountAlias, readPilotAlias, writePilotAlias } from '../../login/pilot-alias';
import { useI18n } from '../i18n';

export interface AccessScreenProps {
  onContinue: (alias: string) => void;
  onCreateTraining?: (alias: string) => void;
  onJoinRoom?: (code: string, alias: string) => void;
  onSignedIn: (user: AccountUser, alias: string) => void;
  sessionBusy?: boolean;
  sessionNotice?: string;
  musicVolume: number;
  musicMuted: boolean;
  onMusicVolumeChange(volume: number): void;
  onMusicMuteChange(muted: boolean): void;
}

export function AccessScreen({ onContinue, onCreateTraining, onJoinRoom, onSignedIn, sessionBusy = false, sessionNotice = '', musicVolume, musicMuted, onMusicVolumeChange, onMusicMuteChange }: AccessScreenProps) {
  const { t } = useI18n();
  const [alias, setAlias] = useState(readPilotAlias);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [chainStatus, setChainStatus] = useState('Stellar Testnet');
  const [chainBusy, setChainBusy] = useState(false);

  /** Login and registration end alike: the account's alias (or the one typed here) becomes the pilot's. */
  async function signIn(action: 'login' | 'register', request: () => Promise<AccountUser>) {
    setBusy(true);
    setNotice('');
    try {
      const user = await request();
      const commander = accountAlias(user, alias);
      writePilotAlias(commander);
      onSignedIn(user, commander);
    } catch (error) {
      setNotice(t(accountErrorKey(error, action)));
      throw error;
    } finally { setBusy(false); }
  }

  // An account without an alias keeps the one typed here, so it follows the player to other devices.
  // Failing to save it never blocks the sign-in.
  const handleLogin = (email: string, password: string) => signIn('login', async () => {
    const user = await loginAccount(email, password);
    const typed = alias.trim();
    if (user.displayName || !typed) return user;
    return updateDisplayName(typed).catch((error: unknown) => { console.error(error); return user; });
  });

  const handleRegister = (email: string, password: string) =>
    signIn('register', () => registerAccount(email, password, alias));

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
      onRegister={handleRegister}
      onAliasChange={setAlias}
      onContinueGuest={onContinue}
      onCreateTraining={onCreateTraining ?? onContinue}
      onJoinRoom={onJoinRoom}
      onConnectWallet={() => void handleConnectWallet()}
      chainStatus={chainStatus}
      chainBusy={chainBusy}
      onOpenAtlas={() => onContinue(alias.trim() || 'Vega')}
      musicVolume={musicVolume}
      musicMuted={musicMuted}
      onMusicVolumeChange={onMusicVolumeChange}
      onMusicMuteChange={onMusicMuteChange}
    />
  );
}
