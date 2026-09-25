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
