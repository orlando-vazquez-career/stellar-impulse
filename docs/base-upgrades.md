# Retirar naves y mejorar la base

Selecciona una o varias naves propias y pulsa **Supr** (Delete), o usa **Retirar
Supr** en el panel de selección. Se retiran inmediatamente y liberan espacio de
flota. No devuelven Metal. La orden de grupo se valida completa en el servidor;
no permite retirar naves rivales. Los campos de texto ignoran el atajo.

En el panel inferior derecho, la pestaña **Base** ofrece dos mejoras pagadas con
Metal. Cada una tiene tres niveles y dura hasta el final de la partida.

| Mejora | Nivel 1 | Nivel 2 | Nivel 3 | Efecto por nivel |
|---|---:|---:|---:|---|
| Capacidad | 10 Metal | 20 Metal | 30 Metal | +4 naves: 12 → 16 → 20 → 24 |
| Daño de base | 12 Metal | 24 Metal | 36 Metal | +10 daño: 0 → 10 → 20 → 30 |

La defensa ataca automáticamente al enemigo o guardián activo más cercano a
cuatro casillas de distancia Manhattan, dentro de la visión de la base. Usa el
ritmo de combate de la partida. En el modo de práctica el primer nivel arma la
defensa; en Partida completa y Escaramuza la base ya dispara sola (12 de daño) y
cada nivel suma encima. Ver `docs/base-system.md`. La mejora no altera el daño de
las naves ni las reglas de captura.

Estas mejoras son economía de la partida. La progresión y los modificadores
roguelite quedan para una etapa posterior.

Los modelos visuales pueden cambiar sin rehacer estas reglas: las órdenes,
economía, daño y ocupación viven en la simulación; el cliente recibe una vista
filtrada. Los sprites prerenderizados 2.5D pueden usar la escena actual. Modelos
3D reales requieren adaptar el renderizador, animaciones, proyección de cámara y
selección de unidades, manteniendo la simulación sobre el plano del mapa.
