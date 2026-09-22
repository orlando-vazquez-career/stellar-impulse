# Pruebas y demostración

## Base inicial

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm chain:probe
pnpm contracts:test
pnpm contracts:check
pnpm contracts:fmt
pnpm contracts:build
```

Unitarios: parser, propiedad, repetición de secuencias, determinismo, daño simultáneo,
captura después de PvE y vistas sin enemigos ocultos. Chain: validación RPC, red incorrecta,
errores y adapter de wallet con test double. Rust: versión del contrato de arranque.
Los tests de wallet no prueban una aprobación humana en extensión.

E2E: dos contextos de navegador entran en una sala, envían órdenes y observan resultado
del entrenamiento. Capturas a 320/768/1024/1440/1920 y chequeo de overflow.
Estas pruebas no certifican la campaña, accesibilidad completa ni balance.

## Aceptación futura del MVP

| Caso | Evidencia requerida | Estado inicial |
|---|---|---|
| Tres sectores1v1 | Dos navegadores, tecnologías, resets y resultado final | Pendiente |
| Bot y reconexión | Cortar red, sustitución10s, reserva60s, control recuperado | Pendiente |
| Niebla | Captura de mensajes por jugador; cero unidades ocultas | Base con tests unitarios; ampliar |
| Órdenes | Ownership, visión, recursos, frecuencia y duplicados rechazados | Base parcial; ampliar |
| Compra y equipamiento | Tx testnet confirmada, propiedad consultada, vista del rival | Pendiente |
| Premio idempotente | Dos reclamos y timeout RPC sin doble emisión | Pendiente |
| Cero pay-to-win | Replay completo con/sin inventario igual | Frontera automatizada; replay pendiente |
| Defensa | README, URL, video2–3min y ensayo | README listo; resto pendiente |

## Guion de smoke manual del bootstrap

1. Ejecutar `pnpm dev` y abrir la URL.
2. Crear entrenamiento; abrir otra pestaña y unirse por código.
3. Primer jugador: ir al nodo, observar guardián y Metal; luego ir al Núcleo.
4. Esperar escudo abierto, caída del guardián y ocho segundos de captura.
5. Ver resultado opuesto en ambos clientes; salir/crear otra sala.
6. Consultar testnet; simular caída de RPC y comprobar que el juego continúa.
7. Conectar wallet solo si se dispone de Freighter en testnet.

Para demo sin red, omitir la consulta Stellar y rotular propiedad en cadena como no
demostrada. Nunca sustituir una tx real por una confirmación inventada.
