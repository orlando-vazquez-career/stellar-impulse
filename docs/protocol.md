# Protocolo de la sala de campaña

Contrato entre el cliente y el servidor para la sala `campaign`. La sala `training` sigue disponible sin
cambios. Versión del protocolo: **1** (`PROTOCOL_VERSION` en `@impulso/input`).

## Entrar a una sala

```ts
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@impulso/input';

const client = new Client(import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567');
const room = await client.create('campaign', { protocolVersion: PROTOCOL_VERSION, name: 'Ana' });
// El rival entra con el código de la sala:
// await client.joinById(room.roomId, { protocolVersion: PROTOCOL_VERSION, name: 'Beto' });
```

- `name` es opcional (1 a 24 letras, números, espacios, `_`, `.` o `-`; por defecto «Comandante»).
- Si la versión no coincide, la unión falla con `unsupported_version`; opciones inválidas dan `invalid_join`.
- La sala es privada y admite dos asientos (`p1` para quien la crea y `p2` para quien se une).
  Una vez empezada la campaña no entra nadie más.

## Mensajes del cliente

Todos viajan en un sobre `{ protocolVersion: 1, body }`. Un sobre inválido se responde con `rejected`.

| Tipo | `body` | Cuándo |
|---|---|---|
| `ready` | `{}` | En el lobby. Con los dos jugadores listos empieza una cuenta atrás de 5 s |
| `command` | orden de `@impulso/input`, por ejemplo `{ seq, type: 'move', squadId, x, y }` | Durante un sector activo; `seq` crece por jugador |
| `tech` | `{ techId }` | En la transición, con uno de los `offers` recibidos en `phase` |

## Mensajes del servidor

| Tipo | Contenido | Frecuencia |
|---|---|---|
| `phase` | `phase`, `sector`, `sectors`, `remainingMs`, `seats`, `pause`, `resumeInMs`, `sectorResults`, `offers`, `myTech`, `rivalChoseTech`, `myTechnologies`, `result` | En cada cambio y una vez por segundo |
| `view` | `PlayerView` de `@impulso/state`: solo lo que ese jugador puede ver | 10 veces por segundo mientras el sector corre |
| `rejected` | `{ reason }`, por ejemplo `invalid_envelope`, `stale_sequence`, `not_in_sector`, `paused`, `rate_limit`, `unknown_tech` | Solo a quien envió el mensaje |
| `paused` | `{ by, remainingMs }` | Cuando una desconexión pausa el sector |
| `campaign_end` | `{ result: { winner, reason }, sectorResults }` | Una vez, al terminar |

La elección de tecnología del rival no se envía: cada jugador ve solo `rivalChoseTech`.

## Fases

```
lobby → countdown (5 s) → sector 1 → transition (25 s) → sector 2 → transition → sector 3 → results (60 s) → closed
```

- Un sector termina cuando alguien captura el Núcleo o al llegar al tope de seguridad de 8 minutos (empate).
- El ganador de la campaña es quien gana el **sector final**; los sectores anteriores no suman puntos.
- En la transición, quien no elige recibe la primera opción de `offers`.
- Motivos de cierre (`result.reason`): `core`, `draw`, `forfeit` (abandono) y `annulled`
  (ambos desconectados o tope de 30 minutos).
- Un lobby sin empezar se cierra a los 15 minutos.

## Desconexión y reconexión

- Si la conexión se cae durante un sector, el servidor reserva el asiento **60 s** y pausa la simulación para ambos.
  Cada jugador tiene como máximo **2 pausas** por campaña; después, la partida sigue sin pausar.
- Al volver, el servidor envía la vista completa y reanuda tras una cuenta atrás de 3 s (`resumeInMs`).
- Si no vuelve a tiempo, o sale a propósito, pierde por abandono.

Del lado del cliente:

```ts
room.reconnection.maxEnqueuedMessages = 0;                    // no reenviar órdenes viejas al volver
sessionStorage.setItem('impulso.rt', room.reconnectionToken); // sobrevive a una recarga de la página
// Al cargar la página:
// const token = sessionStorage.getItem('impulso.rt'); if (token) room = await client.reconnect(token);
```

Mientras `phase.pause` o `phase.resumeInMs` tengan valor, conviene bloquear las órdenes en la interfaz:
el servidor las rechaza con `paused`.

## Límites

20 órdenes por segundo por jugador (rechazo `rate_limit`); 40 mensajes por segundo como corte duro
(el servidor desconecta); 4 KB por mensaje.

## Provisorio

- Los tres sectores usan el mundo de entrenamiento hasta que existan las plantillas de sector.
- Los identificadores de tecnología son provisorios (decisión D06) y todavía no modifican la simulación.
- Los tiempos y el desempate de cada sector pertenecen a la simulación (decisión D03); el tope de 8 minutos es solo de seguridad.
