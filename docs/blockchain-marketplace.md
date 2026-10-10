# Cosméticos NFT, mercado y Freighter (Testnet)

Rama `feat/blockchain-marketplace`. Estado al 10 de octubre de 2026. Resumen técnico y registro de despliegue en
[blockchain.md](blockchain.md).

## Qué hay

| Parte | Estado |
|---|---|
| Contrato de cosméticos v4 (`contracts/cosmetics`): skins, estelas, emblemas, voces y música | Hecho, 20 tests, desplegado |
| Contrato de mercado (`contracts/marketplace`): listar, comprar, cancelar, 5 % a la tesorería, sin custodia | Hecho, 15 tests, desplegado |
| Despliegue en un comando con prueba real en la red (`pnpm contracts:deploy:testnet -- --smoke`) | Hecho |
| Cliente `@impulso/chain`: inventario, compra, mercado, saldo XLM, vínculo SEP-10, premios | Hecho, 29 tests |
| Servidor: vincular wallet a la cuenta con firma (SEP-10) y entregar emblemas de mérito | Hecho, tests de flujo y HTTP |
| Mercado (panel del centro de mando): wallet, Tienda, Anuncios y Mis piezas; el Hangar es el vestidor | Hecho; el flujo ya se probó con Freighter en producción el 9 de octubre |
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
| 3 | Primera victoria | Insignia | Premio: ganar una campaña multijugador 1v1 |
| 4 | Exploración | Insignia | Premio: terminar una campaña multijugador 1v1 |
| 5 | Voz de Analista | Voz | 4 XLM |
| 6 | Gravity's Final Path | Música | 2 XLM |

Cada categoría conserva piezas gratis (VELA en las voces, Iron Vanguard en la música, etc.), así
nadie necesita wallet para jugar. Voz de Comandante está bloqueada hasta tener sus grabaciones.
Ninguna pieza cambia el combate.

## Mercado y Hangar

Todas las transacciones viven en el **Mercado**, una tarjeta del centro de mando que se despliega
como el Hangar:

- **Tienda:** las cuatro piezas de colección con su imagen, precio y **Comprar**. Al tocar una
  pieza se abre su detalle: imagen grande, probador en la nave elegida (o **▶ Escuchar** para voces
  y música, hasta 20 segundos con la música del menú atenuada), precio, vendedor (la tienda
  oficial), **Comprar** y los anuncios de otros comandantes por esa pieza.
- **Anuncios:** los anuncios abiertos de todos, con **Comprar** o **Cancelar** si es tuyo.
- **Mis piezas:** las piezas de colección de tu wallet, para publicarlas con un precio o cancelar
  su anuncio. Los emblemas de mérito no se venden.

Una compra exitosa equipa la pieza al momento. Si la red no confirma a tiempo, el aviso dice
"Pendiente" y enlaza la transacción en stellar.expert; si el contrato la rechaza, explica el motivo
en el idioma elegido.

El **Hangar** es el vestidor: equipa lo que tienes y prueba lo que no. Una pieza NFT que no tienes
se muestra en la nave con la marca "Vista previa · no equipado" (Guardar nunca la guarda), con su
precio y **Ver en el Mercado →**, que abre el Mercado en esa pieza.

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
  contrato rechaza repetirlo. El servidor revisa al terminar cada campaña multijugador 1v1, al
  vincular una wallet y al arrancar con la clave del minter, así también llegan los emblemas ganados
  antes de vincular o mientras el servidor corría sin clave.
- **La clave del minter nunca está en un archivo:** el servidor la lee de `STELLAR_MINTER_SECRET`.
  El iniciador del escritorio la toma de la CLI de Stellar al arrancar. Sin ella, los premios en la
  blockchain se apagan y el juego sigue igual.

## Cómo probarlo mañana

1. **Freighter:** instalar la extensión, crear una wallet, elegir **Testnet** y crear **dos cuentas**
   (A vendedora, B compradora). Fondear las dos con Friendbot desde la extensión.
2. Abrir **"Iniciar version de prueba"** del escritorio y entrar a `http://127.0.0.1:5180` en el
   navegador que tiene Freighter. Corre en puertos propios (5180 y 2580).
3. Iniciar sesión con una cuenta de prueba (las de `.local/cuentas-prueba.md` siguen funcionando) y
   abrir el **Mercado** en el centro de mando.
4. **Conectar Freighter** con la cuenta A → firmar el desafío → la franja muestra la wallet y el saldo.
5. En **Tienda**, **Aurora andina** → **Comprar** → firmar → aparece "ya es tuya" y el enlace a
   stellar.expert. La pieza queda equipada (el Hangar la muestra como equipada).
6. En **Mis piezas**, escribir un precio (por ejemplo 2) → **Publicar en el mercado** → firmar.
7. Cerrar sesión, entrar con **otra cuenta del juego**, vincular la cuenta **B** de Freighter, ir a
   **Mercado › Anuncios** → **Comprar** → firmar. Volver a A: el saldo subió el precio menos el 5 %.
8. **Premio:** jugar una campaña multijugador 1v1 con una cuenta que tenga wallet vinculada y
   terminarla. Al terminar, la ventana del servidor muestra `[rewards] … minted…` y el emblema
   aparece en el Hangar al volver a abrirlo (lee la wallet cada vez que se abre).

Si algo falla, el Mercado muestra el motivo (cuenta equivocada en Freighter, red equivocada, sin
fondos, anuncio vencido, etc.).

## Pendiente

- Repetir los pasos 4 a 8 con Freighter real tras cada cambio del Mercado (no se puede automatizar
  sin la extensión; ver QA-24 y QA-26 a QA-31 en [la planilla de prueba](qa/playtest-2026-10-09.md)).
- Casco, estela e insignia solo se ven en el Hangar y en el probador del Mercado: la partida todavía
  no los dibuja, ni para ti ni para el rival. La voz y la música equipadas sí suenan en tus partidas.
- Los días que le quedan a un anuncio no se muestran todavía.
- Abrir el PR cuando Hans lo pida.
