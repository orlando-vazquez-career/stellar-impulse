# Mapas del campo de batalla

El servidor simula el campo en una cuadrícula ortogonal de celdas enteras: una unidad de simulación equivale a una celda. `cellSize` es el tamaño nominal del tile en píxeles para el frontend, no una escala de la simulación. Para el campo isométrico actual, el frontend aplica su transformación al dibujar y al convertir un clic de pantalla de vuelta a `(x, y)`.

## Catálogo y mapa actual

`@impulso/sim` exporta `MapCell`, `MapObjective`, `MapSpec`, `defineMapSpec`, `BATTLEFIELD_MAP` y `createBattlefieldWorld(map?, rules?)`. El mapa estático contiene identidad/versionado, dimensiones, bases, objetivos y dos máscaras row-major: `walkable` y `opaque`. El índice de una celda es `y * width + x`.

`BATTLEFIELD_MAP` tiene `id: "battlefield"`, versión `1`, tamaño `72 × 72` y `cellSize: 72` píxeles nominales por tile. Sus bases, dos nodos de metal, núcleo y guardianes están definidos en coordenadas de celda. El preset actual permite caminar por todas las celdas y no tiene bloqueadores de visión: el asset visual de terreno no declara colisiones ni oclusión. El mundo nuevo usa el esquema `BattlefieldWorld` (versión 2), independiente del mundo legacy `training` de 12 × 12.

## Importar mapas de Tiled

`parseTiledJson(source)` acepta un subconjunto acotado de JSON de Tiled para contenido de terreno local:

- mapa finito, ortogonal, cuadrado por celda; cada lado entre 1 y 128;
- JSON de hasta 1 MiB UTF-8 y hasta 16 capas de tile;
- de 1 a 8 tilesets embebidos, declarados en orden, sin `source` externo;
- datos de capa como arreglos de GID sin `encoding`, compresión ni chunks; no se permiten flags GID de giro/reflejo;
- capas alineadas al origen, sin desplazamientos.

Solo la capa `nav-blocked` define transitabilidad: GID cero significa transitable y uno distinto de cero bloqueado. Solo `vision-opaque` define oclusión: GID cero deja pasar visión y uno distinto de cero la bloquea. Las capas de arte, incluidas las del asset actual, no cambian estas máscaras. El importador devuelve las máscaras y dimensiones; el catálogo del servidor sigue siendo la autoridad sobre identidad, bases y objetivos.

## Movimiento y visión

La navegación usa cuatro vecinos ortogonales y distancia Manhattan. `findPath` devuelve una ruta que omite el origen e incluye el destino, junto con el número de celdas expandidas. Una búsqueda individual expande como máximo el número de celdas del mapa; el servidor comparte un presupuesto de 32.768 expansiones por tick lógico entre órdenes de una sala.

La ocupación resuelve pasos simultáneos ortogonales: las unidades aliadas pueden ceder paso y luego volver a su ruta; los ciclos completos de aliados reservan sus celdas antes de reclamaciones ordinarias, y los empates restantes priorizan el ID de escuadrón. Enemigos y guardianes vivos bloquean. Esto resuelve conflictos locales de ocupación, no garantiza planificación multiagente general.

La visión usa Manhattan con radio de 0 a 32. Una celda opaca se ve y oculta lo que queda detrás. Las esquinas siguen la regla de pared diamante permisiva: una celda diagonal puede verse entre dos paredes ortogonales; esto no habilita movimiento diagonal. Una fuente dentro de una celda opaca solo ve esa celda. El mundo actualiza `visible` y acumula `explored` para cada jugador en cada tick.

## Datos públicos de mapa

Al entrar en un sector, la sala envía primero el mensaje `map` y luego mensajes `view`. Su contenido público está limitado a `protocolVersion`, `mapId`, `version`, `width`, `height`, `cellSize`, `walkable` y `opaque`. Las máscaras son arreglos booleanos row-major con `width * height` elementos. El mensaje no contiene spawns, objetivos, entidades ni estado privado. El cliente puede guardar el mapa por `(mapId, version)` y esperar el mensaje para esa clave antes de interpretar o dibujar una vista.

La transformación isométrica, capas decorativas, sprites, cámara y escalado pertenecen al frontend. La metadata de navegación y visión sirve para dibujar terreno transitable/oculto si la interfaz lo requiere; no es una fuente para reconstruir entidades.

## Referencias del repositorio

- Catálogo y construcción: [`packages/sim/src/maps/battlefield.ts`](../packages/sim/src/maps/battlefield.ts), [`packages/sim/src/maps/types.ts`](../packages/sim/src/maps/types.ts) y [`packages/sim/src/index.ts`](../packages/sim/src/index.ts).
- Importador: [`packages/sim/src/maps/tiled.ts`](../packages/sim/src/maps/tiled.ts) y [`packages/sim/src/maps/tiled.test.ts`](../packages/sim/src/maps/tiled.test.ts).
- Rutas y visión: [`packages/sim/src/maps/pathfinding.ts`](../packages/sim/src/maps/pathfinding.ts) y [`packages/sim/src/maps/visibility.ts`](../packages/sim/src/maps/visibility.ts).
- Vista pública y máscaras: [`packages/state/src/battlefield.ts`](../packages/state/src/battlefield.ts) y [`packages/state/src/battlefield.test.ts`](../packages/state/src/battlefield.test.ts).
- Metadata enviada por sala: [`apps/server/src/map-catalog.ts`](../apps/server/src/map-catalog.ts) y [`apps/server/src/campaign-room.ts`](../apps/server/src/campaign-room.ts).
- Arte visual de terreno actual: [`apps/web/public/visual/maps/terrain.svg`](../apps/web/public/visual/maps/terrain.svg).
