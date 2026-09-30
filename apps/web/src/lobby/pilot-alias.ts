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
