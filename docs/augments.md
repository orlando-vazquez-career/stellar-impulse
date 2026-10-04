# Aumentos por partida

Las 44 cartas, traducciones y efectos están en `packages/sim/src/augments/catalog.ts`: 30 iniciales (10 por nivel) y 14 desbloqueables. La simulación resuelve los efectos; el cliente muestra una vista privada y envía una elección o renovación. El mínimo final de costo es 3 Metal, incluido Programa de reconocimiento.

La semilla de partida, jugador, número de elección y renovación determinan las cartas. Las elecciones iniciales esperan hasta 30 segundos; las siguientes duran 20 segundos mientras sigue el reloj. El vencimiento asigna una carta usando la misma fuente determinista. No hay costo de Metal.

Las cartas elegidas se revelan a ambos jugadores. Las ofertas, pools y semilla no se exponen al rival. Las etiquetas costo, ingreso-base y flota excluyen cartas incompatibles. Una renovación evita todas las cartas anteriores cuando hay tres alternativas. Cada pool inicial tiene diez cartas. Si las exclusiones reducen el pool y ya no quedan tres alternativas distintas, permite coincidencias con la mano anterior, cambiando las tres posiciones.

La IA descubre nodos mediante visión y conserva su última información visible. Cartografía agrega coordenadas fijas, sin revelar cambios de dueño fuera de visión. Los Exploradores recorren terreno desconocido y no persiguen objetivos para atacarlos. La IA revisa todas sus naves una vez por segundo; las naves siguen moviéndose y disparando en la simulación de 10 ticks/s. Con Reciclaje no espera una reparación en base que ya no existe.

Las pruebas unitarias verifican cada efecto y desventaja, elecciones, plazos y combinaciones. La opción de aceleración solo se acepta con `GAME_TEST_MODE=1` fuera de producción.

A los 8 minutos en Escaramuza y 20 minutos en Partida completa empieza la muerte súbita: capturar el núcleo sin rivales presentes gana inmediatamente (un tick), sin modificar la captura de nodos. Los guardianes siguen bloqueando y un núcleo disputado no da ganador. El HUD anuncia esta fase y la IA prioriza el núcleo aunque vaya perdiendo en nodos. Los señuelos muestran al rival las estadísticas y barra de vida aparentes de un Bombardero; su dueño ve sus 30 de vida reales.

## Balance reproducible

`pnpm exec tsx scripts/balance-augments.ts --samples 200` ejecuta IA Media contra IA Media con las reglas reales, semillas fijas, ambos mapas y modos, alternando el lado aumentado. Conserva resultados crudos en `.local/balance`. Sigue la muerte súbita hasta el resultado oficial o el límite de seguridad de 45 minutos del servidor. Si sigue sin ganador, informa empate, sin inventar una victoria. Los rangos solicitados requieren completar este experimento y revisar los resultados; la existencia del ejecutor no demuestra balance.

`BALANCE_WORKERS=6 BALANCE_SAMPLES=200 pnpm exec tsx scripts/balance-parallel.ts` distribuye cartas entre procesos. Cada pareja de partidas puede reutilizar el inicio idéntico sin aumentos, calculado por la misma simulación; se clona el estado antes de aplicar la carta a cada lado. Las rutas solo se reutilizan cuando el terreno es inmutable y los bloqueos son idénticos.
