# Impulso Stellar — Lobby

Prototipo del lobby ("Atlas de mando"): lista de modos, planeta pixel art por modo,
arte animado al entrar, sonidos, alias editable y fondo de estrellas que cambia al azar.

## Cómo abrirlo

Usa módulos ES, así que necesita un servidor local (no funciona con doble clic en el archivo):

```bash
npx serve .
# o
python -m http.server 8000
```

Luego abre http://localhost:8000 (o el puerto que indique `serve`).

## Estructura

```
index.html          Marcado del escenario (1440×900, se escala a la ventana) y SVG de arte por modo
css/lobby.css       Estilos y animaciones
js/main.js          Punto de entrada: arma las piezas
js/modes.js         Catálogo de modos (solo datos)
js/lobby.js         Estado y render del lobby
js/sound.js         Efectos con Web Audio (sin archivos de audio)
js/starfield.js     Fondos de estrellas con fundido aleatorio
js/alias.js         Alias del piloto (se guarda en localStorage)
assets/planets/     Un GIF por modo: <id-del-modo>.gif
assets/starfields/  Texturas de estrellas de 1024×1024
```

## Cambios comunes

- **Agregar o editar un modo:** en `js/modes.js`. Su planeta es `assets/planets/<id>.gif`
  y su arte es el `<svg data-art="<id>">` de `index.html`.
- **Agregar un fondo de estrellas:** coloca la imagen en `assets/starfields/` y súmala a
  `STARFIELD_IMAGES` en `js/starfield.js`.

## Notas

- El navegador no reproduce sonido hasta el primer clic en la página.
- Respeta `prefers-reduced-motion`: sin animaciones si el sistema lo pide.
