# Estadísticas autoritativas

`statsFor(world, playerId, kind)` resuelve costo, construcción, vida, armadura,
daño, ritmo, alcance, velocidad, visión y captura. El cliente recibe los valores
efectivos en su vista; no calcula las mejoras. Los pasos se cuantizan al tick
de 100 ms (1,7 c/s corresponde a un paso cada seis ticks).

El daño aplica `max(1, daño * counter - armadura)`, conservando fracciones. Esta
fórmula sustituye el antiguo bono de daño por altura. Terreno, rampas y visión
siguen usando la elevación. Los disparos de un tick se resuelven simultáneamente.
El Bombardero aplica su factor de área a objetivos hostiles y nunca a aliadas.

| Nave | Vida | Armadura | Daño / segundos | Alcance | c/s | Visión |
|---|---:|---:|---|---:|---:|---:|
| Explorador | 50 | 0 | Sin ataque | 0 | 2,5 | 7 |
| Interceptor | 100 | 1 | 6 / 0,5 | 1 | 1,7 | 4 |
| Fragata | 220 | 3 | 5 / 1 | 2 | 1,25 | 4 |
| Bombardero | 150 | 1 | 36 / 3 | 4 | 0,8 | 4 |

Se conservan las funciones locales de movimiento, retirada y mejoras de base
como prerrequisitos de esta rama, creada desde main. Sus ramas originales se
mantienen intactas. Los eventos oficiales de combate registran el disparo y
autor de cada destrucción para aumentos y progresión.
