import type { MatchReward } from '@impulso/sim';
import type { AuthService } from './auth';

/**
 * Rooms settle rewards from the simulation tick and never await them there. Colyseus shuts
 * the whole server down on an uncaught error, so a failed save reports `saveFailed` instead.
 */
export async function savedReward(auth: AuthService, userId: string, award: () => Promise<MatchReward>): Promise<MatchReward> {
  try {
    return await award();
  } catch (error) {
    console.error('[rewards] could not save account progress', error);
    const profile = auth.profile(userId);
    return { xpGained: 0, beforeXp: profile.xp, profile, challenges: [], unlocked: [], saveFailed: true };
  }
}
