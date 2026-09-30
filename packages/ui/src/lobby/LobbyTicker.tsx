interface LobbyTickerProps {
  status: string;
  hint: string;
}

export function LobbyTicker({ status, hint }: LobbyTickerProps) {
  return (
    <footer className="ticker">
      <span className="ticker-status">{status}</span>
      <span className="ticker-rule" />
      <span className="ticker-hint">{hint}</span>
    </footer>
  );
}
