import type { CSSProperties } from "react";

interface CatalogRowProps {
  num: string;
  name: string;
  meta: string;
  code?: string;
  accent: string;
  active: boolean;
  variant: "mode" | "option";
  onSelect: () => void;
  onPreview?: () => void;
}

export function CatalogRow({ num, name, meta, code, accent, active, variant, onSelect, onPreview }: CatalogRowProps) {
  const className = active ? `btn row row--${variant} is-active` : `btn row row--${variant}`;
  return (
    <button
      type="button"
      className={className}
      style={{ "--row-accent": accent } as CSSProperties}
      onClick={onSelect}
      onMouseEnter={onPreview}
      onFocus={onPreview}
    >
      <span className="row-head">
        <span className="row-num">{num}</span>
        <span className="row-name serif">{name}</span>
        <span className="row-meta">
          {code ? <span className="row-code">{code}</span> : null}
          <span>{meta}</span>
        </span>
      </span>
      <span className="row-line" />
    </button>
  );
}
