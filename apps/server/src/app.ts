import { defineServer, defineRoom, createRouter, createEndpoint } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TrainingRoom } from './training-room';
import { BattlefieldRoom } from './battlefield-room';
import { campaignRoomWith } from './campaign-room';
import type { CampaignConfig } from './campaign/machine';
import { AuthError, AuthService, bearerToken } from './auth';

export interface GameServerOptions {
  /** Campaign timing overrides for tests or future modes. */
  campaign?: Partial<CampaignConfig>;
  auth?: AuthService;
  authDataFile?: string | null;
}

export function createGameServer(options: GameServerOptions = {}) {
  const auth = options.auth ?? new AuthService(options.authDataFile === undefined
    ? (process.env.AUTH_DATA_FILE ?? './data/users.json') : options.authDataFile);
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
      training: defineRoom(TrainingRoom),
      battlefield: defineRoom(BattlefieldRoom),
      campaign: defineRoom(campaignRoomWith(options.campaign ?? {}, auth)),
    },
    routes: createRouter({
      health: createEndpoint('/health', { method: 'GET' }, async () => ({
        status: 'ok', mode: 'training', persistent: false,
      })),
      register: createEndpoint('/auth/register', { method: 'POST' }, async (ctx) => {
        const { email, password } = credentials(ctx.body);
        return respond(() => auth.register(email, password), 201);
      }),
      login: createEndpoint('/auth/login', { method: 'POST' }, async (ctx) => {
        const { email, password } = credentials(ctx.body);
        return respond(() => auth.login(email, password));
      }),
      me: createEndpoint('/auth/me', { method: 'GET' }, async (ctx) =>
        respond(() => ({ user: authenticated(ctx.request?.headers.get('authorization') ?? null).user }))),
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
