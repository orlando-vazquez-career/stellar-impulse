import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_KEYS, formatMessage, getActiveLocale, translate, type MessageKey } from './i18n';

describe('translate', () => {
  it('keeps every English message free of Spanish accents and marks, except the Spanish language name', () => {
    const accented = MESSAGE_KEYS.filter((key) => key !== 'spanishName' && /[áéíóúñ¿¡]/u.test(translate('en', key)));
    expect(accented).toEqual([]);
  });

  it('keeps the Spanish copy of the menu keys identical to the literals they replace', () => {
    const literals: Partial<Record<MessageKey, string>> = {
      systemsOnline: '● SISTEMAS EN LÍNEA',
      bridgeChannel: 'SECTOR 01 // PUENTE',
      menuOperations: 'OPERACIONES',
      documentTitle: 'Stellar Impulse · Interfaz visual',
      musicToggleLabel: 'MÚSICA',
      musicToggleMute: 'Silenciar música',
      musicToggleUnmute: 'Activar música',
    };
    for (const [key, literal] of Object.entries(literals)) expect(translate('es', key as MessageKey)).toBe(literal);
  });

  it('translates the menu keys into English', () => {
    expect(translate('en', 'menuOperations')).toBe('OPERATIONS');
    expect(translate('en', 'systemsOnline')).toBe('● SYSTEMS ONLINE');
    expect(translate('en', 'musicToggleMute')).toBe('Mute music');
    expect(translate('en', 'musicToggleUnmute')).toBe('Unmute music');
    expect(translate('en', 'musicToggleLabel')).toBe('MUSIC');
  });

  it('fills the placeholders of a message', () => {
    expect(translate('es', 'welcome', { name: 'Vega' })).toBe('Comandante Vega, el sector espera.');
    expect(translate('en', 'welcome', { name: 'Vega' })).toBe('Commander Vega, the sector awaits.');
  });

  it('carries the base copy other screens asked for', () => {
    expect(translate('es', 'accountCreateHint')).toBe('Tu alias queda guardado en la cuenta y te acompaña en cualquier dispositivo.');
    expect(translate('en', 'accountCreateHint')).toBe('Your alias is saved to the account and follows you on any device.');
    expect(translate('es', 'accountRegisterInvalid')).toBe('Revisa el correo electrónico.');
    expect(translate('en', 'accountRegisterInvalid')).toBe('Check the email address.');
    expect(translate('es', 'marketEmpty')).toBe('No hay anuncios activos. Publica una pieza desde «Mis piezas».');
    expect(translate('en', 'marketEmpty')).toBe('No open listings. List a piece from My pieces.');
    expect(translate('es', 'accountPasswordWeak')).toBe('La contraseña necesita de 8 a 128 caracteres, una minúscula, una mayúscula y un símbolo.');
    expect(translate('en', 'accountPasswordWeak')).toBe('The password needs 8 to 128 characters, a lowercase letter, an uppercase letter and a symbol.');
    expect(MESSAGE_KEYS).not.toContain('mapValue');
  });
});

describe('formatMessage', () => {
  it('replaces every appearance of each placeholder', () => {
    expect(formatMessage('{a} y {a} contra {b}', { a: 1, b: 'Vega' })).toBe('1 y 1 contra Vega');
  });

  it('leaves the template alone without values and keeps unknown placeholders', () => {
    expect(formatMessage('Hola {name}')).toBe('Hola {name}');
    expect(formatMessage('Hola {name}', { other: 2 })).toBe('Hola {name}');
  });
});

describe('getActiveLocale', () => {
  afterEach(() => vi.unstubAllGlobals());
  const storage = (value: string | null) => ({ getItem: (key: string) => key === 'impulso.locale' ? value : null });

  it('reads the saved locale', () => {
    vi.stubGlobal('localStorage', storage('en'));
    expect(getActiveLocale()).toBe('en');
    vi.stubGlobal('localStorage', storage('es'));
    expect(getActiveLocale()).toBe('es');
  });

  it('falls back to Spanish for anything else', () => {
    vi.stubGlobal('localStorage', storage(null));
    expect(getActiveLocale()).toBe('es');
    vi.stubGlobal('localStorage', storage('fr'));
    expect(getActiveLocale()).toBe('es');
  });

  it('falls back to Spanish when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(getActiveLocale()).toBe('es');
  });
});
