# Táctica del MVP

**Estado:** backlog propuesto. Las tarjetas siguientes no están completadas por el bootstrap.
Cada tarjeta reserva hasta **4 horas** incluyendo revisión/apoyo: 45 tarjetas, 180 horas;
9 tarjetas por integrante, 36 horas. Si una supera cuatro horas, dividir y recortar otra
dentro del presupuesto. No sumar revisiones como horas adicionales.

Antes de ejecutar una tarjeta: confirmar reglas de [producto](../product.md), contrato
de interfaz afectado y caso de aceptación. Implementar la prueba, el cambio mínimo y
abrir PR. Comandos base: `pnpm check`, `pnpm test:e2e`; contratos añaden
`pnpm contracts:test`, `pnpm contracts:check`, `pnpm contracts:build`.
Cada prueba nueva debe incorporarse a esos comandos o quedar con comando exacto en el PR.

## 23–25 septiembre: reglas e interfaces

| ID | Dueño | Apoyo / revisor | Archivos | Dependencia | Aceptación |
|---|---|---|---|---|---|
| H01 | Hans | Diego / Orlando | docs/plans | Ninguna | Fecha, capacidad y presupuesto confirmados por todos |
| D01 | Diego | Yamil / Hans | docs/product.md | H01 | Casos de captura, empate, reset y recuperación acordados |
| Y01 | Yamil | Diego / Orlando | packages/input, sim | D01 | Órdenes mover/atacar/mantener/capturar validadas con tests |
| O01 | Orlando | Yamil / Hans | apps/server, docs/architecture.md | Y01 | Versionado de mensajes y admisión probados con dos clientes |
| I01 | Ismael | Yamil / Diego | docs/design.md, render-2d | D01 | Vista a cinco anchos y selección legible por teclado |
| H02 | Hans | Diego / Yamil | docs/testing.md | D01 | Matriz aceptación y fallos reproducibles registrada |
| D02 | Diego | Yamil / Ismael | packages/sim/data | D01 | Tabla de costos/energía/tope sin ventaja de lado |
| Y02 | Yamil | Ismael / Orlando | packages/sim, render-2d | Y01,D02 | Obstáculos y rutas por escuadrón deterministas |
| O02 | Orlando | Yamil / Hans | docs/blockchain.md, contracts | D01 | Roles, storage, TTL y activo testnet revisados técnicamente |
| I02 | Ismael | Diego / Yamil | render-2d, apps/web | I01 | Cuatro siluetas distinguibles sin depender solo de color |

## 26–28 septiembre: campaña local y propiedad

| ID | Dueño | Apoyo / revisor | Archivos | Dependencia | Aceptación |
|---|---|---|---|---|---|
| D03 | Diego | Yamil / Hans | packages/sim/data | D02 | Tecnologías con límites y defaults, 6 mínimo tras recorte |
| Y03 | Yamil | Diego / Orlando | packages/sim | Y02,D03 | Reset de economía/flota y conservación de tecnologías |
| Y04 | Yamil | Diego / Orlando | packages/sim | Y03 | Tres sectores, jefe y victoria final reproducibles |
| Y05 | Yamil | Diego / Orlando | sim, apps/server | Y04 | Bot solo emite órdenes válidas con visión autorizada |
| D04 | Diego | Hans / Yamil | docs/testing.md, sim/data | Y04 | Playtest 25 sep procesado, sin victoria por último golpe |
| O03 | Orlando | Yamil / revisor técnico | contracts/cosmetics | O02 | Clases y grants con auth, límites y tests negativos |
| O04 | Orlando | Yamil / revisor técnico | contracts, chain | O03 | Deploy testnet con hash, red, commit y propiedad consultada |
| I03 | Ismael | Diego / Yamil | packages/ui, apps/web | I02,Y03 | HUD economía, captura, timers y transición legibles |
| H03 | Hans | Diego / Ismael | docs/testing.md | Y04 | Video interno de run y fallos clasificados |
| H04 | Hans | Orlando / Diego | docs/plans | H03 | Bloqueos priorizados y horas reales reconciliadas |
| I04 | Ismael | Diego / Yamil | apps/web/assets | I02 | Librea/estela con licencia y colores de equipo conservados |

## 29 septiembre–2 octubre: multijugador y sesión

| ID | Dueño | Apoyo / revisor | Archivos | Dependencia | Aceptación |
|---|---|---|---|---|---|
| O05 | Orlando | Yamil / revisor técnico | apps/server, state | O01,Y04 | Cada conexión recibe solo su proyección; test de fuga pasa |
| Y06 | Yamil | Orlando / Diego | apps/web, render-2d | O05 | Dos clientes completan campaña sin autoridad en navegador |
| O06 | Orlando | Yamil / revisor técnico | apps/server | O05,Y05 | Token sesión, reserva60s, bot10s, reconexión sin replay de órdenes |
| D05 | Diego | Hans / Yamil | docs/testing.md | Y06 | Matriz de desconexión, empate y agotamiento ejecutada |
| I05 | Ismael | Yamil / Diego | apps/web, ui | Y06 | Transición, elección tecnológica y fallback de selección |
| H05 | Hans | Diego / Orlando | docs/testing.md | O06 | Playtest2oct con evidencias de 1v1/reconexión |
| D06 | Diego | Ismael / Yamil | sim/data | H05 | Balance por lado/tecnología; límites revisados |
| I06 | Ismael | Diego / Yamil | apps/web/assets | I04 | Dos emblemas, procedencia y estados de inventario |
| H06 | Hans | Orlando / Diego | docs/plans | H05 | Decidir go/no-go para contenido adicional |

## 3–5 octubre: compra y premios

| ID | Dueño | Apoyo / revisor | Archivos | Dependencia | Aceptación |
|---|---|---|---|---|---|
| O07 | Orlando | Yamil / revisor técnico | server, chain | O04,O06 | SEP-10, vinculación de invitado y persistencia transaccional |
| O08 | Orlando | Yamil / revisor técnico | contracts, server, chain | O07 | Compra firmada por jugador; premio doble no duplica emisión |
| Y07 | Yamil | Orlando / Diego | sim, tests | O08 | Replay con/sin cosméticos produce igual resultado lógico |
| I07 | Ismael | Orlando / Diego | apps/web, ui | I06,O08 | Hangar/equipamiento autorizado visible al rival |
| D07 | Diego | Hans / Yamil | sim/data, docs | D06 | Playtest compara recuperación y remontadas |
| H07 | Hans | Orlando / Diego | docs/testing.md | I07,Y07 | Compra/grant/equipar evidenciados con transacciones testnet |

## 6–11 octubre: cierre y defensa

| ID | Dueño | Apoyo / revisor | Archivos | Dependencia | Aceptación |
|---|---|---|---|---|---|
| Y08 | Yamil | Ismael / Orlando | sim, render-2d | Y07 | Medir tick y latencia en portátil objetivo, corregir cuello principal |
| I08 | Ismael | Diego / Hans | ui, apps/web | I07 | Tutorial breve, foco, mensajes y estados de error revisados |
| D08 | Diego | Hans / Yamil | sim/data, docs | D07,Y08 | Reglas congeladas7oct y sin bloqueos de campaña |
| O09 | Orlando | Yamil / revisor técnico | contracts, server, docs | O08 | Revisión de permisos/TTL/abuso y procedimiento de testnet validado |
| Y09 | Yamil | Orlando / Diego | tests, apps | O09,Y08 | Regresión dos clientes + red fallida; candidato estable |
| H08 | Hans | Todos / Diego | docs/testing.md | Y09,D08 | Playtest9oct y aceptación completa; pendientes honestos |
| I09 | Ismael | Hans / Diego | docs/demo | I08,H08 | Capturas y video2–3min con licencias verificadas |
| D09 | Diego | Hans / Ismael | docs/demo | H08 | Guion explica núcleo, remontada y cero pay-to-win |
| H09 | Hans | Todos / Diego | docs/demo | I09,D09 | Ensayo, URL/repo/video, contingencia y entrega11oct |

## Registro de despliegues futuro

Cuando O04 se ejecute, registrar red, passphrase, dirección pública, tx, hash WASM,
commit, fecha, responsable y verificación. No incluir secretos ni rutas del desarrollador.
No existe aún una entrada de despliegue: el build local no demuestra publicación en cadena.

## Cierre de cada tarjeta

Responsable registra comandos/resultados, archivos, desviaciones y límites. El revisor
reproduce al menos su criterio de aceptación. Hans actualiza estado y horas efectivas.
Un test no ejecutado se marca pendiente. No cerrar por cantidad de código generado.
