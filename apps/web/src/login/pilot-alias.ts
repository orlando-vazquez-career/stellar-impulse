const ALIAS_KEY = 'impulso-stellar:alias';

interface AliasRead {
  getItem: (key: string) => string | null;
}

interface AliasWrite {
  setItem: (key: string, value: string) => void;
}

export function normalizeAlias(value: string): string {
  return value.trim().toUpperCase();
}

/** Alias de un comandante con sesión: el de su cuenta, si no el escrito aquí y si no el nombre de su correo. */
export function accountAlias(account: { email: string; displayName: string | null }, typed: string): string {
  return account.displayName || typed.trim() || account.email.split('@')[0]!.slice(0, 24);
}

export function readPilotAlias(storage: AliasRead = localStorage): string {
  try {
    return storage.getItem(ALIAS_KEY) ?? '';
  } catch (error) {
    console.error(error);
    return '';
  }
}

export function writePilotAlias(alias: string, storage: AliasWrite = localStorage): void {
  try {
    storage.setItem(ALIAS_KEY, alias);
  } catch (error) {
    console.error(error);
  }
}
