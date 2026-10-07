export const LOGICA_TERRAIN_BY_TILE_ID = [
  'empty', 'nebula', 'asteroid', 'boost', 'slow', 'blocked', 'ice', 'ion_storm',
] as const;

export interface TiledTsxTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  objectalignment?: string;
  spacing?: number;
  margin?: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  tileoffset?: { x: number; y: number };
  grid?: { orientation: string; width: number; height: number };
  tiles?: TiledTsxTile[];
}

interface TiledTsxTile {
  id: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  properties?: { name: string; type?: string; propertytype?: string; value: unknown }[];
  animation?: { tileid: number; duration: number }[];
}

interface ParseTsxInput {
  xml: string;
  firstgid: number;
  tsxPathFromMap: string;
}

export function isLogicaTilesetSource(source: unknown): boolean {
  return typeof source === 'string' && source.replaceAll('\\', '/').endsWith('tilesets/logica.tsx');
}

export function parseTiledTsx(input: ParseTsxInput): TiledTsxTileset {
  const open = input.xml.match(/<tileset\b[^>]*>/);
  if (!open) throw new Error('Invalid tiled tileset');
  const head = attributes(open[0]);
  const tileset: TiledTsxTileset = {
    firstgid: input.firstgid,
    name: requiredName(head.name),
    tilewidth: requiredInt(head.tilewidth),
    tileheight: requiredInt(head.tileheight),
    tilecount: requiredInt(head.tilecount),
    columns: requiredInt(head.columns),
  };
  if (head.objectalignment) tileset.objectalignment = head.objectalignment;
  if (head.spacing !== undefined) tileset.spacing = Number(head.spacing);
  if (head.margin !== undefined) tileset.margin = Number(head.margin);
  copyOffset(input.xml, tileset);
  copyGrid(input.xml, tileset);
  copySheetImage({ xml: input.xml, tsxPathFromMap: input.tsxPathFromMap, tileset });
  const tiles = readTiles(input.xml, input.tsxPathFromMap);
  if (tiles.length > 0) tileset.tiles = tiles;
  return tileset;
}

function copyOffset(xml: string, tileset: TiledTsxTileset): void {
  const tag = xml.match(/<tileoffset\b[^>]*\/>/);
  if (!tag) return;
  const offset = attributes(tag[0]);
  tileset.tileoffset = { x: Number(offset.x), y: Number(offset.y) };
}

function copyGrid(xml: string, tileset: TiledTsxTileset): void {
  const tag = xml.match(/<grid\b[^>]*\/>/);
  if (!tag) return;
  const grid = attributes(tag[0]);
  tileset.grid = {
    orientation: grid.orientation ?? 'orthogonal',
    width: Number(grid.width),
    height: Number(grid.height),
  };
}

function copySheetImage(input: { xml: string; tsxPathFromMap: string; tileset: TiledTsxTileset }): void {
  const firstTile = input.xml.search(/<tile\b/);
  const tag = input.xml.match(/<image\b[^>]*\/>/);
  if (!tag) return;
  if (firstTile !== -1 && input.xml.indexOf(tag[0]) >= firstTile) return;
  const image = attributes(tag[0]);
  input.tileset.image = joinFromTsx(input.tsxPathFromMap, requiredName(image.source));
  input.tileset.imagewidth = Number(image.width);
  input.tileset.imageheight = Number(image.height);
}

function readTiles(xml: string, tsxPathFromMap: string): TiledTsxTile[] {
  const tiles: TiledTsxTile[] = [];
  for (const block of xml.matchAll(/<tile\b([^>]*)>([\s\S]*?)<\/tile>/g)) {
    const rawAttrs = block[1];
    const body = block[2];
    if (rawAttrs === undefined || body === undefined) continue;
    const id = requiredInt(attributes(`<tile ${rawAttrs}>`).id);
    const tile: TiledTsxTile = { id };
    const imageTag = body.match(/<image\b[^>]*\/>/);
    if (imageTag) {
      const image = attributes(imageTag[0]);
      tile.image = joinFromTsx(tsxPathFromMap, requiredName(image.source));
      tile.imagewidth = Number(image.width);
      tile.imageheight = Number(image.height);
    }
    const properties = [...body.matchAll(/<property\b([^>]*)\/>/g)].flatMap((entry) => {
      const raw = entry[1];
      if (raw === undefined) return [];
      const property = attributes(`<property ${raw}>`);
      const parsed: NonNullable<TiledTsxTile['properties']>[number] = {
        name: requiredName(property.name),
        value: typedValue(property.value, property.type),
      };
      if (property.type) parsed.type = property.type;
      if (property.propertytype) parsed.propertytype = property.propertytype;
      return [parsed];
    });
    if (properties.length > 0) tile.properties = properties;
    const frames = [...body.matchAll(/<frame\b([^>]*)\/>/g)].flatMap((entry) => {
      const raw = entry[1];
      if (raw === undefined) return [];
      const frame = attributes(`<frame ${raw}>`);
      return [{ tileid: requiredInt(frame.tileid), duration: requiredInt(frame.duration) }];
    });
    if (frames.length > 0) tile.animation = frames;
    tiles.push(tile);
  }
  return tiles;
}

function joinFromTsx(tsxPathFromMap: string, imageSource: string): string {
  const folder = tsxPathFromMap.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
  const joined = folder.length > 0 ? `${folder}/${imageSource}` : imageSource;
  return joined.replaceAll('\\', '/').replace(/\/{2,}/g, '/');
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][\w:.-]*)="([^"]*)"/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    out[name] = value;
  }
  return out;
}

function typedValue(value: string | undefined, type: string | undefined): unknown {
  if (value === undefined) return '';
  if (type === 'int' || type === 'float') return Number(value);
  if (type === 'bool') return value === 'true';
  return value;
}

function requiredName(value: string | undefined): string {
  if (!value) throw new Error('Invalid tiled tileset');
  return value;
}

function requiredInt(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Invalid tiled tileset');
  return parsed;
}
