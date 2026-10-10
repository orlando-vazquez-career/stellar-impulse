# Sistema de base

Las partidas reales (Partida completa y Escaramuza, creadas con `createMatchWorld`)
tienen una base destructible con módulos y una economía de nodos más lenta. El
modo de práctica antiguo (`createSectorWorld`) no cambia. Todo vive en la
simulación (`packages/sim/src/base.ts`); el cliente solo envía órdenes y muestra
la vista filtrada.

## Decisión de juego

El Metal es escaso. Conviene tomar nodos rápido (cada uno paga un bono la primera
vez), construir la Refinería y después elegir entre atacar antes de que el rival
se fortalezca o invertir en economía para llegar con todo al tercer aumento y al
núcleo.

## Economía

| Parámetro | Partida completa | Escaramuza |
|---|---:|---:|
| Metal inicial | 10 | 10 |
| Ingreso de la base | 0,2/s | 0,5/s |
| Bono por primera captura de un nodo | +10 | +6 |
| Nodo recién capturado sin producir | 20 s | 10 s |
| Nodo sin Refinería / con Refinería / con Refinería II | 0,2 / 0,35 / 0,5 por s | 0,4 / 0,7 / 0,9 por s |

El bono se paga una sola vez por nodo en la partida. Recapturar solo reinicia la
espera. Los aumentos de economía se aplican encima de estos valores.

## Base

| Parámetro | Partida completa | Escaramuza |
|---|---:|---:|
| Casco | 2500 | 1500 |
| Armadura | 2 | 2 |
| Escudo (invulnerable y sin rendición) | hasta 5:00 | hasta 2:30 |
| Defensa propia | 12 de daño por segundo, alcance 4 | igual |
| Regeneración | 3 por segundo tras 10 s sin daño | igual |

La defensa dispara primero a las naves que atacan la base y después a la más
cercana. Las mejoras de Daño de base (+10 por nivel) y de Capacidad (+4 naves por
nivel) siguen disponibles en la pestaña Base.

Las naves atacan la base rival con clic derecho sobre ella, o solas cuando la
tienen en alcance y no hay otro objetivo. El Bombardero hace ×1,5 a estructuras.
Destruir la base rival gana la partida. Desde el fin del escudo también se puede
**Rendirse** (botón arriba a la derecha, con confirmación).

## Hangar

El hangar construye una nave por vez y guarda hasta cuatro pedidos más en cola (cinco
en total). Cada pedido se cobra al encolar y ocupa su plaza de flota desde ese
momento: las naves vivas, la que se construye y las de la cola no pueden superar el
tope. La siguiente empieza en el mismo tick en que sale la anterior, con el
Astillero y los aumentos de construcción rápida vigentes al empezar. Si un aumento
prohíbe un tipo que estaba en cola, ese pedido se descarta con reembolso al llegarle
el turno. Si la flota ya está en el tope, el pedido espera pagado hasta que se libere
una plaza. Cancelar un pedido devuelve exactamente lo que pagó; cancelar la nave en
construcción deja empezar la siguiente en el tick siguiente. La IA rival nunca usa la
cola: solo encarga con el hangar libre.

Las naves nacen fuera del casco. La flota inicial y el hangar usan el primer anillo
de casillas alrededor de la base (la de combate en +1,0 y el Explorador en +1,+1,
espejadas para p2) y, si está ocupado, buscan hacia afuera hasta el anillo 4. Las
estaciones despachan desde el segundo anillo. El hangar, los refuerzos de aumentos y
las estaciones prueban primero las casillas del anillo más cercanas al Núcleo (con el
orden de barrido como desempate), así que las dos bases lanzan a la misma distancia de
él. Con todo ocupado el hangar retiene la nave terminada y la cola no avanza.

## Captura de objetivos

El Núcleo y cada nodo de Metal se capturan desde un disco de radio 2
(`CORE_CAPTURE_RADIUS` y `METAL_CAPTURE_RADIUS`); los pronexos y estaciones usan el
`radio` de su marcador. Un marcador `pilar` o `recurso` puede fijar su propio `radio`
(de 1 a 8). Sector 01 conserva el radio de las reglas (1). Exploradores y señuelos no
cuentan para capturar.

## Módulos

Tres espacios. El primero solo admite la Refinería; los otros dos se eligen entre
Astillero, Bastión y Radar, así que uno siempre queda afuera. Se construye un
módulo a la vez, se paga al empezar y no tiene efecto hasta terminar.

| Módulo | Costo (completa / escaramuza) | Tiempo | Efecto |
|---|---|---|---|
| Refinería | 30 / 21 Metal | 30 / 21 s | Nodos casi al doble. Requisito para el resto |
| Refinería II | 50 / 35 Metal | 40 / 28 s | Nodos rinden todavía más |
| Astillero | 40 / 28 Metal | 35 / 25 s | Naves 35 % más rápidas de construir y +2 de flota |
| Bastión | 45 / 32 Metal | 35 / 25 s | Defensa de 20 de daño y alcance 5, +600 de casco, +2 de armadura |
| Radar | 35 / 25 Metal | 30 / 21 s | Base ve 4 casillas más, nodos propios vigilan (radio 3) y revela naves camufladas en su cobertura |

## IA rival

Construye la Refinería cuando tiene un nodo y ahorra Metal para ella. Después:

- Fácil: solo Refinería; nunca asalta bases.
- Media: Astillero y Bastión; asalta la base con 6 naves de combate.
- Difícil: Refinería II, Astillero y Bastión; asalta con 5.

Con la flota llena y Metal de sobra compra Capacidad.

## Medición

Partidas IA Media contra IA Media (y una contra Difícil), sin aumentos, en ambos
mapas:

- Escaramuza: 6 a 8 minutos.
- Partida completa: 6 a 20 minutos; dos de seis terminaron por base destruida y el
  resto por núcleo.
- El Metal de la Partida completa se mantiene bajo (decenas) hasta el minuto 5.

Contra un jugador inactivo, la IA Media destruye la base de Escaramuza unos 40 s
después de que cae el escudo.
