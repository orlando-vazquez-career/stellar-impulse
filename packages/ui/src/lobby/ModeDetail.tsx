import type { LobbyMode } from "./types";
import { CatalogRow } from "./CatalogRow";

interface ModeDetailProps {
  mode: LobbyMode;
  optionIndex: number | null;
  deployed: boolean;
  hidden: boolean;
  onBack: () => void;
  onPick: (optionIndex: number) => void;
  onDeploy: () => void;
}

export function ModeDetail({ mode, optionIndex, deployed, hidden, onBack, onPick, onDeploy }: ModeDetailProps) {
  return (
    <section className="panel panel--detail" hidden={hidden}>
      <button className="btn back-button" type="button" onClick={onBack}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M17 6H2M6 1L1 6l5 5" /></svg>
        VOLVER AL ATLAS
      </button>
      <div className="detail-code">MODO {mode.num} · {mode.code}</div>
      <h2 className="detail-name serif">{mode.name}</h2>
      <p className="detail-blurb">{mode.blurb}</p>
      <div className="option-list">
        {mode.options.map((option, index) => (
          <CatalogRow
            key={option.name}
            num={optionNumber(index)}
            name={option.name}
            meta={option.meta}
            accent={mode.accent}
            active={index === optionIndex}
            variant="option"
            onSelect={() => onPick(index)}
          />
        ))}
      </div>
      <button className="btn deploy-button" type="button" disabled={optionIndex === null} onClick={onDeploy}>
        {deployed ? "EN RUTA" : "DESPLEGAR"}
      </button>
    </section>
  );
}

function optionNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
