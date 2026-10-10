import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Brand } from '../shared/Brand';
import {
  activeMapId, activeMapSourceFile, cellAtPixel, cellToPixel, HIDDEN_LAYERS, mapImageUrl, MAP_ORIGIN_Y, playableMapLabel,
  routeAcrossSector, sectorMap, sectorSurface, TILE_HEIGHT, TILE_WIDTH, type Tileset,
} from './sector-map';
import './sector-map.css';

type Cell = { x: number; y: number };

/** Tiled stores flip flags in the top bits of every gid. */
const GID_MASK = 0x1fffffff;
/** Widest canvas the inspector paints; larger maps are drawn smaller and scrolled. */
const MAX_CANVAS_WIDTH = 3072;
/** Object layers drawn out of file order, as in the match: far background first, floor emblems right over the terrain. */
const SKY_LAYER = 'fondo-espacio';
const EMBLEM_LAYER = 'logos';
/** The bases of the match are drawn by owner colour, not with the oversized Tiled placeholders. */
const BASE_PLACEHOLDERS = new Set(['base_jugador', 'base_enemiga']);
const BASE_COLOR = { p1: '#36a9ff', p2: '#ff4f64' } as const;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function tilesetFor(gid: number): Tileset | undefined {
  return [...sectorMap.tilesets].reverse().find((item) => item.firstgid <= gid);
}

function diamond(ctx: CanvasRenderingContext2D, cell: Cell) {
  const point = cellToPixel(cell);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - TILE_HEIGHT / 2);
  ctx.lineTo(point.x + TILE_WIDTH / 2, point.y);
  ctx.lineTo(point.x, point.y + TILE_HEIGHT / 2);
  ctx.lineTo(point.x - TILE_WIDTH / 2, point.y);
  ctx.closePath();
}

/** The art of the active map, painted once: every repaint only adds the selection, route and ship over it. */
function paintTerrain(canvas: HTMLCanvasElement, scale: number, images: Map<string, HTMLImageElement | null>) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const imageOf = (file: string | undefined) => images.get(mapImageUrl(file) ?? '') ?? null;

  const drawObjects = (layers: typeof sectorMap.layers) => {
    const objects = layers.flatMap((layer) => (layer.objects ?? []).filter((object) => object.gid && object.visible !== false && !BASE_PLACEHOLDERS.has(object.name ?? '')));
    // Object positions are in tile-height pixels along both isometric axes.
    const placed = objects.map((object) => ({ object, point: cellToPixel({ x: object.x / TILE_HEIGHT, y: object.y / TILE_HEIGHT }) }))
      .sort((a, b) => a.point.y - b.point.y);
    for (const { object, point } of placed) {
      const gid = object.gid! & GID_MASK;
      const tileset = tilesetFor(gid);
      const image = imageOf(tileset?.tiles?.find((tile) => tile.id === gid - tileset.firstgid)?.image);
      if (!tileset || !image) continue;
      const bottom = point.y - TILE_HEIGHT / 2 + (tileset.objectalignment === 'center' ? object.height / 2 : 0);
      ctx.drawImage(image, point.x - object.width / 2, bottom - object.height, object.width, object.height);
    }
  };
  const objectLayers = sectorMap.layers.filter((layer) => layer.visible && layer.objects);

  drawObjects(objectLayers.filter((layer) => layer.name === SKY_LAYER));
  for (const layer of sectorMap.layers.filter((item) => item.visible && item.data && !HIDDEN_LAYERS.has(item.name))) {
    for (let y = 0; y < sectorMap.height; y += 1) {
      for (let x = 0; x < sectorMap.width; x += 1) {
        const gid = layer.data[y * sectorMap.width + x]! & GID_MASK;
        if (!gid) continue;
        const point = cellToPixel({ x, y });
        const tileset = tilesetFor(gid);
        const index = tileset ? gid - tileset.firstgid : 0;
        const tile = tileset?.image ? undefined : tileset?.tiles?.find((item) => item.id === index);
        const image = imageOf(tileset?.image ?? tile?.image);
        if (!tileset || !image) {
          // A tileset image that is not in the repository: keep the cell readable with a reserve colour.
          ctx.fillStyle = '#0a1726';
          ctx.fillRect(point.x - TILE_WIDTH / 2, point.y - TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT);
          continue;
        }
        // Tiled anchors an isometric tile image at the bottom of its cell, left edge on the cell's left corner.
        const offset = tileset.tileoffset ?? { x: 0, y: 0 };
        const width = tileset.image ? tileset.tilewidth : image.width;
        const height = tileset.image ? tileset.tileheight : image.height;
        const columns = tileset.columns || 1;
        ctx.drawImage(image, tileset.image ? (index % columns) * width : 0, tileset.image ? Math.floor(index / columns) * height : 0, width, height,
          point.x - TILE_WIDTH / 2 + offset.x, point.y + TILE_HEIGHT / 2 + offset.y - height, width, height);
      }
    }
  }
  drawObjects(objectLayers.filter((layer) => layer.name === EMBLEM_LAYER));
  drawObjects(objectLayers.filter((layer) => layer.name !== SKY_LAYER && layer.name !== EMBLEM_LAYER));

  for (const player of ['p1', 'p2'] as const) {
    diamond(ctx, sectorSurface.bases[player]);
    ctx.fillStyle = BASE_COLOR[player];
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#f4fbff';
    ctx.lineWidth = 2 / scale;
    ctx.stroke();
  }
}

/** Inspector of the map chosen in the preparation lobby; the caller selects it before mounting. */
export function SectorMapScreen({ onBack }: { onBack(): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const label = playableMapLabel(activeMapId);
  const SCALE = Math.min(1, MAX_CANVAS_WIDTH / (sectorMap.width * TILE_WIDTH));
  const CANVAS_WIDTH = Math.round(sectorMap.width * TILE_WIDTH * SCALE);
  const CANVAS_HEIGHT = Math.round(((sectorMap.width + sectorMap.height) * TILE_HEIGHT / 2 + MAP_ORIGIN_Y + 32) * SCALE);
  const [selected, setSelected] = useState<Cell>(sectorSurface.bases.p1);
  const [pilot, setPilot] = useState<Cell>(sectorSurface.bases.p1);
  const [route, setRoute] = useState<Cell[]>([]);
  const [routeStatus, setRouteStatus] = useState('Selecciona una casilla transitable para mover la nave de prueba.');
  const [assetError, setAssetError] = useState(false);
  const [terrain, setTerrain] = useState<HTMLCanvasElement | null>(null);

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
    const urls = new Set<string>();
    for (const tileset of sectorMap.tilesets) {
      for (const file of [tileset.image, ...(tileset.tiles ?? []).map((tile) => tile.image)]) {
        const url = mapImageUrl(file);
        if (url) urls.add(url);
      }
    }
    void Promise.all([...urls].map(async (url) => [url, await loadImage(url)] as const)).then((loaded) => {
      if (disposed) return;
      if (loaded.some(([, image]) => !image)) setAssetError(true);
      const art = document.createElement('canvas');
      art.width = CANVAS_WIDTH;
      art.height = CANVAS_HEIGHT;
      paintTerrain(art, SCALE, new Map(loaded));
      setTerrain(art);
      // Large maps open on the player's base instead of on an empty corner.
      const stage = stageRef.current;
      const base = cellToPixel(sectorSurface.bases.p1);
      if (stage) stage.scrollTo(base.x * SCALE - stage.clientWidth / 2, base.y * SCALE - stage.clientHeight / 2);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !terrain) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(terrain, 0, 0);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.strokeStyle = '#83d4ff';
    ctx.lineWidth = 3 / SCALE;
    diamond(ctx, selected);
    ctx.stroke();
    if (route.length) {
      ctx.lineWidth = 2 / SCALE;
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
    ctx.arc(ship.x, ship.y - 12, 8 / Math.sqrt(SCALE), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    canvasRef.current?.setAttribute('data-atlas-ready', 'true');
  }, [terrain, selected, pilot, route]);

  function selectCell(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * CANVAS_WIDTH / rect.width / SCALE;
    const y = (event.clientY - rect.top) * CANVAS_HEIGHT / rect.height / SCALE;
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
      <div><p className="vi-eyebrow">EDITOR TILED · VISTA LOCAL</p><h1>{label}</h1>
        <p>Mapa isométrico de {sectorMap.width}×{sectorMap.height}, leído de {activeMapSourceFile()}. Pulsa una casilla para probar el movimiento y revisar su navegación.</p></div>
      {assetError && <p role="alert">No se pudieron cargar todas las imágenes del mapa.</p>}
      <div ref={stageRef} className={`vi-sector-map__stage${SCALE < 1 ? ' is-large' : ''}`}><canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
        role="img" aria-label={`Mapa Tiled ${label}`} data-map-size={`${sectorMap.width}x${sectorMap.height}`} data-scale={SCALE} onClick={selectCell} /></div>
      <div className="vi-sector-map__details" role="status">
        <span>Base A · {sectorSurface.bases.p1.x}, {sectorSurface.bases.p1.y}</span>
        <span>Base B · {sectorSurface.bases.p2.x}, {sectorSurface.bases.p2.y}</span>
        <span>Núcleo · {sectorSurface.core.x}, {sectorSurface.core.y}</span>
        <span>Nave · {pilot.x}, {pilot.y}</span>
        <span>Casilla {selected.x}, {selected.y} · {sectorSurface.walkable[index] ? 'Transitable' : 'Bloqueada'} · Altura {sectorSurface.level[index]}</span>
      </div>
      <p className="vi-sector-map__note" role="status">{routeStatus} Esta prueba usa las rutas, rampas y bloqueos de la simulación, los mismos con los que se juega la partida.</p>
    </section>
  </main>;
}
