import type { LobbyMode } from "./types";
import { CatalogRow } from "./CatalogRow";

interface ModeListProps {
  modes: readonly LobbyMode[];
  activeId: string;
  hidden: boolean;
  onPreview: (modeId: string) => void;
  onEnter: (modeId: string) => void;
}

export function ModeList({ modes, activeId, hidden, onPreview, onEnter }: ModeListProps) {
  return (
    <nav className="panel panel--modes" aria-label="Modos de juego" hidden={hidden}>
      {modes.map((mode) => (
        <CatalogRow
          key={mode.id}
          num={mode.num}
          name={mode.name}
          code={mode.code}
          meta={mode.meta}
          accent={mode.accent}
          active={mode.id === activeId}
          variant="mode"
          onSelect={() => onEnter(mode.id)}
          onPreview={() => onPreview(mode.id)}
        />
      ))}
    </nav>
  );
}
