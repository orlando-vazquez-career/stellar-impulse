import type { MatchReward } from '@impulso/sim';
import type { AuthService } from './auth';

/**
 * Rewards are saved from the simulation tick. Colyseus shuts the whole server down on an
 * uncaught error, so a failed save (full or detached disk) reports `saveFailed` instead.
 */
export function savedReward(auth: AuthService, userId: string, award: () => MatchReward): MatchReward {
  try {
    return award();
  } catch (error) {
    console.error('[rewards] could not save account progress', error);
    const profile = auth.profile(userId);
    return { xpGained: 0, beforeXp: profile.xp, profile, challenges: [], unlocked: [], saveFailed: true };
  }
}
