# Impulso Stellar

RTS roguelite competitivo PvPvE para navegador. Explorar para prepararse, combatir para avanzar y defender para ganar.

**Estado: repositorio inicial y entrenamiento técnico de un sector. No es la campaña MVP.**
El diseño vigente es la versión 0.3 del 22 de septiembre de 2026. El objetivo es 1v1,
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

Abrir **http://127.0.0.1:5173**. Crear entrenamiento, seleccionar el escuadrón y
dar una orden sobre el mapa. El servidor escucha en **127.0.0.1:2567**.
Compartir el código de sala con otra pestaña permite conectar el segundo asiento.
Son sesiones efímeras de desarrollo; recargar no recupera el asiento.

No necesitas wallet, cuenta, base de datos ni credenciales para iniciar.
El botón de red consulta la testnet real; conectar Freighter es opcional y requiere
la extensión configurada en testnet. Conectar una dirección **no autentica una cuenta**.

## Qué contiene esta base

- Cliente React/Vite y renderer Canvas isométrico intercambiable.
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
| `apps/web` | Navegador, sesión de entrenamiento e integración visual |
| `apps/server` | Autoridad, salas, validación y distribución de vistas |
| `packages/sim` | Reglas puras, sin render, RPC ni inventario |
| `packages/input` | Órdenes serializables y validación |
| `packages/state` | Proyección autorizada por jugador |
| `packages/render-2d` | Canvas isométrico |
| `packages/ui` | Componentes compartidos |
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
