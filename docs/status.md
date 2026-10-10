# Estado del repositorio

Actualizado: 9 de octubre de 2026. Base de producto: 0.1.0.

## Implementado

### Cola del hangar, captura y pausa de práctica (9 de octubre de 2026)

El hangar acepta hasta cinco pedidos (uno en construcción y cuatro en cola), cobra al
encolar y permite cancelar cualquiera con reembolso exacto (`cancel_production`). Cada
pedido pendiente ocupa su plaza de flota, también para las compras en estaciones. Las
naves nacen en el primer anillo de la base y en el segundo de las estaciones, nunca
dentro del casco. El Núcleo y los nodos de Metal se capturan desde un radio de 2 casillas
en los mapas de Tiled. La vista indica si el Núcleo está bloqueado, libre, capturándose
o en disputa, quién lo captura y cuánto le falta. La práctica contra la IA admite una
pausa ilimitada del único humano; en multijugador no hay pausa voluntaria. Consulta
[protocolo](protocol.md) y [sistema de base](base-system.md).

### Campaña multijugador con el motor de partida (8 de octubre de 2026)

El multijugador ya no usa el mundo de prueba: la sala `campaign` (protocolo 3) juega tres
sectores con el mismo motor del entrenamiento, en el mapa Espiral. Cada sector es una
Escaramuza nueva con base, Metal, producción, módulos, formaciones y rendición. Empieza con
una oferta privada de aumento (plata, oro y prismático, uno por sector) que detiene el reloj
hasta que ambos eligen; los aumentos elegidos se vuelven a aplicar en los sectores siguientes
y quien ganó el sector anterior tiene una renovación extra. Gana la campaña quien gana el
sector 3. El cliente juega la campaña con la misma pantalla de partida del entrenamiento,
recupera sala, asiento y secuencia de órdenes al recargar y muestra el resultado de la
campaña, no el de cada sector. Cada sector registra sus estadísticas: los desafíos de la
campaña se miden con el mejor sector. La sala `battlefield` conserva el protocolo 2.
Consulta [protocolo](protocol.md) y [progresión](progression.md).

### Salas y conexión multijugador (3 de octubre de 2026)

El centro de mando permite crear una sala privada o unirse por código con cuentas
distintas. El lobby muestra las dos plazas y su estado listo desde el servidor;
solo inicia la cuenta regresiva cuando ambos están conectados y listos. El juego
conserva la misma conexión y representa las vistas privadas autoritativas de Sector 01.
Las órdenes de mover, atacar y detener usan secuencias y confirmaciones del servidor.

La sesión conserva el token de reconexión en `sessionStorage`: una caída o recarga
recupera el mismo asiento durante la reserva. Salir del lobby libera la plaza; salir
de la partida concede el resultado al rival. La pantalla también recupera resultados
tras recargar. Las salas históricas de 72 × 72 se rechazan en esta interfaz con un
mensaje de mapa incompatible. El entrenamiento contra IA conserva su ruta independiente.

### Interfaz principal y prueba Tiled (1 de octubre de 2026)

`/` y `/visual` abren la misma experiencia Visual. El antiguo Atlas de Mando y su
cliente Canvas de entrenamiento se retiraron de la entrada web; las salas del servidor
no se tocaron. Desde la preparación se puede probar el TMJ editable de Sector 01
(29×29): su atlas, los datos de superficie y una nave local que usa el buscador de
rutas de la simulación (incluidas las restricciones de altura/rampas).
El TMJ referencia un segundo atlas ausente para una única casilla de espacio: el
inspector la dibuja con un color de reserva, sin alterar el archivo de Tiled.
El combate Phaser ahora dibuja las capas del mismo TMJ de 29×29 y sus naves se
mueven en continuo cuando el terreno es llano; en las rampas siguen las rutas
válidas de la simulación. Selección individual y múltiple, órdenes de movimiento y
ataque se conservan. WASD vuelve a desplazar la cámara y Q queda como atajo de
ataque (los A guardados se migran). El minimapa refleja el terreno de Sector 01.
En esta entrega del 1 de octubre, el combate todavía usaba **adaptador local**.
`pnpm check` pasó con 251 tests; `pnpm test:e2e` pasó con 13 tests
(incluida una prueba directa de la sala `training` tras retirar su cliente web).


Monorepo pnpm, cliente React/Vite, renderer Canvas, sala Colyseus efímera,
entrenamiento de un sector a10Hz, escuadrones Interceptor, guardianes, nodo Metal,
captura de núcleo con tiempos reducidos, parser y proyección por jugador.
Consulta real de testnet, adapter Freighter y contrato Soroban `cosmetics` v2 (NFT con compra,
premios idempotentes y aprobaciones), todavía sin desplegar.
Plan de producto, arquitectura, estrategia y táctica en español; licencia MIT.

### Backend de campaña (29 de septiembre de 2026)

Backend actualizado el 29 de septiembre: campaign usa protocolo v2 y un mundo autoritativo de cuadrícula ortogonal de 72 × 72. Incluye rutas A* deterministas para órdenes de hasta 16 escuadrones, resolución local de ocupación, visibilidad y exploración por jugador, metadata pública del mapa y reconexión con plazo y pausas limitadas. La sala training conserva su API y mundo legacy. Consulta [protocolo](protocol.md) y [mapas](map-backend.md).

## Límites

Los tres sectores de la campaña se juegan en el mismo mapa. No hay bot que reemplace a un
jugador caído: la reserva de asiento y las pausas cubren la reconexión. Energía sigue
pendiente. El modo training conserva su IA y producción.
Las limitaciones de blockchain y persistencia descritas en las entregas históricas
requieren su propia verificación antes de una publicación.

Las salas son efímeras de desarrollo. campaign reserva un asiento desconectado hasta 60 s desde la caída original, con hasta dos pausas por jugador; training no ofrece reconexión, pero sí una pausa voluntaria en práctica contra la IA con un único humano. Los lobbies de campaña sin empezar caducan a los 15 minutos.

No se ha aprobado interactivamente Freighter ni ejecutado prueba nativa macOS.
Los tests del adapter no equivalen a una firma o conexión humana real.
El brief es un diseño, no un reporte de funciones existentes.

## Validación local del backend de mapas (29 de septiembre de 2026)

- pnpm check: 174 tests en 23 archivos; límites entre paquetes, árbol público, tipos y build correctos.
- CI=1 pnpm test:e2e: 9 pruebas E2E pasaron.

## Verificación histórica del bootstrap (22 de septiembre de 2026)

- Node 24.19.0 y pnpm 11.25.0 en Windows: instalación con lockfile, límites entre
  paquetes, higiene pública, tipos, **37 tests TypeScript** y build web correctos.
- Chromium: **2 pruebas E2E**, con dos contextos de navegador, captura de objetivo
  y layout a 320/768/1024/1440/1920 px. Capturas revisadas visualmente.
- WSL2/Ubuntu: **1 test de host Soroban**, cargo check, formato y build WASM correctos
  usando el wrapper del repositorio.
- WASM inicial: 461 bytes; SHA256
  `7db6ec6a6d405521235488887b2543733e9fcecac95a9e9507a62f7cef9fe14b`.
- RPC testnet: `healthy`, ledger **4814747**, protocolo **28**, passphrase testnet
  comprobada el 22 de septiembre de 2026. Es una observación puntual.
- Revisión independiente del conjunto publicable: documentación portable, sin
  secretos detectados, referencias privadas ni archivos fuente de diseño.
- CI incluye calidad en Windows/Linux/macOS, navegador en Linux y contratos en Linux.
  Consultar [la ejecución de CI](https://github.com/orlando-vazquez-career/stellar-impulse/actions)
  para conocer su resultado remoto; las pruebas locales no lo sustituyen.

El build Rust es un contrato de arranque, no un sistema de cosméticos.
Acceso RPC no demuestra despliegue ni propiedad de activos.
