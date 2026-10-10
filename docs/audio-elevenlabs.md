# Audio con ElevenLabs: voz de a bordo y efectos

Diseño del reemplazo de la voz del navegador (`speechSynthesis`) y de los efectos sintetizados
por audio generado en ElevenLabs. Los archivos generados se versionan en
`apps/web/public/audio/`; el juego no depende de ElevenLabs para funcionar ni para compilar.
Este documento registra cómo se hicieron, para poder regenerarlos o reemplazarlos.

Estado: voces y efectos principales en el juego (9-oct-2026). Inventario de partida: 49 sonidos en 4
subsistemas, 44 eventos de juego sin sonido. La implementación va por fases (ver al final).

## Voz de a bordo: VELA

**VELA** es la IA de a bordo y el anunciador por defecto. El nombre viene de la constelación
de Vela y de «velar» (vigilar la flota). Es un nombre original: no remite a personajes ni
marcas de otros juegos.

- Arquetipo: IA compañera serena, inteligente y precisa, con calidez discreta; nunca teatral.
- Acento: Español latinoamericano neutro, al estilo del doblaje neutro: sin voseo ni modismos regionales, con seseo (sin distinción z/s), la 's' final y la 'd' intervocálica pronunciadas, y entonación clara y estable. 'Metal' se dice aguda (me-TAL) y 'Núcleo' esdrújula (NÚ-cle-o): revisarlo de oído en cada toma, porque con un mismo voice_id para los dos idiomas puede colarse la fonética inglesa. Todo el guion trata de 'tú' ('Captura', 'Destruye', 'Elige', 'Despeja'), igual que la interfaz. En inglés, acento claro y neutro; un leve acento latino es aceptable si no resta claridad.
- Modelo de voz: diseño con `eleven_ttv_v3`; frases con `eleven_v4` (mismos tags que v3).
- El carácter de IA se agrega en el procesado (chorus leve, plate corto, realce de agudos),
  no en el diseño, para que la toma seca sirva también a otros paquetes.

Descripción usada para el diseño (inglés, entrada de ElevenLabs):

> Female AI companion voice for a starship command console, sounding around 30 to 35 years old. Intelligent, serene and quietly warm, yet precise and economical: short operational sentences delivered with intent. Mid-low register, smooth and clear, with crisp consonants and clean diction. Neutral Latin American Spanish accent with no regional traits; in English, a clear and neutral accent. Measured tactical pace, slightly brisker than conversation. Calm under pressure: urgency shows as tighter, faster phrasing, never shouting. Confident, supportive and trustworthy; never theatrical, flirtatious, cute or robotic. Natural, polished human voice with a clean, modern timbre; no effects or filtering. Close-mic studio quality, dry room, no background noise.

Texto de prueba (sólo frases del guion):

> Enlace establecido. Captura Metal antes de que se abra el Núcleo. Nodo de Metal capturado. Flota bajo ataque. El Núcleo se abre en treinta segundos. Núcleo abierto. Destruye al guardián. Capturando el Núcleo. El rival captura el Núcleo. No puedo hacer eso. Victoria. Sector asegurado.

## Guion

Registro en «tú», como la interfaz. P0 = espacios de voz que ya existen en el juego;
P1/P2 = eventos hoy mudos. Los tags entre corchetes indican la interpretación y no se leen.

| Prioridad | Espacio | Español | Inglés | Máx. |
| --- | --- | --- | --- | --- |
| P0 | `start` | [calm] Enlace establecido. Captura Metal antes de que se abra el Núcleo. | [calm] Link established. Secure Metal before the Core opens. | 4.4 s |
| P0 | `ship-lost` | [calm] Nave perdida. | [calm] Ship lost. | 1 s |
| P0 | `node-captured` | [warmly] Nodo de Metal capturado. | [warmly] Metal node captured. | 1.7 s |
| P0 | `node-lost` | [serious] Nodo de Metal perdido. | [serious] Metal node lost. | 1.7 s |
| P0 | `under-attack` | [urgent] Flota bajo ataque. | [urgent] Fleet under attack. | 1.4 s |
| P0 | `core-soon` | [calm] El Núcleo se abre en treinta segundos. | [calm] The Core opens in thirty seconds. | 2.6 s |
| P0 | `core-open` | [confident] Núcleo abierto. Destruye al guardián. | [confident] Core open. Destroy the guardian. | 2.8 s |
| P0 | `core-own-capturing` | [calm] Capturando el Núcleo. | [calm] Capturing the Core. | 1.6 s |
| P0 | `core-rival-capturing` | [urgent] El rival captura el Núcleo. | [urgent] Rival capturing the Core. | 2 s |
| P0 | `victory` | [warmly] Victoria. Sector asegurado. | [warmly] Victory. Sector secured. | 2.6 s |
| P0 | `defeat` | [softly] Derrota. Sector perdido. | [softly] Defeat. Sector lost. | 2.4 s |
| P1 | `base-under-attack` (nuevo) | [urgent] Base bajo ataque. | [urgent] Base under attack. | 1.4 s |
| P1 | `base-hull-critical` (nuevo) | [urgent] Casco crítico en la base. | [urgent] Base integrity critical. | 1.8 s |
| P1 | `shields-down` (nuevo) | [serious] Escudos de base caídos. Bases expuestas. | [serious] Base shields down. Bases exposed. | 2.8 s |
| P1 | `sudden-death` (nuevo) | [serious] Muerte súbita. Captura instantánea del Núcleo. | [serious] Sudden death. Core capture is instant. | 3.2 s |
| P1 | `satellite-warning` (nuevo) | [urgent] Satélite en caída. Despeja la zona. | [urgent] Satellite falling. Clear the zone. | 2.6 s |
| P1 | `nebula-advancing` (nuevo) | [cautiously] La niebla avanza. Visión reducida. | [cautiously] Fog advancing. Sight reduced. | 2.4 s |
| P1 | `belt-closing` (nuevo) | [cautiously] El cinturón se cierra. Despeja el paso. | [cautiously] Belt closing. Clear the passage. | 2.6 s |
| P1 | `core-guardian-down` (nuevo) | [confident] Guardián destruido. Captura el Núcleo. | [confident] Guardian destroyed. Capture the Core. | 2.6 s |
| P1 | `core-contested` (nuevo) | [urgent] Núcleo disputado. | [urgent] Core contested. | 1.4 s |
| P1 | `node-threatened` (nuevo) | [urgent] Nodo de Metal amenazado. | [urgent] Metal node under threat. | 1.7 s |
| P1 | `module-online` (nuevo) | [calm] Módulo operativo. | [calm] Module online. | 1.3 s |
| P1 | `insufficient-metal` (nuevo) | [calm] Metal insuficiente. | [calm] Not enough Metal. | 1.4 s |
| P1 | `fleet-full` (nuevo) | [calm] Flota completa. | [calm] Fleet at capacity. | 1.2 s |
| P1 | `order-denied` (nuevo) | [calm] No puedo hacer eso. | [calm] I can't do that. | 1.3 s |
| P1 | `augment-offer` (nuevo) | [calm] Señal de mejora. Elige un aumento. | [calm] Upgrade signal. Choose an augment. | 2.8 s |
| P1 | `link-lost` (nuevo) | [calm] Enlace perdido. | [calm] Link lost. | 1.2 s |
| P2 | `ship-ready` (nuevo) | [calm] Nave lista. | [calm] Ship ready. | 1 s |
| P2 | `station-captured` (nuevo) | [warmly] Estación capturada. | [warmly] Station captured. | 1.4 s |
| P2 | `station-lost` (nuevo) | [serious] Estación perdida. | [serious] Station lost. | 1.3 s |
| P2 | `link-restored` (nuevo) | [calm] Enlace restablecido. | [calm] Link restored. | 1.4 s |

## Efectos

Concepto: **ataque de StarCraft, cola de EVE**. Cada efecto se entiende en sus primeros
50-100 ms por un transitorio mecánico claro; después puede tener una cola corta de zumbido o
subgrave que da escala. Se abandona el chiptune actual (ondas cuadradas, arpegios de 8 bits).

Reglas de prompt (`eleven_text_to_sound_v2`): describir sólo el sonido; un sonido por
generación (las capas se mezclan en el procesado); sin nombres de juegos o marcas, sin
palabras visuales ni negaciones.

| Prioridad | Espacio | Prompt | Duración | Influencia |
| --- | --- | --- | --- | --- |
| P0 | `sfx.explosion-small` | Small starfighter exploding in space, a sharp metallic crack and hull crunch over a tight low thump with a quick crackle of debris, dry and short. | 1 s | 0.35 |
| P0 | `sfx.explosion-large` | Large armored space structure exploding, a deep sub-bass boom with heavy steel tearing and a long rolling low rumble tail. | 2.2 s | 0.35 |
| P0 | `sfx.capture-own` | Single smooth rising crystalline synth shimmer swell with a soft airy tail. | 1 s | 0.5 |
| P0 | `sfx.capture-rival` | Single detuned synth tone with a low electric buzz and a quick power-down fade. | 0.5 s | 0.55 |
| P0 | `sfx.launch/a-clamp` | Heavy magnetic clamp releasing, a single sharp metallic clunk, dry. | 0.5 s | 0.5 |
| P0 | `sfx.launch/b-thruster` | Small spacecraft thruster igniting, a short rising whoosh with rough exhaust texture. | 1 s | 0.4 |
| P0 | `sfx.alarm` | Single short electronic klaxon blast, an urgent mid-range tone with a hard metallic edge and an abrupt dry stop. | 0.5 s | 0.6 |
| P0 | `sfx.horn` | Deep capital ship horn blast, a low brassy synth drone swelling in and fading out with sub-bass resonance and a spacious metallic tail. | 3 s | 0.4 |
| P0 | `sfx.victory` | Short bold rising synth brass chord, resolved and confident, with a warm sustained tail. | 3.5 s | 0.4 |
| P0 | `sfx.defeat` | Low descending synth brass chord in a minor key over a fading sub-bass drone. | 3.5 s | 0.4 |
| P1 | `sfx.barrier-down` (nuevo) | Energy barrier collapsing, a crackling electric discharge that breaks into a glassy shatter and fades out. | 2 s | 0.4 |
| P1 | `sfx.satellite-whistle` (nuevo) | Rising rushing whistle of a heavy object falling fast. | 1.5 s | 0.45 |
| P1 | `sfx.satellite-impact` (nuevo) | Deep concussive boom with scattered metal debris and a short rumbling tail. | 2 s | 0.35 |
| P1 | `sfx.alert-hazard` (nuevo) | Single slow rising-and-falling electronic siren sweep, a cool hollow tone with a short spacious tail. | 2 s | 0.5 |
| P1 | `sfx.alert-objective` (nuevo) | Single short sharp electronic beep with a metallic edge and a brief ring. | 0.5 s | 0.6 |
| P1 | `sfx.core-open` (nuevo) | Massive energy core powering up, a deep resonant hum swelling into a bright harmonic pulse. | 3.5 s | 0.4 |
| P1 | `ui.hover` (nuevo) | Very soft tiny interface tick, a short high digital blip with a faint glassy click, dry and subtle. | 0.5 s | 0.6 |
| P1 | `ui.select` (nuevo) | Crisp sci-fi interface click, a short metallic tap with a quick bright digital chirp and a tiny tail. | 0.5 s | 0.6 |
| P1 | `ui.back` (nuevo) | Soft sci-fi interface cancel click, a short muted tap with a quick descending digital blip. | 0.5 s | 0.6 |
| P1 | `ui.confirm` (nuevo) | Solid console confirmation, a mechanical latch click with a short warm rising synth chirp. | 1 s | 0.5 |
| P1 | `ui.transition/a-engage` (nuevo) | Deep sub thump with a short rising power-up hum. | 1.5 s | 0.45 |
| P1 | `ui.transition/b-hiss` (nuevo) | Short pneumatic hiss release, dry. | 0.6 s | 0.5 |
| P1 | `ui.augment-offer` (nuevo) | Soft rising synth sweep with a gentle high digital shimmer and a soft glassy sparkle. | 1.5 s | 0.5 |
| P1 | `run.warp-charge` (nuevo) | Starship jump drive charging, a rising electric engine whine and swelling low hum that accelerates and builds tension. | 3 s | 0.4 |
| P1 | `run.warp-release` (nuevo) | Hyperspace jump release, a sharp sub-bass boom that trails into a long fading rushing wake. | 3 s | 0.4 |
| P1 | `run.sector-clear` (nuevo) | Punchy low impact with a rising bright synth brass swell and an airy tail. | 2.5 s | 0.45 |
| P1 | `run.complete` (nuevo) | Warm layered synth brass swell over one deep sub hit, resolving into a sustained shimmering chord, restrained and confident. | 3 s | 0.4 |
| P1 | `run.sector-failed` (nuevo) | Dull low impact with descending muted synth tones and a fading electrical crackle. | 2.5 s | 0.45 |
| P1 | `run.title-blip` (nuevo) | Single tiny mechanical teletype key strike, a dry metallic click with a faint digital tick. | 0.5 s | 0.6 |
| P1 | `run.impact` (nuevo) | Massive ominous sci-fi impact, a deep distorted sub-bass hit with a harsh metallic crunch and a dark reverberant low drone tail. | 4 s | 0.4 |
| P1 | `lobby.anomaly-static` (nuevo) | Short burst of corrupted radio static, stuttering crackle and hiss that cuts in and out like a failing radio signal. | 1 s | 0.4 |
| P1 | `lobby.anomaly-thump` (nuevo) | Deep muffled sub-bass thump, a short distant pressure hit, dark and low-passed. | 0.8 s | 0.4 |
| P1 | `sfx.shields-down/a-whine` (nuevo) | Descending electric power-down whine. | 2 s | 0.45 |
| P1 | `sfx.shields-down/b-thud` (nuevo) | Heavy low thud with a crackling discharge. | 1 s | 0.4 |
| P1 | `sfx.sudden-death` (nuevo) | Deep pulsing sub-bass heartbeat that quickens and builds into a sharp metallic accent hit. | 3 s | 0.4 |
| P1 | `sfx.module-complete/a-latch` (nuevo) | Heavy mechanical latch locking into place, a dry metallic clunk. | 0.5 s | 0.5 |
| P1 | `sfx.module-complete/b-hiss` (nuevo) | Short hydraulic hiss release. | 0.6 s | 0.5 |
| P1 | `sfx.link-lost` (nuevo) | Communication link dropping, a short burst of static that cuts out into a falling digital tone. | 1.5 s | 0.45 |
| P1 | `ui.countdown-tick` (nuevo) | Single crisp digital beep, a short clean mid-high tone with a tiny click attack. | 0.5 s | 0.6 |
| P2 | `sfx.weapon-interceptor` (nuevo) | Short sci-fi laser bolt shot, a quick snappy zap with a tight bright attack and a tiny electric tail. | 0.5 s | 0.5 |
| P2 | `sfx.weapon-frigate` (nuevo) | Short focused particle beam burst, a humming energy beam with crackling edges that starts sharp and cuts off cleanly. | 0.6 s | 0.5 |
| P2 | `sfx.weapon-bomber-launch` (nuevo) | Heavy plasma mortar launch, a deep muffled thump with a short rising projectile hiss. | 0.7 s | 0.45 |
| P2 | `sfx.weapon-bomber-impact` (nuevo) | Plasma bomb detonation, a punchy low boom with crackling energy dispersal and a short sizzle. | 0.8 s | 0.4 |
| P2 | `sfx.weapon-turret` (nuevo) | Heavy automated defense cannon shot, a deep mechanical kick with a metallic clank and a short energy discharge. | 0.6 s | 0.45 |
| P2 | `ui.denied` (nuevo) | Short low dissonant electronic buzz with a muted rasp. | 0.5 s | 0.6 |
| P2 | `ui.unit-select` (nuevo) | Soft tactical selection tick, a short low-mid digital click with a faint radio squelch. | 0.5 s | 0.6 |
| P2 | `ui.order-move` (nuevo) | Short command acknowledge chirp, a soft rising digital blip with a light radio click. | 0.5 s | 0.6 |
| P2 | `ui.order-attack` (nuevo) | Single short sharp target lock tick with a hard metallic edge. | 0.5 s | 0.6 |
| P2 | `sfx.cloak` (nuevo) | Phase-shifting whoosh with a wavering chorus texture that fades into a hollow hum. | 1.2 s | 0.45 |
| P2 | `ambient.match-bed` (nuevo) | Deep space ambience, a very low steady engine hum with faint distant rumbles and slow shifting airy tones, calm and spacious. (loop) | 30 s | 0.3 |
| P2 | `ambient.nebula` (nuevo) | Low ominous drone with slowly modulated filtered noise, soft pulsing static and a hollow airy hiss. (loop) | 10 s | 0.35 |
| P2 | `run.leviathan-loop` (nuevo) | Unstable corrupted signal drone, a low pulsing hum with intermittent digital glitch stutters and faint radio static. (loop) | 8.4 s | 0.4 |

## Procesado

- Recorte del silencio inicial (menos de 30 ms), fundido de salida y filtro pasa-altos.
- Sonoridad por familia, sin `loudnorm` en clips de menos de 3 s: voces con ganancia común
  hasta −16 LUFS (máximo de corto plazo); efectos normalizados por pico según su familia;
  true peak máximo −1 dBTP.
- Mono a 44,1 kHz salvo stingers y ambientes; se codifica una sola vez desde el WAV.
- Formato de entrega: MP3 (96 kbps mono para voces, 112 kbps para efectos, 160 kbps estéreo para
  cuerno, victoria y derrota), porque todos los navegadores lo decodifican.
- Verificación: cada toma de voz se transcribió con Whisper (modelo medium, local) y solo entran las
  que dicen el texto del guion. Así se detectó que en inglés VELA decía «Reval» por «Rival» y
  «Bass hole» por «Base hull»: la primera se regrabó con pronunciación IPA y la segunda pasó a
  «Base integrity critical».

## Fases

1. **Hecho (9-oct)**: VELA en los 31 espacios de voz (es/en), con varias tomas en las líneas
   frecuentes; prioridad, cola, enfriamientos y retardo tras el efecto; los 9 espacios de efectos;
   VELA como paquete por defecto, Analista como VELA procesada y Comandante bloqueado
   («Próximamente») hasta tener su propia voz. Eventos nuevos del juego: inicio real del combate,
   oferta de aumento, base bajo ataque y casco crítico, escudos caídos, muerte súbita, módulo
   operativo, guardián del Núcleo, Núcleo disputado, nodo amenazado, órdenes rechazadas y enlace
   perdido o restablecido.
2. **Pendiente**: efectos P1/P2 (interfaz, Run, lobby, armas por tipo de nave, ambientes),
   ducking de música mientras habla la voz, voz propia del Comandante y voz por tipo de nave lista.

Créditos: todas las voces y efectos de este documento se generaron con ElevenLabs
(plan pago del equipo, uso comercial permitido). El origen de cada archivo se anota en
`apps/web/public/audio/CREDITOS.md`.
