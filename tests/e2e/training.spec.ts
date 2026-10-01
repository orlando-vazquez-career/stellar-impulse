import { Client } from '@colyseus/sdk';
import { expect, test } from '@playwright/test';
import type { PlayerView } from '../../packages/state/src/index';

test('training server remains available to two clients after the old web lobby is removed', async () => {
  const client = new Client('http://127.0.0.1:2567');
  const first = await client.create('training');
  try {
    const second = await client.joinById(first.roomId);
    try {
      expect(second.roomId).toBe(first.roomId);
      const view = await new Promise<PlayerView>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('training view timeout')), 5000);
        second.onMessage('view', (snapshot: PlayerView) => { clearTimeout(timeout); resolve(snapshot); });
      });
      expect(view.width).toBe(29);
      expect(view.height).toBe(29);
      expect(view.playerId).toBe('p2');
    } finally {
      await second.leave();
    }
  } finally {
    await first.leave();
  }
});