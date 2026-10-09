import { useEffect, useRef } from "react";
import type { LobbyMode } from "./types";

const FRAME_COUNT = 60;
const COLUMNS = 10;
const FRAME_SIZE = 120;
const FRAME_MS = 170;
const DRAW_SIZE = 500;
const FADE_MS = 600;
const MAX_PIXEL_RATIO = 2;

interface PlanetGlobeProps {
  modes: readonly LobbyMode[];
  active: LobbyMode;
}

interface Fade {
  fromId: string;
  startedAt: number;
}

export function PlanetGlobe({ modes, active }: PlanetGlobeProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const activeId = useRef(active.id);
  const fade = useRef<Fade | null>(null);

  useEffect(() => {
    if (activeId.current === active.id) return;
    fade.current = { fromId: activeId.current, startedAt: performance.now() };
    activeId.current = active.id;
  }, [active.id]);

  useEffect(() => {
    const sheet = canvas.current;
    const context = sheet?.getContext("2d");
    if (!sheet || !context) return;
    prepareContext(sheet, context);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const paint = (time: number) => {
      drawScene({
        context,
        images: images.current,
        activeId: activeId.current,
        fade: fade.current,
        time,
        reduced: reduced.matches,
      });
      if (fade.current && time - fade.current.startedAt >= FADE_MS) fade.current = null;
    };

    for (const mode of modes) loadSheet(images.current, mode, () => paint(performance.now()));

    let frame = 0;
    const tick = (time: number) => {
      paint(time);
      if (!reduced.matches) frame = requestAnimationFrame(tick);
    };
    if (reduced.matches) paint(0);
    else frame = requestAnimationFrame(tick);

    const onMotion = () => {
      cancelAnimationFrame(frame);
      if (reduced.matches) paint(0);
      else frame = requestAnimationFrame(tick);
    };
    reduced.addEventListener("change", onMotion);
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", onMotion);
    };
  }, [modes]);

  return <canvas ref={canvas} className="planet-sprite is-visible" role="img" aria-label={`Planeta de ${active.name}`} />;
}

function prepareContext(sheet: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  sheet.width = DRAW_SIZE * ratio;
  sheet.height = DRAW_SIZE * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
}

function loadSheet(images: Map<string, HTMLImageElement>, mode: LobbyMode, onLoad: () => void): void {
  if (images.has(mode.id)) return;
  const image = new Image();
  image.decoding = "async";
  image.onload = onLoad;
  image.src = mode.sprite;
  images.set(mode.id, image);
}

interface Scene {
  context: CanvasRenderingContext2D;
  images: Map<string, HTMLImageElement>;
  activeId: string;
  fade: Fade | null;
  time: number;
  reduced: boolean;
}

function drawScene({ context, images, activeId, fade, time, reduced }: Scene): void {
  context.clearRect(0, 0, DRAW_SIZE, DRAW_SIZE);
  const amount = fade ? Math.min(1, (time - fade.startedAt) / FADE_MS) : 1;
  if (fade && amount < 1) {
    drawPlanet({ context, image: images.get(fade.fromId), time, alpha: 1 - amount, reduced });
  }
  drawPlanet({ context, image: images.get(activeId), time, alpha: fade ? amount : 1, reduced });
}

interface PlanetDraw {
  context: CanvasRenderingContext2D;
  image: HTMLImageElement | undefined;
  time: number;
  alpha: number;
  reduced: boolean;
}

function drawPlanet({ context, image, time, alpha, reduced }: PlanetDraw): void {
  if (!image || !image.complete || image.naturalWidth === 0) return;
  const clock = reduced ? 0 : (time % (FRAME_COUNT * FRAME_MS)) / FRAME_MS;
  const index = Math.floor(clock) % FRAME_COUNT;
  const mix = reduced ? 0 : smoothstep(clock - Math.floor(clock));
  drawFrame({ context, image, index, alpha });
  if (mix > 0) drawFrame({ context, image, index: (index + 1) % FRAME_COUNT, alpha: alpha * mix });
}

interface FrameDraw {
  context: CanvasRenderingContext2D;
  image: HTMLImageElement;
  index: number;
  alpha: number;
}

function drawFrame({ context, image, index, alpha }: FrameDraw): void {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  context.globalAlpha = alpha;
  context.drawImage(
    image,
    column * FRAME_SIZE,
    row * FRAME_SIZE,
    FRAME_SIZE,
    FRAME_SIZE,
    0,
    0,
    DRAW_SIZE,
    DRAW_SIZE,
  );
}

function smoothstep(amount: number): number {
  return amount * amount * (3 - 2 * amount);
}
