# Backend de cuentas y salas multijugador

## Uso desde la aplicación

La pantalla de acceso tiene dos pestañas. **Crear cuenta** pide correo, contraseña
(de 8 a 128 caracteres) y alias de comandante, crea la cuenta y entra con ella como
el login. **Iniciar sesión** entra con una cuenta existente. Mientras se crea una
cuenta se oculta **Continuar como invitado**; vuelve al elegir **Iniciar sesión**.
Si el correo ya tiene cuenta, el alias no es válido o los datos no alcanzan, el
panel lo explica en español.

El alias queda guardado en la cuenta y la acompaña en cualquier dispositivo. Tras
el login o al recargar con la sesión abierta, el alias de la cuenta es el del
piloto, aunque en el campo haya otro. Si la cuenta todavía no tiene alias, por
ejemplo una creada sin él con `POST /auth/register`, el alias escrito en el campo
se guarda en la cuenta al iniciar sesión; si no se puede guardar, el login sigue
igual. Si el campo está vacío, se usa el nombre del correo. Por ahora la aplicación
no tiene una pantalla para cambiar un alias ya guardado; se cambia con
`PUT /auth/profile`.

Con `pnpm dev`, abrir dos navegadores o perfiles e iniciar sesión con cuentas distintas.
El primer comandante usa **Crear sala multijugador → Crear sala**; el segundo usa
**Unirse a sala**, pega el código y confirma su nombre de sala. El nombre admite
de 1 a 24 letras, números, espacios, guion, punto o guion bajo. Ambos pulsan **Estoy listo**.
El servidor inicia la cuenta regresiva de cinco segundos y abre la misma partida para ambos.

El multijugador es una campaña de tres sectores en el mapa Espiral con el mismo motor
del entrenamiento: base, Metal, producción, módulos, formaciones y aumentos. Cada sector
es una Escaramuza nueva que empieza con la elección de un aumento (plata, oro y
prismático); los aumentos elegidos se conservan en los sectores siguientes y gana la
campaña quien gana el tercero. Todas las órdenes se procesan en el servidor. La sesión
compartida conserva fase, mapa y vista al cambiar de pantalla. No crea una segunda sala
al abrir el juego.

Una recarga o caída de conexión recupera la plaza mediante el token de sala guardado
en `sessionStorage`. Las órdenes no se encolan durante la caída, pausa o cuenta
de reanudación. **Volver al mando** desde el lobby libera la plaza; **Salir de partida**
termina por abandono. El cierre de sesión abandona la sala y revoca el token de cuenta.
Si se sale mientras la conexión está caída, la interfaz vuelve al mando sin esperar
la red; el servidor libera la reserva al vencer la ventana de reconexión.

## Flujo para el frontend

1. Registrar con `POST /auth/register` o iniciar sesión con `POST /auth/login`, enviando JSON `{ "email": "ana@example.com", "password": "secret-1234" }` a la URL del servidor Colyseus. El registro acepta además `displayName`, el alias de comandante; si se omite, la cuenta se crea sin alias. Registro responde `201`, login `200`; ambos devuelven `{ token, expiresAt, user: { id, email, displayName } }`, con `displayName: null` si la cuenta no tiene alias. Un correo ya registrado responde `409` con `{ "error": "email_in_use" }`; un alias no válido, `400` con `{ "error": "invalid_display_name" }` sin crear la cuenta.
2. Conservar `token` durante la sesión del navegador. `GET /auth/me` (`{ user }`) y `POST /auth/logout` usan `Authorization: Bearer <token>`. El logout responde `204`; el frontend debe abandonar la sala activa antes de cerrar sesión.
   - `PUT /auth/profile` con la misma cabecera y JSON `{ "displayName": "Vega" }` cambia el alias y responde `200` con `{ user }`. Un alias no válido o ausente responde `400` (`invalid_display_name`); sin sesión válida, `401` (`authentication_required`). No consume el presupuesto de comprobaciones de contraseña.
   - `GET /auth/profile` devuelve la progresión de la cuenta ([progresión](progression.md)) y, junto a ella, `displayName`.
   - El alias admite de 1 a 24 letras (con tildes), números, espacios, guion, punto o guion bajo, después de quitar los espacios de los extremos. Es la misma regla del nombre de sala.
3. Crear una sala con `client.create('campaign', { protocolVersion: 3, name: alias, token })`. `map` es opcional y usa el catálogo `PLAYABLE_MAPS` compartido con el lobby de campaña/práctica: actualmente `'espiral'` (predeterminado). Sector 01 y el campo de batalla antiguo no se admiten como mapas de campaña multijugador. El `room.roomId` es el código privado de 12 caracteres hexadecimales que se muestra al anfitrión.
4. El segundo usuario inicia sesión con otra cuenta y usa `client.joinById(code.trim().toUpperCase(), { protocolVersion: 3, name: alias, token })`. El código admite dos jugadores y deja de aceptar nuevos participantes cuando empieza la campaña.
5. Cada cliente recibe `phase` con su `playerId`, el estado de ambos asientos y el mapa elegido en `renderMap`. El asiento propio no se deduce del alias. Cada cliente envía `ready` con `{ protocolVersion: 3, body: {} }`; cuando ambos están listos comienza la cuenta regresiva. Desde ahí se usa el protocolo de [campaña](protocol.md) para fases, vistas, aumentos, órdenes y reconexión.

`campaign` rechaza invitados (`authentication_required`) y la misma cuenta no puede ocupar ambos asientos (`already_in_room`). Un abandono en lobby libera la plaza; un abandono durante la campaña concede la victoria al rival conectado. Una caída reserva el asiento para reconexión. `training` conserva su acceso actual para el modo de práctica contra IA.

## Almacenamiento y despliegue

Con `DATABASE_URL` (Railway; ver [despliegue](deployment.md)), las cuentas viven en Postgres: la tabla `accounts` guarda correo, hash `scrypt` con salt aleatorio, alias de comandante (`display_name`) y XP, y las tablas de [progresión](progression.md) guardan logros y premios. `pnpm --filter @impulso/server start` aplica las migraciones pendientes (`prisma migrate deploy`) antes de abrir el servidor. Si la base está vacía y existe el archivo de cuentas anterior, lo importa una vez con su progreso y su alias. `/health` informa `storage: "postgres"`. El servidor carga todas las cuentas al arrancar y escribe cada cambio en la base.

Sin `DATABASE_URL`, las contraseñas se guardan como hashes `scrypt` con salt aleatorio en `AUTH_DATA_FILE` (por defecto `./data/users.json`, ignorado por Git), junto al alias de comandante de cada cuenta. Cada escritura se vuelca a disco en un archivo temporal que reemplaza al anterior de forma atómica, y la versión previa queda como `users.json.bak`. Si el archivo principal no se puede leer al arrancar, el servidor carga el respaldo; si ninguno se puede leer, no arranca, en lugar de empezar sin cuentas y pisarlas. Si una escritura falla durante una partida, la sala sigue y el resultado llega con `saveFailed: true`. Login y registro comparten un presupuesto de 20 comprobaciones de contraseña, que se recupera a 2 por segundo; al agotarse responden `429` con `{ "error": "rate_limited" }` y `Retry-After: 1`. El presupuesto es global, no por IP. El correo se normaliza a minúsculas. La contraseña debe medir entre 8 y 128 caracteres. Los tokens aleatorios duran 24 horas y viven en memoria: reiniciar el servidor obliga a iniciar sesión otra vez, aunque las cuentas sobreviven en la base o en el archivo. Sin base de datos, configurar `AUTH_DATA_FILE` en un volumen persistente; en ambos casos, usar HTTPS/WSS en el acceso público. La sala y las sesiones viven en un solo proceso para esta demo de hasta 20 testers.

No hay billetera obligatoria, fondos XLM, compras ni contratos en este flujo.

## Pruebas en paralelo con el servidor de desarrollo

Los lobbies de campaña/práctica y multijugador leen `PLAYABLE_MAPS` de `packages/input/src/playable-maps.ts`. El servidor valida la misma lista y anuncia el mapa elegido a ambos jugadores; el invitado y la reconexión conservan esa elección. Los tres sectores usan `createMatchWorld`, con el terreno y las mecánicas habituales del mapa.

Para ejecutar los E2E sin ocupar los puertos de otro desarrollador:

```powershell
$env:IMPULSO_E2E_SERVER_PORT='2587'
$env:IMPULSO_E2E_WEB_PORT='5187'
$env:CI='1'
pnpm test:e2e
```

Si no se especifican puertos, siguen siendo 2567 y 5173. Las peticiones de prueba y los clientes Colyseus usan el servidor de esa corrida, con cuentas en un archivo temporal. `CI=1` obliga a abrir servidores propios en lugar de reutilizar uno activo.
