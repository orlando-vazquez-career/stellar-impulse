# Impulso Stellar

RTS roguelite competitivo PvPvE para navegador. Explorar para prepararse, combatir para avanzar y defender para ganar.

**Estado: interfaz Visual principal y entrenamiento técnico separado en el servidor. No es la campaña MVP.**
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
Entra como invitado → prepara una operación → **Explorar mapa Tiled** para probar
rutas, rampas, bloqueos y movimiento de una nave en el Sector 01 de 29×29, o
despliega el combate Phaser sobre ese mismo mapa Tiled para probar selección, órdenes,
movimiento libre y ataque. WASD mueve la cámara; **Q** activa la orden de ataque.
El servidor sigue escuchando en **127.0.0.1:2567**, pero el lobby Visual y su
gameplay usan un adaptador local: los códigos de sala de esa pantalla son simulados.
La sala `training` y la sala `campaign` permanecen en el servidor para integración futura.

No necesitas wallet, cuenta, base de datos ni credenciales para iniciar. El adaptador
de testnet/Freighter sigue en el repositorio, pero ya no está expuesto en esta interfaz.

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
