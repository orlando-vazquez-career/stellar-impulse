const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567').replace(/\/$/, '');
const TOKEN_KEY = 'impulso.auth-token';

export interface AccountUser { id: string; email: string }

export class AuthRequestError extends Error {
  constructor(public readonly status: number) { super('Authentication request failed'); }
}

export function sessionToken(): string | null { return sessionStorage.getItem(TOKEN_KEY); }
export function clearSession(): void { sessionStorage.removeItem(TOKEN_KEY); }

function isUser(value: unknown): value is AccountUser {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
    && 'email' in value && typeof value.email === 'string';
}

export async function loginAccount(email: string, password: string): Promise<AccountUser> {
  const response = await fetch(`${SERVER_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new AuthRequestError(response.status);
  const result = await response.json() as { token?: unknown; user?: unknown };
  if (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.token) || !isUser(result.user)) {
    throw new Error('Invalid authentication response');
  }
  sessionStorage.setItem(TOKEN_KEY, result.token);
  return result.user;
}

export async function ensureGuestSession(alias?: string): Promise<AccountUser> {
  const currentToken = sessionToken();
  if (currentToken) {
    try {
      const restored = await restoreAccount();
      if (restored) return restored;
    } catch {
      // Session expired or invalid, request a new guest session
    }
  }

  try {
    const response = await fetch(`${SERVER_URL}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ alias: alias || 'guest' }),
    });
    if (response.ok) {
      const result = await response.json() as { token?: unknown; user?: unknown };
      if (typeof result.token === 'string' && /^[A-Za-z0-9_-]{40,}$/.test(result.token) && isUser(result.user)) {
        sessionStorage.setItem(TOKEN_KEY, result.token);
        return result.user;
      }
    }
  } catch {
    // If /auth/guest endpoint is not reachable, fallback to register
  }

  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const cleanAlias = (alias?.trim().slice(0, 16).replace(/[^a-zA-Z0-9]/g, '') || 'guest').toLowerCase();
  const guestEmail = `${cleanAlias}-${randomSuffix}@guest.local`;
  const guestPassword = `Guest_${randomSuffix}_${Date.now()}`;

  const regResponse = await fetch(`${SERVER_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ email: guestEmail, password: guestPassword }),
  });
  if (!regResponse.ok) throw new AuthRequestError(regResponse.status);
  const regResult = await regResponse.json() as { token?: unknown; user?: unknown };
  if (typeof regResult.token !== 'string' || !/^[A-Za-z0-9_-]{40,}$/.test(regResult.token) || !isUser(regResult.user)) {
    throw new Error('Invalid authentication response');
  }
  sessionStorage.setItem(TOKEN_KEY, regResult.token);
  return regResult.user;
}

export async function restoreAccount(): Promise<AccountUser | null> {
  const token = sessionToken();
  if (!token) return null;
  const response = await fetch(`${SERVER_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (response.status === 401) { clearSession(); return null; }
  if (!response.ok) throw new AuthRequestError(response.status);
  const result = await response.json() as { user?: unknown };
  if (!isUser(result.user)) throw new Error('Invalid authentication response');
  return result.user;
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
