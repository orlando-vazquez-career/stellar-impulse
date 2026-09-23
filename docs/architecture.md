# Arquitectura inicial
 
La arquitectura separa la simulación, la comunicación multijugador, la presentación visual, la persistencia y la integración con Stellar.
 
El servidor es la única autoridad sobre las reglas de la partida. El cliente captura las acciones del jugador, presenta la interfaz y renderiza las vistas autorizadas recibidas desde el servidor.
 
La blockchain permanece fuera del ciclo de simulación y se utiliza exclusivamente para verificar propiedad, emitir premios y gestionar cosméticos.
 
## Diagrama general
 
```mermaid

 flowchart LR

     Player["Jugador"] --> UI["React UI"]

     UI --> Client["Phaser Client"]
 
    Client -->|"Comandos"| Server["Colyseus Server"]

     Server --> Protocol["Protocol"]

     Protocol --> Sim["Simulation"]

     Sim --> World["Authoritative State"]
 
    World --> Projection["Player Projection"]

     Projection -->|"Vista permitida"| Server

     Server -->|"Estado filtrado"| Client
 
    Client --> Renderer["Phaser Renderer"]

     UI --> Chain["Stellar Client"]

     Chain --> Contract["Soroban Cosmetics"]

 ```
 
## Flujo de una orden
 
```mermaid

 sequenceDiagram

     participant P as Jugador

     participant C as Cliente Phaser

     participant S as Servidor Colyseus

     participant M as Simulador

     participant V as Proyección
 
    P->>C: Selecciona y ordena

     C->>S: Envía comando

     S->>S: Valida secuencia y propiedad

     S->>M: Aplica comando aceptado

     M->>M: Avanza simulación

     M-->>S: Nuevo estado autoritativo

     S->>V: Genera vista del jugador

     V-->>C: Estado visible filtrado

     C-->>P: Renderiza resultado

 ```
 
## Responsabilidades por capa
 
 | Capa | Tecnología | Responsabilidad |

 |---|---|---|

 | Interfaz | **React + Zustand** | Lobby, HUD, selección de tecnologías, hangar y resultados |

 | Renderizado | **Phaser** | Mapa isométrico, cámara, sprites, selección, efectos y sonido |

 | Comunicación | **Colyseus** | Salas, WebSockets, sincronización, mensajes y reconexión |

 | Servidor | **Node.js** | Autoridad de la partida, validación de comandos y servicios |

 | Protocolo | **TypeScript** | Contratos compartidos de comandos, eventos y respuestas |

 | Simulación | **TypeScript puro** | Movimiento lógico, recursos, combate, captura y victoria |

 | Proyección | **TypeScript puro** | Construcción de la vista permitida para cada jugador |

 | Persistencia | **PostgreSQL + Prisma** | Perfiles, campañas, equipamiento y premios pendientes |

 | Blockchain | **Rust + Soroban SDK** | Propiedad, compra y emisión de cosméticos |

 | Integración Stellar | **Stellar SDK + bindings TypeScript** | Billetera, consultas y transacciones |
 
## Estructura del monorepo
 
```text

 impulso-stellar/

 ├── apps/

 │   ├── client/                  # React + Phaser + Vite

 │   │   ├── src/

 │   │   │   ├── game/            # Escenas y adaptador de Phaser

 │   │   │   ├── ui/              # Componentes React

 │   │   │   ├── network/         # Cliente Colyseus

 │   │   │   └── main.tsx

 │   │   └── package.json

 │   │

 │   └── server/                  # Node.js + Colyseus

 │       ├── src/

 │       │   ├── rooms/           # Salas de partida

 │       │   ├── handlers/        # Recepción y validación

 │       │   ├── services/        # Perfiles, premios y Stellar

 │       │   └── main.ts

 │       └── package.json

 │

 ├── packages/

 │   ├── sim/                     # Reglas deterministas

 │   ├── protocol/                # Comandos, eventos y DTO compartidos

 │   ├── state/                   # Estado del mundo y vistas filtradas

 │   ├── content/                 # Unidades, costos y tecnologías

 │   ├── bots/                    # IA mediante comandos públicos

 │   └── stellar/                 # SDK y bindings de contratos

 │

 ├── contracts/

 │   └── cosmetics/               # Contrato Soroban

 │

 ├── assets/

 │   ├── units/

 │   ├── structures/

 │   ├── environment/

 │   ├── effects/

 │   ├── audio/

 │   └── ui/

 │

 ├── tests/

 │   ├── simulation/

 │   ├── multiplayer/

 │   ├── security/

 │   └── e2e/

 │

 ├── docs/

 │   └── architecture/

 │       ├── ADR-001-monorepo.md

 │       ├── ADR-002-authority.md

 │       ├── ADR-003-privacy.md

 │       ├── ADR-004-renderer.md

 │       ├── ADR-005-persistence.md

 │       └── ADR-006-environments.md

 │

 ├── pnpm-workspace.yaml

 ├── package.json

 └── README.md

 ```
 
# Decisiones de arquitectura
 
## ADR-001: monorepo y dependencias
 
### Contexto
 
El cliente, el servidor, el simulador y los bots necesitan compartir tipos, comandos, eventos y configuraciones de contenido.
 
Publicar cada paquete por separado añadiría trabajo de versionado y distribución que no aporta valor al MVP.
 
### Decisión
 
El proyecto utilizará **pnpm workspaces** para organizar un monorepo.
 
Las responsabilidades se distribuirán de la siguiente manera:
 
- `apps/client` contiene React, Phaser y Vite.

 - `apps/server` contiene Node.js y Colyseus.

 - `packages/sim` contiene las reglas deterministas.

 - `packages/protocol` contiene los contratos de comunicación.

 - `packages/state` contiene el estado lógico y las proyecciones.

 - `packages/content` contiene estadísticas y balance.

 - `packages/bots` contiene los comportamientos de IA.

 - `packages/stellar` contiene la integración TypeScript con Stellar.

 - `contracts/cosmetics` contiene el contrato Soroban escrito en Rust.
 
Los paquetes internos se compartirán directamente mediante los workspaces y no se publicarán durante el MVP.
 
### Reglas de dependencias
 
Las dependencias permitidas serán:
 
```text

 client ──────> protocol

 client ──────> state

 client ──────> stellar
 
server ──────> protocol

 server ──────> state

 server ──────> sim

 server ──────> content

 server ──────> bots

 server ──────> stellar
 
bots ────────> protocol

 bots ────────> state

 bots ────────> content
 
sim ─────────> protocol

 sim ─────────> state

 sim ─────────> content

 ```
 
El paquete `sim` no puede importar:
 
- Phaser.

 - React.

 - Zustand.

 - Colyseus.

 - Prisma.

 - PostgreSQL.

 - Stellar SDK.

 - APIs del navegador.

 - Inventarios cosméticos.

 - Reloj de pared.

 - Variables específicas del servidor.
 
El comando `pnpm check:boundaries` verificará estas restricciones.
 
### Consecuencias
 
Esta decisión permite:
 
- Compartir tipos sin publicar paquetes.

 - Reducir inconsistencias entre cliente y servidor.

 - Ejecutar el simulador sin levantar la interfaz.

 - Utilizar el simulador para bots y pruebas.

 - Mantener las reglas independientes del renderizado.

 - Cambiar el renderer sin reconstruir la lógica del juego.
 
PostgreSQL, Prisma y los servicios externos se incorporarán cuando exista un flujo que realmente necesite persistencia. No deben bloquear el primer corte vertical.
 
## ADR-002: autoridad y determinismo
 
### Contexto
 
El juego es competitivo y se ejecuta en navegador. Si el cliente pudiera modificar recursos, daño, posición o captura, un jugador podría alterar el resultado desde las herramientas del navegador.
 
También se necesita reproducir escenarios y comprobar que los cosméticos no cambien las reglas.
 
### Decisión
 
El servidor será la única autoridad sobre:
 
- Posiciones lógicas.

 - Recursos.

 - Producción.

 - Salud.

 - Daño.

 - Capturas.

 - Tecnologías.

 - Resultados.

 - Condiciones de victoria.
 
El cliente enviará únicamente intenciones:
 
```ts

 type PlayerCommand =

   | {

       type: "MOVE_SQUAD";

       sequence: number;

       squadId: string;

       target: {

         x: number;

         y: number;

       };

     }

   | {

       type: "ATTACK_TARGET";

       sequence: number;

       squadId: string;

       targetId: string;

     }

   | {

       type: "CAPTURE_NODE";

       sequence: number;

       squadId: string;

       nodeId: string;

     }

   | {

       type: "BUILD_UNIT";

       sequence: number;

       unitType: string;

     }

   | {

       type: "CHOOSE_UPGRADE";

       sequence: number;

       upgradeId: string;

     };

 ```
 
Un mensaje no equivale a un turno. El servidor recibe comandos continuamente y los procesa dentro de su ciclo de simulación.
 
### Validaciones del servidor
 
Antes de aceptar un comando, el servidor comprobará:
 
- Que el jugador pertenece a la sala.

 - Que la secuencia es mayor que la última aceptada.

 - Que el escuadrón pertenece al jugador.

 - Que el objetivo existe.

 - Que el objetivo es visible cuando corresponda.

 - Que las coordenadas son enteras.

 - Que el destino está dentro del mapa.

 - Que existe una ruta válida.

 - Que hay recursos suficientes.

 - Que la acción está habilitada.

 - Que no se supera el límite de frecuencia.
 
### Reglas de determinismo
 
El simulador utilizará:
 
- Aritmética entera o de punto fijo.

 - Orden estable de jugadores, unidades y objetivos.

 - Identificadores únicos.

 - Reglas de desempate explícitas.

 - Configuración versionada.

 - Semillas controladas para cualquier aleatoriedad futura.

 - Daño calculado antes de aplicarlo.
 
El daño simultáneo se resolverá en dos fases:
 
1. Calcular todos los ataques correspondientes al tick.

 2. Aplicar conjuntamente el daño calculado.
 
Esto evita que el orden de recorrido determine qué unidad puede atacar antes de morir.
 
### Estado inicial y semillas
 
El primer escenario será fijo y no necesitará aleatoriedad.
 
Cuando se incorpore generación procedural:
 
- El servidor generará la semilla.

 - La semilla permanecerá privada durante la partida.

 - La semilla podrá publicarse después de finalizar.

 - El replay guardará la versión de reglas, la semilla y la secuencia de comandos.
 
No se publicará información que revele el estado oculto durante una partida activa.
 
### Consecuencias
 
La autoridad del servidor reduce manipulaciones del cliente, pero no elimina automáticamente:
 
- Bots externos.

 - Colusión.

 - Abandono de partidas.

 - Explotación de errores.

 - Ataques de denegación de servicio.
 
Estos riesgos necesitan controles adicionales fuera del simulador.
 
## ADR-003: privacidad por construcción
 
### Contexto
 
La niebla de guerra no es segura si el servidor transmite todo el mundo y el cliente simplemente oculta los enemigos mediante CSS, Phaser o condiciones visuales.
 
Un jugador podría inspeccionar la memoria o el tráfico de red para encontrar unidades ocultas.
 
### Decisión
 
Cada cliente recibirá una proyección calculada específicamente para su jugador:
 
```ts

 const playerView = viewFor(worldState, playerId);

 ```
 
La función `viewFor` decidirá qué información puede recibir cada conexión.
 
### Información pública
 
Todos los jugadores pueden conocer:
 
- Dimensiones del mapa.

 - Terreno y obstáculos estáticos.

 - Ubicación de objetivos estáticos.

 - Reglas.

 - Costos públicos.

 - Tiempo restante.

 - Estado público del Núcleo.

 - Resultado final.
 
### Información privada
 
Cada jugador puede conocer:
 
- Sus unidades.

 - Sus recursos.

 - Sus tecnologías.

 - Sus órdenes aceptadas.

 - Sus tiempos de producción.

 - Enemigos dentro de su rango de visión.

 - Eventos visibles desde sus unidades o estructuras.
 
### Información que no se transmite
 
El servidor no enviará:
 
- Unidades enemigas fuera de visión.

 - Destinos de órdenes enemigas.

 - Colas de producción rivales.

 - Recursos exactos del rival.

 - Tecnologías privadas no reveladas.

 - Objetivos dinámicos todavía no descubiertos.

 - Información interna de los bots.
 
### Implementación inicial
 
Durante el entrenamiento técnico se podrán enviar vistas completas filtradas a **10 Hz**.
 
Esta frecuencia permite validar:
 
- Contrato de mensajes.

 - Privacidad.

 - Reconexión.

 - Interpolación inicial.

 - Consistencia visual.
 
La optimización mediante deltas se implementará únicamente si las mediciones muestran que las vistas completas generan un problema real.
 
### Hashes y sincronización
 
Las vistas de dos jugadores no tienen que producir el mismo hash porque contienen información diferente.
 
Las comprobaciones correctas serán:
 
- Hash del estado autoritativo en el servidor.

 - Hash de cada proyección generada.

 - Comparación entre la vista enviada y la vista reconstruida.

 - Reproducción completa del servidor utilizando entradas registradas.
 
No debe compararse directamente el hash visible del jugador A con el del jugador B.
 
### Colyseus Schema
 
No se utilizará un único `Schema` compartido que contenga información privada para todos los clientes, salvo que exista un mecanismo de filtrado probado.
 
La estructura de sincronización debe garantizar que cada conexión reciba únicamente la vista autorizada.
 
## ADR-004: renderer sustituible
 
### Contexto
 
El juego necesita una presentación isométrica 2D para navegador. El brief recomienda Phaser, pero la simulación no debe depender de un motor visual específico.
 
La versión inicial necesita validar rendimiento, legibilidad y capacidad de producción antes de considerar un renderer diferente o una presentación 3D.
 
### Decisión
 
El MVP utilizará **Phaser** como motor de renderizado 2D.
 
Phaser manejará:
 
- Escenas.

 - Cámara.

 - Zoom y desplazamiento.

 - Coordenadas isométricas.

 - Sprites.

 - Animaciones.

 - Efectos.

 - Sonido.

 - Entrada de mouse y teclado.

 - Orden visual por profundidad.
 
Phaser podrá utilizar WebGL o Canvas según su configuración y las capacidades del navegador.
 
React manejará:
 
- Pantalla inicial.

 - Lobby.

 - HUD.

 - Panel de selección.

 - Tecnologías.

 - Hangar.

 - Resultado final.

 - Estados de sesión y billetera.
 
Zustand manejará únicamente estado de presentación compartido entre React y Phaser.
 
### Contrato del renderer
 
El renderer consumirá una vista autorizada:
 
```ts

 type RenderSnapshot = {

   tick: number;

   playerId: string;

   squads: VisibleSquad[];

   nodes: VisibleNode[];

   core: VisibleCoreState;

   effects: VisibleEffect[];

 };

 ```
 
El renderer podrá:
 
- Interpolar posiciones.

 - Reproducir animaciones.

 - Mostrar predicciones visuales.

 - Representar efectos.

 - Mostrar selección y órdenes confirmadas.
 
El renderer no podrá:
 
- Aplicar daño.

 - Modificar recursos.

 - Capturar nodos.

 - Construir unidades.

 - Resolver combates.

 - Decidir la victoria.

 - Modificar directamente el estado autoritativo.
 
### Sustitución futura
 
Si Phaser no alcanza el rendimiento o la dirección visual requerida, podrá sustituirse por otra implementación que respete `RenderSnapshot`.
 
Una posible transición futura sería:
 
```text

 render-phaser -> render-three

 ```
 
Esta sustitución no debe modificar:
 
- `packages/sim`.

 - `packages/protocol`.

 - `packages/state`.

 - Las reglas del servidor.

 - El formato de las órdenes.
 
### Validación
 
El renderer se probará en un portátil objetivo con:
 
- Resolución de referencia de 1366 × 768.

 - Cantidad máxima prevista de unidades.

 - Niebla de guerra activa.

 - HUD visible.

 - Efectos principales habilitados.

 - Conexión a una sala local.
 
El mock gráfico inicial no representa el arte final.
 
## ADR-005: persistencia y blockchain fuera del tick
 
### Contexto
 
La simulación genera numerosos cambios por segundo. Esos cambios no necesitan escribirse en PostgreSQL ni enviarse a Soroban.
 
La persistencia y la blockchain tienen latencia, costos y modos de fallo diferentes a los de una partida en tiempo real.
 
### Decisión
 
La sala inicial mantendrá el estado activo en memoria.
 
Durante el primer corte vertical, reiniciar el servidor podrá eliminar las partidas activas. Esta limitación deberá estar documentada y no presentarse como comportamiento de producción.
 
PostgreSQL almacenará posteriormente:
 
- Usuarios.

 - Perfiles.

 - Vinculaciones de billeteras.

 - Equipamiento cosmético.

 - Resultados.

 - Logros.

 - Premios pendientes.

 - Historial de campañas.

 - Configuración de contenido versionada.
 
PostgreSQL no almacenará cada movimiento o tick.
 
### Outbox de premios
 
Los premios se registrarán primero en una tabla de salida:
 
```text

 reward_outbox

 ├── id

 ├── campaign_id

 ├── player_id

 ├── achievement_id

 ├── wallet_address

 ├── status

 ├── transaction_hash

 ├── attempts

 ├── created_at

 └── updated_at

 ```
 
La combinación de los siguientes campos deberá ser única:
 
```text

 campaign_id + player_id + achievement_id

 ```
 
Esto evita que un mismo logro genere varias emisiones.
 
### Worker de emisión
 
El worker:
 
1. Reclamará trabajos pendientes mediante una transacción.

 2. Comprobará si el premio ya fue emitido.

 3. Preparará la llamada al contrato.

 4. Enviará la transacción.

 5. Registrará el hash.

 6. Consultará el resultado.

 7. Marcará el trabajo como completado.
 
Si la respuesta RPC es ambigua, el worker deberá reconciliar el estado antes de repetir. No asumirá que una respuesta interrumpida significa que la transacción falló.
 
### Vinculación de billetera
 
Una dirección no se vinculará solamente porque el cliente la envíe.
 
El jugador deberá demostrar control de la dirección mediante autenticación **SEP-10** o un mecanismo equivalente aprobado.
 
Las compras serán firmadas por el jugador.
 
Los premios serán emitidos por una cuenta de servidor con permisos limitados.
 
### Contrato de cosméticos
 
El contrato `cosmetics` manejará:
 
- Clases de cosméticos.

 - Propietarios.

 - Ranuras.

 - Procedencia.

 - Transferibilidad.

 - Cupos opcionales.

 - Compra primaria.

 - Emisión autorizada.
 
El contrato deberá incluir:
 
- Roles separados.

 - Errores tipados.

 - Aritmética comprobada.

 - Eventos.

 - Límites de emisión.

 - Validación de cupos.

 - Pruebas de permisos.

 - Pruebas de doble emisión.
 
### Reglas operativas
 
No habrá:
 
- Consultas RPC dentro del tick.

 - Escrituras PostgreSQL por movimiento.

 - Lectura de inventario desde el simulador.

 - Espera blockchain para terminar una campaña.

 - Reintentos ciegos de transacciones.

 - Claves secretas en el cliente.
 
Una caída de Stellar RPC no debe detener ni invalidar una campaña en curso.
 
## ADR-006: entornos y despliegue
 
### Contexto
 
El equipo puede trabajar desde Windows, Linux o macOS. Rust y Stellar CLI suelen tener un flujo más estable en Linux, mientras que el cliente y el servidor Node.js funcionan de forma nativa en los tres sistemas.
 
Además, desplegar el frontend no significa que el servidor multijugador también esté disponible.
 
### Desarrollo local
 
Node.js, pnpm, Vite, React, Phaser y Colyseus se ejecutarán nativamente en:
 
- Windows.

 - Linux.

 - macOS.
 
En Windows, Rust y Stellar CLI se ejecutarán preferentemente mediante **WSL2**.
 
En Linux y macOS podrán ejecutarse de forma nativa.
 
### Reglas de compatibilidad
 
No se compartirán entre Windows y WSL2:
 
- `node_modules`.

 - `target`.

 - Cachés de compilación.

 - Binarios generados.

 - Rutas absolutas.

 - Archivos temporales.
 
El repositorio compartirá únicamente código fuente, configuración y archivos de bloqueo.
 
Los comandos portables se expondrán mediante scripts de `package.json` o wrappers del repositorio.
 
Ejemplo:
 
```json

 {

   "scripts": {

     "dev": "pnpm --parallel --filter ./apps/** dev",

     "dev:client": "pnpm --filter @impulso/client dev",

     "dev:server": "pnpm --filter @impulso/server dev",

     "test": "pnpm -r test",

     "check": "pnpm -r check",

     "check:boundaries": "node scripts/check-boundaries.mjs"

   }

 }

 ```
 
Los scripts no deben depender de rutas absolutas particulares de una computadora.
 
### Entornos
 
El proyecto tendrá inicialmente:
 
| Entorno | Propósito |

 |---|---|

 | Local | Desarrollo individual |

 | Preview | Integración y pruebas del equipo |

 | Demo | Versión estable para evaluación |
 
Producción con dinero real queda fuera del MVP.
 
### Variables de entorno
 
Las variables se documentarán en `.env.example`.
 
Ejemplo:
 
```env

 NODE_ENV=development
 
CLIENT_ORIGIN=http://localhost:5173

 GAME_SERVER_PORT=2567

 GAME_SERVER_HOST=127.0.0.1
 
DATABASE_URL=postgresql://user:password@localhost:5432/impulso
 
STELLAR_NETWORK=testnet

 STELLAR_RPC_URL=

 STELLAR_NETWORK_PASSPHRASE=

 COSMETICS_CONTRACT_ID=
 
REWARD_ISSUER_SECRET=

 ```
 
`REWARD_ISSUER_SECRET` nunca debe:
 
- Guardarse en Git.

 - Incluirse en `.env.example`.

 - Enviarse al cliente.

 - Imprimirse en logs.

 - Compartirse mediante capturas.
 
En `.env.example` debe aparecer vacío.
 
### Despliegue del cliente
 
El cliente podrá desplegarse en:
 
- Vercel.

 - Cloudflare Pages.
 
El cliente es una aplicación estática construida por Vite.
 
### Despliegue del servidor
 
El servidor Colyseus necesita un proceso persistente con soporte WebSocket.
 
Podrá desplegarse en:
 
- Railway.

 - Fly.io.

 - Render.
 
No debe desplegarse como una función serverless de corta duración.
 
### Requisitos para una demo pública
 
Antes de publicar deben configurarse:
 
- HTTPS para el cliente.

 - WSS para WebSockets.

 - Lista de orígenes permitidos.

 - Límites de conexiones.

 - Límite de salas por proceso.

 - Límite de mensajes por jugador.

 - Logs estructurados.

 - Identificador de campaña.

 - Manejo de errores no controlados.

 - Health check.

 - Pruebas de reconexión.

 - Estrategia de reinicio.

 - Variables secretas en el proveedor.
 
El servidor local escuchará `127.0.0.1` por defecto.
 
Solo se expondrá en `0.0.0.0` dentro del entorno de despliegue configurado.
 
## Reglas transversales
 
### Separación entre reglas y presentación
 
La presentación puede mostrar:
 
- Interpolaciones.

 - Animaciones.

 - Sonidos.

 - Efectos.

 - Predicciones.

 - Información autorizada.
 
La presentación no puede modificar:
 
- Recursos.

 - Daño.

 - Propiedad.

 - Captura.

 - Producción.

 - Tecnologías.

 - Resultados.
 
### Separación entre partida y blockchain
 
La partida puede comenzar y terminar aunque Stellar RPC no esté disponible.
 
Los resultados se guardarán primero en la base de datos y los premios se procesarán posteriormente.
 
### Bots bajo las mismas reglas
 
Los bots enviarán comandos mediante la misma interfaz pública que los jugadores.
 
No podrán modificar directamente el estado del simulador.
 
### Compatibilidad del protocolo
 
Los mensajes deberán incluir una versión:
 
```ts

 type ClientMessage<T> = {

   protocolVersion: number;

   sequence: number;

   type: string;

   payload: T;

 };

 ```
 
El servidor rechazará versiones incompatibles con un error explícito.
 
### Observabilidad mínima
 
Cada campaña deberá registrar:
 
- Identificador de campaña.

 - Versión de reglas.

 - Versión del protocolo.

 - Jugadores.

 - Inicio y final.

 - Resultado.

 - Motivo de finalización.

 - Desconexiones.

 - Errores del servidor.

 - Estado de premios pendientes.
 
No se deben registrar:
 
- Claves privadas.

 - Tokens completos de sesión.

 - Secretos.

 - Información de autenticación reutilizable.
 
## Orden de implementación
 
La arquitectura se implementará en este orden:
 
1. Configurar el monorepo.

 2. Definir `protocol`, `state` y `content`.

 3. Implementar el simulador determinista.

 4. Crear el cliente local con Phaser.

 5. Crear el HUD con React.

 6. Implementar la sala Colyseus.

 7. Generar vistas filtradas por jugador.

 8. Conectar dos navegadores.

 9. Implementar bot y reconexión.

 10. Añadir PostgreSQL.

 11. Añadir contrato de cosméticos.

 12. Integrar billetera y premios.

 13. Desplegar preview.

 14. Ejecutar pruebas de seguridad y carga.

 15. Congelar funciones y preparar la demo.
 
## Criterios de aceptación de arquitectura
 
La arquitectura inicial se considerará validada cuando:
 
- `packages/sim` funcione sin navegador ni servidor.

 - El simulador produzca el mismo resultado con las mismas entradas.

 - `pnpm check:boundaries` impida dependencias prohibidas.

 - El servidor rechace comandos fuera de secuencia.

 - El servidor rechace comandos sobre unidades ajenas.

 - Dos jugadores reciban vistas distintas cuando existe información oculta.

 - El cliente no reciba enemigos fuera de su visión.

 - Phaser renderice únicamente la vista recibida.

 - Los cosméticos no alteren el estado lógico.

 - Una caída de Stellar RPC no interrumpa la partida.

 - Las claves secretas no estén incluidas en el cliente.

 - El frontend y el servidor puedan desplegarse de forma independiente.
