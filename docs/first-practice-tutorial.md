# Tutorial de primera práctica

El tutorial aparece sobre el HUD de la primera práctica contra IA, después de la
elección inicial de aumento. No se muestra en campaña multijugador ni en el
adaptador visual sin servidor. No pausa la partida ni envía órdenes por el jugador.

Presenta cinco instrucciones, con traducciones ES/EN y el componente `Panel`:
seleccionar naves propias, moverlas con clic derecho, producir una nave, capturar
un nodo de Metal y construir la Refinería. Los Exploradores no capturan; el paso
de captura lo explica. La Refinería se encuentra en la pestaña Módulos del HUD.

El observador consume `GameplayViewModel`. Para movimiento espera un cambio de
posición tras una ruta; para producción espera una nave nueva después de observar
la cola; para captura espera un cambio a dueño aliado de un nodo de Metal; para
la Refinería espera que el módulo termine. Pulsar un botón o ver una construcción
en curso no completa esos pasos. Recuerda las acciones realizadas antes de llegar
a su instrucción, y permite saltar un paso u omitir todo el tutorial.

Terminar u omitir todo guarda `impulso.first-match-tutorial.v1 = seen` en
`localStorage`, en ese navegador y origen. Saltar un paso continúa con el
siguiente; salir antes de terminar permite repetirlo en otra práctica. Lectura y
escritura usan `try/catch`, de modo que bloquear almacenamiento no impide jugar.
Para repetirlo manualmente, borrar esa única entrada del almacenamiento del sitio.

Los unitarios comprueban transiciones, órdenes aún pendientes, acciones anteriores,
selección enemiga, apariciones gratuitas y almacenamiento bloqueado. El E2E usa
el servidor real para selección, movimiento y producción, comprueba ES/EN,
omisión de pasos y persistencia después de recargar. Captura y finalización de
Refinería se verifican con estados del modelo en los unitarios.
