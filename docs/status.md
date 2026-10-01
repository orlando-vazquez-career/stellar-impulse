# Estado del repositorio

Actualizado: 1 de octubre de 2026. Base de producto: 0.1.0.

## Implementado

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
El combate sigue con **adaptador local**, sin conexión a la sala autoritativa `campaign`.
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

El gameplay de campaña todavía no está completo: el preset está abierto, los tres sectores lo reutilizan, las tecnologías son placeholders y el cliente web aún no integra la vista de campaña. Siguen pendientes bots, producción de flotas, Energía, tecnologías jugables, PostgreSQL, SEP-10, compra, premios e inventario equipado. No hay contrato desplegado, mainnet ni sitio publicado.

Las salas son efímeras de desarrollo. campaign reserva un asiento desconectado hasta 60 s desde la caída original, con hasta dos pausas por jugador; training no ofrece reconexión. Los lobbies de campaña sin empezar caducan a los 15 minutos.

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
