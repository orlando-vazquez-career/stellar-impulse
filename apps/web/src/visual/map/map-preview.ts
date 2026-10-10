import { TRAINING_MAPS, type TrainingMapId } from '@impulso/sim';

type Surface = typeof TRAINING_MAPS[TrainingMapId];
type Cell = { x: number; y: number };

/** Same yaw as the battlefield camera, so the preview shows the bases where the match will. */
const VIEW_YAW_RADIANS = -Math.PI / 6;
const PREVIEW_WIDTH = 480;
const PADDING = 10;
const COLOR = {
  floor: ['#2c4a68', '#3a6288', '#4a7aa6', '#5b95c4'], barrier: '#ff9d4d', belt: '#c9a15a',
  metal: '#9fb6cc', capture: '#f2cd79', core: '#f2cd79', turret: '#ff7a8a', blue: '#36a9ff', red: '#ff4f64', outline: '#05070f',
} as const;

/** Where each cell of a map falls in its preview box, and the size of that box. */
export function previewLayout(surface: { width: number; height: number }, width = PREVIEW_WIDTH) {
  const centerX = (surface.width - 1) / 2, centerY = (surface.height - 1) / 2;
  const cosine = Math.cos(VIEW_YAW_RADIANS), sine = Math.sin(VIEW_YAW_RADIANS);
  const iso = (x: number, y: number) => {
    const dx = x - centerX, dy = y - centerY;
    const viewX = dx * cosine - dy * sine, viewY = dx * sine + dy * cosine;
    return { x: viewX - viewY, y: (viewX + viewY) / 2 };
  };
  const lastX = surface.width - 1, lastY = surface.height - 1;
  const corners = [iso(0, 0), iso(lastX, 0), iso(lastX, lastY), iso(0, lastY)];
  const left = Math.min(...corners.map((corner) => corner.x)) - 1, right = Math.max(...corners.map((corner) => corner.x)) + 1;
  const top = Math.min(...corners.map((corner) => corner.y)) - 0.5, bottom = Math.max(...corners.map((corner) => corner.y)) + 0.5;
  const scale = (width - PADDING * 2) / (right - left);
  return {
    width, height: Math.ceil((bottom - top) * scale + PADDING * 2), scale,
    point(x: number, y: number) { const at = iso(x, y); return { x: PADDING + (at.x - left) * scale, y: PADDING + (at.y - top) * scale }; },
  };
}

/** Paint a map from its gameplay data: floor by height, then what a commander plans around. */
export function drawMapPreview(canvas: HTMLCanvasElement, id: TrainingMapId): void {
  const surface: Surface = TRAINING_MAPS[id];
  const layout = previewLayout(surface);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const half = layout.scale;
  const diamond = (cell: Cell, grow = 0.2) => {
    const at = layout.point(cell.x, cell.y), hw = half + grow, hh = half / 2 + grow;
    ctx.moveTo(at.x, at.y - hh); ctx.lineTo(at.x + hw, at.y); ctx.lineTo(at.x, at.y + hh); ctx.lineTo(at.x - hw, at.y); ctx.closePath();
  };
  const cells = (list: readonly Cell[], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const cell of list) diamond(cell);
    ctx.fill();
  };
  const mark = (cell: Cell, color: string, size: number, shape: 'square' | 'circle' | 'rhombus') => {
    const at = layout.point(cell.x, cell.y);
    ctx.fillStyle = color;
    ctx.strokeStyle = COLOR.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(at.x, at.y, size, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(at.x - size, at.y - size * 0.7, size * 2, size * 1.4);
    else { ctx.moveTo(at.x, at.y - size); ctx.lineTo(at.x + size, at.y); ctx.lineTo(at.x, at.y + size); ctx.lineTo(at.x - size, at.y); ctx.closePath(); }
    ctx.fill();
    ctx.stroke();
  };

  const floors: Cell[][] = COLOR.floor.map(() => []);
  const lowest = surface.level.reduce((min, level, index) => surface.walkable[index] ? Math.min(min, level) : min, Infinity);
  surface.walkable.forEach((walkable, index) => {
    if (!walkable) return;
    const step = Math.min(COLOR.floor.length - 1, Math.max(0, surface.level[index]! - lowest));
    floors[step]!.push({ x: index % surface.width, y: Math.floor(index / surface.width) });
  });
  floors.forEach((list, step) => cells(list, COLOR.floor[step]!));
  cells((surface.belt ?? []).flatMap((gate) => gate.cells), COLOR.belt);
  cells((surface.barriers ?? []).flatMap((barrier) => barrier.cells), COLOR.barrier);

  for (const metal of surface.metals) mark(metal, COLOR.metal, 3.2, 'rhombus');
  for (const turret of surface.turrets ?? []) mark(turret, COLOR.turret, 2.6, 'circle');
  for (const capture of surface.captures) mark(capture, COLOR.capture, 4.2, 'rhombus');
  for (const station of surface.stations ?? []) mark(station, COLOR.capture, 5.5, 'square');
  mark(surface.core, COLOR.core, 6, 'circle');
  mark(surface.bases.p1, COLOR.blue, 8, 'square');
  mark(surface.bases.p2, COLOR.red, 8, 'square');
}
