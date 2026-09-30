interface SoundButtonProps {
  enabled: boolean;
  onToggle: () => void;
}

export function SoundButton({ enabled, onToggle }: SoundButtonProps) {
  const className = enabled ? "btn icon-button is-on" : "btn icon-button";
  return (
    <button className={className} type="button" aria-label={enabled ? "Silenciar efectos" : "Activar efectos"} onClick={onToggle}>
      <svg data-icon="on" width="18" height="16" viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" hidden={!enabled}><path d="M1 5.5h3.5L9 1.5v13l-4.5-4H1z" /><path d="M12 5c1.2 1.6 1.2 4.4 0 6M14.5 3c2.3 2.8 2.3 7.2 0 10" /></svg>
      <svg data-icon="off" width="18" height="16" viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" hidden={enabled}><path d="M1 5.5h3.5L9 1.5v13l-4.5-4H1z" /><path d="M12 5.5l5 5M17 5.5l-5 5" /></svg>
    </button>
  );
}
