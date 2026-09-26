import { defineServer, defineRoom, createRouter, createEndpoint } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TrainingRoom } from './training-room';
import { campaignRoomWith } from './campaign-room';
import type { CampaignConfig } from './campaign/machine';

export interface GameServerOptions {
  /** Campaign timing overrides for tests or future modes. */
  campaign?: Partial<CampaignConfig>;
}

export function createGameServer(options: GameServerOptions = {}) {
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
      campaign: defineRoom(campaignRoomWith(options.campaign ?? {})),
    },
    routes: createRouter({
      health: createEndpoint('/health', { method: 'GET' }, async () => ({
        status: 'ok', mode: 'training', persistent: false,
      })),
    }),
  });
}
