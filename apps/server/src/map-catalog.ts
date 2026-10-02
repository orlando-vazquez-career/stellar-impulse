import { BATTLEFIELD_MAP, type MapSpec } from '@impulso/sim';

/** Campaign sectors select server-owned static terrain. Client messages never select a map. */
export function campaignMapForSector(_sector: number): MapSpec {
  return BATTLEFIELD_MAP;
}

/** Only declared public, static terrain metadata may cross the room boundary. */
export function publicMapMetadata(map: MapSpec) {
  return {
    mapId: map.id, version: map.version, width: map.width, height: map.height,
    cellSize: map.cellSize, walkable: [...map.walkable], opaque: [...map.opaque],
    ...(map.level && map.ramp ? { level: [...map.level], ramp: [...map.ramp] } : {}),
  };
}
