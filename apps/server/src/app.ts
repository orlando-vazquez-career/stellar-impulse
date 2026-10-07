import { defineServer, defineRoom, createRouter, createEndpoint } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { trainingRoomWith } from './training-room';
import { BattlefieldRoom } from './battlefield-room';
import { campaignRoomWith } from './campaign-room';
import type { CampaignConfig } from './campaign/machine';
import { AuthError, AuthService, bearerToken } from './auth';

export interface AuthLimit { burst: number; refillPerSecond: number }

export interface GameServerOptions {
  /** Campaign timing overrides for tests or future modes. */
  campaign?: Partial<CampaignConfig>;
  auth?: AuthService;
  authDataFile?: string | null;
  /** Shared budget of password checks (login and registration). */
  authLimit?: AuthLimit;
}

/** 20 testers can sign in at once; past that, a flood cannot keep hashing passwords on the game loop. */
const DEFAULT_AUTH_LIMIT: AuthLimit = { burst: 20, refillPerSecond: 2 };

/** Password hashing blocks the event loop every room shares, so login and registration draw from one bucket. */
function tokenBucket({ burst, refillPerSecond }: AuthLimit) {
  let tokens = burst;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * refillPerSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function createGameServer(options: GameServerOptions = {}) {
  const auth = options.auth ?? new AuthService(options.authDataFile === undefined
    ? (process.env.AUTH_DATA_FILE ?? './data/users.json') : options.authDataFile);
  const passwordCheck = tokenBucket(options.authLimit ?? DEFAULT_AUTH_LIMIT);
  const limited = () => Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '1' } });
  const credentials = (body: unknown) => body && typeof body === 'object' && !Array.isArray(body)
    ? body as { email?: unknown; password?: unknown } : {};
  const respond = (action: () => unknown, status = 200): Response => {
    try { return Response.json(action(), { status }); }
    catch (error) {
      if (error instanceof AuthError) return Response.json({ error: error.code }, { status: error.status });
      throw error;
    }
  };
  const authenticated = (header: string | null) => {
    const token = bearerToken(header);
    const user = auth.getUser(token);
    if (!user) throw new AuthError(401, 'authentication_required');
    return { token, user };
  };
  const transport = new WebSocketTransport({
    maxPayload: 4096,
    verifyClient: (info, done) => {
      const expected = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173';
      // Node smoke clients have no Origin. Public deployment needs authenticated admission.
      done(!info.origin || info.origin === expected || (expected === 'http://127.0.0.1:5173' && info.origin === 'http://localhost:5173'));
    },
  });
  return defineServer({
    transport,
    greet: false,
    rooms: {
      training: defineRoom(trainingRoomWith(auth)),
      battlefield: defineRoom(BattlefieldRoom),
      campaign: defineRoom(campaignRoomWith(options.campaign ?? {}, auth)),
    },
    routes: createRouter({
      health: createEndpoint('/health', { method: 'GET' }, async () => ({
        status: 'ok', mode: 'training', persistent: auth.persistent,
      })),
      register: createEndpoint('/auth/register', { method: 'POST' }, async (ctx) => {
        if (!passwordCheck()) return limited();
        const { email, password } = credentials(ctx.body);
        return respond(() => auth.register(email, password), 201);
      }),
      login: createEndpoint('/auth/login', { method: 'POST' }, async (ctx) => {
        if (!passwordCheck()) return limited();
        const { email, password } = credentials(ctx.body);
        return respond(() => auth.login(email, password));
      }),
      me: createEndpoint('/auth/me', { method: 'GET' }, async (ctx) =>
        respond(() => ({ user: authenticated(ctx.request?.headers.get('authorization') ?? null).user }))),
      profile: createEndpoint('/auth/profile', {method:'GET'}, async(ctx)=>respond(()=>
        auth.profile(authenticated(ctx.request?.headers.get('authorization') ?? null).user.id))),
      logout: createEndpoint('/auth/logout', { method: 'POST' }, async (ctx) => {
        try {
          const { token } = authenticated(ctx.request?.headers.get('authorization') ?? null);
          auth.logout(token);
          return new Response(null, { status: 204 });
        } catch (error) {
          if (error instanceof AuthError) return Response.json({ error: error.code }, { status: error.status });
          throw error;
        }
      }),
    }),
  });
}
