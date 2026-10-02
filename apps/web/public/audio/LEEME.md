# Audios del juego

Cada sonido tiene un **espacio** (slot) con nombre fijo. Mientras un espacio esté vacío (`null`),
el juego usa un sonido sintetizado o la voz del navegador, así que nunca queda mudo.

## Cómo agregar un audio

1. Guarda el archivo en esta carpeta: efectos en `sfx/`, voces en `voice/es/` o `voice/en/`.
   Formatos: `.ogg`, `.mp3` o `.wav` (recomendado `.ogg`, mono, 44,1 kHz).
2. En `manifest.json`, cambia `null` por la ruta del archivo, relativa a esta carpeta.
   Ejemplo: `"explosion-small": "sfx/explosion-small.ogg"`.
3. Recarga la página del juego. No hace falta reiniciar el servidor.

Los volúmenes se ajustan desde Ajustes (general × efectos). Normaliza los archivos a un volumen
parecido y deja poco silencio al inicio para que suenen al instante.

## Música (`music`)

| Espacio | Cuándo suena | Sugerencia |
| --- | --- | --- |
| `menu` | Menú, lobby, hangar y ajustes | Ambiental tranquila que se pueda repetir en bucle, 1–3 min |
| `match` | Durante la partida | Más tensa y rítmica, en bucle, 1–3 min |

Mientras estén vacíos suena música generada por el propio juego. El volumen sale de Ajustes (general × música).
Guarda las pistas en una carpeta `music/`.

## Efectos (`sfx`)

| Espacio | Cuándo suena | Sugerencia |
| --- | --- | --- |
| `explosion-small` | Se destruye una nave (propia o rival a la vista) | Explosión corta, 0,4–0,7 s |
| `explosion-large` | Cae un guardián | Explosión grave, 0,8–1,2 s |
| `capture-own` | Capturas un nodo o empiezas a capturar el Núcleo | Acorde ascendente, positivo |
| `capture-rival` | El rival toma o te quita un nodo | Acorde descendente |
| `launch` | Sale una nave del hangar | Despegue corto |
| `alarm` | Te atacan o el rival captura el Núcleo (máx. cada 6 s) | Alarma de dos tonos |
| `horn` | Inicio de partida y apertura del Núcleo | Cuerno o fanfarria grave, ~1 s |
| `victory` | Ganas la partida | Fanfarria de 2–3 s |
| `defeat` | Pierdes la partida | Tema triste de 2–3 s |

## Voces (`voice`)

Hay un juego por idioma (`es` y `en`); se usa el del idioma elegido en la interfaz.

| Espacio | Frase sugerida (ES) |
| --- | --- |
| `start` | «Sector uno. Captura Metal antes de que se abra el Núcleo.» |
| `ship-lost` | «Nave perdida.» |
| `node-captured` | «Nodo capturado.» |
| `node-lost` | «Perdimos un nodo.» |
| `under-attack` | «Nuestra flota está bajo ataque.» |
| `core-soon` | «El Núcleo se abre en treinta segundos.» |
| `core-open` | «El Núcleo está abierto. Derroten al guardián.» |
| `core-own-capturing` | «Estamos capturando el Núcleo.» |
| `core-rival-capturing` | «El rival está capturando el Núcleo.» |
| `victory` | «Victoria.» |
| `defeat` | «Derrota.» |

Usa solo audios propios o con licencia que permita uso comercial, y anota su origen en los créditos.
