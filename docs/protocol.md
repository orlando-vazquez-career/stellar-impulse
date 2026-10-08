# Protocolo de la sala de campaña

Contrato de red para `campaign`, con mensajes versionados por `CAMPAIGN_PROTOCOL_VERSION` de `@impulso/input` (valor 2). Los helpers de sobre legacy (`PROTOCOL_VERSION`, `openEnvelope` y `parseJoinOptions`) se conservan para quienes aún los usen. La sala `training` mantiene su API propia de órdenes y vistas; esto no implica que envuelva sus mensajes en un sobre de versión 1.

## Crear o unirse

La sala admite dos asientos (`p1` al crear y `p2` al unirse), y no admite participantes nuevos una vez iniciada la campaña. Cada jugador necesita un token de cuenta obtenido por `/auth/register` o `/auth/login`; ver [autenticación y salas](auth-multiplayer.md). `name` es opcional: admite de 1 a 24 letras, números, espacios, `_`, `.` o `-`; si se omite, el servidor usa `Comandante`. Una versión de campaña incorrecta falla con `unsupported_version`; opciones inválidas fallan con `invalid_join`. El `roomId` generado es el código de invitación de 12 caracteres hexadecimales. `phase.playerId` identifica el asiento propio desde el lobby; los alias pueden coincidir. Si alguien sale antes de empezar, su plaza vuelve a estar disponible y el asiento de quien permanece no cambia.

El creador puede pedir `map: 'sector-01'` para el mapa de catálogo de 29 × 29 usado por la interfaz integrada. El invitado hereda esa elección sin enviar `map`; `phase.renderMap` anuncia `sector-01` a ambos desde el lobby. Sin esa opción se conserva el mapa histórico de 72 × 72. No se aceptan otros nombres ni terreno arbitrario. Un `createSector` configurado por el servidor tiene prioridad sobre la elección del creador. El ejemplo de abajo muestra creación, unión por código y reconexión usando el mismo enlace de eventos.

## Flujo del cliente

Usa `bindRoom` para configurar cada instancia de sala. Al recargar, llama a `reconnectCampaign` con el token guardado; no crees una sala antes de intentar la reconexión. Crea o únete solo cuando la persona inicie o acepte una partida. Al reconectar, el SDK devuelve una instancia nueva: vuelve a vincularla, desactiva mensajes encolados y guarda el token vigente.

```ts
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';

const client = new Client(import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567');
let room: Room | undefined;
const accessToken = sessionStorage.getItem('impulso.auth');
if (!accessToken) throw new Error('Inicia sesión antes de entrar a una partida');

function bindRoom(nextRoom: Room): void {
  room = nextRoom;
  room.reconnection.maxEnqueuedMessages = 0;
  sessionStorage.setItem('impulso.rt', room.reconnectionToken);
  room.onMessage('map', (message) => cacheMap(message));
  room.onMessage('view', (view) => renderBattlefield(view));
  room.onMessage('phase', (phase) => renderPhase(phase));
  room.onMessage('ack', ({ seq }) => markCommandAccepted(seq));
  room.onMessage('rejected', ({ reason }) => showCommandError(reason));
}

function activeRoom(): Room {
  if (!room) throw new Error('La sala aún no está conectada');
  return room;
}

async function createCampaign(name = 'Ana'): Promise<Room> {
  const nextRoom = await client.create('campaign', {
    protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
    name,
    token: accessToken,
    map: 'sector-01',
  });
  bindRoom(nextRoom);
  return nextRoom;
}

async function joinCampaign(code: string, name = 'Beto'): Promise<Room> {
  const nextRoom = await client.joinById(code.trim().toUpperCase(), {
    protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
    name,
    token: accessToken,
  });
  bindRoom(nextRoom);
  return nextRoom;
}

async function reconnectCampaign(): Promise<Room | null> {
  const token = sessionStorage.getItem('impulso.rt');
  if (!token) return null;
  const nextRoom = await client.reconnect(token);
  bindRoom(nextRoom);
  return nextRoom;
}

function markReady(): void {
  activeRoom().send('ready', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body: {} });
}

function moveGroup(seq: number, squadIds: string[], x: number, y: number): void {
  activeRoom().send('command', {
    protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
    body: { type: 'move_group', seq, squadIds, x, y },
  });
}

function stopGroup(seq: number, squadIds: string[]): void {
  activeRoom().send('command', {
    protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
    body: { type: 'stop', seq, squadIds },
  });
}
```

Durante un sector, el servidor envía `map` antes de `view`; asocia ambos mediante `(mapId, version)` y espera esos mensajes antes de reconstruir la escena. Una vista completa vuelve a enviarse al reconectar. Si `phase.pause` o `phase.resumeInMs` tiene valor, bloquea el envío de órdenes hasta que termine la pausa o la reanudación; durante ese intervalo el servidor las rechaza con `paused`.

## Sobres y mensajes del cliente

Los mensajes de campaña que requieren sobre llevan `{ protocolVersion: 2, body }`. El servidor responde a una orden válida con `ack: { protocolVersion: 2, seq }`. Una orden inválida o rechazada recibe `rejected: { protocolVersion: 2, reason }` solo para quien la envió. El rechazo no consume `seq`; la vista propia expone `players[playerId].lastSequence` para elegir la siguiente secuencia. Una secuencia debe ser un entero seguro positivo y mayor que la última aceptada por ese jugador.

| Canal | `body` | Uso |
|---|---|---|
| `ready` | `{}` | En lobby; con ambos jugadores listos comienza cuenta regresiva de 5 s. |
| `command` | `{ type: 'move_group', seq, squadIds, x, y }`, `{ type: 'move_formation', seq, squadIds, x, y, formation }`, `{ type: 'attack_group', seq, squadIds, targetId }` o `{ type: 'stop', seq, squadIds }` | Durante un sector activo. Entre 1 y 128 IDs de escuadrón únicos; coordenadas enteras no negativas para `move_group` y `move_formation`. |
| `tech` | `{ techId }` | En transición, usando un identificador ofrecido en `phase.offers`. |

`formation` admite `line`, `column`, `wedge`, `box`, `ranks` o `circle`; el servidor asigna las posiciones y valida las rutas de toda la selección antes de aceptar la orden.

Los cuerpos no admiten campos extra. `parseBattlefieldCommand` copia y valida los datos sin coerción. Los rechazos de unidad se agrupan bajo `unit_unavailable`, tanto si la unidad no existe como si no pertenece al jugador o está destruida.

## Mensajes del servidor

| Canal | Contenido | Frecuencia o privacidad |
|---|---|---|
| `map` | `{ protocolVersion, mapId, version, width, height, cellSize, walkable, opaque }`, con `level` y `ramp` opcionales | Al iniciar cada sector y al reconectar, antes de `view`. Solo metadata estática incluida en la lista permitida; nunca spawns, objetivos o entidades. |
| `phase` | `protocolVersion`, `playerId`, `renderMap` opcional, `phase`, `sector`, `sectors`, `remainingMs`, `seats`, `pause`, `resumeInMs`, `sectorResults`, `offers`, `myTech`, `rivalChoseTech`, `myTechnologies`, `result` | En cada cambio de fase y una vez por segundo. Las elecciones del rival no se revelan; solo se indica `rivalChoseTech`. |
| `view` | Vista `BattlefieldView` específica para el jugador | 10 veces por segundo durante el sector; se reenvía al reconectar. |
| `ack` | `{ protocolVersion, seq }` | Solo para una orden de campaña aceptada. |
| `rejected` | `{ protocolVersion, reason }` | Solo a quien envió el mensaje. |
| `paused` | `{ protocolVersion, by, remainingMs }` | Cuando una desconexión pausa el sector. |
| `campaign_end` | `{ protocolVersion, result: { winner, reason }, sectorResults, reward? }` | Una vez al terminar la campaña. `reward` es el premio de cuenta de quien lo recibe (`xpGained`, `beforeXp`, `profile`, `unlocked`); ver [progresión](progression.md). |

La vista usa `schemaVersion: 2` y `mode: "battlefield"`; incluye `mapId`, `mapVersion`, `tick`, `playerId`, dimensiones, reglas, jugadores, escuadrones, guardianes, nodos, núcleo, máscaras `visible`/`explored` y ganador. Los jugadores y bases son públicos por las reglas del juego. El cliente solo recibe su metal y su `lastSequence`; solo sus escuadrones llevan `route` y `target`. De los escuadrones rivales solo se envían los vivos dentro de la visión actual. Guardianes y nodos aparecen cuando son visibles; el núcleo es público. Exploración se conserva en el mundo aunque una celda ya no esté visible.

Las máscaras tienen forma `{ encoding: 'bitset-lsb0', width, height, data }`. Las celdas se recorren por filas (`index = y * width + x`); el bit menos significativo de cada byte representa primero. Los bits sobrantes del último byte deben ser cero. Para una máscara de 3 × 2 con celdas visibles en índices 0 y 4, `data` es `[0b00010001]`. `decodeBattlefieldMask` devuelve un arreglo booleano row-major:

```ts
import { decodeBattlefieldMask } from '@impulso/state';
const cells = decodeBattlefieldMask({
  encoding: 'bitset-lsb0', width: 3, height: 2, data: [0b00010001],
});
// [true, false, false, false, true, false]
```

## Fases de campaña

```
lobby → countdown (5 s) → sector 1 → transition (25 s) → sector 2 → transition → sector 3 → results (60 s) → closed
```

Un sector termina al capturar el Núcleo o al alcanzar el tope de seguridad actual de 8 minutos (empate). El ganador de la campaña es quien gana el sector final; los sectores anteriores no suman puntos. En cada transición, quien no elige recibe la primera opción de `offers`. Motivos de cierre: `core`, `draw`, `forfeit` (abandono) y `annulled` (ambos desconectados o tope de 30 minutos). Un lobby sin empezar se cierra a los 15 minutos.

La sala repite el mapa elegido en los tres sectores por ahora. Los identificadores de tecnología son placeholders y todavía no modifican la simulación. Esas selecciones se conservan en la fase de campaña, pero no implican mejoras de juego implementadas.

## Desconexión, tamaño y ritmo

Cada jugador dispone de hasta 2 pausas por campaña. Cada caída inicia una ventana de reconexión de 60 s desde el instante original de esa caída; el plazo no se renueva al pasar a otro sector. Si la caída ocurre durante un sector y queda cuota de pausa, la simulación se detiene para ambos hasta la reconexión o el plazo. Si ya agotó la cuota, la simulación sigue y, al vencer el plazo sin reconexión, se declara `forfeit` si el rival sigue conectado o `annulled` si ambos asientos están ausentes. Al volver de una pausa activa, recibe la metadata del mapa, una vista completa y una cuenta regresiva de reanudación de 3 s. Si se reconecta dentro del plazo cuando no hubo pausa activa, no hay cuenta regresiva de 3 s. Una caída durante transición no pausa esa transición; al iniciar el siguiente sector, puede pausarlo si la cuota lo permite y el plazo original sigue vigente. Si no queda cuota, el sector corre hasta que la persona vuelva o venza su plazo; al expirar, el resultado es `forfeit` si el rival está conectado o `annulled` si ambos siguen ausentes.

El servidor limita las órdenes a 32 acciones de escuadrón por segundo y jugador; una orden grupal cuenta una acción por cada ID en `squadIds`. El corte duro es de 40 mensajes entrantes por segundo y el máximo de 4 KiB aplica a cada payload entrante del cliente; las vistas y metadata que envía el servidor pueden superar ese tamaño. A* limita cada búsqueda al número de celdas del mapa y todas las órdenes comparten un máximo de 32.768 expansiones por tick de simulación en la sala. Si el presupuesto restante no alcanza, la orden recibe `budget_exceeded`. El cliente no recibe un costo de expansiones en el `ack`; el costo solo sirve para controlar el presupuesto del servidor.

## Referencias del repositorio

- Versiones, sobres y validadores: [`packages/input/src/protocol.ts`](../packages/input/src/protocol.ts) y [`packages/input/src/battlefield.ts`](../packages/input/src/battlefield.ts).
- Sala y máquina de campaña: [`apps/server/src/campaign-room.ts`](../apps/server/src/campaign-room.ts) y [`apps/server/src/campaign/machine.ts`](../apps/server/src/campaign/machine.ts).
- Formato de mapa y vista: [`docs/map-backend.md`](map-backend.md), [`packages/state/src/battlefield.ts`](../packages/state/src/battlefield.ts).
- Contrato compartido de fase: `CampaignPhaseView` exportado por `@impulso/state`, en [`packages/state/src/campaign.ts`](../packages/state/src/campaign.ts).
- Pruebas de contrato: [`apps/server/src/campaign-room.test.ts`](../apps/server/src/campaign-room.test.ts), [`packages/input/src/protocol.test.ts`](../packages/input/src/protocol.test.ts) y [`packages/state/src/battlefield.test.ts`](../packages/state/src/battlefield.test.ts).
