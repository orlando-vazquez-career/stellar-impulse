import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from './isometric';

export interface ScreenPoint { x: number; y: number }

/**
 * Ground ellipse of a capture area of `radius` cells. The area is a disc of cells; on the isometric
 * ground that is an ellipse twice as wide as tall, reaching the far corners of the outer cells.
 */
export function captureEllipse(radius: number): { width: number; height: number } {
  const reach = (radius + 0.5) * Math.SQRT2;
  return { width: reach * 2 * TILE_HALF_WIDTH, height: reach * 2 * TILE_HALF_HEIGHT };
}

/**
 * `steps + 1` points along the ellipse, from the top (−π/2) clockwise on screen over `fraction` of a turn:
 * the arc a capture in progress is stroked with.
 */
export function ellipseSweep(center: ScreenPoint, width: number, height: number, fraction: number, steps: number): ScreenPoint[] {
  const count = Math.max(1, Math.floor(steps));
  const sweep = Math.PI * 2 * fraction;
  return Array.from({ length: count + 1 }, (_, step) => {
    const angle = -Math.PI / 2 + sweep * step / count;
    return { x: center.x + Math.cos(angle) * width / 2, y: center.y + Math.sin(angle) * height / 2 };
  });
}
