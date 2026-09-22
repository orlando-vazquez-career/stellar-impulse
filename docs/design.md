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

Inicio → crear entrenamiento o introducir sala → seleccionar escuadrón → ordenar destino →
observar combate automático → capturar → resultado → nueva sala.

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
