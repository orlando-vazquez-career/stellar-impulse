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
