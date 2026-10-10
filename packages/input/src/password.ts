import { passwordIssues } from './protocol.js';

/** Length limits of a new account's password; the login accepts any password of this length range. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * New accounts: 8–128 characters with a lowercase letter, an uppercase letter and a symbol (any character that is
 * not a letter, mark or digit). Letters include accented ones, so "Ñandú-clave" passes. The rule only applies when
 * an account is created: existing accounts keep signing in with the passwords they already have.
 */
export function passwordMeetsPolicy(password: string): boolean {
  return passwordIssues(password).length === 0;
}
