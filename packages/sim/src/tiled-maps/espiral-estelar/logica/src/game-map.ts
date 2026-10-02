import { isOpenAt, type Cycle } from './cycle';
import { isInside, tileIndex, type GridSize, type TileCoord } from './grid';
import { canWeightEnter, type ShipWeight, type Terrain } from './terrain';

export interface WormholeNetwork {
  readonly id: string;
  /** Al entrar por un extremo se sale por el siguiente (sirve para pares y para redes de 3 o más). */
  readonly endpoints: readonly TileCoord[];
  readonly cycle: Cycle;
}

export interface AsteroidGate {
  readonly tiles: readonly TileCoord[];
  readonly cycle: Cycle;
}

export type MarkerValue = string | number | boolean;

export interface MapMarker {
  readonly kind: string;
  readonly tile: TileCoord;
  readonly properties: Readonly<Record<string, MarkerValue>>;
}

export interface GameMapInput extends GridSize {
  readonly terrain: readonly Terrain[];
  readonly wormholes: readonly WormholeNetwork[];
  readonly gates: readonly AsteroidGate[];
  readonly markers: readonly MapMarker[];
}

interface EndpointRef {
  readonly network: WormholeNetwork;
  readonly position: number;
}

export interface GameMap extends GameMapInput {
  readonly gateByTile: ReadonlyMap<number, AsteroidGate>;
  readonly endpointByTile: ReadonlyMap<number, EndpointRef>;
}

export function createGameMap(input: GameMapInput): GameMap {
  if (input.terrain.length !== input.width * input.height) {
    throw new Error(`El terreno tiene ${input.terrain.length} casillas y se esperaban ${input.width * input.height}`);
  }
  return { ...input, gateByTile: indexGates(input), endpointByTile: indexEndpoints(input) };
}

function indexGates(input: GameMapInput): Map<number, AsteroidGate> {
  const lookup = new Map<number, AsteroidGate>();
  for (const gate of input.gates) {
    for (const tile of gate.tiles) lookup.set(tileIndex(input, tile), gate);
  }
  return lookup;
}

function indexEndpoints(input: GameMapInput): Map<number, EndpointRef> {
  const lookup = new Map<number, EndpointRef>();
  for (const network of input.wormholes) {
    network.endpoints.forEach((tile, position) => lookup.set(tileIndex(input, tile), { network, position }));
  }
  return lookup;
}

export function terrainAt(map: GameMap, tile: TileCoord, tick: number): Terrain {
  const index = tileIndex(map, tile);
  const baseTerrain = map.terrain[index] ?? 'blocked';
  const gate = map.gateByTile.get(index);
  return gate && isOpenAt(gate.cycle, tick) ? 'empty' : baseTerrain;
}

export function canEnterTile(map: GameMap, tile: TileCoord, weight: ShipWeight, tick: number): boolean {
  return isInside(map, tile) && canWeightEnter(terrainAt(map, tile, tick), weight);
}

export function wormholeExit(map: GameMap, tile: TileCoord, tick: number): TileCoord | undefined {
  const endpoint = map.endpointByTile.get(tileIndex(map, tile));
  if (!endpoint || !isOpenAt(endpoint.network.cycle, tick)) return undefined;
  const { endpoints } = endpoint.network;
  return endpoints[(endpoint.position + 1) % endpoints.length];
}

export function markersOfKind(map: GameMap, kind: string): MapMarker[] {
  return map.markers.filter((marker) => marker.kind === kind);
}
