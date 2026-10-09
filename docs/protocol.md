# Protocolo de la sala de campaña

Contrato de red para `campaign`, con mensajes versionados por `CAMPAIGN_PROTOCOL_VERSION` de `@impulso/input` (valor 3). La campaña corre el mismo motor que el entrenamiento (`createMatchWorld`): mapa Espiral, base, economía, producción, módulos, formaciones y aumentos. La sala `battlefield` conserva el protocolo 2 (`BATTLEFIELD_PROTOCOL_VERSION`) con el mundo de prueba; ver [mapas del campo de batalla](map-backend.md). Los helpers de sobre legacy (`PROTOCOL_VERSION`, `openEnvelope` y `parseJoinOptions`) se conservan para quienes aún los usen. La sala `training` mantiene su API propia de órdenes y vistas.

## Crear o unirse

La sala admite dos asientos (`p1` al crear y `p2` al unirse), y no admite participantes nuevos una vez iniciada la campaña. Cada jugador necesita un token de cuenta obtenido por `/auth/register` o `/auth/login`; ver [autenticación y salas](auth-multiplayer.md). La misma cuenta no puede ocupar los dos asientos (`already_in_room`). `name` es opcional: admite de 1 a 24 letras, números, espacios, `_`, `.` o `-`; si se omite, el servidor usa `Comandante`. Una versión de campaña incorrecta falla con `unsupported_version`; opciones inválidas fallan con `invalid_join`. El `roomId` generado es el código de invitación de 12 caracteres hexadecimales. `phase.playerId` identifica el asiento propio desde el lobby; los alias pueden coincidir. Si alguien sale antes de empezar, su plaza vuelve a estar disponible y el asiento de quien permanece no cambia.

El creador elige uno de los mapas de `PLAYABLE_MAPS`, la misma lista que muestran campaña/práctica y multijugador. Actualmente se admite `map: 'espiral'` (predeterminado); `sector-01` y `battlefield` quedan fuera del catálogo jugable y se rechazan en la admisión. El invitado hereda esa elección sin enviar `map`; `phase.renderMap` la anuncia a ambos desde el lobby y los tres sectores se juegan en ese mapa. No se aceptan otros nombres ni terreno arbitrario. Al unirse, el servidor carga los aumentos desbloqueados de cada cuenta: son el pool de sus ofertas.

## Flujo del cliente

Usa `bindRoom` para configurar cada instancia de sala. Al recargar, llama a `reconnectCampaign` con el token guardado; no crees una sala antes de intentar la reconexión. Al reconectar, el SDK devuelve una instancia nueva: vuelve a vincularla, desactiva mensajes encolados y guarda el token vigente. El cliente web hace todo esto en `apps/web/src/multiplayer/session.ts`.

```ts
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';

const client = new Client(import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567');
let room: Room | undefined;
const accessToken = sessionStorage.getItem('impulso.auth-token');
if (!accessToken) throw new Error('Inicia sesión antes de entrar a una partida');
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });

function bindRoom(nextRoom: Room): void {
  room = nextRoom;
  room.reconnection.maxEnqueuedMessages = 0;
  sessionStorage.setItem('impulso.rt', room.reconnectionToken);
  room.onMessage('phase', (phase) => renderPhase(phase));
  room.onMessage('view', (view) => renderMatch(view));
  room.onMessage('ack', ({ seq }) => markCommandAccepted(seq));
  room.onMessage('rejected', ({ reason }) => showCommandError(reason));
  room.onMessage('campaign_end', ({ result, reward }) => showResult(result, reward));
}

async function createCampaign(name = 'Ana'): Promise<Room> {
  const nextRoom = await client.create('campaign', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name, token: accessToken, map: 'espiral' });
  bindRoom(nextRoom);
  return nextRoom;
}

async function joinCampaign(code: string, name = 'Beto'): Promise<Room> {
  const nextRoom = await client.joinById(code.trim().toUpperCase(), { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name, token: accessToken });
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

const markReady = () => room!.send('ready', envelope({}));
const pickAugment = (choice: number, id: string) => room!.send('augmentPick', envelope({ choice, id }));
const produce = (seq: number, kind: 'interceptor' | 'frigate' | 'bomber' | 'explorer') => room!.send('command', envelope({ type: 'produce', seq, kind }));
```

Si `phase.pause` o `phase.resumeInMs` tiene valor, bloquea el envío de órdenes hasta que termine la pausa o la reanudación; durante ese intervalo el servidor las rechaza con `paused`. Cada sector empieza con la elección de aumento: hasta que ambos eligen, el reloj está detenido y las órdenes se rechazan con `opening_selection`.

## Sobres y mensajes del cliente

Todos los mensajes del cliente llevan `{ protocolVersion: 3, body }`. El servidor responde a una orden válida con `ack: { protocolVersion: 3, seq }`. Una orden inválida o rechazada recibe `rejected: { protocolVersion: 3, reason }` solo para quien la envió. El rechazo no consume `seq`. Una secuencia debe ser un entero seguro positivo y mayor que la última aceptada en el sector; cada sector es un mundo nuevo que vuelve a contar desde cero, pero el cliente puede seguir numerando de forma creciente sin reiniciar. La vista propia expone `players[playerId].lastSequence` para que un cliente restaurado continúe la numeración.

| Canal | `body` | Uso |
|---|---|---|
| `ready` | `{}` | En lobby; con ambos jugadores listos comienza la cuenta regresiva de 5 s. |
| `command` | Órdenes del motor de partida: `move`, `move_formation`, `attack`, `stop`, `enqueue`, `stance`, `produce`, `build_module`, `upgrade_base`, `disband` y `surrender`, cada una con su `seq` | Durante un sector activo, después de la elección de aumento. Son las mismas órdenes y validaciones del entrenamiento (`parseCommand` y `applyCommand`). |
| `augmentPick` | `{ choice, id }` | Elige una carta de la oferta vigente; `choice` es 0, 1 o 2. |
| `augmentReroll` | `{ choice }` | Renueva las cartas de la oferta vigente mientras queden renovaciones. |

`surrender` hace perder el sector, no la campaña, y solo se acepta cuando la base ya no tiene escudo (`surrender_locked` antes). Los cuerpos no admiten campos extra.

## Mensajes del servidor

| Canal | Contenido | Frecuencia o privacidad |
|---|---|---|
| `phase` | `protocolVersion`, `playerId`, `renderMap`, `phase`, `sector`, `sectors`, `remainingMs`, `seats`, `pause`, `resumeInMs`, `sectorResults`, `result` | En cada cambio de fase y una vez por segundo. |
| `view` | `PlayerView` del motor de partida (`mode: "training"`) más `protocolVersion` | 10 veces por segundo durante el sector, incluida la elección de aumento; se reenvía al reconectar y al empezar cada sector aunque esté en pausa. |
| `ack` | `{ protocolVersion, seq }` | Solo para una orden aceptada. |
| `rejected` | `{ protocolVersion, reason }` | Solo a quien envió el mensaje. |
| `paused` | `{ protocolVersion, by, remainingMs }` | Cuando una desconexión pausa el sector. |
| `campaign_end` | `{ protocolVersion, result: { winner, reason }, sectorResults, reward? }` | Una vez al terminar la campaña. `reward` es el premio de cuenta de quien lo recibe (`xpGained`, `beforeXp`, `profile`, `challenges`, `merits`, `unlocked`); ver [progresión](progression.md). |

La vista es la misma proyección privada del entrenamiento (`viewFor`): solo las unidades, guardianes y nodos que el jugador ve, su propio Metal, producción, módulos y mejoras, y su `lastSequence`. Del rival nunca llegan Metal, órdenes, secuencia ni la oferta de aumento; sus aumentos elegidos sí son públicos. `augments.offer` muestra la oferta propia con `rerolls` usados y `rerollLimit`.

## Fases de campaña

```
lobby → countdown (5 s) → sector 1 → transition (15 s) → sector 2 → transition → sector 3 → results (60 s) → closed
```

Cada sector es una partida de Escaramuza nueva: flota, recursos, base y nodos arrancan de cero. Los aumentos elegidos en sectores anteriores se vuelven a aplicar al empezar el sector (también sus bonus de un solo uso) y cada sector ofrece una carta más: plata en el sector 1, oro en el 2 y prismática en el 3. La oferta detiene el reloj hasta que ambos eligen o vencen sus 30 s, y dentro del sector no hay otras ofertas. Quien ganó el sector anterior tiene una renovación extra.

Un sector termina cuando la partida tiene ganador (núcleo, base destruida o rendición) o al alcanzar el tope de seguridad de 12 minutos (empate); la muerte súbita de Escaramuza empieza a los 8. El ganador de la campaña es quien gana el sector 3; los sectores anteriores no suman puntos. Motivos de cierre: `core` (el sector 3 tuvo ganador), `draw` (el sector 3 llegó al tope sin ganador), `forfeit` (abandono) y `annulled` (ambos desconectados o tope de 45 minutos). Un lobby sin empezar se cierra a los 15 minutos.

## Desconexión, tamaño y ritmo

Cada jugador dispone de hasta 2 pausas por campaña. Cada caída inicia una ventana de reconexión de 60 s desde el instante original de esa caída; el plazo no se renueva al pasar a otro sector. Si la caída ocurre durante un sector y queda cuota de pausa, la simulación se detiene para ambos hasta la reconexión o el plazo. Si ya agotó la cuota, la simulación sigue y, al vencer el plazo sin reconexión, se declara `forfeit` si el rival sigue conectado o `annulled` si ambos asientos están ausentes. Al volver de una pausa activa, recibe una vista completa y una cuenta regresiva de reanudación de 3 s. Si se reconecta dentro del plazo cuando no hubo pausa activa, no hay cuenta regresiva. Una caída durante transición no pausa esa transición; al iniciar el siguiente sector, puede pausarlo si la cuota lo permite y el plazo original sigue vigente.

El servidor limita las órdenes a 32 acciones de escuadrón por segundo y jugador; una orden grupal cuenta una acción por cada ID en `squadIds`. El corte duro es de 40 mensajes entrantes por segundo y el máximo de 4 KiB aplica a cada payload entrante del cliente; las vistas que envía el servidor pueden superar ese tamaño.

## Referencias del repositorio

- Versiones, sobres y validadores: [`packages/input/src/protocol.ts`](../packages/input/src/protocol.ts) y [`packages/input/src/index.ts`](../packages/input/src/index.ts).
- Sala y máquina de campaña: [`apps/server/src/campaign-room.ts`](../apps/server/src/campaign-room.ts) y [`apps/server/src/campaign/machine.ts`](../apps/server/src/campaign/machine.ts).
- Aumentos de campaña: `prepareCampaignSector` en [`packages/sim/src/augments/runtime.ts`](../packages/sim/src/augments/runtime.ts).
- Contrato compartido de fase: `CampaignPhaseView` exportado por `@impulso/state`, en [`packages/state/src/campaign.ts`](../packages/state/src/campaign.ts).
- Pruebas de contrato: [`apps/server/src/campaign-room.test.ts`](../apps/server/src/campaign-room.test.ts), [`apps/server/src/campaign-flow.test.ts`](../apps/server/src/campaign-flow.test.ts), [`apps/server/src/campaign/machine.test.ts`](../apps/server/src/campaign/machine.test.ts) y [`packages/input/src/protocol.test.ts`](../packages/input/src/protocol.test.ts).
