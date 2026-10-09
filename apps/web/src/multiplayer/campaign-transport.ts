import type { MatchTransport } from '../visual/game/server-adapter';
import type { CampaignView, CommandIntent, MultiplayerSession, MultiplayerSnapshot } from './session';

type Connection = 'online' | 'connecting' | 'offline';

function connectionOf(session: MultiplayerSnapshot): Connection {
  if (session.connection === 'online') return 'online';
  return session.connection === 'connecting' || session.connection === 'reconnecting' ? 'connecting' : 'offline';
}

/** What the HUD says about the room: errors first, then connection, pauses and campaign phases. */
function phaseNotice(session: MultiplayerSnapshot): string | null {
  if (session.error) return session.error;
  if (session.connection === 'reconnecting') return 'Reconectando con la sala…';
  if (session.connection === 'connecting') return 'Conectando con la sala…';
  if (session.connection !== 'online') return 'Se perdió la conexión con la sala.';
  const phase = session.phase;
  if (!phase) return 'Sincronizando la partida…';
  if (phase.pause) return `Partida pausada: esperando la reconexión de ${phase.seats[phase.pause.by]?.name ?? 'un jugador'}.`;
  if (phase.resumeInMs !== null) return `La partida continúa en ${Math.ceil(phase.resumeInMs / 1000)} s…`;
  if (phase.phase === 'countdown') return `La partida comienza en ${Math.ceil((phase.remainingMs ?? 0) / 1000)} s…`;
  if (phase.phase === 'transition') return `Sector ${phase.sector} completado. Preparando el siguiente sector…`;
  if (phase.phase === 'results' || phase.phase === 'closed') {
    if (phase.result?.reason === 'annulled') return 'La partida fue anulada.';
    if (phase.result?.winner === null) return 'La campaña terminó en empate.';
    if (phase.result?.reason === 'forfeit') return 'La campaña terminó por abandono de un jugador.';
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
        const text = phaseNotice(snapshot);
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
