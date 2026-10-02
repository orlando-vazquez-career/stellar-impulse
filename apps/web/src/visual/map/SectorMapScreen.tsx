import { useEffect, useRef, useState, type MouseEvent } from 'react';
import atlasUrl from '../../../../../packages/sim/src/tiled-maps/sector-01 aaaa/stellar-plataformas.png';
import { Brand } from '../shared/Brand';
import { cellAtPixel, cellToPixel, MAP_ORIGIN_Y, routeAcrossSector, sectorMap, sectorSurface, TILE_HEIGHT, TILE_WIDTH } from './sector-map';
import './sector-map.css';

type Cell = { x: number; y: number };

export function SectorMapScreen({ onBack }: { onBack(): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The inspector edits Sector 01; the caller selects it before mounting.
  const CANVAS_WIDTH = sectorMap.width * TILE_WIDTH;
  const CANVAS_HEIGHT = (sectorMap.width + sectorMap.height) * TILE_HEIGHT / 2 + MAP_ORIGIN_Y + 32;
  const [selected, setSelected] = useState<Cell>(sectorSurface.bases.p1);
  const [pilot, setPilot] = useState<Cell>(sectorSurface.bases.p1);
  const [route, setRoute] = useState<Cell[]>([]);
  const [routeStatus, setRouteStatus] = useState('Selecciona una casilla transitable para mover la nave de prueba.');
  const [assetError, setAssetError] = useState(false);

  useEffect(() => {
    const next = route[0];
    if (!next) return;
    const timer = setTimeout(() => {
      setPilot(next);
      setRoute((current) => current.slice(1));
    }, 120);
    return () => clearTimeout(timer);
  }, [route]);

  useEffect(() => {
    let disposed = false;
    const image = new Image();
    image.onload = () => { if (!disposed) paint(image); };
    image.onerror = () => { if (!disposed) setAssetError(true); };
    image.src = atlasUrl;
    function paint(atlas: HTMLImageElement) {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      for (const layer of sectorMap.layers.filter((item) => item.visible)) {
        for (let y = 0; y < sectorMap.height; y += 1) {
          for (let x = 0; x < sectorMap.width; x += 1) {
            const gid = layer.data[y * sectorMap.width + x];
            if (!gid) continue;
            const point = cellToPixel({ x, y });
            const tileset = [...sectorMap.tilesets].reverse().find((item) => item.firstgid <= gid);
            if (tileset?.image === 'stellar-plataformas.png') {
              const index = gid - tileset.firstgid;
              ctx.drawImage(atlas, (index % tileset.columns) * tileset.tilewidth,
                Math.floor(index / tileset.columns) * tileset.tileheight,
                tileset.tilewidth, tileset.tileheight,
                point.x - tileset.tilewidth / 2, point.y - tileset.tileheight + TILE_HEIGHT / 2,
                tileset.tilewidth, tileset.tileheight);
            } else {
              // The editable TMJ refers to an unavailable second atlas for one space tile.
              ctx.fillStyle = '#0a1726';
              ctx.fillRect(point.x - TILE_WIDTH / 2, point.y - TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT);
            }
          }
        }
      }
      const point = cellToPixel(selected);
      ctx.strokeStyle = '#83d4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - TILE_HEIGHT / 2);
      ctx.lineTo(point.x + TILE_WIDTH / 2, point.y);
      ctx.lineTo(point.x, point.y + TILE_HEIGHT / 2);
      ctx.lineTo(point.x - TILE_WIDTH / 2, point.y);
      ctx.closePath();
      ctx.stroke();
      if (route.length) {
        ctx.strokeStyle = '#83d4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const start = cellToPixel(pilot);
        ctx.moveTo(start.x, start.y);
        for (const step of route) {
          const next = cellToPixel(step);
          ctx.lineTo(next.x, next.y);
        }
        ctx.stroke();
      }
      const ship = cellToPixel(pilot);
      ctx.fillStyle = '#36a9ff';
      ctx.shadowColor = '#36a9ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y - 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      canvasRef.current?.setAttribute('data-atlas-ready', 'true');
    }
    return () => { disposed = true; };
  }, [selected, pilot, route]);

  function selectCell(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * CANVAS_WIDTH / rect.width;
    const y = (event.clientY - rect.top) * CANVAS_HEIGHT / rect.height;
    const cell = cellAtPixel(x, y);
    if (!cell) return;
    setSelected(cell);
    const path = routeAcrossSector(pilot, cell);
    setRoute(path.slice(1));
    setRouteStatus(path.length ? `Ruta aceptada hacia ${cell.x}, ${cell.y}.` : 'Destino bloqueado o inaccesible.');
  }

  const index = selected.y * sectorMap.width + selected.x;
  return <main className="vi-sector-map vi-screen">
    <header className="vi-screen__header"><Brand /><button className="vi-text-button" onClick={onBack}>← Volver a preparación</button></header>
    <section className="vi-sector-map__body">
      <div><p className="vi-eyebrow">EDITOR TILED · VISTA LOCAL</p><h1>Sector 01 · Umbral Helios</h1>
        <p>Mapa isométrico editable de {sectorMap.width}×{sectorMap.height}. Pulsa una casilla para probar el movimiento y revisar su navegación.</p></div>
      {assetError && <p role="alert">No se pudo cargar el atlas del mapa.</p>}
      <div className="vi-sector-map__stage"><canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
        role="img" aria-label="Mapa Tiled Sector 01" data-map-size={`${sectorMap.width}x${sectorMap.height}`} onClick={selectCell} /></div>
      <div className="vi-sector-map__details" role="status">
        <span>Base A · {sectorSurface.bases.p1.x}, {sectorSurface.bases.p1.y}</span>
        <span>Base B · {sectorSurface.bases.p2.x}, {sectorSurface.bases.p2.y}</span>
        <span>Núcleo · {sectorSurface.core.x}, {sectorSurface.core.y}</span>
        <span>Nave · {pilot.x}, {pilot.y}</span>
        <span>Casilla {selected.x}, {selected.y} · {sectorSurface.walkable[index] ? 'Transitable' : 'Bloqueada'} · Altura {sectorSurface.level[index]}</span>
      </div>
      <p className="vi-sector-map__note" role="status">{routeStatus} Esta prueba usa las rutas, rampas y bloqueos de la simulación. El combate Visual usa este mismo TMJ, pero sigue siendo local y no se conecta a una sala.</p>
    </section>
  </main>;
}
