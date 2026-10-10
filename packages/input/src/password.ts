export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

/** New accounts: 8–20 characters, mixed case and one character that is not a letter or digit. */
export function passwordMeetsPolicy(password: string): boolean {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return false;
  return HAS_LOWERCASE.test(password) && HAS_UPPERCASE.test(password) && HAS_SPECIAL.test(password);
}
