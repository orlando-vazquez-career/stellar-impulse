import { useEffect, useRef } from 'react';
import type { TrainingMapId } from '@impulso/sim';
import { drawMapPreview } from './map-preview';

/** Miniature of a map drawn from the data the match is played on: terrain, bases, nodes and hazards. */
export function MapPreview({ map }: { map: TrainingMapId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (canvas.current) drawMapPreview(canvas.current, map); }, [map]);
  return <canvas ref={canvas} className="vi-map-preview__canvas" data-map={map} />;
}
