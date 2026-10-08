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

E2E multijugador: dos contextos de navegador con cuentas diferentes crean y comparten
una sala, esperan ambos estados listo, entran juntos y envían órdenes confirmadas.
Una recarga conserva sala, asiento y secuencia; abandonar concede victoria al rival,
y recargar resultados conserva esa victoria. También se comprueban código inválido,
corrección de nombre de sala y salida del lobby incluso durante una caída de red.
Las pruebas de transporte cubren
tercer jugador, privacidad, pausa, reconexión automática y ausencia de órdenes reenviadas.
La suite mantiene login, entrenamiento, mapa, cámara, hangar y ajustes.
Estas pruebas no certifican la campaña completa, accesibilidad completa ni balance.

Ejecutar solo la aceptación de salas con `pnpm test:e2e tests/e2e/multiplayer.spec.ts`.

Cuentas en Postgres: `apps/server/src/postgres-store.test.ts` corre solo con
`DATABASE_URL_TEST` apuntando a una base descartable (vacía las tablas en cada caso).
En CI lo ejecuta el job `database` contra un servicio Postgres 17. En local, con el
contenedor de [desarrollo](development.md):
`DATABASE_URL_TEST=postgresql://impulso:impulso@127.0.0.1:55432/impulso pnpm exec vitest run apps/server/src/postgres-store.test.ts`.
Cubre reinicio y login, XP, desafíos y mejores marcas de una partida, emblemas de campaña,
resultados repetidos desde otro proceso, correo duplicado entre procesos, dos resultados
simultáneos e importación del archivo anterior.

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
