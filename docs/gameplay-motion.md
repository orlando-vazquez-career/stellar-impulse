# Movimiento y tráfico de naves

El combate sobre Sector 01 y Espiral Estelar usa un paso cada 0,6 segundos para
el Interceptor (antes 0,4). Conserva las diferencias de velocidad por clase.
El cliente interpola cada paso durante ese intervalo completo, también en diagonal,
y suaviza el giro en cada frame. Los guardianes también se interpolan.

Todas las naves vivas, aliadas y enemigas, y los guardianes bloquean su casilla.
La casilla de salida queda reservada durante el desplazamiento para que una nave
que viene detrás no atraviese a la primera durante la interpolación. Las rutas
buscan un desvío al encontrar tráfico; si no hay paso, la orden espera y se retoma
al liberarse. Las esquinas enemigas y de guardianes también bloquean el paso diagonal.
Dos aliadas bloqueadas de frente intercambian casillas en un mismo tick, cuando
coinciden sus ritmos de movimiento. En cruces o rampas, la de id menor puede
ceder hacia una vecina libre y esperar tres intervalos antes de retomar su orden.
Ambas excepciones respetan terreno, reservas ajenas y ocupación enemiga; las
casillas finales siempre son distintas. El intercambio directo puede cruzar las
trayectorias visuales de ese par durante la interpolación.
Las formaciones de llegada amplían su anillo cuando hace falta espacio.

Ninguna nave nace sobre una base o una estación. La flota inicial, el hangar y los
refuerzos de aumentos aparecen en el primer anillo de casillas alrededor de la base
(o más afuera si está ocupado) y las compras de estación, en el segundo anillo de la
estación. Así nada queda dentro del casco al empezar a moverse. Dentro de cada anillo
se elige primero la casilla más cercana al Núcleo, de modo que ningún bando lanza una
casilla por detrás del otro.

El sandbox `?adapter=mock` usa aceleración y frenado, una separación mínima de
0,9 casillas y destinos cercanos libres al hacer clic sobre una aliada. Comprueba
el recorrido por pasos cortos para evitar atravesar una nave tras un frame lento.
Las colisiones no empujan naves ni cambian las reglas de daño o captura.

Verificación: `pnpm check` y `pnpm exec playwright test` completos.
Las pruebas cubren cruces de frente en ambos mapas, determinismo, bloqueos
enemigos, desvíos, espera, reanudación, reservas,
formaciones de 12 naves, desplazamientos diagonales, aceleración, llegada y
redirección hacia un ataque con tráfico cercano.

## Flotas grandes

Los puestos de llegada se mantienen mientras la orden está en curso y se eligen entre casillas alcanzables. Una aliada ya estacionada puede intercambiar posiciones para dejar pasar a otra sin perder su orden. Las aliadas también pueden pasar junto a las esquinas en diagonal; las casillas de destino y las reservas de salida siguen siendo exclusivas. Enemigos y guardianes mantienen su bloqueo. Las regresiones cubren flotas mixtas de 24 naves en ambos mapas, los cruces de frente y el determinismo.

## Persecución y armas

En las partidas de Sector 01 y Espiral, una orden de ataque conserva durante cinco
segundos la última posición observada del enemigo. Si pierde visión, busca esa
casilla; si el enemigo reaparece, retoma la persecución. Nunca sigue coordenadas
ocultas. Una nave destruida libera el objetivo inmediatamente. Mover, añadir una
ruta o mantener posición cancela la persecución. Una nave en espera que ya disparó
a un rival también lo persigue; los disparos de defensa durante una marcha no
reemplazan el destino elegido por el jugador.

Cada disparo confirmado guarda origen, impacto y tick en el servidor. El cliente
dibuja proyectiles para Interceptores, rayos para Fragatas y bombas con arco e
impacto de área para Bombarderos. Los efectos no calculan daño y no revelan puntos
fuera de visión. La pequeña barra gris bajo la vida se vacía al disparar y se llena
durante la recarga. Cambiar de objetivo o moverse no reinicia esa recarga; una vez
lista, el arma dispara al entrar un enemigo en alcance, sin esperar otro pulso
global. El cliente interpola como máximo un tick de recarga entre vistas.

Los valores del HUD y del hangar muestran hasta dos decimales, conservando valores
como 1,25 y evitando residuos de coma flotante en las velocidades modificadas.
