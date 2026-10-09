# Kit del mapa Trascendencia Estelar

Tercer mapa: un archipiélago espacial para cuatro flotas (2 contra 2). Es un proyecto aparte: nada de esta
carpeta lo leen `espiral-estelar` ni `espiral-estelar_2`, y nada de ellas se lee desde aquí.

Todavía **no está conectado al juego** (no aparece en el lobby). Ver "Lo que falta" al final.

## Carpetas

| Carpeta | Qué contiene |
|---|---|
| `trascendencia-estelar.tiled-project` / `.tmx` | Proyecto y mapa de Tiled (163×163, isométrico 64×32) |
| `trascendencia-estelar.json` | El mismo mapa exportado, con los tilesets como referencias a los `.tsx` |
| `tilesets/` | Los del Espiral más `logo_stellar`, `hielo`, `estrellas`, `espacio` y `destruibles` |
| `assets-externos/` | Solo los sprites que el mapa usa: decorado (`deco_*`), robots y el planeta animado |
| `assets-juego/` | Lo que usa Phaser en ejecución: portal, niebla, pincel de visión, satélite y fragata |
| `vistas-previas/` | `mapa_completo.png`, generado con `tmxrasterizer` |
| `logica/` | TypeScript puro + tests: terreno, pathfinding, niebla de guerra, clic y colisiones |
| `herramientas/` | Scripts Python (ver "Regenerar") |
| `CREDITOS.md` | De dónde sale cada asset y su licencia |

## Diseño del mapa

El diseño vive en `herramientas/diseno_trascendencia.py`. El terreno se define en un octavo del mapa y se
repite en las ocho direcciones; los objetos de juego giran de cuarto en cuarto de vuelta. Al generar se
comprueba la simetría, que cada base alcance todos los objetivos y que las barreras cierren de verdad.

- **Islas**: una isla central con el Núcleo y ocho islas alrededor, flotando en el vacío.
- **Bases**: cuatro, en las puntas. Los `spawn` 1 (izquierda) y 3 (arriba) son el equipo 1; los `spawn` 2
  (derecha) y 4 (abajo), el equipo 2. Cada `spawn` lleva `owner` y `equipo`.
- **Puentes principales**: de la isla central a cada isla. Siempre abiertos.
- **Camino de ronda**: une cada base con las dos islas de pronexo vecinas sin pasar por el centro. Cada uno
  de los ocho tramos lleva una barrera de hielo, un remanso con una luna que hay que rodear y una barrera de
  chatarra. Con las barreras en pie, toda ruta cruza la isla central.
- **Pronexos**: seis. Cuatro en las islas de las diagonales y dos dentro de la isla central.
- **Recursos**: veinte. Dos por base, uno en el islote de cada puente de base, uno por isla de pronexo y
  cuatro en la isla central.
- **Nebulosas**: una a mitad de cada puente de pronexo, con su niebla móvil de dos rutas.
- **Satélites**: ocho zonas de caída en dos grupos que se turnan (islotes y puentes de pronexo).
- **Obstáculos fijos**: dieciséis `OBSTACLE_RING` y dieciséis antenas o satélites, dentro de las islas.
- **Sin agujeros de gusano**.

## Barreras destruibles

Son dieciséis objetos `barrera_destruible` en la capa `objetos`, con estas propiedades:

| Propiedad | Valor |
|---|---|
| `material` | `hielo` (600 de vida) o `chatarra` (900) |
| `hp` | Vida de la barrera |
| `celdas` | Las casillas que tapa, como `x,y;x,y;…` |

En la capa `logica` esas casillas son `blocked`. Cuando el juego las implemente, al llegar `hp` a cero debe
abrir justo las casillas de `celdas`. El dibujo de cada barrera está en `estructuras` (`barrera_hielo`,
`barrera_chatarra`); `barrera_hielo_rota` queda en el tileset para el estado dañado.

Las lunas de los remansos usan el tile animado de `planetafondo.tsx` y también son `blocked`, pero no se rompen.

## El espacio

- **Capa `fondo`**: el vacío no lleva suelo. Solo estrellas que titilan (`estrellas.tsx`) y ocho planetas
  animados de `planetafondo.tsx`.
- **Capa `fondo-espacio`** (objetos, debajo del terreno): nubes de gas, galaxias, diez planetas de colores,
  dos estaciones lejanas, cometas y púlsares animados. No es simétrica a propósito.
- **Capa `decoracion`**: asteroides y hielo en las costas, y constelaciones de roca de hielo en el vacío. Las
  constelaciones se definen en `NODOS` y `ARISTAS` del script; los cristales gigantes marcan dos nodos.

Para sumar planetas de otro color: guardar la imagen como `tilesets/img/planeta_10.png`, correr
`assets_espacio.py` (la añade a `espacio.tsx`) y agregarla a la lista `ESPACIO` y a `fondo_espacio` en
`diseno_trascendencia.py`.

## Emblemas de Stellar

Van en la capa de objetos `logos`, debajo de `estructuras`: uno dorado bajo el Núcleo, uno ante cada base
y uno bajo cada pronexo exterior (nueve).

## Regenerar

```sh
python herramientas/logo_stellar.py            # solo si cambia el logo
python herramientas/assets_espacio.py          # hielo, estrellas, fondo lejano y barreras
python herramientas/diseno_trascendencia.py    # escribe el .tmx
tiled --export-map json trascendencia-estelar.tmx trascendencia-estelar.json
tmxrasterizer --size 3000 --hide-layer logica --hide-layer altura --hide-layer objetos --hide-layer eventos --hide-layer obstaculos-vista trascendencia-estelar.tmx vistas-previas/mapa_completo.png
```

Regenerar pisa lo que se haya pintado a mano en Tiled sobre el `.tmx`. Requiere `pillow` y `numpy`.

`hoja_contacto.py` junta imágenes en una sola para revisarlas. `recortar_externos.py` y `generar_kit.py`
vienen del kit del Espiral y aquí no se usan.

## Pruebas

Desde la raíz del repositorio:

```sh
npx vitest run packages/sim/src/tiled-maps/trascendencia-estelar
```

`logica/test/trascendencia-estelar.test.ts` comprueba el tamaño, las cuatro bases, los seis pronexos, los
veinte recursos, que las cuatro flotas recorran distancias parecidas, que con las barreras en pie toda ruta
cruce el centro y que al romperlas se abra el atajo.

## Lo que falta

- **El lector del juego lo rechaza hoy.** `packages/sim/src/mapas/espiral.ts` limita el lado del mapa y el
  `firstgid` de los tilesets a 128 (`MAX_SIDE`); este mapa mide 163 y sus tilesets llegan a 193. Hay que
  subir ese límite o darle a este mapa un lector propio.
- **Conectarlo**: registrarlo en `TRAINING_MAPS` (`packages/sim/src/index.ts`), en el lobby y en
  `apps/web/src/visual/map/sector-map.ts`.
- **Cuatro flotas**: el juego hoy maneja dos bandos; los `spawn` 3 y 4 y la propiedad `equipo` esperan ese cambio.
- **Barreras destruibles**: la mecánica no existe todavía en la simulación.
- **Dibujar las capas nuevas** en Phaser: `logos` y `fondo-espacio`.
