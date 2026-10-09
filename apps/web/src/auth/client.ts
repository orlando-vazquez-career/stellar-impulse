const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567').replace(/\/$/, '');
const TOKEN_KEY = 'impulso.auth-token';

/** `displayName` is the commander alias kept in the account; null until the player picks one. */
export interface AccountUser { id: string; email: string; displayName: string | null }

/** `code` is the error the server named (`email_in_use`, `invalid_display_name`…), when it sent one. */
export class AuthRequestError extends Error {
  constructor(public readonly status: number, public readonly code = '') { super('Authentication request failed'); }
}

/** i18n keys for what went wrong while signing in or creating an account. */
export type AccountErrorKey = 'accountInvalid' | 'accountRegisterInvalid' | 'accountEmailInUse' | 'accountAliasInvalid' | 'accountUnavailable';

export function sessionToken(): string | null { return sessionStorage.getItem(TOKEN_KEY); }
export function clearSession(): void { sessionStorage.removeItem(TOKEN_KEY); }

/** An answer without `displayName` (a server older than aliases) counts as an account without one. */
function toUser(value: unknown): AccountUser | null {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string'
    || !('email' in value) || typeof value.email !== 'string') return null;
  const displayName = 'displayName' in value && typeof value.displayName === 'string' ? value.displayName : null;
  return { id: value.id, email: value.email, displayName };
}

async function requestError(response: Response): Promise<AuthRequestError> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return new AuthRequestError(response.status, typeof body?.error === 'string' ? body.error : '');
}

async function userFrom(response: Response): Promise<AccountUser> {
  const user = toUser((await response.json() as { user?: unknown }).user);
  if (!user) throw new Error('Invalid authentication response');
  return user;
}

/** Login and registration answer alike: a session token and the account. */
async function startSession(path: string, body: Record<string, string>): Promise<AccountUser> {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await requestError(response);
  const result = await response.json() as { token?: unknown; user?: unknown };
  const user = toUser(result.user);
  if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.token) || !user) {
    throw new Error('Invalid authentication response');
  }
  sessionStorage.setItem(TOKEN_KEY, result.token);
  return user;
}

export function loginAccount(email: string, password: string): Promise<AccountUser> {
  return startSession('/auth/login', { email, password });
}

/** Creates the account and signs in with it. Without `displayName` the account starts with no alias. */
export function registerAccount(email: string, password: string, displayName?: string): Promise<AccountUser> {
  return startSession('/auth/register', { email, password, ...(displayName === undefined ? {} : { displayName }) });
}

export async function restoreAccount(): Promise<AccountUser | null> {
  const token = sessionToken();
  if (!token) return null;
  const response = await fetch(`${SERVER_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (response.status === 401) { clearSession(); return null; }
  if (!response.ok) throw new AuthRequestError(response.status);
  return userFrom(response);
}

/** Saves the commander alias in the account, so it follows the player to any device. */
export async function updateDisplayName(displayName: string): Promise<AccountUser> {
  const token = sessionToken();
  if (!token) throw new AuthRequestError(401, 'authentication_required');
  const response = await fetch(`${SERVER_URL}/auth/profile`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) throw await requestError(response);
  return userFrom(response);
}

export function accountErrorKey(error: unknown, action: 'login' | 'register'): AccountErrorKey {
  if (!(error instanceof AuthRequestError)) return 'accountUnavailable';
  if (error.status === 409) return 'accountEmailInUse';
  if (error.code === 'invalid_display_name') return 'accountAliasInvalid';
  if (error.status === 400 || error.status === 401) return action === 'register' ? 'accountRegisterInvalid' : 'accountInvalid';
  return 'accountUnavailable';
}

export async function logoutAccount(): Promise<void> {
  const token = sessionToken();
  try {
    if (!token) return;
    const response = await fetch(`${SERVER_URL}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!response.ok && response.status !== 401) throw new AuthRequestError(response.status);
  } finally { clearSession(); }
}
