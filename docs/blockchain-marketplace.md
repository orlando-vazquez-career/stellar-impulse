# Cosméticos NFT, mercado y Freighter (Testnet)

Rama `feat/blockchain-marketplace`. Estado al 8 de octubre de 2026, noche.

## Qué hay

| Parte | Estado |
|---|---|
| Contrato de cosméticos v4 (`contracts/cosmetics`): skins, estelas, emblemas, voces y música | Hecho, 20 tests, desplegado |
| Contrato de mercado (`contracts/marketplace`): listar, comprar, cancelar, 5 % a la tesorería, sin custodia | Hecho, 15 tests, desplegado |
| Despliegue en un comando con prueba real en la red (`pnpm contracts:deploy:testnet -- --smoke`) | Hecho |
| Cliente `@impulso/chain`: inventario, compra, mercado, saldo XLM, vínculo SEP-10, premios | Hecho, 29 tests |
| Servidor: vincular wallet a la cuenta con firma (SEP-10) y entregar emblemas de mérito | Hecho, tests de flujo y HTTP |
| Hangar: wallet, piezas NFT, comprar, vender, cancelar y vista Mercado | Hecho, falta probar con Freighter real |
| `pnpm check` | 682 tests en verde y build |

### Contratos en Testnet

| Contrato | ID |
|---|---|
| Cosméticos v4 | `CBKQMFOSP2RFRXL6KQH3VTLVOKJCUU6K3XJLRNEUJHJJM7AZT2JSLA6L` |
| Mercado | `CDB77C2EVQFHI6DNOK7Q7FZNJ6OMRRONMS5EI5BLIKV3UMENYE7NQ53C` |

Registro completo (hashes, transacciones, prueba de humo): `contracts/deployments/testnet.json`.
La prueba de humo en la red vendió una estela por 2 XLM entre dos cuentas: la tesorería cobró
exactamente 0,1 XLM (5 %) y la pieza cambió de dueño. Listar cuesta unos 0,26 XLM de red.

### Catálogo en la blockchain

| Clase | Pieza | Categoría del hangar | Precio |
|---|---|---|---|
| 1 | Aurora andina | Casco | 5 XLM |
| 2 | Pulso violeta | Estela | 3 XLM |
| 3 | Primera victoria | Insignia | Premio: ganar una campaña 1v1 |
| 4 | Exploración | Insignia | Premio: terminar una campaña 1v1 |
| 5 | Voz de Analista | Voz | 4 XLM |
| 6 | Gravity's Final Path | Música | 2 XLM |

Cada categoría conserva piezas gratis (Voz de Comandante, Iron Vanguard, etc.), así nadie necesita
wallet para jugar. Ninguna pieza cambia el combate.

## Decisiones

- **Mercado sin custodia:** la pieza queda en la wallet del vendedor hasta la venta. Listar es
  una sola firma: el mercado se autoriza en el contrato de cosméticos dentro de la misma
  transacción. Comprar es atómico: paga al vendedor (95 %), a la tesorería (5 %) y mueve la pieza.
- **Errores numerados aparte:** cosméticos usa 1-16 y mercado 101-111, para que el juego sepa
  qué contrato rechazó y lo explique en una frase.
- **Vincular la wallet prueba propiedad (SEP-10):** el servidor entrega un desafío que nunca puede
  ejecutarse (no mueve fondos), Freighter lo firma y el servidor verifica. Un desafío vale cinco
  minutos, una vez, y solo para la cuenta que lo pidió. Una wallet no puede estar en dos cuentas.
- **Premios sin estado extra:** cada emblema tiene un identificador fijo por cuenta y mérito; el
  contrato rechaza repetirlo. El servidor revisa al terminar cada campaña y al vincular una wallet,
  así también llegan los emblemas ganados antes de vincular.
- **La clave del minter nunca está en un archivo:** el servidor la lee de `STELLAR_MINTER_SECRET`.
  El iniciador del escritorio la toma de la CLI de Stellar al arrancar. Sin ella, los premios en la
  blockchain se apagan y el juego sigue igual.

## Cómo probarlo mañana

1. **Freighter:** instalar la extensión, crear una wallet, elegir **Testnet** y crear **dos cuentas**
   (A vendedora, B compradora). Fondear las dos con Friendbot desde la extensión.
2. Abrir **"Iniciar version de prueba"** del escritorio y entrar a `http://127.0.0.1:5180` en el
   navegador que tiene Freighter. Corre en puertos propios (5180 y 2580).
3. Iniciar sesión con una cuenta de prueba (las de `.local/cuentas-prueba.md` siguen funcionando) e
   ir al **Hangar**.
4. **Conectar Freighter** con la cuenta A → firmar el desafío → la franja muestra la wallet y el saldo.
5. Elegir **Aurora andina** → **Comprar · 5 XLM** → firmar → aparece "ya es tuya" y el enlace a
   stellar.expert. Equiparla y guardar.
6. Con la pieza elegida, escribir un precio (por ejemplo 2) → **Publicar en el mercado** → firmar.
7. Cerrar sesión, entrar con **otra cuenta del juego**, vincular la cuenta **B** de Freighter, ir a
   **Mercado** → **Comprar** → firmar. Volver a A: el saldo subió el precio menos el 5 %.
8. **Premio:** jugar una campaña 1v1 con una cuenta que tenga wallet vinculada y ganarla. Al terminar,
   la ventana del servidor muestra `[rewards] primera-victoria minted…` y el emblema aparece en el
   hangar tras pulsar **Actualizar**.

Si algo falla, el hangar muestra el motivo (cuenta equivocada en Freighter, red equivocada, sin
fondos, anuncio vencido, etc.).

## Pendiente

- Probar los pasos 4 a 8 con Freighter real (no se puede automatizar sin la extensión).
- Que el rival vea la librea equipada (hoy cada uno ve sus propios cosméticos).
- Actualizar `docs/blockchain.md` con los IDs nuevos y unificar con este documento.
- Abrir el PR cuando Hans lo pida.
