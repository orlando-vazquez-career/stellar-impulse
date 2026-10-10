# Kit del mapa Trascendencia Estelar (dos flotas)

Tercer mapa de entrenamiento: el archipiélago de `trascendencia-estelar`, encogido de 163×163 a 115×115 y
pensado para el jugador contra la IA. Es un proyecto aparte: no lee nada de `trascendencia-estelar` (la versión
de cuatro flotas, que sigue intacta) ni de los mapas Espiral.

**Está conectado al juego**: aparece en el lobby como «Trascendencia Estelar» (id `trascendencia`).

## Carpetas

| Carpeta | Qué contiene |
|---|---|
| `trascendencia-estelar_2.tiled-project` / `.tmx` | Proyecto y mapa de Tiled (115×115, isométrico 64×32) |
| `trascendencia-estelar_2.json` | El mismo mapa exportado, con los tilesets como referencias a los `.tsx`. Es lo que lee el juego |
| `tilesets/`, `assets-externos/`, `assets-juego/` | Los mismos del mapa de cuatro flotas |
| `vistas-previas/mapa_completo.png` | Generado con `tmxrasterizer` |
| `logica/` | TypeScript puro + tests del kit |
| `herramientas/` | Scripts Python (ver "Regenerar") |

## Diseño del mapa

Vive en `herramientas/diseno_trascendencia.py`. Es el diseño original multiplicado por `S = 115 / 163`: mismas
islas, puentes y distancias relativas. El terreno se define en un octavo del mapa y se repite en las ocho
direcciones, así que las dos flotas recorren las mismas distancias.

- **Bases**: dos, en puntas opuestas. `spawn` 1 (jugador) a la izquierda y `spawn` 2 (IA) a la derecha. Con el
  giro de cámara del juego quedan abajo a la izquierda y arriba a la derecha.
- **Islas neutrales**: las de arriba y de abajo. Cada una tiene dos recursos y una **estación capturable**.
- **Pronexos**: cuatro, en las islas de las diagonales.
- **Recursos**: diez. Dos por isla de punta y dos en la isla central.
- **Camino de ronda**: une cada isla de punta con las dos islas de pronexo vecinas sin pasar por el centro. Cada
  uno de los ocho tramos lleva una **barrera destruible** y un remanso con una ruina que hay que rodear: un
  satélite estrellado (tramos que salen de una base) o un reactor averiado (los que salen de una estación).
- **Tramos de vuelo libre**: en cada puente la plataforma se interrumpe unas casillas y las naves cruzan sobre el
  espacio abierto. Se vuela igual; solo cambia el suelo (`VUELO_PUENTE` y `VUELO_RONDA` en el script).
- **Nebulosas** con niebla móvil a mitad de cada puente de pronexo, y ocho zonas de caída de satélites en dos
  grupos que se turnan.

## Qué va dónde

- **Sobre la plataforma**: lo que se posa en ella. Antenas, cristales (pocos), naves y satélites destruidos.
- **En el vacío**: asteroides, satélites enteros en órbita y restos a la deriva. Nada de hielo ni cristales.
- **Fondo lejano** (capa `fondo-espacio`): nubes, galaxias, soles, cinturones, planetas, la luna rota y el gigante
  anillado. Los cuerpos sólidos nunca asoman tras una isla: el script los aleja hasta dejar vacío de por medio.

Los assets de `destruibles.tsx` y `espacio.tsx` los fabrica `python herramientas/assets_espacio.py`.

## Estilo de los sprites

La regla completa está en `docs/design.md` (sección Arte). En resumen:

- **Decorado de Tiled** (todo lo que se coloca en las capas de objetos de este kit): isométrico vectorial del kit,
  con contorno `#0C1018` (`OUTLINE` en `herramientas/assets_bases.py`), supersample 3–4 y `apagar_bordes`
  (`herramientas/assets_espacio.py`). Cada imagen respeta el lienzo y el ancla (`objectalignment="bottom"`) de su
  tileset: la torre de vigilancia es de 80×128 y se apoya en el borde inferior.
- **Entidades de partida** con dueño, vida o rotación (bases de mando, torretas jugables, naves): no son de este kit.
  Van en `apps/web/public/assets/game/` en cenital tipo render, sin contorno y con el neón de su facción (violeta
  `#A978FF` la neutral).
- **El nexo** es la excepción: el juego lo muestra con el `pilar` y el `escudo` de este kit, no con un disco cenital.

Los sprites nuevos se generan con IA de imágenes (Codex) anclados a referencias de estilo del kit
(`tilesets/img/base_jugador.png` y la torre de vigilancia aprobada, `tilesets/img/torre_vigilancia.png`) y se ajustan
al lienzo y al ancla de su tileset; no se dibujan con scripts procedurales nuevos. Cada uno se anota en `CREDITOS.md`.
La torre de vigilancia es la misma imagen en este kit, `espiral-estelar` y `espiral-estelar_2`;
`packages/sim/src/tiled-maps/estructuras-arte.test.ts` lo comprueba junto con su lienzo.

## Estaciones capturables

Puntos `estacion` en la capa `objetos`. Se capturan como un pronexo (propiedad `radio`). Quien la tiene puede
comprar naves ahí desde el panel del hangar: salen **al instante**, junto a la estación, y cuestan
`factorPrecio` veces su precio (3). No usan la cola del hangar, pero sí respetan el tope de flota.

Lógica: orden `station_produce` en `packages/input` y `packages/sim/src/index.ts`.

## Barreras destruibles

Ocho puntos `barrera_destruible` en `objetos`:

| Propiedad | Valor |
|---|---|
| `material` | `hielo` (600 de vida, en los tramos que salen de una base) o `chatarra` (900, en los que salen de una estación) |
| `hp` | Vida de la barrera |
| `celdas` | Las casillas que tapa, como `x,y;x,y;…` |

En la capa `logica` esas casillas son `blocked`. En partida la barrera es un objetivo neutral que no dispara: las
naves solo le tiran si se les ordena atacarla (clic derecho). Al llegar su vida a cero se abren justo sus `celdas`
y su dibujo estalla en fragmentos. El punto de la barrera está sobre una de sus casillas, con suelo libre a ambos lados.

Lógica: `packages/sim/src/mecanicas/barreras.ts`. Estallido: `apps/web/src/visual/game/phaser/barrier-effects.ts`.

## Regenerar

```sh
python herramientas/diseno_trascendencia.py    # escribe el .tmx
tiled --export-map json trascendencia-estelar_2.tmx trascendencia-estelar_2.json
tmxrasterizer --size 2400 --hide-layer logica --hide-layer altura --hide-layer objetos --hide-layer eventos --hide-layer obstaculos-vista trascendencia-estelar_2.tmx vistas-previas/mapa_completo.png
```

Regenerar pisa lo que se haya pintado a mano en Tiled sobre el `.tmx`. Requiere `pillow` y `numpy`. En Windows,
`tiled` y `tmxrasterizer` están en `C:\Program Files\Tiled`.

## Pruebas

Desde la raíz del repositorio:

```sh
npx vitest run packages/sim/src/tiled-maps/trascendencia-estelar_2 packages/sim/src/mapas/trascendencia.test.ts packages/sim/src/tiled-maps/estructuras-arte.test.ts
```

## Lo que falta

- La IA captura las estaciones pero todavía no compra naves en ellas, ni ataca las barreras.
- El vórtice central, el cinturón de asteroides móvil, las torretas y el Leviatán no están en este mapa.
