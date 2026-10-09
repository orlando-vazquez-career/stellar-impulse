# Controles, escuadras y cámara

Todas las teclas de la partida se cambian en **Ajustes → Controles**: se pulsa la acción y
luego la tecla o combinación nueva (Ctrl, Alt y Shift). Si esa tecla ya la usa otra acción,
las dos intercambian teclas y el panel lo avisa, así nunca queda un atajo perdido. Esc
cancela la espera; cada acción cambiada tiene su botón para volver a la tecla original.

Las teclas se guardan por posición física (`KeyboardEvent.code`): la Z es la misma en un
teclado español o inglés, y Shift+1 sigue siendo la tecla 1 aunque escriba «!». En Chrome
el panel muestra las letras impresas en el teclado del jugador. Nunca se asignan F11 y F12
(pantalla completa y herramientas del navegador), la tecla Windows ni un modificador solo.
Se guardan en el dispositivo, junto al resto de los ajustes.

## Teclas por defecto

| Grupo | Acción | Tecla |
|---|---|---|
| Órdenes | Mantener posición | Z |
| | Cancelar la orden de las naves seleccionadas | Esc |
| | Cambiar formación | F |
| | Disolver la selección | Supr |
| Producción | Interceptor / Fragata / Bombardero / Explorador | X / C / V / B |
| Cámara | Desplazar (mientras se mantiene; las flechas también) | W A S D |
| | Ir a las naves seleccionadas | Espacio |
| | Ir a la base | Inicio |
| | Guardar vista 1-4 / volver a la vista 1-4 | Ctrl+F5…F8 / F5…F8 |
| Selección | Seleccionar todas mis naves | Ctrl+A |
| Escuadras | Guardar la selección como escuadra 1-9 | Ctrl+1…9 |
| | Seleccionar la escuadra | 1…9 |
| | Añadir la selección a la escuadra | Shift+1…9 |
| | Llevar la cámara a la escuadra | doble toque en 1…9 |

Mover y atacar son con clic derecho (sobre el suelo o sobre un enemigo o la base rival), y
una nave captura un nodo quedándose sobre él, por eso ya no hay botones ni teclas de Mover,
Atacar y Capturar. El HUD conserva Mantener y Cancelar, con la tecla configurada.

Esc primero cierra el panel de sonido si está abierto; si no, detiene a las naves
seleccionadas: cada nave termina la casilla que está recorriendo y se queda ahí (orden
`stop` del servidor). Los atajos no se activan mientras se escribe en un campo de texto.

## Escuadras

Una escuadra es una lista de naves bajo un número; una nave puede estar en varias. Las naves
destruidas o disueltas salen solas, y una escuadra vacía desaparece. El panel Acciones muestra
las escuadras con naves: clic las selecciona y doble clic además lleva la cámara. Al llevar la
cámara a un grupo disperso, se centra en la nave más cercana al centro del grupo, no en el
espacio vacío entre ellas. Las escuadras y las vistas guardadas duran lo que dura la partida.

Ctrl+1…9, Ctrl+A y F5 son atajos del navegador; durante la partida el juego los toma para sí
(`preventDefault`). Fuera de la partida se comportan como siempre.

## Pruebas

- `apps/web/src/visual/settings/keybindings.test.ts`: lectura de teclas, intercambio, valores
  guardados inválidos y nombres de teclas.
- `apps/web/src/visual/game/control-groups.test.ts`: guardar, añadir, naves perdidas y centro.
- `tests/e2e/visual.spec.ts`: reasignar en Ajustes; escuadras, vistas, Espacio, doble toque e
  Inicio con el adaptador local.
- `tests/e2e/formations.spec.ts`: Ctrl+1, Esc envía un `stop` por nave y la flota se detiene,
  y la tecla 1 recupera la escuadra, contra el servidor real; un atajo reasignado en partida.
