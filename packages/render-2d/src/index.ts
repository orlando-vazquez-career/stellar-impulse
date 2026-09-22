import type { PlayerView } from '@impulso/state';

const W = 1000, H = 660, TILE_X = 38, TILE_Y = 19, OX = 500, OY = 104;
const iso = (x: number, y: number) => ({ x: OX + (x - y) * TILE_X, y: OY + (x + y) * TILE_Y });

export function pickCell(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const dx = ((clientX - rect.left) * W / rect.width - OX) / TILE_X;
  const dy = ((clientY - rect.top) * H / rect.height - OY) / TILE_Y;
  const x = Math.round((dx + dy) / 2), y = Math.round((dy - dx) / 2);
  return x >= 0 && x < 12 && y >= 0 && y < 12 ? { x, y } : null;
}

export function drawArena(canvas: HTMLCanvasElement, view: PlayerView | null, selected: string | null) {
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
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const p = iso(x, y), known = view ? visible.has(`${x},${y}`) : true;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - TILE_Y); ctx.lineTo(p.x + TILE_X, p.y);
    ctx.lineTo(p.x, p.y + TILE_Y); ctx.lineTo(p.x - TILE_X, p.y); ctx.closePath();
    ctx.fillStyle = known ? ((x + y) % 2 ? '#132b3c' : '#102637') : '#0b1927';
    ctx.fill(); ctx.strokeStyle = known ? '#264655' : '#132635'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  const label = (x: number, y: number, text: string, color = '#a8becd') => {
    ctx.fillStyle = color; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(text, x, y);
  };
  for (const [x, y, name] of [[1, 10, 'Base A'], [10, 1, 'Base B']] as const) {
    const p = iso(x, y);
    ctx.strokeStyle = '#63889a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 30, 14, 0, 0, Math.PI * 2); ctx.stroke();
    label(p.x, p.y + 55, name);
  }
  const core = iso(6, 6);
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
    if (squad.id === selected) {
      ctx.strokeStyle = '#71e5dc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 28, 14, 0, 0, Math.PI * 2); ctx.stroke();
      if (squad.target) {
        const dest = iso(squad.target.x, squad.target.y);
        ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(dest.x, dest.y); ctx.stroke(); ctx.setLineDash([]);
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
