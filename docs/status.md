# Estado del repositorio inicial

Fecha: 22 de septiembre de 2026. Versión: 0.1.0.

## Implementado

Monorepo pnpm, cliente React/Vite, renderer Canvas, sala Colyseus efímera,
entrenamiento de un sector a10Hz, escuadrones Interceptor, guardianes, nodo Metal,
captura de núcleo con tiempos reducidos, parser y proyección por jugador.
Consulta real de testnet, adapter Freighter y contrato Soroban que devuelve su versión.
Plan de producto, arquitectura, estrategia y táctica en español; licencia MIT.

## Límites

No campaña completa, bots, reconexión, producción de flotas, Energía, tecnologías,
PostgreSQL, SEP-10, compra, premios ni inventario equipado. Sin contrato desplegado.
Sin mainnet ni sitio publicado. Las salas solo son desarrollo local, se destruyen al
reiniciar y caducan a15min; un asiento abandonado no puede recuperarse.

No se ha aprobado interactivamente Freighter ni ejecutado prueba nativa macOS.
Los tests del adapter no equivalen a una firma o conexión humana real.
El brief es un diseño, no un reporte de funciones existentes.

## Verificación local del bootstrap

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
