import type { MapSpec } from '@impulso/sim';

/** Only declared public, static terrain metadata may cross the room boundary. */
export function publicMapMetadata(map: MapSpec) {
  return {
    mapId: map.id, version: map.version, width: map.width, height: map.height,
    cellSize: map.cellSize, walkable: [...map.walkable], opaque: [...map.opaque],
    ...(map.level && map.ramp ? { level: [...map.level], ramp: [...map.ramp] } : {}),
  };
}
