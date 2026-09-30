import { describe, expect, it, vi } from 'vitest';
import { normalizeAlias, readPilotAlias, writePilotAlias } from './pilot-alias';

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('pilot alias', () => {
  it('stores a trimmed uppercase name', () => {
    const storage = memory();
    writePilotAlias(normalizeAlias('  nova  '), storage);
    expect(readPilotAlias(storage)).toBe('NOVA');
  });

  it('starts empty when nothing is stored', () => {
    expect(readPilotAlias(memory())).toBe('');
  });

  it('reports a storage failure and keeps the session usable', () => {
    const error = new Error('blocked');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = {
      getItem: () => { throw error; },
      setItem: () => { throw error; },
    };
    expect(readPilotAlias(broken)).toBe('');
    writePilotAlias('NOVA', broken);
    expect(spy).toHaveBeenCalledWith(error);
    spy.mockRestore();
  });
});
