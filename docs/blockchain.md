# Stellar y contratos

## Estado del repositorio inicial

La integración implementada consulta la salud e identidad de Stellar Testnet mediante
`getHealth` y `getNetwork`. El adaptador Freighter pide permiso para leer una dirección
pública y comprueba su checksum y la passphrase de Testnet. No firma transacciones.
Compartir una dirección no demuestra posesión autenticada ante el servidor:
un futuro login requiere un desafío firmado y verificado, con expiración y protección
contra replay. No se implementa ni se declara conformidad con SEP-10 en esta entrega.
La red y la cuenta se deberán volver a validar antes de cualquier firma futura,
porque el usuario puede cambiarlas después de conectar.

El contrato `Cosmetics` (versión 3) registra cada pieza como un NFT de una clase
(librea, estela o emblema). Roles separados: `admin` crea clases y precios, `minter`
(servidor) otorga premios, `treasury` recibe ventas primarias. El constructor rechaza
que dos roles usen la misma dirección (`InvalidConfiguration`).

| Función | Uso |
| --- | --- |
| `create_class`, `set_price` | Admin: familia, ranura, transferibilidad, cupo, precio y URI |
| `buy` | Compra primaria firmada por el jugador; paga en el token configurado |
| `grant` | Premio del servidor; `reward_id` impide acuñar dos veces |
| `balance`, `owner_of`, `token_uri`, `transfer` | Interfaz NFT estándar |
| `approve`, `approve_for_all`, `transfer_from` | Base para un marketplace externo |
| `tokens_of`, `has_class`, `get_class` | Inventario del hangar y verificación de equipamiento |
| `propose_role`, `accept_role`, `role` | Cambio de rol en dos pasos: el admin propone y el candidato acepta con su firma; emite `RoleChanged` |

Mérito y veteranía son intransferibles y no pueden aprobarse, por lo que nunca se
listan en un mercado. Mérito no se vende. El marketplace y su comisión quedan en un
contrato separado. No hay contratos desplegados ni direcciones de despliegue publicadas.

Cada dueño tiene dos inventarios con tope de 200 piezas cada uno: uno para piezas
transferibles y otro para piezas ligadas (mérito y veteranía). Como `transfer` no pide
permiso al receptor, alguien podría llenar el inventario transferible de otra persona,
pero eso nunca bloquea un premio: los premios ligados van a su propio inventario.

Validación inicial (22 de septiembre de 2026): un test de host Soroban y build
WASM ejecutados en WSL/Linux; diez tests TypeScript y typecheck correctos;
sonda pública con ledger 4814567, protocolo 28 y passphrase de Testnet.
La aprobación real de Freighter en un navegador y la ejecución nativa en macOS
quedan pendientes de validación por el equipo.

## Entorno reproducible

Versiones fijadas: Rust `1.98.1`, Soroban SDK `28.0.0`, Stellar CLI `28.0.0`.
El archivo `contracts/Cargo.lock` fija las dependencias Rust transitivas.
El target es `wasm32v1-none`. El SDK 28 requiere compilar el contrato con
`stellar contract build`; el wrapper utiliza ese comando con `--locked`.

En Windows, instalar WSL2 y una distribución Linux. Ejecutar instalación y comandos
Rust/Soroban dentro de WSL. En Linux y macOS se ejecutan directamente en la terminal.
Se necesita un compilador C del sistema para dependencias Rust; en Ubuntu:

```bash
sudo apt update
sudo apt install build-essential pkg-config libssl-dev
```

Instalar Rust siguiendo [rustup](https://rustup.rs/) y después, en WSL/Linux/macOS:

```bash
rustup toolchain install 1.98.1 --profile minimal --component rustfmt,clippy --target wasm32v1-none
cargo +1.98.1 install --locked stellar-cli --version 28.0.0
```

Desde la raíz del repositorio, con Node y pnpm instalados:

```bash
node scripts/contracts.mjs fmt
node scripts/contracts.mjs check
node scripts/contracts.mjs test
node scripts/contracts.mjs build
pnpm --filter @impulso/chain probe
```

En Windows el wrapper llama a `wsl.exe` con la distribución predeterminada y convierte
la ubicación del checkout con `wslpath`. Para elegir otra distribución desde PowerShell:

```powershell
$env:IMPULSO_WSL_DISTRO = "Ubuntu-24.04"
node scripts/contracts.mjs test
```

No hay rutas de equipo codificadas. El resultado WASM queda en
`contracts/target/wasm32v1-none/release/impulso_cosmetics.wasm`.
Si trabajas exclusivamente dentro de WSL, ejecutar pnpm y Rust desde ese entorno
evita mezclar instalaciones Node de Windows y Linux.

## Red y límites

| Configuración | Valor |
| --- | --- |
| Red permitida por el cliente inicial | Stellar Testnet |
| Passphrase | `Test SDF Network ; September 2015` |
| RPC | `https://soroban-testnet.stellar.org` |
| Horizon | `https://horizon-testnet.stellar.org` |
| Explorer | `https://stellar.expert/explorer/testnet` |

La sonda es una consulta real de solo lectura y tiene timeout de 10 segundos.
Los tests TypeScript usan dobles deterministas; no prueban disponibilidad pública.
La conexión real de la extensión requiere la intervención del usuario en su navegador.
Testnet puede reiniciarse y borrar cuentas, contratos e inventarios. El juego de
práctica debe seguir disponible si la wallet o la red están caídas.

## Decisión D05 (25 de septiembre de 2026)

Tomada por Orlando, responsable de D05.

| Tema | Decisión |
| --- | --- |
| Matriz de versiones | Protocolo 28 (testnet desde el 27 de agosto y mainnet desde el 16 de septiembre): Rust 1.98.1, soroban-sdk 28.0.0, stellar-cli 28.0.0, `@stellar/stellar-sdk` 17.1.0 y `@stellar/freighter-api` 6.0.1. Esta combinación compila y pasa CI. stellar-core 29 ya corre en la red: antes de una votación del protocolo 29, se actualizan los SDK en una rama y se repite CI. |
| Permisos de emisión | `admin` configura clases y precios. `minter` es la cuenta del servidor y la única que otorga premios. `treasury` solo recibe pagos. Las tres direcciones son distintas y cada cambio de rol se hace en dos pasos (`propose_role` y `accept_role`). La clave del `minter` vive solo en el servidor, como variable de entorno; nunca en el cliente ni en el repositorio. |
| Autenticación | SEP-10 completo. El servidor de juego publica `/.well-known/stellar.toml` con `WEB_AUTH_ENDPOINT` y `SIGNING_KEY`, y genera el desafío con `buildChallengeTx` del módulo `webauth` de `@stellar/stellar-sdk`. El jugador firma con Freighter (`signTransaction`). El servidor valida con `readChallengeTx` y `verifyChallengeTxSigners` y entrega un token de sesión ligado a esa dirección. La clave que firma los desafíos es propia y distinta de los tres roles del contrato. Una dirección conectada sin desafío firmado nunca es una identidad. Se implementa en la tarjeta O07 (3–5 oct). |
| Token de pago de prueba | XLM nativo, a través de su Stellar Asset Contract en testnet (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`). No requiere trustline y los fondos salen de Friendbot. Los precios se expresan en stroops (1 XLM = 10.000.000). |
| Despliegue | Cosméticos v4 y mercado desplegados en testnet el 9 de octubre de 2026 (el v3 del 29 de septiembre queda en desuso). Ver [Registro de despliegue](#registro-de-despliegue). |

## Registro de despliegue

| Campo | Cosméticos | Mercado |
| --- | --- | --- |
| Red | Stellar Testnet (`Test SDF Network ; September 2015`) | Igual |
| Contrato | [`CBKQMFOSP2RFRXL6KQH3VTLVOKJCUU6K3XJLRNEUJHJJM7AZT2JSLA6L`](https://stellar.expert/explorer/testnet/contract/CBKQMFOSP2RFRXL6KQH3VTLVOKJCUU6K3XJLRNEUJHJJM7AZT2JSLA6L) | [`CDB77C2EVQFHI6DNOK7Q7FZNJ6OMRRONMS5EI5BLIKV3UMENYE7NQ53C`](https://stellar.expert/explorer/testnet/contract/CDB77C2EVQFHI6DNOK7Q7FZNJ6OMRRONMS5EI5BLIKV3UMENYE7NQ53C) |
| Versión | `version() = 4` | `version() = 1` |
| WASM SHA-256 | `f049f33ff6c800f7263260b2ef9399aecff490e1c90e658bd4a771d15f8603a4` (14.294 bytes) | `d753d8b942aec25dba3e21caf05fa89a489a0bc309fcec0289cfe8e5d2fd75b0` (10.849 bytes) |
| Commit | `6a18b1e` | `6a18b1e` |
| Fecha | 9 de octubre de 2026 | 9 de octubre de 2026 |
| Token de pago | XLM nativo vía SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Igual; comisión de 500 puntos básicos (5 %) para el `treasury` |

Los dos hashes se reproducen compilando la rama con `stellar contract build --locked`.

Catálogo creado en el despliegue (metadatos en `apps/web/public/cosmetics/`). Cada categoría
del hangar conserva piezas gratis fuera de la cadena, así nadie necesita wallet para jugar:

| Clase | Pieza | Ranura | Familia | Precio |
| --- | --- | --- | --- | --- |
| 1 | Aurora Andina | Librea | Colección | 5 XLM |
| 2 | Pulso violeta | Estela | Colección | 3 XLM |
| 3 | Primera Victoria | Emblema | Mérito | Solo premio |
| 4 | Exploración | Emblema | Mérito | Solo premio |
| 5 | Voz de Analista | Comentarista | Colección | 4 XLM |
| 6 | Gravity's Final Path | Música | Colección | 2 XLM |

Prueba en red (`--smoke`): una cuenta de jugador compró Pulso violeta, el minter otorgó
Primera Victoria, un segundo `grant` con el mismo `reward_id` fue rechazado, y el jugador
vendió Pulso violeta a otra cuenta en el mercado por 2 XLM: el `treasury` recibió exactamente
0,1 XLM (5 %) y la pieza cambió de dueño en la misma transacción. Publicar un anuncio cuesta
unos 0,26 XLM de comisión de red (incluye el alquiler del almacenamiento). El registro completo,
con las direcciones públicas de los roles, está en `contracts/deployments/testnet.json`.

Redespliegue (por ejemplo, tras un reinicio de testnet), con Stellar CLI 28.0.0:

```bash
pnpm contracts:build
pnpm contracts:deploy:testnet -- --smoke
```

El script crea o reutiliza las identidades `impulso-admin`, `impulso-minter`,
`impulso-treasury`, `impulso-player` e `impulso-buyer` en el almacén de claves local de
Stellar CLI (fondeadas con Friendbot), despliega los dos contratos, crea las seis clases y
reescribe el registro. Reintenta los cortes de red de testnet, nunca los errores del contrato.
Las claves secretas nunca se escriben en el repositorio. El servidor recibe la clave del
`minter` como variable de entorno (`STELLAR_MINTER_SECRET`).

## Mercado entre jugadores

`contracts/marketplace` no custodia: una pieza listada sigue en la wallet del vendedor hasta
que se vende. `list` registra el precio y, en la misma transacción y con una sola firma,
aprueba al mercado en el contrato de cosméticos hasta un ledger límite (máximo 30 días; el
juego usa 7). `buy` es atómico: cobra al comprador, paga al vendedor el precio menos la
comisión y a la tesorería la comisión (redondeada a favor del vendedor), y mueve la pieza con
`transfer_from`. `max_price` protege al comprador si el precio cambió. `cancel` retira el
anuncio y la aprobación. Las piezas de mérito no se pueden listar porque el contrato de
cosméticos no permite aprobarlas. Los errores del mercado empiezan en 101 para no confundirse
con los de cosméticos (1-16). Detalle, decisiones y plan de prueba con Freighter:
[blockchain-marketplace.md](blockchain-marketplace.md).

## Wallet vinculada a la cuenta

La identidad del juego sigue siendo la cuenta (correo y contraseña). La wallet se vincula a la
cuenta con un desafío SEP-10 (`buildChallengeTx`, `readChallengeTx`, `verifyChallengeTxSigners`):
el servidor lo firma con una clave propia, Freighter lo firma y el servidor lo verifica. Un
desafío vence a los cinco minutos, vale una vez y solo para la cuenta que lo pidió; una wallet
no puede estar vinculada a dos cuentas. Firmar el desafío no mueve fondos. Rutas:
`POST /wallet/challenge`, `POST /wallet/link`, `DELETE /wallet`. Esto reemplaza el inicio de
sesión por wallet previsto en D05: la cuenta ya existía y la wallet solo dice a dónde van los
premios y qué piezas puede equipar el jugador.

## Premios en la cadena

Al guardar una campaña con emblemas nuevos, y al vincular una wallet, el servidor revisa los
méritos de la cuenta y otorga con el `minter` los que la wallet todavía no tiene. El
`reward_id` es `sha256("impulso:<contrato>:<cuenta>:<mérito>")`, fijo por cuenta y mérito, así
que un reintento o un reinicio nunca paga dos veces. Las concesiones van en fila (una sola
cuenta firma). Sin `STELLAR_MINTER_SECRET` los premios en la cadena se apagan y el juego sigue.

## Cliente TypeScript

`@impulso/chain` expone los contratos desplegados para el cliente y el servidor:

| Función | Uso |
| --- | --- |
| `ownedCosmetics(dirección)` | Piezas de una dirección, para el hangar. Solo lectura, sin wallet |
| `ownsCosmeticClass(dirección, clase)` | Verificación de equipamiento (`has_class`) |
| `buyCosmetic(dirección, clase)` | Compra primaria firmada en Freighter |
| `marketListings()`, `listCosmetic`, `buyListing`, `cancelListing` | Mercado: leer anuncios, publicar, comprar y cancelar |
| `xlmBalance(dirección)` | Saldo de XLM en testnet |
| `createWalletChallenge`, `signWalletChallenge`, `verifyWalletChallenge` | Vínculo SEP-10 (servidor, cliente, servidor) |
| `grantReward`, `meritRewardId`, `isRewardClaimed` | Premios firmados por el `minter` (solo servidor) |
| `COSMETICS_TESTNET`, `MARKETPLACE_TESTNET`, `DEMO_COSMETICS` | Ids y catálogo, verificados contra `contracts/deployments/testnet.json` en tests |

Las lecturas se hacen por simulación y nunca firman ni envían. Los rechazos de un contrato
llegan como `ChainError("CONTRACT_REJECTED")` con el número de error y una frase para el jugador.
`signWalletChallenge` comprueba que lo que pide firmar sea un desafío de acceso y nunca un pago.

## Plan del contrato de cosméticos para el MVP

El MVP debe permitir crear clases, comprar, otorgar, consultar propiedad y
transferir cosméticos de las colecciones que lo permitan. Estas funciones son
obligatorias en el siguiente contrato del MVP; ninguna está implementada en el
bootstrap actual. Antes de programar esas escrituras, el equipo debe aprobar la
interfaz, el activo de pago y los parámetros económicos. Esa revisión corresponde
a la próxima etapa y no modifica el alcance autorizado de esta base inicial.

Los cosméticos nunca alteran movimiento, daño, puntuación, matchmaking ni
recompensas competitivas. No se representarán como inversión ni como promesa de
rentabilidad. La propiedad verificable y la presentación visual deben permanecer
separadas del resultado de las partidas.

### Modelo de clase

Cada clase identifica un tipo de cosmético y pertenece a una colección.
El esquema deberá incluir, como mínimo:

| Campo | Regla prevista |
| --- | --- |
| Identificador y colección | ID único, estable y de tamaño acotado; la colección determina el contexto del catálogo. |
| Slot o slots compatibles | Valores del catálogo visual compartido con el juego; se rechazan combinaciones incompatibles. |
| Metadatos | Nombre, versión, URI y hash de contenido; no almacenar imágenes en el ledger. |
| Procedencia | Origen verificable del cosmético, modalidad de adquisición permitida y referencia de campaña, logro o catálogo cuando corresponda; cada emisión conserva su recibo y emisor. |
| Transferibilidad | Política explícita de la clase y su colección; las restricciones deben comprobarse en cada transferencia. La regla inicial queda fijada al crear la clase. |
| Cupo | Máximo de unidades y contador emitido, compartido por compras y otorgamientos; máximo positivo e inmutable. |
| Precio | Importe entero en unidades mínimas, activo de pago permitido y versión del precio para clases comprables. Una clase no comprable se marca explícitamente. |
| Disponibilidad | Compra y otorgamiento habilitados según la procedencia y política de la clase; el cliente no decide permisos. |

Cada instancia emitida tiene ID único, clase, propietario y referencia de
procedencia. La política final de unicidad por jugador y las reglas de equipamiento
por slot se acuerdan junto al catálogo antes de publicar la interfaz.

### Interfaz y responsabilidades previstas

| Operación del MVP | Autorización y resultado |
| --- | --- |
| Constructor | Recibe administrador, emisor y tesorería distintos; valida la configuración una sola vez. Un rol de pausa puede añadirse si el equipo adopta esa capacidad. |
| Crear clase | Administrador con `require_auth`; registra colección, slots, procedencia, transferibilidad, cupo, metadatos y precio. |
| Comprar | Comprador con `require_auth`; valida clase comprable, cotización, activo, cupo y recibo. Ejecuta pago a la tesorería almacenada y emisión de forma atómica. |
| Otorgar | Emisor con `require_auth`; valida la procedencia y el permiso de otorgamiento, destinatario, cupo y recibo único. No habilita emisión arbitraria desde el navegador. |
| Consultar | Lecturas públicas acotadas por clase, ítem o propietario; devuelven metadatos, supply, propiedad y procedencia sin recorrer todo el estado. |
| Transferir | Propietario actual con `require_auth`; exige clase y colección transferibles, destinatario válido y propiedad vigente. Cambia propietario sin alterar cupo ni emitir otra unidad. |
| Actualizar precio | Administrador con `require_auth`; crea una nueva versión sin modificar una cotización ya aceptada. La compra valida expresamente la versión y su vigencia. |
| Rotar un rol | Administrador actual y aceptación del nuevo titular; emite un evento auditable. La dirección de tesorería no se toma de parámetros libres de la compra. |
| Pausar escrituras, opcional | Si se implementa, el rol autorizado usa `require_auth`; las lecturas siguen disponibles y la política de reanudación queda definida. |

La tesorería recibe pagos y no obtiene por ello permisos para crear clases u
otorgar cosméticos. El administrador gestiona la configuración y el emisor
autoriza otorgamientos; no habrá una llave universal con todos los permisos.
Las operaciones comprueban los roles almacenados. Configuraciones inválidas y
roles incompatibles se rechazan en el constructor. El servidor de juego no
custodiará semillas.

El equipamiento puede mantenerse fuera de cadena si el servidor verifica propiedad
y compatibilidad de slots. El MVP no necesita un marketplace para permitir
transferencias directas. Regalías y actualización de código quedan fuera de esta
primera interfaz hasta acordar gobernanza y migración.

### Estado, eventos, errores e invariantes

Estado propuesto: configuración y roles en instancia; clases, propietarios,
contadores de cupo y recibos consumidos en almacenamiento persistente.
Usar claves por clase, ítem y recibo, sin vectores que crezcan sin límite.
Las consultas por propietario deberán usar paginación o un índice fuera de cadena
reconstruible desde eventos. IDs y tamaños de metadatos tendrán límites explícitos.

Eventos candidatos: clase creada, precio versionado, compra completada,
cosmético otorgado, cosmético transferido y rol rotado. Si existe pausa, publicar
sus cambios. Compra y otorgamiento registran ID de operación, clase, ítem,
destinatario y procedencia; la compra incluye activo, importe y versión de precio.

Errores tipados candidatos con discriminantes estables:
`Unauthorized`, `Paused`, `UnknownClass`, `UnknownItem`,
`SupplyExhausted`, `DuplicateReceipt`, `InvalidMetadata`, `InvalidSlot`,
`InvalidProvenance`, `InvalidRecipient`, `InvalidConfiguration`,
`NotPurchasable`, `GrantNotAllowed`, `NonTransferable`, `PaymentMismatch`,
`ExpiredQuote`, `PriceVersionMismatch`, `ArithmeticOverflow`.
La política de códigos se versiona antes de publicar el ABI; los clientes no
deben inferir estados desde strings.

Invariantes que deberán probarse:

- Compras y otorgamientos comparten cupo; el total emitido nunca supera el máximo.
- Cada suma es comprobada y cada ítem tiene un solo propietario.
- Cada recibo produce como máximo una emisión y conserva su procedencia verificable.
- Las transferencias respetan la política de clase y colección sin aumentar el supply.
- El precio cobrado corresponde al activo, importe y versión autorizados por el comprador.
- Un cosmético no modifica ningún atributo competitivo del juego.
- Ninguna operación permite cambiar roles sin autorización ni saltarse una pausa existente.
- Un error de autorización, pago, destinatario o metadatos no deja escrituras parciales.

### Idempotencia, TTL y pagos

Recibos de compra y otorgamiento: identificador derivado de una operación única
con dominio de red y contrato, vinculado a destinatario, clase y modalidad.
Duplicar una solicitud produce el mismo resultado verificable o un error tipado,
nunca otra emisión ni otro cargo. Un recibo consumido debe ser persistente;
si se archiva, su ausencia no puede interpretarse como permiso para reutilizarlo.
La política de restauración se prueba junto al replay.

Antes de implementar, fijar TTL mínimo, umbral y extensión para instancia, código,
clases, propiedad y recibos; determinar quién paga rent/restauración y cómo se
alerta. No usar entradas temporales como única evidencia de propiedad o antirreplay.
Los costos de recursos y rent se simulan y miden en Testnet antes de comprometer
un presupuesto. No hay costos operativos del contrato económico medidos todavía.

La compra pertenece al MVP. Su implementación requiere fijar el activo permitido,
el contrato token validado para la red, importes enteros y decimales, tesorería,
precio versionado, caducidad de cotización y recibo único. El comprador autoriza
el débito exacto; pago y emisión son atómicos. No aceptar una confirmación del
navegador como prueba de pago ni usar números flotantes para importes.
El estándar SEP-41 aplica al activo fungible de pago; no se presume que el
cosmético implementa ese estándar. El estándar interoperable de coleccionables
se selecciona antes de implementar la interfaz de propiedad y transferencia.

### Ensayo, revisión y lanzamiento posteriores

1. Aprobar interfaz y esquema de clase, roles separados, activo y precios,
   cupos, procedencia, transferibilidad y política de TTL.
2. Implementar crear clase, comprar, otorgar, consultar y transferir según la
   política de cada colección. Añadir pruebas por permiso, límites, metadatos,
   slots, overflow y errores; casos de autorización real, sin depender únicamente
   de `mock_all_auths`.
3. Probar cupo compartido, compra duplicada, otorgamiento duplicado, propiedad
   tras transferencia, clases no transferibles, precio desactualizado, fallo de
   pago, atomicidad, expiración, restauración y replay tras restauración.
4. Probar rotación de roles y límites de recursos; si se adopta pausa, probar
   cada operación afectada y su recuperación.
5. Desplegar en Testnet con un alias local creado por la persona responsable,
   sin guardar semillas en archivos del proyecto. Registrar red, contrato, hash
   WASM, transacción, commit, fecha y enlace verificable.
6. Ejecutar integración con todos los roles y medir simulación, fees y rent.
   El historial de una Testnet reiniciada no cuenta como evidencia vigente.
7. Revisión independiente de control de acceso, dependencias, estado, economía
   y build reproducible; cerrar hallazgos graves y repetir el ensayo.
8. Mainnet requiere una decisión y firma humana separadas, presupuesto de costos,
   plan de recuperación y comunicación. No forma parte de este bootstrap.

Amenazas iniciales: cliente manipulado, cuenta de operador comprometida, replay,
red o RPC equivocado, metadatos sustituidos, expiración o archivo del estado,
cupo excedido y promesas de compra basadas en respuestas del cliente.
La separación de roles, validación de red, hashes y verificaciones de servidor
y contrato deben cubrirlas en la implementación futura.

## Referencias públicas

- [Redes oficiales de Stellar](https://developers.stellar.org/docs/networks)
- [RPC getHealth](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getHealth)
- [RPC getNetwork](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getNetwork)
- [Soroban SDK 28.0.0](https://docs.rs/soroban-sdk/28.0.0/soroban_sdk/)
- [Freighter API](https://docs.freighter.app/extension-freighter-api/connecting)
- [Autorización de contratos](https://developers.stellar.org/docs/build/guides/auth)
- [Almacenamiento de contratos](https://developers.stellar.org/docs/build/guides/storage)
- [Propuestas de estándares Stellar](https://github.com/stellar/stellar-protocol/tree/master/ecosystem)
