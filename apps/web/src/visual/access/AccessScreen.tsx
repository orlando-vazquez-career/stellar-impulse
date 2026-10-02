import { useState } from 'react';
import { LoginScreen } from '../../login/LoginScreen';

export interface AccessScreenProps {
  onContinue: (alias: string) => void;
  onCreateTraining?: (alias: string) => void;
  onJoinRoom?: (code: string, alias: string) => void;
}

export function AccessScreen({ onContinue, onCreateTraining, onJoinRoom }: AccessScreenProps) {
  const [alias, setAlias] = useState('');
  const [chainStatus, setChainStatus] = useState('Stellar Testnet');
  const [chainBusy, setChainBusy] = useState(false);

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
