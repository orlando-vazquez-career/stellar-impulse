import { findPath, type PlayerView } from '@impulso/state';

const W = 1000, H = 660, TILE_X = 23, TILE_Y = 12, OX = 500, OY = 86;
const iso = (x: number, y: number) => ({ x: OX + (x - y) * TILE_X, y: OY + (x + y) * TILE_Y });

export function pickCell(canvas: HTMLCanvasElement, clientX: number, clientY: number, width = 20, height = 20) {
  const rect = canvas.getBoundingClientRect();
  const dx = ((clientX - rect.left) * W / rect.width - OX) / TILE_X;
  const dy = ((clientY - rect.top) * H / rect.height - OY) / TILE_Y;
  const x = Math.round((dx + dy) / 2), y = Math.round((dy - dx) / 2);
  return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
}

export function drawArena(canvas: HTMLCanvasElement, view: PlayerView | null, selected: readonly string[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * scale; canvas.height = H * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#08131f'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 95; i++) {
    ctx.fillStyle = i % 5 === 0 ? '#769bad' : '#28414f';
    ctx.fillRect((i * 137 + 37) % W, (i * 197 + 83) % H, i % 5 === 0 ? 2 : 1, 1);
  }
  const visible = new Set(view?.visibleCells.map(p => `${p.x},${p.y}`) ?? []);
  for (let y = 0; y < (view?.height ?? 20); y++) for (let x = 0; x < (view?.width ?? 20); x++) {
    const p = iso(x, y), known = view ? visible.has(`${x},${y}`) : true;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - TILE_Y); ctx.lineTo(p.x + TILE_X, p.y);
    ctx.lineTo(p.x, p.y + TILE_Y); ctx.lineTo(p.x - TILE_X, p.y); ctx.closePath();
    ctx.fillStyle = known ? ((x + y) % 2 ? '#132b3c' : '#102637') : '#0b1927';
    ctx.fill(); ctx.strokeStyle = known ? '#264655' : '#132635'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  const label = (x: number, y: number, text: string, color = '#a8becd') => {
    ctx.fillStyle = color; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(text, x, y);
  };
  for (const obstacle of view?.obstacles ?? []) {
    const p = iso(obstacle.x, obstacle.y);
    ctx.fillStyle = '#72818f';
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 24); ctx.lineTo(p.x + 20, p.y - 4);
    ctx.lineTo(p.x + 11, p.y + 7); ctx.lineTo(p.x - 18, p.y + 4); ctx.closePath(); ctx.fill();
  }
  const bases = view ? [view.players.p1.base, view.players.p2.base] : [{ x: 2, y: 17 }, { x: 17, y: 2 }];
  for (const [index, base] of bases.entries()) {
    const { x, y } = base;
    const p = iso(x, y);
    ctx.fillStyle = index === 0 ? '#163f58' : '#55303d';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 28, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = index === 0 ? '#71e5dc' : '#ffad85'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 31, 16, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = index === 0 ? '#71e5dc' : '#ffad85'; ctx.fillRect(p.x - 5, p.y - 24, 10, 18);
    label(p.x, p.y + 38, index === 0 ? 'Base A' : 'Base B');
  }
  const core = iso(view?.core.x ?? 10, view?.core.y ?? 10);
  ctx.strokeStyle = view?.core.open ? '#f2cd79' : '#7694ad'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(core.x, core.y, 55, 27, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f2cd79'; ctx.beginPath(); ctx.moveTo(core.x, core.y - 43);
  ctx.lineTo(core.x + 13, core.y - 15); ctx.lineTo(core.x, core.y - 2); ctx.lineTo(core.x - 13, core.y - 15); ctx.closePath(); ctx.fill();
  label(core.x, core.y + 47, 'Núcleo', '#f2cd79');
  for (const node of view?.nodes ?? []) {
    const p = iso(node.x, node.y);
    ctx.fillStyle = '#f2cd79'; ctx.fillRect(p.x - 7, p.y - 18, 14, 18);
    label(p.x, p.y + 33, 'Metal', '#f2cd79');
  }
  for (const guardian of view?.guardians ?? []) {
    if (guardian.hp <= 0) continue;
    const p = iso(guardian.x, guardian.y);
    ctx.strokeStyle = '#ffad85'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x + 20, p.y - 27, 9, 0, Math.PI * 2); ctx.stroke();
    label(p.x + 20, p.y - 44, `Guardián ${guardian.hp}`, '#ffad85');
  }
  for (const squad of view?.squads ?? []) {
    if (squad.hp <= 0) continue;
    const p = iso(squad.x, squad.y), mine = squad.ownerId === view?.playerId;
    if (selected.includes(squad.id)) {
      ctx.strokeStyle = '#71e5dc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 28, 14, 0, 0, Math.PI * 2); ctx.stroke();
      if (squad.target) {
        const path = findPath(squad, squad.target, view!.width, view!.height, view!.obstacles);
        ctx.setLineDash([4, 6]); ctx.beginPath();
        path.forEach((cell, index) => { const waypoint = iso(cell.x, cell.y); if (index === 0) ctx.moveTo(waypoint.x, waypoint.y); else ctx.lineTo(waypoint.x, waypoint.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }
      const route = squad.route ?? [];
      if (route.length > 0) {
        ctx.strokeStyle = '#f2cd79'; ctx.setLineDash([2, 4]); ctx.beginPath();
        const marks = squad.target ? [squad.target, ...route] : route;
        marks.forEach((cell, index) => { const waypoint = iso(cell.x, cell.y); if (index === 0) ctx.moveTo(waypoint.x, waypoint.y); else ctx.lineTo(waypoint.x, waypoint.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (squad.attackTargetId) {
        const target = [...view!.squads, ...view!.guardians].find((unit) => unit.id === squad.attackTargetId);
        if (target) {
          const destination = iso(target.x, target.y);
          ctx.strokeStyle = '#ff6b72'; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(destination.x, destination.y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
    ctx.fillStyle = mine ? '#71e5dc' : '#ffad85';
    for (const offset of [-12, 0, 12]) {
      ctx.beginPath(); ctx.moveTo(p.x + offset, p.y - 28); ctx.lineTo(p.x + offset + 7, p.y - 10);
      ctx.lineTo(p.x + offset, p.y - 14); ctx.lineTo(p.x + offset - 7, p.y - 10); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#283b47'; ctx.fillRect(p.x - 22, p.y + 10, 44, 4);
    ctx.fillStyle = mine ? '#71e5dc' : '#ffad85'; ctx.fillRect(p.x - 22, p.y + 10, 44 * squad.hp / squad.maxHp, 4);
    label(p.x, p.y + 35, mine ? 'Tu escuadrón' : 'Rival');
  }
  label(78, 617, 'SECTOR 00');
  label(889, 617, view ? `T + ${(view.tick / 10).toFixed(1)} s` : 'Entrenamiento');
}
