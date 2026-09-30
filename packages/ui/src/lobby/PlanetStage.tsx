import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { LobbyMode } from "./types";
import { MAP_MARKUP, ORBIT_MARKUP } from "./art-markup";
import { ModeArt } from "./ModeArt";

const NODE_DOT_OFFSET_X = 7;
const NODE_LABEL_OFFSET_Y = 22;

interface PlanetStageProps {
  modes: readonly LobbyMode[];
  active: LobbyMode;
  entered: boolean;
  shock: number;
  onPreview: (modeId: string) => void;
  onEnter: (modeId: string) => void;
}

export function PlanetStage({ modes, active, entered, shock, onPreview, onEnter }: PlanetStageProps) {
  const shockwave = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (shock === 0) return;
    const element = shockwave.current;
    if (!element) return;
    element.classList.remove("is-playing");
    void element.offsetWidth;
    element.classList.add("is-playing");
  }, [shock]);

  return (
    <div className={entered ? "planet-stage is-zoomed" : "planet-stage"}>
      <svg width="760" height="760" viewBox="0 0 760 760" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ORBIT_MARKUP }} />
      <div className="planet">
        <div className="planet-rim" />
        <div>
          {modes.map((mode) => (
            <img
              key={mode.id}
              className={mode.id === active.id ? "planet-sprite is-visible" : "planet-sprite"}
              src={mode.sprite}
              alt={mode.id === active.id ? `Planeta de ${mode.name}` : ""}
              width={500}
              height={500}
            />
          ))}
        </div>
        <div className="planet-shade" />
      </div>
      <div className="lobby-map" hidden={entered}>
        <svg width="760" height="760" viewBox="0 0 760 760" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MAP_MARKUP }} />
        <div>
          {modes.map((mode) => (
            <button
              key={mode.id}
              className="btn map-node"
              type="button"
              aria-label={`Entrar a ${mode.name}`}
              style={nodeStyle(mode)}
              onClick={() => onEnter(mode.id)}
              onMouseEnter={() => onPreview(mode.id)}
            >
              <span className="map-node-dot">
                <span className="map-node-pulse" />
                <span className="map-node-core" />
              </span>
              <span className="map-node-code">{mode.code}</span>
              <span className="map-node-meta">{mode.meta}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="shockwave" ref={shockwave} />
      <ModeArt activeId={active.id} entered={entered} />
    </div>
  );
}

function nodeStyle(mode: LobbyMode): CSSProperties {
  return {
    left: `${mode.x - NODE_DOT_OFFSET_X}px`,
    top: `${mode.y - NODE_LABEL_OFFSET_Y}px`,
    "--node-accent": mode.accent,
  } as CSSProperties;
}
