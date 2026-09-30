import { findPath, type PlayerView } from '@impulso/state';

const W = 1000, H = 660, TILE_X = 23, TILE_Y = 12, OX = 500, OY = 86;
const VOID = '#070b14';

interface Camera { tileX: number; tileY: number; ox: number; oy: number }

function cameraFor(columns: number, rows: number): Camera {
  if (columns === 20 && rows === 20) return { tileX: TILE_X, tileY: TILE_Y, ox: OX, oy: OY };
  const span = columns + rows;
  const tileX = Math.max(6, Math.floor((W - 40) / span));
  const tileY = Math.max(3, Math.floor(tileX / 2));
  return { tileX, tileY, ox: Math.floor(W / 2), oy: tileY * rows + 24 };
}

function project(camera: Camera, x: number, y: number) {
  return { x: camera.ox + (x - y) * camera.tileX, y: camera.oy + (x + y) * camera.tileY };
}

export function pickCell(canvas: HTMLCanvasElement, clientX: number, clientY: number, width = 20, height = 20) {
  const camera = cameraFor(width, height);
  const rect = canvas.getBoundingClientRect();
  const dx = ((clientX - rect.left) * W / rect.width - camera.ox) / camera.tileX;
  const dy = ((clientY - rect.top) * H / rect.height - camera.oy) / camera.tileY;
  const x = Math.round((dx + dy) / 2), y = Math.round((dy - dx) / 2);
  return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
}

function floorColor(known: boolean, open: boolean, high: boolean, x: number, y: number): string {
  if (!open) return VOID;
  if (!known) return '#0b1927';
  if (high) return (x + y) % 2 ? '#1c4a63' : '#184258';
  return (x + y) % 2 ? '#132b3c' : '#102637';
}

export function drawArena(canvas: HTMLCanvasElement, view: PlayerView | null, selected: readonly string[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const columns = view?.width ?? 20;
  const rows = view?.height ?? 20;
  const camera = cameraFor(columns, rows);
  const unit = camera.tileX / TILE_X;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * scale; canvas.height = H * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#08131f'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 95; i++) {
    ctx.fillStyle = i % 5 === 0 ? '#769bad' : '#28414f';
    ctx.fillRect((i * 137 + 37) % W, (i * 197 + 83) % H, i % 5 === 0 ? 2 : 1, 1);
  }
  const visible = new Set(view?.visibleCells.map(p => `${p.x},${p.y}`) ?? []);
  const mask = view?.walkable;
  const levels = view?.level;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const p = project(camera, x, y), known = view ? visible.has(`${x},${y}`) : true;
    const index = y * columns + x;
    const open = !mask || mask[index] === true;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - camera.tileY); ctx.lineTo(p.x + camera.tileX, p.y);
    ctx.lineTo(p.x, p.y + camera.tileY); ctx.lineTo(p.x - camera.tileX, p.y); ctx.closePath();
    ctx.fillStyle = floorColor(known, open, (levels?.[index] ?? 0) > 0, x, y);
    ctx.fill(); ctx.strokeStyle = open ? (known ? '#264655' : '#132635') : VOID; ctx.lineWidth = 0.8; ctx.stroke();
  }
  const label = (x: number, y: number, text: string, color = '#a8becd') => {
    ctx.fillStyle = color; ctx.font = `${Math.max(10, Math.round(13 * unit))}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(text, x, y);
  };
  for (const obstacle of view?.obstacles ?? []) {
    const p = project(camera, obstacle.x, obstacle.y);
    ctx.fillStyle = '#72818f';
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 24 * unit); ctx.lineTo(p.x + 20 * unit, p.y - 4 * unit);
    ctx.lineTo(p.x + 11 * unit, p.y + 7 * unit); ctx.lineTo(p.x - 18 * unit, p.y + 4 * unit); ctx.closePath(); ctx.fill();
  }
  const bases = view ? [view.players.p1.base, view.players.p2.base] : [{ x: 2, y: 17 }, { x: 17, y: 2 }];
  for (const [index, base] of bases.entries()) {
    const { x, y } = base;
    const p = project(camera, x, y);
    ctx.fillStyle = index === 0 ? '#163f58' : '#55303d';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 28 * unit, 14 * unit, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = index === 0 ? '#71e5dc' : '#ffad85'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 31 * unit, 16 * unit, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = index === 0 ? '#71e5dc' : '#ffad85'; ctx.fillRect(p.x - 5 * unit, p.y - 24 * unit, 10 * unit, 18 * unit);
    label(p.x, p.y + 38 * unit, index === 0 ? 'Base A' : 'Base B');
  }
  const core = project(camera, view?.core.x ?? 10, view?.core.y ?? 10);
  ctx.strokeStyle = view?.core.open ? '#f2cd79' : '#7694ad'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(core.x, core.y, 55 * unit, 27 * unit, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f2cd79'; ctx.beginPath(); ctx.moveTo(core.x, core.y - 43 * unit);
  ctx.lineTo(core.x + 13 * unit, core.y - 15 * unit); ctx.lineTo(core.x, core.y - 2 * unit); ctx.lineTo(core.x - 13 * unit, core.y - 15 * unit); ctx.closePath(); ctx.fill();
  label(core.x, core.y + 47 * unit, 'Núcleo', '#f2cd79');
  for (const node of view?.nodes ?? []) {
    const p = project(camera, node.x, node.y);
    ctx.fillStyle = node.kind === 'capture' ? '#71e5dc' : '#f2cd79';
    ctx.fillRect(p.x - 7 * unit, p.y - 18 * unit, 14 * unit, 18 * unit);
    label(p.x, p.y + 33 * unit, node.kind === 'capture' ? 'Captura' : 'Metal', node.kind === 'capture' ? '#71e5dc' : '#f2cd79');
  }
  for (const guardian of view?.guardians ?? []) {
    if (guardian.hp <= 0) continue;
    const p = project(camera, guardian.x, guardian.y);
    ctx.strokeStyle = '#ffad85'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x + 20 * unit, p.y - 27 * unit, 9 * unit, 0, Math.PI * 2); ctx.stroke();
    label(p.x + 20 * unit, p.y - 44 * unit, `Guardián ${guardian.hp}`, '#ffad85');
  }
  for (const squad of view?.squads ?? []) {
    if (squad.hp <= 0) continue;
    const p = project(camera, squad.x, squad.y), mine = squad.ownerId === view?.playerId;
    if (selected.includes(squad.id)) {
      ctx.strokeStyle = '#71e5dc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 28 * unit, 14 * unit, 0, 0, Math.PI * 2); ctx.stroke();
      if (squad.target && !view?.walkable) {
        const path = findPath(squad, squad.target, view!.width, view!.height, view!.obstacles);
        ctx.setLineDash([4, 6]); ctx.beginPath();
        path.forEach((cell, index) => { const waypoint = project(camera, cell.x, cell.y); if (index === 0) ctx.moveTo(waypoint.x, waypoint.y); else ctx.lineTo(waypoint.x, waypoint.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }
      const route = squad.route ?? [];
      if (route.length > 0) {
        ctx.strokeStyle = '#f2cd79'; ctx.setLineDash([2, 4]); ctx.beginPath();
        const marks = squad.target ? [squad.target, ...route] : route;
        marks.forEach((cell, index) => { const waypoint = project(camera, cell.x, cell.y); if (index === 0) ctx.moveTo(waypoint.x, waypoint.y); else ctx.lineTo(waypoint.x, waypoint.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (squad.attackTargetId) {
        const target = [...view!.squads, ...view!.guardians].find((entry) => entry.id === squad.attackTargetId);
        if (target) {
          const destination = project(camera, target.x, target.y);
          ctx.strokeStyle = '#ff6b72'; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(destination.x, destination.y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
    ctx.fillStyle = mine ? '#71e5dc' : '#ffad85';
    for (const offset of [-12, 0, 12]) {
      ctx.beginPath(); ctx.moveTo(p.x + offset * unit, p.y - 28 * unit); ctx.lineTo(p.x + (offset + 7) * unit, p.y - 10 * unit);
      ctx.lineTo(p.x + offset * unit, p.y - 14 * unit); ctx.lineTo(p.x + (offset - 7) * unit, p.y - 10 * unit); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#283b47'; ctx.fillRect(p.x - 22 * unit, p.y + 10 * unit, 44 * unit, 4 * unit);
    ctx.fillStyle = mine ? '#71e5dc' : '#ffad85'; ctx.fillRect(p.x - 22 * unit, p.y + 10 * unit, 44 * unit * squad.hp / squad.maxHp, 4 * unit);
    label(p.x, p.y + 35 * unit, mine ? 'Tu escuadrón' : 'Rival');
  }
  label(78, 617, view?.walkable ? 'SECTOR 01' : 'SECTOR 00');
  label(889, 617, view ? `T + ${(view.tick / 10).toFixed(1)} s` : 'Entrenamiento');
}
