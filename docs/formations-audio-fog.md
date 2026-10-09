# Formaciones, audio y niebla

## Formaciones

Con dos o más naves seleccionadas, el panel ofrece Línea, Columna, Cuña,
Cuadro, Filas y Círculo. El clic de movimiento envía una orden de grupo;
el servidor asigna destinos diferentes según la dirección y el terreno.
La preferencia de forma se guarda en el dispositivo. Funciona en entrenamiento
contra la IA y en las salas multijugador cuando hay una selección de varias naves.

F cambia de formación; como todas las teclas, se puede cambiar en Ajustes → Controles
(ver [controls.md](controls.md)). El selector ocupa una fila propia en el panel
compacto y no se superpone al Hangar ni al minimapa a partir de 1024 px.

El protocolo admite hasta 128 integrantes por selección, incluyendo las naves
adicionales del Astillero y los aumentos. No se recorta la selección a 24.
El servidor valida propiedad, vida, geometría y rutas antes de aceptar una orden.
En entrenamiento, cambiar el destino reinicia el progreso de la formación:
la distancia de la orden anterior no se interpreta como un atasco de la nueva.

## Audio

El volumen general y los canales Música, Efectos, Voz e Interfaz se aplican
también a sonidos que ya están reproduciéndose. Silenciar corta todos los
canales. El panel de partida guarda los cambios; los ajustes del menú permiten
previsualizar y volver sin guardar.

Los efectos y las grabaciones pasan por ganancias de canal que responden al
mezclador en vivo. La voz sintetizada del navegador no permite modificar el
volumen de una frase en curso: al ajustar Voz, la frase actual se reinicia con
el volumen nuevo; al silenciar, se cancela. Cerrar un panel de muestras no
cancela una voz de partida que pertenezca a otro reproductor. Los contextos y
suscripciones se liberan al cerrar reproductores y muestras.

## Niebla

El terreno tiene tres estados: nunca visto, explorado fuera de visión y visible.
Un nodo fuera de visión conserva su último dueño observado con un marcador tenue.
El cliente no aprende cambios de dueño ni posiciones nuevas fuera de las vistas
permitidas por el servidor. Los enemigos desaparecen con una transición breve.

En multijugador, la máscara explorada proviene del servidor y se conserva al
reconectar. La memoria de nodos se limpia al cambiar de sector; no se mezcla
con la del sector siguiente. En entrenamiento, la memoria dura lo que la partida.

## Regresiones cubiertas

- Nueva orden de una formación mixta mientras marcha.
- Simulación y envío de selecciones de 26 naves completas.
- Las seis formas multijugador, destinos únicos y asignación determinista.
- Nodos recordados sin información nueva y reinicio entre sectores.
- Volumen de sonidos activos, silencio y propiedad de la voz sintetizada.
- Atajo F configurado y panel sin superposición a 1024 px, en navegador.

Validación requerida: `pnpm check` y `pnpm exec playwright test`.
