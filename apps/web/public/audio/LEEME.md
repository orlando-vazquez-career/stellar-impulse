# Audios del juego

Cada sonido tiene un **espacio** (slot) con nombre fijo. Mientras un espacio esté vacío (`null`),
el juego usa un sonido sintetizado o la voz del navegador, así que nunca queda mudo. Las voces y
los efectos actuales se generaron con ElevenLabs; el origen de cada archivo está en
[CREDITOS.md](CREDITOS.md) y el diseño en [docs/audio-elevenlabs.md](../../../../docs/audio-elevenlabs.md).

## Cómo agregar un audio

1. Guarda el archivo en esta carpeta: efectos en `sfx/`, voces en `voice/es/` o `voice/en/`.
   Formato: `.mp3` mono a 44,1 kHz (lo decodifican todos los navegadores); `.ogg` y `.wav` también sirven.
2. En `manifest.json`, cambia `null` por la ruta del archivo, relativa a esta carpeta.
   Ejemplo: `"alarm": "sfx/alarm.mp3"`. Un espacio puede tener varias tomas en una lista:
   `"explosion-small": ["sfx/explosion-small-1.mp3", "sfx/explosion-small-2.mp3"]`; el juego
   elige una al azar sin repetir la anterior.
3. Recarga la página del juego. No hace falta reiniciar el servidor.

Los volúmenes se ajustan desde Ajustes (general × efectos × voz). Normaliza los archivos a una
sonoridad parecida (voces a −16 LUFS) y deja poco silencio al inicio para que suenen al instante.

## Música (`music`)

| Espacio | Cuándo suena | Sugerencia |
| --- | --- | --- |
| `menu` | Menú, lobby, hangar y ajustes | Ambiental tranquila que se pueda repetir en bucle, 1–3 min |
| `match` | Durante la partida | Más tensa y rítmica, en bucle, 1–3 min |

Mientras estén vacíos suena música generada por el propio juego. El volumen sale de Ajustes (general × música).
Guarda las pistas en una carpeta `music/`.

## Efectos (`sfx`)

| Espacio | Cuándo suena |
| --- | --- |
| `explosion-small` | Se destruye una nave (propia o rival a la vista) |
| `explosion-large` | Cae un guardián, una torreta o una barrera, o impacta un satélite |
| `capture-own` | Capturas un nodo o una estación, o empiezas a capturar el Núcleo |
| `capture-rival` | El rival toma o te quita un nodo o una estación |
| `launch` | Sale una nave del hangar |
| `alarm` | Te atacan, cae un satélite, avanza la niebla o el rival captura el Núcleo (máx. cada 6 s) |
| `horn` | Empieza el combate, caen los escudos, se abre el Núcleo o empieza la muerte súbita |
| `victory` | Ganas la partida |
| `defeat` | Pierdes la partida |

## Voces (`voice`)

Hay un juego por idioma (`es` y `en`); se usa el del idioma elegido en la interfaz. La voz es
**VELA**, la IA de a bordo. Cada línea tiene prioridad: una alerta corta a una confirmación, una
línea menos importante espera a que termine la actual y se descarta si ya no sirve, y cada línea
tiene un tiempo mínimo antes de repetirse.

| Espacio | Frase (ES) |
| --- | --- |
| `start` | «Enlace establecido. Captura Metal antes de que se abra el Núcleo.» |
| `ship-lost` | «Nave perdida.» |
| `node-captured` | «Nodo de Metal capturado.» |
| `node-lost` | «Nodo de Metal perdido.» |
| `under-attack` | «Flota bajo ataque.» |
| `core-soon` | «El Núcleo se abre en treinta segundos.» |
| `core-open` | «Núcleo abierto. Destruye al guardián.» |
| `core-own-capturing` | «Capturando el Núcleo.» |
| `core-rival-capturing` | «El rival captura el Núcleo.» |
| `victory` | «Victoria. Sector asegurado.» |
| `defeat` | «Derrota. Sector perdido.» |
| `base-under-attack` | «Base bajo ataque.» |
| `base-hull-critical` | «Casco crítico en la base.» |
| `shields-down` | «Escudos de base caídos. Bases expuestas.» |
| `sudden-death` | «Muerte súbita. Captura instantánea del Núcleo.» |
| `satellite-warning` | «Satélite en caída. Despeja la zona.» |
| `nebula-advancing` | «La niebla avanza. Visión reducida.» |
| `belt-closing` | «El cinturón se cierra. Despeja el paso.» |
| `core-guardian-down` | «Guardián destruido. Captura el Núcleo.» |
| `core-contested` | «Núcleo disputado.» |
| `node-threatened` | «Nodo de Metal amenazado.» |
| `module-online` | «Módulo operativo.» |
| `insufficient-metal` | «Metal insuficiente.» |
| `fleet-full` | «Flota completa.» |
| `order-denied` | «No puedo hacer eso.» |
| `augment-offer` | «Señal de mejora. Elige un aumento.» |
| `link-lost` | «Enlace perdido.» |
| `ship-ready` | «Nave lista.» |
| `station-captured` | «Estación capturada.» |
| `station-lost` | «Estación perdida.» |
| `link-restored` | «Enlace restablecido.» |

`voicePacks` guarda las grabaciones de los paquetes de voz del Hangar, por id del ítem
(por ejemplo `voz-analista`). Una línea que un paquete no tenga sale de `voice`.

Usa solo audios propios o con licencia que permita uso comercial, y anota su origen en [CREDITOS.md](CREDITOS.md).
La banda sonora y temas musicales originales pertenecen a @llamakachera - Llama Kachera (todos los derechos reservados, ver [LICENSE](../../../../LICENSE)).
