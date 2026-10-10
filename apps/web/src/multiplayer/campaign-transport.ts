import type { MatchTransport } from '../visual/game/server-adapter';
import { getActiveLocale, type Locale } from '../visual/i18n';
import { isMultiplayerErrorReason, multiplayerErrorText, multiplayerText, type MultiplayerKey } from './multiplayer-copy';
import type { CampaignView, CommandIntent, MultiplayerSession, MultiplayerSnapshot } from './session';

type Connection = 'online' | 'connecting' | 'offline';

function connectionOf(session: MultiplayerSnapshot): Connection {
  if (session.connection === 'online') return 'online';
  return session.connection === 'connecting' || session.connection === 'reconnecting' ? 'connecting' : 'offline';
}

/**
 * What the HUD says about the room, in the language the player chose: errors first, then connection, pauses
 * and campaign phases. An error the client has no reason for is shown as the session wrote it.
 */
function phaseNotice(session: MultiplayerSnapshot, locale: Locale): string | null {
  const text = (key: MultiplayerKey, values?: Record<string, string | number>) => multiplayerText(locale, key, values);
  if (session.error) {
    return session.errorReason && isMultiplayerErrorReason(session.errorReason)
      ? multiplayerErrorText(locale, session.errorReason) : session.error;
  }
  if (session.connection === 'reconnecting') return text('noticeReconnecting');
  if (session.connection === 'connecting') return text('noticeConnecting');
  if (session.connection !== 'online') return text('noticeConnectionLost');
  const phase = session.phase;
  if (!phase) return text('noticeSyncing');
  if (phase.pause) return text('noticePaused', { name: phase.seats[phase.pause.by]?.name ?? text('noticeSomePlayer') });
  if (phase.resumeInMs !== null) return text('noticeResume', { seconds: Math.ceil(phase.resumeInMs / 1000) });
  if (phase.phase === 'countdown') return text('noticeCountdown', { seconds: Math.ceil((phase.remainingMs ?? 0) / 1000) });
  if (phase.phase === 'transition') return text('noticeTransition', { sector: phase.sector });
  if (phase.phase === 'results' || phase.phase === 'closed') {
    if (phase.result?.reason === 'annulled') return text('noticeAnnulled');
    if (phase.result?.winner === null) return text('noticeDraw');
    if (phase.result?.reason === 'forfeit') return text('noticeForfeit');
  }
  return null;
}

/**
 * The campaign session as a gameplay transport: the session owns the room, its reconnection and the
 * order sequence; the adapter only reads its views and hands it intentions.
 */
export function campaignTransport(session: MultiplayerSession): MatchTransport {
  return {
    open(events) {
      let view: CampaignView | null = null;
      let notice: string | null | undefined;
      let connection: Connection | undefined;
      const sync = () => {
        const snapshot = session.getSnapshot();
        const state = connectionOf(snapshot);
        if (state !== connection) { connection = state; events.connection(state); }
        // Read on every change, so a language switched mid-match applies to the next notice.
        const text = phaseNotice(snapshot, getActiveLocale());
        if (text !== notice) { notice = text; events.notice(text); }
        if (snapshot.view && snapshot.view !== view) { view = snapshot.view; events.view(snapshot.view); }
        events.refresh();
      };
      const stop = session.subscribe(sync);
      sync();
      return stop;
    },
    command: (command) => session.command(command as CommandIntent),
    augmentPick: (choice, id) => session.augmentPick(choice, id),
    augmentReroll: (choice) => session.augmentReroll(choice),
    sector: () => session.getSnapshot().phase?.sector ?? 1,
    outcome() {
      const { phase, reward } = session.getSnapshot();
      if (!phase?.result || phase.result.winner === null || (phase.phase !== 'results' && phase.phase !== 'closed')) return null;
      return { result: phase.result.winner === phase.playerId ? 'victory' : 'defeat', ...(reward ? { reward } : {}) };
    },
  };
}
