# Dirección visual y experiencia

## Intención

Una mesa táctica espacial legible. El mapa isométrico es el elemento principal;
paneles compactos acompañan la decisión de mover, observar y capturar.
La referencia visual es una consola azul oscura y cian; el brief manda sobre el antiguo roadmap.

| Token | Valor | Uso |
|---|---|---|
| espacio | #08131f | Fondo |
| panel | #102333 | Superficies |
| texto | #edf4f8 | Texto principal |
| secundario | #a8becd | Apoyo |
| aliado | #71e5dc | Flota propia y selección |
| rival | #ffad85 | Enemigo, acompañado de forma/etiqueta |
| recurso | #f2cd79 | Nodos y objetivo |

Tipografía del sistema, sin descargar fuentes externas. Títulos firmes, texto breve y
números alineados. El terreno ocupa el centro; controles y lectura de escuadrón a su lado.
Marcas de base, guardianes y núcleo tienen siluetas diferentes.

## Flujo inicial

Inicio → **login "señal perdida"** (puerta de entrada) → entrenamiento directo, unirse con
código, o pasar al atlas de mando → modo entrenamiento → crear sala o unirse con código →
seleccionar escuadrón → ordenar destino → observar combate automático → capturar →
resultado → nueva sala.

El login es una escena procedural a viewport completo: una nave capital partida en dos
arde en primer plano (fuegos con parpadeo, columnas de humo, chispas y micro-explosiones
ocasionales) mientras el cinturón de asteroides cruza detrás en paralaje con el cursor.
El panel es una consola-holograma cyberpunk que vibra y sufre ráfagas de glitch, como
una transmisión perdiendo señal. Determinista (semilla fija), pausa en pestaña oculta y
con `prefers-reduced-motion` se congela en un único frame. La música se monta aparte:
basta soltar `public/audio/login-theme.mp3` y arranca con el primer gesto del usuario.

Wallet es opcional y aparece fuera del área de órdenes. Consulta de red y conexión muestran
cargando, éxito, error y red incorrecta. La ausencia de wallet nunca bloquea jugar.
No mostrar compra, premio, inventario o progreso de campaña como si existieran.

## Estados y accesibilidad

Selección mediante clic; botones de destinos y movimiento por flechas ofrecen alternativa
al mapa. Foco visible, instrucciones textuales y resultado en región de estado.
Color acompañado por etiqueta/forma. Reducir movimiento cuando lo solicite el sistema.
Canvas no ofrece por sí solo accesibilidad completa; lector de pantalla y control total
requieren una revisión específica antes del MVP.

Revisar a 320, 768, 1024, 1440 y 1920 px sin overflow. El MVP está dirigido a desktop;
adaptación de layout estrecho no certifica una versión móvil del RTS.
Presupuesto inicial: tick p95 <50 ms a 10 Hz, entrada visible p95 <200 ms en entorno
documentado, interacción UI <200 ms, JS inicial comprimido <350 KiB.
Son metas; medirlas en equipo de referencia antes de declararlas cumplidas.

## Arte

Los gráficos de esta base son procedurales, sin recursos externos ni copias del material
de inspiración. Ismael reemplazará siluetas y efectos con assets de licencia documentada.
Cosméticos deben preservar colores de equipo, siluetas, radios y avisos.

### Regla de estilo de los sprites del mapa

Cada sprite sigue uno de dos estilos, según lo que representa en la partida:

| Qué es | Estilo | Cómo se hace |
|---|---|---|
| Entidad de partida con dueño, vida o rotación (base de mando, torreta jugable y su cabeza giratoria, naves) | Cenital tipo render | Fuente de 256–512 px que el juego reduce al dibujarla. Sin contorno; neón del color de la facción y violeta `#A978FF` para la variante neutral. Referencia: `apps/web/public/assets/game/structures/command-base-top-neutral.png` |
| Decorado de Tiled (lo que se coloca en las capas de objetos de los kits: torre de vigilancia, antenas, satélites, restos) | Isométrico vectorial del kit | Contorno `#0C1018` (`OUTLINE` de `assets_bases.py`), supersample 3–4 y `apagar_bordes` (`assets_espacio.py`) para que el halo no se vea como una mancha al escalar. Lienzo y ancla de su tileset |

**Excepción:** el nexo se muestra con el pilar y el escudo del kit, no con un disco cenital
(`NEXUS_STYLE = 'pillar'` en `apps/web/src/visual/map/map-objects.ts`).

**Origen de los sprites nuevos.** Se generan con IA de imágenes (Codex) anclados a referencias de
estilo del kit (`tilesets/img/base_jugador.png` y la torre de vigilancia aprobada,
`tilesets/img/torre_vigilancia.png`), y después se ajustan al lienzo y al ancla que declara su
tileset; no se agregan scripts procedurales nuevos para dibujarlos. Cada archivo se anota en el
`CREDITOS.md` del kit. `packages/sim/src/tiled-maps/estructuras-arte.test.ts` comprueba que la torre de
vigilancia conserve su lienzo de 80×128 RGBA, el tamaño declarado en `estructuras.tsx` y el de cada
objeto del mapa, y que sea el mismo archivo en los tres kits jugables.

La escena del login (`apps/web/src/login/scene`) sigue la misma regla: cascos, asteroides,
fuego, humo y grano son procedurales sobre Canvas 2D, sembrados con `createRng(20260930)`,
y reutiliza los starfields del atlas como capa de cielo con opacidad baja. Cada sistema
visual es un módulo independiente (fondo, asteroides, nave, post-proceso) para poder
sustituirlo por sprites con licencia sin tocar los demás.
