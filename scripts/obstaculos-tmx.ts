// Writes into espiral-estelar.tmx the obstacles the game derives from the OBSTACLE_RING points and
// rectangles, as a locked layer of tile objects, so Tiled shows what the match will show.
// Run after exporting the map to JSON:  pnpm tsx scripts/obstaculos-tmx.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { leerEspiral } from '../packages/sim/src/mapas/espiral.ts';

const folder = new URL('../packages/sim/src/tiled-maps/espiral-estelar/', import.meta.url);
const LAYER = 'obstaculos-vista';
/** The game draws each model with its origin at 72% of its height; Tiled anchors tile objects at the bottom. */
const BELOW_ANCHOR = 0.28;

const sector = leerEspiral(JSON.parse(readFileSync(new URL('espiral-estelar.json', folder), 'utf8')));
let tmx = readFileSync(new URL('espiral-estelar.tmx', folder), 'utf8');
const newline = tmx.includes('\r\n') ? '\r\n' : '\n';

const firstGid = Number(tmx.match(/<tileset firstgid="(\d+)" source="tilesets\/estructuras\.tsx"\/>/)?.[1]);
if (!Number.isFinite(firstGid)) throw new Error('El mapa no usa tilesets/estructuras.tsx');
const tiles = new Map<string, { gid: number; width: number; height: number }>();
for (const tile of readFileSync(new URL('tilesets/estructuras.tsx', folder), 'utf8').matchAll(/<tile id="(\d+)">[\s\S]*?<image source="img\/([\w-]+)\.png" width="(\d+)" height="(\d+)"\/>/g)) {
  tiles.set(tile[2]!, { gid: firstGid + Number(tile[1]), width: Number(tile[3]), height: Number(tile[4]) });
}

// Drop the previous preview, then number the new layer and objects after everything the map already has.
tmx = tmx.replace(new RegExp(` <objectgroup[^>]*name="${LAYER}"[^>]*>[\\s\\S]*?</objectgroup>\\r?\\n`), '');
const head = tmx.match(/nextlayerid="(\d+)" nextobjectid="(\d+)"/);
if (!head) throw new Error('Mapa sin nextlayerid/nextobjectid');
const layerId = Number(head[1]);
let objectId = Number(head[2]);
const tile = Number(tmx.match(/tileheight="(\d+)"/)?.[1]);

const lines = [` <objectgroup id="${layerId}" name="${LAYER}" locked="1">`];
for (const obstacle of sector.obstaculos ?? []) {
  const art = tiles.get(obstacle.model);
  if (!art) throw new Error(`Falta ${obstacle.model} en estructuras.tsx`);
  const shift = art.height * BELOW_ANCHOR;
  lines.push(`  <object id="${objectId++}" name="${obstacle.model}" gid="${art.gid}" x="${round(obstacle.x * tile + shift)}" y="${round(obstacle.y * tile + shift)}" width="${art.width}" height="${art.height}"/>`);
}
lines.push(' </objectgroup>');
tmx = tmx.replace(head[0], `nextlayerid="${layerId + 1}" nextobjectid="${objectId}"`)
  .replace('</map>', `${lines.join(newline)}${newline}</map>`);
writeFileSync(new URL('espiral-estelar.tmx', folder), tmx);
console.log(`${sector.obstaculos?.length ?? 0} obstáculos escritos en la capa "${LAYER}" de espiral-estelar.tmx`);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
