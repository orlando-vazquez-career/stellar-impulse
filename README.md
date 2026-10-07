# Stellar Impulse

RTS roguelite competitivo PvPvE para navegador. Explorar para prepararse, combatir para avanzar y defender para ganar.

**Estado: entrenamiento contra IA y salas multijugador conectadas al servidor. La campaña MVP completa sigue en desarrollo.**
El brief de referencia es la versión 0.4. El objetivo es 1v1,
tres sectores isométricos 2D, servidor autoritativo y cosméticos en Stellar testnet.
Las compras nunca modifican el poder de una flota.

## Empezar

Requisitos: Git, Node **24.19.0** y pnpm **11.25.0**. Rust se ejecuta dentro de WSL2
en Windows; Linux y macOS lo ejecutan nativamente.

```sh
git clone https://github.com/orlando-vazquez-career/stellar-impulse.git
cd stellar-impulse
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

Abrir **http://127.0.0.1:5173** (la antigua ruta `/visual` también muestra la misma interfaz).
Entra como invitado → **Preparar operación** para entrenar contra la IA en Espiral
Estelar o Sector 01. **Explorar mapa Tiled** abre el inspector de Sector 01.
WASD mueve la cámara; clic izquierdo selecciona, clic derecho ordena y **Q** activa ataque.
El servidor escucha en **127.0.0.1:2567** y aplica las órdenes y el estado de la partida.

Para jugar entre dos personas, inicia sesión con dos cuentas diferentes en dos
navegadores o perfiles. El primero elige **Crear sala multijugador → Crear sala**;
el segundo elige **Unirse a sala** y pega el código. Ambos pulsan **Estoy listo**:
tras la cuenta regresiva entran a la misma partida de Sector 01. Una recarga recupera
la plaza mientras siga vigente la reserva de reconexión. El registro de cuentas y
el contrato de conexión están en [cuentas y multijugador](docs/auth-multiplayer.md).

El entrenamiento admite invitados; el multijugador requiere cuenta. No necesitas
wallet para ninguno de estos flujos. `?adapter=mock` conserva el juego visual local.

## Qué contiene esta base

- Cliente React/Vite con una entrada Visual y demo Phaser isométrica sobre el TMJ
  editable de Sector 01; usa su atlas, alturas, rampas y bloqueos para las rutas.
- Inspector interactivo del TMJ editable de Sector 01: pinta su atlas y usa el parser
  y el buscador de rutas de `@impulso/sim` para probar el terreno.
- Sala Colyseus y entrenamiento determinista con órdenes validadas y vistas filtradas.
- Paquetes separados para reglas, órdenes, estado visible, interfaz y Stellar.
- Consulta real de Stellar testnet y adaptador de conexión de wallet.
- Workspace Rust/Soroban con contrato de arranque, pruebas y build WASM.
- Plan estratégico, tareas, decisiones, CI y reglas para contribuir.

La campaña de tres sectores, economía completa, bots, reconexión, PostgreSQL,
SEP-10, compras y premios son **trabajo planificado**. El contrato inicial solo
expone su versión; no emite ni vende cosméticos. Ver [estado verificable](docs/status.md).

## Verificar

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm chain:probe
pnpm contracts:test
pnpm contracts:check
pnpm contracts:build
```

Los tres últimos comandos necesitan el [toolchain de contratos](docs/blockchain.md).
`pnpm check` valida límites entre paquetes, higiene pública, tipos, tests y build.
La consulta de red es voluntaria y no forma parte de los tests reproducibles sin red.

## Mapa

| Ruta | Responsabilidad |
|---|---|
| `apps/web` | Interfaz Visual, demo local e inspector Tiled |
| `apps/server` | Autoridad, salas, validación y distribución de vistas |
| `packages/sim` | Reglas puras, sin render, RPC ni inventario |
| `packages/input` | Órdenes serializables y validación |
| `packages/state` | Proyección autorizada por jugador |
| `packages/chain` | Red testnet y wallet |
| `contracts/cosmetics` | Contrato de arranque y futura propiedad cosmética |
| `docs` | Producto, arquitectura, planificación y ejecución |

## Equipo

Hans coordina calidad, demo y pitch; Diego diseña reglas y balance; Yamil desarrolla
el juego y simulador; Orlando lidera backend, multijugador y blockchain; Ismael dirige
arte e interfaz. Las asignaciones y horas son propuestas que el equipo debe confirmar.

Lee [la documentación](docs/README.md), [cómo contribuir](CONTRIBUTING.md) y
[el plan de trabajo](docs/plans/strategy.md). Código y documentación bajo [MIT](LICENSE).
Los recursos gráficos incluidos son formas procedurales creadas para este repositorio.
No se distribuyen los documentos privados de referencia ni la imagen de inspiración.

Proyecto independiente construido sobre Stellar, sin declaración de afiliación o aval
de la Stellar Development Foundation.
