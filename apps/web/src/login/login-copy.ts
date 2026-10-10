import type { PasswordRule } from '@impulso/input';
import { formatMessage, type Locale, type MessageValues } from '../visual/i18n';

/** Fixed texts of the access panel that live outside the shared dictionary. */
const es = {
  eyebrow: 'INGRESO',
  brand: 'IMPULSO STELLAR',
  ruleLength: 'De 8 a 128 caracteres',
  ruleLowercase: 'Una minúscula',
  ruleUppercase: 'Una mayúscula',
  ruleSymbol: 'Un símbolo, como ! # - _ o un espacio',
} as const;

export type LoginCopyKey = keyof typeof es;

const en: Record<LoginCopyKey, string> = {
  eyebrow: 'LOGIN',
  brand: 'STELLAR IMPULSE',
  ruleLength: '8 to 128 characters',
  ruleLowercase: 'A lowercase letter',
  ruleUppercase: 'An uppercase letter',
  ruleSymbol: 'A symbol, such as ! # - _ or a space',
};

export const LOGIN_COPY_KEYS = Object.keys(es) as LoginCopyKey[];

export function loginText(locale: Locale, key: LoginCopyKey, values?: MessageValues): string {
  return formatMessage((locale === 'en' ? en : es)[key], values);
}

const RULE_KEYS: Record<PasswordRule, LoginCopyKey> = {
  length: 'ruleLength',
  lowercase: 'ruleLowercase',
  uppercase: 'ruleUppercase',
  symbol: 'ruleSymbol',
};

/** One line of the password checklist shown while creating an account. */
export function passwordRuleText(locale: Locale, rule: PasswordRule): string {
  return loginText(locale, RULE_KEYS[rule]);
}
