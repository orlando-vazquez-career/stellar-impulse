# Manual de marca — Stellar Impulse

**Versión:** 1.0 · **Fecha:** 4 de octubre de 2026 · **Producto:** RTS roguelite espacial para navegador

## 1. Lectura de la interfaz actual

La interfaz tiene una dirección visual clara y consistente en su intención:

- **Entrada / login:** una transmisión perdida con nave capital, estrellas, scanlines y un panel holográfico.
- **Centro de mando:** menú de operaciones sobre un campo estelar, con tarjetas angulares y un gran anillo orbital.
- **Preparación:** briefing de misión a la izquierda y configuración de sala, facción y dificultad a la derecha.
- **Hangar:** composición editorial de preview de nave + colección cosmética.
- **Ajustes:** navegación lateral y panel de configuración con el mismo lenguaje de consola.
- **Mapa:** inspector isométrico más utilitario, centrado en el terreno y la ruta.
- **Gameplay:** HUD táctico sobre mapa isométrico; recursos, sector, minimapa, escuadrón y acciones tienen posiciones estables.

### Fortalezas

1. La combinación **Rajdhani + Inter** diferencia sistema y explicación.
2. Los paneles recortados, labels numerados y códigos de sector crean una gramática reconocible.
3. El contraste entre fondo profundo, texto claro y acentos luminosos funciona bien en desktop.
4. Los colores de facción están presentes en HUD y lobby, y existe una base de accesibilidad con foco, alto contraste, texto grande, perfiles cromáticos y reducción de movimiento.
5. El logo actual ya tiene una idea válida: un marco orbital cuadrado/diamante con un núcleo central.

### Riesgos de consistencia

1. Hay dos acentos principales en el código: `#71E5DC` domina login/lobby y `#36A9FF` domina gameplay. El manual los separa por rol para que no compitan.
2. La paleta aparece repetida como valores literales en varios CSS. El siguiente paso técnico debe centralizar tokens y reducir la deriva.
3. Scanlines, glitch, anillos, estrellas y glows aparecen en varias pantallas. Son parte del mundo, pero deben permanecer secundarios al CTA y al mapa.
4. El término “cyberpunk” describe parte de la implementación, pero la marca final debe comunicarse como **táctica espacial / consola de navegación**: menos ruido, más precisión.
5. La interfaz está optimizada para desktop. La advertencia bajo 1024 px es coherente con el RTS actual y debe mantenerse hasta certificar un layout táctil.

## 2. Posicionamiento de marca

### Esencia

> **Stellar Impulse convierte el movimiento en decisión.**

### Personalidad

- Táctica, no militarista extrema.
- Tecnológica, no clínica.
- Espacial, no fantasiosa.
- Competitiva, no agresiva por defecto.
- Premium de ingeniería, no lujosa.

### Voz

Mensajes breves, operativos y concretos. El sistema habla como una consola que ayuda a
actuar: “Señal estable”, “Ruta aceptada”, “Núcleo bloqueado”, “No puedo hacer eso.”
Evitar frases promocionales, chistes en combate y exceso de jerga técnica en ayudas.

### Descriptor recomendado

**RTS táctico espacial para navegador.**

No usar como descriptor principal “cyberpunk” ni “juego blockchain”. Stellar puede aparecer
como contexto tecnológico, pero el producto se presenta primero por su experiencia de juego.

## 3. Sistema de color

| Token | Hex | Rol | Uso |
|---|---:|---|---|
| Space deep | `#03070C` | Fondo profundo | Login, fondos de menú, overlays |
| Space | `#070B14` | Fondo base | Pantallas Visual, mapa, loading |
| Surface | `#131D2D` | Panel | HUD, tarjetas, navegación |
| Surface raised | `#202E43` | Panel elevado | Selección activa, tabs, controles |
| Border | `#3A4A62` | Estructura | Bordes neutros y separadores |
| Text | `#F2F6FA` | Texto principal | Títulos, valores, CTA oscuro |
| Muted | `#93A4B8` | Texto de apoyo | Descripciones, estados inactivos |
| Signal Cyan | `#71E5DC` | Firma de marca | Header, labels, navegación, estados de consola |
| Impulse Blue | `#36A9FF` | Acción táctica | Selección, rutas, aliados, foco de gameplay |
| Ice Blue | `#83D4FF` | Resaltado | Hover, rutas visibles, datos destacados |
| Energy | `#FFD84D` | Atención positiva | Recursos, núcleo, alias activo, foco de operación |
| Core | `#F7E77C` | Objetivo | Núcleo y objetivos de alto valor |
| Success | `#4AD69A` | Confirmación | Listo, equipado, conectado, completado |
| Warning | `#FF9F43` | Atención | Riesgo, espera, límite o estado no ideal |
| Blue faction | `#36A9FF` | Facción aliada | Flota propia; siempre con silueta/label |
| Red faction | `#FF4F64` | Facción rival | Enemigo; siempre con silueta/label |
| Neutral | `#A978FF` | Facción neutral | Entidades neutrales y elementos especiales |
| Metal | `#BFC9D6` | Recurso neutral | Metal, infraestructura, datos técnicos |

### Contraste de referencia

Calculado sobre fondo `#070B14`:

- Text `#F2F6FA`: **18.12:1**.
- Muted `#93A4B8`: **7.73:1**.
- Signal Cyan `#71E5DC`: **13.07:1**.
- Impulse Blue `#36A9FF`: **7.76:1**.
- Energy `#FFD84D`: **14.23:1**.
- Red faction `#FF4F64`: **6.14:1**.

El color no debe ser el único indicador de equipo, peligro, disponibilidad o selección.
Usar además texto, forma, posición, icono o patrón.

## 4. Tipografía

### Familias

- **Rajdhani 500/600/700:** marca, títulos, labels, números y códigos.
- **Inter 400/600:** párrafos, formularios, descripciones, ayudas y errores.

### Escala recomendada

| Nivel | Familia | Tamaño | Peso | Tracking |
|---|---|---:|---:|---:|
| Display | Rajdhani | 52–88 px | 600–700 | -0.035em a 0 |
| H1 de pantalla | Rajdhani | 36–56 px | 700 | 0.5–1 px |
| H2 de panel | Rajdhani | 19–24 px | 700 | 1–1.5 px |
| Label / eyebrow | Rajdhani | 11–14 px | 600–700 | 0.14–0.25em |
| Body | Inter | 13–16 px | 400 | normal |
| Microcopy | Inter | 11–12 px | 400/600 | 0.02–0.08em |
| HUD numeric | Rajdhani | 20–28 px | 600 | tabular-nums |

### Reglas

- Usar mayúsculas para labels, navegación y estados cortos; no para párrafos.
- No usar Rajdhani en bloques largos: su personalidad funciona como voz de sistema.
- Mantener una línea de lectura de 45–70 caracteres en descripciones.
- Los números de recursos y códigos de sala deben alinear cifras.

## 5. Logo y símbolo

### Concepto

El símbolo combina un **diamante orbital** —el sector y la navegación— con un **núcleo**
central y un trazo diagonal de **impulso**. No representa una nave concreta; representa la
red de mando que permite moverla.

### Archivos

- `apps/web/public/brand/stellar-impulse-logo.svg` — logo horizontal a color.
- `apps/web/public/brand/stellar-impulse-mark.svg` — símbolo aislado.
- `apps/web/public/brand/stellar-impulse-logo-mono.svg` — versión de una tinta clara.

### Área de protección

Usar un margen mínimo equivalente al diámetro del núcleo central alrededor del logo. No
colocar estrellas, bordes de panel, texto ni controles dentro de esa zona.

### Tamaños mínimos

- Logo horizontal digital: **132 px de ancho**.
- Símbolo aislado digital: **28 px**.
- Impresión: logo horizontal **30 mm**; símbolo **8 mm**.

### Fondos permitidos

1. `#03070C` o `#070B14` para la versión a color.
2. Superficies `#131D2D` si existe separación de borde.
3. Blanco o fondos claros solo con la versión mono oscura aprobada en una futura entrega.

### No hacer

- No inclinar el logo fuera de su propia geometría.
- No añadir sombra, glow, degradado o textura al archivo maestro.
- No cambiar el núcleo amarillo por el color de una facción.
- No escribir “STELLAR IMPULSE” con otra fuente y llamarlo logo.
- No usar el símbolo de facción como marca del juego.

## 6. Componentes y forma

### Paneles

- Fondo `Surface` o `Surface raised`.
- Borde de 1 px; acento superior o lateral de 2 px solo en estados importantes.
- Esquina recortada de 8–16 px en pantallas de menú; radio máximo 2 px en HUD.
- Sombra corta y opacidad alta. La información debe seguir legible sin glow.

### Botones

- **Primario táctico:** `Impulse Blue`, texto oscuro, flecha o indicador de dirección.
- **Primario de consola:** `Signal Cyan`, texto oscuro.
- **Secundario:** superficie oscura, borde neutro y texto `Muted`.
- **Peligro:** `Red faction` solo para destruir, abandonar o derrota; nunca como decoración.
- Hover: una sola variación de fondo/borde y una transición de 120–180 ms.

### Iconografía

Usar geometría monolineal de 1–2 px, ángulos de 45° o 90°, sin emojis en acciones críticas.
El triángulo, diamante, círculo de núcleo y línea de ruta son formas propias del sistema.

## 7. Movimiento y sonido

- Movimiento de interfaz: 120–180 ms.
- Entrada de pantalla: 240–420 ms cuando no interfiere con la tarea.
- Órbitas de fondo: 90–110 s.
- Scanlines: baja opacidad, sin desplazar contenido.
- Glitch: reservado a login/señal perdida y eventos narrativos; nunca en formularios o
  botones durante la interacción.
- `prefers-reduced-motion` debe congelar o reducir fondos, anillos y anuncios.
- Hover y selección pueden tener sonido, pero la información nunca debe depender del audio.

## 8. Aplicación por pantalla

| Pantalla | Prioridad visual | Acento dominante |
|---|---|---|
| Acceso | Identificar al comandante y entrar | Signal Cyan + Energy |
| Centro de mando | Elegir operación | Signal Cyan |
| Preparación | Leer briefing y confirmar despliegue | Signal Cyan + faction colors |
| Hangar | Comparar cosméticos sin confundir poder | Signal Cyan + Success |
| Ajustes | Editar preferencias sin ruido | Signal Cyan |
| Mapa | Entender terreno y ruta | Impulse Blue |
| Gameplay | Leer estado y actuar en el mapa | Impulse Blue + faction colors |
| Perfil | Leer progreso y desbloqueos | Ice Blue + Success |

## 9. Checklist de revisión

- [ ] ¿La pantalla se reconoce como Stellar Impulse sin leer el texto?
- [ ] ¿El mapa o la acción principal domina sobre la decoración?
- [ ] ¿Los colores usados están en esta paleta y tienen un rol claro?
- [ ] ¿La diferencia entre marca, facción y estado es evidente?
- [ ] ¿El foco de teclado se ve sin depender del glow?
- [ ] ¿La pantalla sigue siendo entendible con movimiento reducido?
- [ ] ¿El logo conserva proporción, área de protección y tamaño mínimo?
- [ ] ¿El copy es breve, operativo y bilingüe cuando corresponde?

## 10. Fuente de tokens

Los tokens normativos para agentes y futuras herramientas viven en [`DESIGN.md`](../DESIGN.md).
Este manual explica su intención y su aplicación en la interfaz actual.
