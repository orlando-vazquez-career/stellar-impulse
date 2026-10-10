import { translate, type Locale } from '../i18n';
import { contractText, marketText } from '../market/market-copy';

/** Freighter is open on an account other than the one linked to this game account. */
export class WrongAccountError extends Error {
  constructor(readonly active: string, readonly linked: string) { super('wrong account'); }
}

/** "GA7Q…VSGZ": a Stellar address short enough for a sentence. */
export function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Turns chain, wallet and server failures into one line in the player's language. Only reads
 * `code`, `contractCode` and the wrong-account addresses, so it never loads the chain client.
 */
export function chainErrorText(error: unknown, locale: Locale): string {
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  if (error instanceof WrongAccountError) return t('chainWrongAccount', { active: short(error.active), linked: short(error.linked) });
  if (error && typeof error === 'object' && 'code' in error) {
    const { code, contractCode } = error as { code: unknown; contractCode?: unknown };
    switch (code) {
      case 'WALLET_UNAVAILABLE': return t('chainNoFreighter');
      case 'WALLET_REJECTED': return t('chainRejected');
      case 'NETWORK_MISMATCH': return t('chainWrongNetwork');
      case 'UNFUNDED_ACCOUNT': return t('chainUnfunded');
      case 'RPC_UNAVAILABLE': return t('chainReadFailed');
      case 'PENDING': return marketText(locale, 'pending');
      case 'INVALID_RESPONSE': return marketText(locale, 'invalidResponse');
      case 'CONTRACT_REJECTED': {
        const worded = typeof contractCode === 'number' ? contractText(locale, contractCode) : null;
        return worded ?? t('chainContractRefused', { code: String(contractCode ?? '?') });
      }
      case 'wallet_in_use': return t('chainWalletInUse');
      case 'wallet_challenge_expired': return t('chainChallengeExpired');
      case 'invalid_wallet_signature': return t('chainBadSignature');
      case 'authentication_required': return t('chainSessionExpired');
    }
  }
  return t('chainActionFailed');
}

/** The transaction a failure points at, so the notice can link it in the explorer. */
export function chainErrorHash(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('transactionHash' in error)) return undefined;
  const hash = (error as { transactionHash?: unknown }).transactionHash;
  return typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash) ? hash : undefined;
}
