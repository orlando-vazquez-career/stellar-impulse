# Kit del mapa Espiral Estelar

## Carpetas

| Carpeta | Qué contiene |
|---|---|
| `espiral-estelar.tiled-project` / `.tmx` | Proyecto y mapa de Tiled (58×58, isométrico 64×32) con el diseño Espiral Estelar ya armado |
| `espiral-estelar.json` | El mismo mapa exportado (tilesets incrustados): lo lee `loadTiledMap` y Phaser |
| `tilesets/` | `logica` (terreno), `suelo` (10 tiles), `asteroides` (8 variantes) y `estructuras`: bases del jugador y enemiga, pilar, escudo, pronexo, agujero, recurso y 3 naves destruidas |
| `assets-juego/` | Lo que usa Phaser en ejecución: animación del portal, textura de niebla y pincel de visión |
| `assets-juego/naves/` | Fragata en 8 direcciones (4× escala, usar `setScale(0.25)`), sombras aparte y su atlas |
| `vistas-previas/` | Mapa completo, mapa con niebla de ejemplo y minimapa de la capa lógica |
| `logica/` | TypeScript puro + tests: terreno, velocidades, pathfinding, niebla de guerra, clic y colisiones |
| `logica/client/` | Lo que va en el navegador: proyección isométrica, picking, render de la niebla y vista del portal |
| `herramientas/` | Scripts Python que regeneran todo: `python3 herramientas/generar_kit.py` (requiere numpy, pillow y cairosvg) |

## Diseño del mapa

El diseño vive en `herramientas/diseno_espiral.py`: caminos (con su tipo de carril), nebulosas, plazas, pasos de asteroides, naves destruidas y objetos. Solo se define la mitad azul; la roja sale por simetría central. Al generar, se comprueba la simetría y que todo sea alcanzable.

- Carriles azules (acelerador) en el espiral principal y rojos (desacelerador) en las rutas secundarias.
- Naves destruidas como bloqueo: su huella es `blocked` en la capa lógica, así que cortan o angostan caminos y nebulosas.
- Restos de nave pequeños: solo decoran, se puede pasar por encima.
- Dos pares de agujeros de gusano (A arriba/abajo, B izquierda/derecha) y dos pasos de asteroides que se abren por ciclos.

## En Tiled

1. Abrir `espiral-estelar.tiled-project` y después `espiral-estelar.tmx`.
2. Pintar `logica` (lo que lee el servidor) y encima `suelo` / `decoracion` (asteroides).
3. Las estructuras van como objetos de imagen en la capa `estructuras`.
4. Los marcadores con lógica (`spawn`, `pronexo`, `agujero`, `asteroid_gate`…) van en `objetos`. Un `pronexo` acepta la propiedad `radio` (entero, 1 a 8): las casillas a su alrededor que cuentan como área de captura. Sin ella vale el radio general de las reglas (1). El `pilar` (Núcleo) y cada `recurso` (nodo de Metal) aceptan la misma propiedad; sin ella valen 2.
5. Las zonas donde caen satélites van como rectángulos `zona_caida` en la capa `eventos`. Propiedades: `damage`, `radius` (casillas alrededor del impacto), `intervalSeconds`, `warningSeconds` y `amount` (satélites por oleada). El satélite no se coloca en Tiled: lo crea el juego (`packages/sim/src/mecanicas/satellites.ts`) y lo dibuja Phaser con `assets-juego/satelite_caida.png`.
6. La capa `robots` (objetos `robot_capsula` del tileset `robot-sal` y `robotsitoo`) queda en el mapa, pero el cliente ya no la dibuja: el juego no la lee.
7. Los obstáculos van como **puntos** de clase `OBSTACLE_RING` en `objetos` o como **rectángulos** de esa clase, en cualquier capa de objetos. Un rectángulo se rellena solo con obstáculos repartidos por su suelo libre, dejando una casilla entre ellos y sin cortar nunca el paso de una base a un objetivo. Cada punto cierra las casillas a su alrededor para naves e IA y el juego dibuja su modelo. Propiedades opcionales: `modelo` (`nave_destruida_1`, `estacion_rota`, `nave_destruida_2`, `cristales` o `satelite`; sin ella se reparten por id) y `radio` en casillas. Los modelos y sus radios están en `packages/sim/src/mapas/obstaculos.ts`.
8. Exportar a JSON (con o sin **Embed tilesets**: el juego lee los `.tsx` si hace falta).

## Lógica (`logica/src`)

| Archivo | Para qué |
|---|---|
| `terrain.ts` | Tabla de reglas por terreno: velocidad, visión, si tapa la vista, si oculta unidades y qué peso de nave entra. **Aquí se ajusta el balance.** |
| `tiled-loader.ts` | `loadTiledMap(json, ticksPorSegundo)` convierte el JSON exportado en un `GameMap` |
| `fog-of-war.ts` | `FogOfWar.update(map, observadores, tick)` por jugador; `isUnitVisible` para filtrar la vista del rival |
| `pathfinding.ts` | A* con costo por terreno, sin cortar esquinas, con atajos por agujeros de gusano abiertos |
| `movement.ts` | `orderMove` + `advanceUnits` por tick: velocidad por terreno, teletransporte y espera si otra nave bloquea |
| `occupancy.ts` | Bloqueo de cuerpos: una nave por casilla |
| `click-targets.ts` | Ajusta el clic a una casilla válida y reparte destinos distintos entre las naves seleccionadas |
| `cycle.ts` | Apertura y cierre por ticks (portales y pasos de asteroides) y fase para la animación |

Todo es determinista (enteros, desempates por id) para correr en el servidor autoritativo.

```ts
const map = loadTiledMap(json, TICKS_PER_SECOND);
const occupancy = new TileOccupancy(map);
const fog = new FogOfWar(map);

// al recibir un clic con naves seleccionadas
const targets = assignMoveTargets({ map, tick, occupancy }, clickedTile, selectedShips);
for (const ship of ships) {
  const target = targets.get(ship.id);
  if (target) orderMove({ map, occupancy, tick, rules: DEFAULT_MOVEMENT_RULES }, ship, target);
}

// cada tick
advanceUnits(map, ships, occupancy, tick);
fog.update(map, playerShips.map((ship) => ({ tile: ship.tile, visionRadius: ship.vision })), tick);
```

En el cliente: `worldToTile` / `pick` con `pointer.worldX/worldY`, `FogRenderer.render(snapshot)` y `PortalView.sync(phaseAt(...).phase)`.

> El brief v0.3 dice que las naves no colisionan entre sí. El bloqueo se activa o desactiva con `bodyBlocking` en `MovementRules`, para que Diego lo decida en el playtest.

## Comandos

```sh
cd logica
npm install
npm run check   # tipos
npm test        # 27 tests (incluye el mapa real)
```
