export const GRID_COLUMNS = 96;
export const GRID_ROWS = 96;
export const CELL_SIZE = 72;
export const WORLD_WIDTH = GRID_COLUMNS * CELL_SIZE;
export const WORLD_HEIGHT = GRID_ROWS * CELL_SIZE;
export const CORE_CELL = { x: 48, y: 48 } as const;

export interface GridPoint { x: number; y: number }
export interface GridCell extends GridPoint {} // Whole-number tile indices used by grid pathfinding.

export function gridToWorld(x: number, y: number) {
  return { x: (x + 0.5) * CELL_SIZE, y: (y + 0.5) * CELL_SIZE };
}

export function worldToGrid(worldX: number, worldY: number): GridCell | null {
  const x = Math.floor(worldX / CELL_SIZE);
  const y = Math.floor(worldY / CELL_SIZE);
  return x >= 0 && y >= 0 && x < GRID_COLUMNS && y < GRID_ROWS ? { x, y } : null;
}

export function buildRoute(start: GridCell, target: GridCell, blocked: GridCell[] = []): GridCell[] {
  if (target.x < 0 || target.y < 0 || target.x >= GRID_COLUMNS || target.y >= GRID_ROWS) return [];
  const encode = (cell: GridCell) => cell.y * GRID_COLUMNS + cell.x;
  const startId = encode(start);
  const targetId = encode(target);
  if (startId === targetId) return [{ ...start }];
  const blockedIds = new Set(blocked.map(encode));
  if (blockedIds.has(targetId)) return [];
  const previous = new Int32Array(GRID_COLUMNS * GRID_ROWS).fill(-1);
  const queue = new Int32Array(GRID_COLUMNS * GRID_ROWS);
  let head = 0;
  let tail = 0;
  queue[tail++] = startId;
  previous[startId] = startId;
  while (head < tail && previous[targetId] === -1) {
    const id = queue[head++]!;
    const x = id % GRID_COLUMNS;
    const y = Math.floor(id / GRID_COLUMNS);
    for (const [nextX, nextY] of [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]] as [number, number][]) {
      if (nextX < 0 || nextY < 0 || nextX >= GRID_COLUMNS || nextY >= GRID_ROWS) continue;
      const nextId = nextY * GRID_COLUMNS + nextX;
      if (previous[nextId] !== -1 || blockedIds.has(nextId)) continue;
      previous[nextId] = id;
      queue[tail++] = nextId;
    }
  }
  if (previous[targetId] === -1) return [];
  const route: GridCell[] = [];
  for (let id = targetId; id !== startId; id = previous[id]!) {
    route.push({ x: id % GRID_COLUMNS, y: Math.floor(id / GRID_COLUMNS) });
  }
  route.push({ ...start });
  return route.reverse();
}
