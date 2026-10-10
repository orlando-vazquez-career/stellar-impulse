import { useEffect, useRef } from 'react';
import type { TrainingMapId } from '@impulso/sim';
import { captureEllipse } from '../game/phaser/capture-geometry';
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from '../game/phaser/isometric';
import { useI18n } from '../i18n';
import { lobbyText } from '../lobby/lobby-copy';
import { mapName } from './map-name';
import { buildMapPreview, fitMapPreview, type PreviewPoint } from './map-preview';

/** The minimap's palette: blue fleet, red fleet, golden Core, grey neutral objectives. */
const COLOR = {
  floor: '#34587a',
  area: 'rgba(181, 196, 209, 0.32)',
  coreArea: 'rgba(247, 231, 124, 0.5)',
  neutral: '#8aa0b8',
  station: '#b5c4d1',
  core: '#f7e77c',
  p1: '#36a9ff',
  p1Edge: '#83d4ff',
  p2: '#ff4f64',
  p2Edge: '#ff9ba7',
} as const;
/** Pixels kept clear around the map so the markers on its edge are not cut. */
const MARGIN = 8;

type Context = CanvasRenderingContext2D;

function diamond(context: Context, at: PreviewPoint, halfWidth: number, halfHeight: number) {
  context.moveTo(at.x, at.y - halfHeight);
  context.lineTo(at.x + halfWidth, at.y);
  context.lineTo(at.x, at.y + halfHeight);
  context.lineTo(at.x - halfWidth, at.y);
  context.closePath();
}

function drawPreview(canvas: HTMLCanvasElement, mapId: TrainingMapId) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const context = canvas.getContext('2d');
  if (!context || width <= 0 || height <= 0) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const preview = buildMapPreview(mapId);
  const { scale, place } = fitMapPreview(preview, width, height, MARGIN);
  if (scale <= 0) return;
  // Markers keep a readable size on a small canvas: they are symbols, not the real footprint.
  const unit = Math.max(2, Math.min(width, height) / 40);

  // Every cell a ship can cross, in one path: thousands of diamonds, a single fill.
  context.beginPath();
  const cellWidth = TILE_HALF_WIDTH * scale + 0.35;
  const cellHeight = TILE_HALF_HEIGHT * scale + 0.35;
  for (const cell of preview.walkable) diamond(context, place(cell), cellWidth, cellHeight);
  context.fillStyle = COLOR.floor;
  context.fill();

  // Capture areas, with the radius each map gives its objectives.
  context.lineWidth = 1;
  for (const area of [...preview.metals, ...preview.captures, ...preview.stations, preview.core]) {
    const ellipse = captureEllipse(area.radius);
    const at = place(area);
    context.beginPath();
    context.ellipse(at.x, at.y, ellipse.width * scale / 2, ellipse.height * scale / 2, 0, 0, Math.PI * 2);
    context.strokeStyle = area === preview.core ? COLOR.coreArea : COLOR.area;
    context.stroke();
  }

  context.fillStyle = COLOR.neutral;
  context.beginPath();
  for (const node of [...preview.metals, ...preview.captures]) diamond(context, place(node), unit * 0.9, unit * 0.9);
  context.fill();
  context.fillStyle = COLOR.station;
  context.beginPath();
  for (const station of preview.stations) diamond(context, place(station), unit * 1.4, unit * 1.4);
  context.fill();

  // The Core and the bases glow, like their markers on the minimap.
  const core = place(preview.core);
  context.shadowBlur = unit * 2;
  context.shadowColor = COLOR.core;
  context.fillStyle = COLOR.core;
  context.beginPath();
  context.arc(core.x, core.y, unit * 1.5, 0, Math.PI * 2);
  context.fill();
  for (const [base, fill, edge] of [[preview.bases.p1, COLOR.p1, COLOR.p1Edge], [preview.bases.p2, COLOR.p2, COLOR.p2Edge]] as const) {
    const at = place(base);
    const box = [at.x - unit * 1.7, at.y - unit * 1.2, unit * 3.4, unit * 2.4] as const;
    context.shadowBlur = unit * 2;
    context.shadowColor = fill;
    context.fillStyle = fill;
    context.fillRect(...box);
    context.shadowBlur = 0;
    context.strokeStyle = edge;
    context.strokeRect(...box);
  }
}

/** A small drawing of a map for the lobbies: walkable ground, both bases, the Core and the objectives. */
export function MapPreview({ mapId }: { mapId: TrainingMapId }) {
  const { locale } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => drawPreview(element, mapId);
    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mapId]);

  return <canvas
    ref={canvas}
    className="vi-map-preview__canvas"
    role="img"
    aria-label={lobbyText(locale, 'mapPreview', { map: mapName(mapId, locale) })}
    data-map-id={mapId}
  />;
}
