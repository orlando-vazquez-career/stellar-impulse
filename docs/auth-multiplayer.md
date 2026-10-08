# Backend de cuentas y salas multijugador

## Uso desde la aplicación

Con `pnpm dev`, abrir dos navegadores o perfiles e iniciar sesión con cuentas distintas.
El primer comandante usa **Crear sala multijugador → Crear sala**; el segundo usa
**Unirse a sala**, pega el código y confirma su nombre de sala. El nombre admite
de 1 a 24 letras, números, espacios, guion, punto o guion bajo. Ambos pulsan **Estoy listo**.
El servidor inicia la cuenta regresiva de cinco segundos y abre la misma partida para ambos.

El multijugador usa Sector 01 (29 × 29) y una flota fija de un Interceptor por jugador.
Mover, atacar y detener se procesan en el servidor; la producción sigue disponible
en entrenamiento. La sesión compartida conserva fase, mapa y vista al cambiar de
pantalla. No crea una segunda sala al abrir el juego.

Una recarga o caída de conexión recupera la plaza mediante el token de sala guardado
en `sessionStorage`. Las órdenes no se encolan durante la caída, pausa o cuenta
de reanudación. **Volver al mando** desde el lobby libera la plaza; **Salir de partida**
termina por abandono. El cierre de sesión abandona la sala y revoca el token de cuenta.
Si se sale mientras la conexión está caída, la interfaz vuelve al mando sin esperar
la red; el servidor libera la reserva al vencer la ventana de reconexión.

## Flujo para el frontend

1. Registrar con `POST /auth/register` o iniciar sesión con `POST /auth/login`, enviando JSON `{ "email": "ana@example.com", "password": "secret-1234" }` a la URL del servidor Colyseus. Registro responde `201`, login `200`; ambos devuelven `{ token, expiresAt, user: { id, email } }`.
2. Conservar `token` durante la sesión del navegador. `GET /auth/me` y `POST /auth/logout` usan `Authorization: Bearer <token>`. El logout responde `204`; el frontend debe abandonar la sala activa antes de cerrar sesión.
3. Crear una sala con `client.create('campaign', { protocolVersion: 2, name: alias, token, map: 'sector-01' })`. Esta opción selecciona el mapa de catálogo de 29 × 29 para la interfaz; al omitirla se conserva el mapa histórico de 72 × 72. El `room.roomId` es el código privado de 12 caracteres hexadecimales que se muestra al anfitrión.
4. El segundo usuario inicia sesión con otra cuenta y usa `client.joinById(code.trim().toUpperCase(), { protocolVersion: 2, name: alias, token })`. El código admite dos jugadores y deja de aceptar nuevos participantes cuando empieza la campaña.
5. Cada cliente recibe `phase` con su `playerId`, el estado de ambos asientos y `renderMap: 'sector-01'` para la sala integrada. El asiento propio no se deduce del alias. Cada cliente envía `ready` con `{ protocolVersion: 2, body: {} }`; cuando ambos están listos comienza la cuenta regresiva. Desde ahí se usa el protocolo de [campaña](protocol.md) para fases, vistas, órdenes y reconexión.

`campaign` rechaza invitados (`authentication_required`) y la misma cuenta no puede ocupar ambos asientos (`already_in_room`). Un abandono en lobby libera la plaza; un abandono durante la campaña concede la victoria al rival conectado. Una caída reserva el asiento para reconexión. `training` conserva su acceso actual para el modo de práctica contra IA.

## Almacenamiento y despliegue

Las contraseñas se guardan como hashes `scrypt` con salt aleatorio en `AUTH_DATA_FILE` (por defecto `./data/users.json`, ignorado por Git). Cada escritura se vuelca a disco en un archivo temporal que reemplaza al anterior de forma atómica, y la versión previa queda como `users.json.bak`. Si el archivo principal no se puede leer al arrancar, el servidor carga el respaldo; si ninguno se puede leer, no arranca, en lugar de empezar sin cuentas y pisarlas. Si una escritura falla durante una partida, la sala sigue y el resultado llega con `saveFailed: true`. Login y registro comparten un presupuesto de 20 comprobaciones de contraseña, que se recupera a 2 por segundo; al agotarse responden `429` con `{ "error": "rate_limited" }` y `Retry-After: 1`. El presupuesto es global, no por IP. El correo se normaliza a minúsculas. La contraseña debe medir entre 8 y 128 caracteres. Los tokens aleatorios duran 24 horas y viven en memoria: reiniciar el servidor obliga a iniciar sesión otra vez, aunque las cuentas sobreviven si el archivo persiste. Para GCP o Railway, configurar `AUTH_DATA_FILE` en un volumen persistente y usar HTTPS/WSS en el acceso público. La sala y las sesiones viven en un solo proceso para esta demo de hasta 20 testers.

No hay billetera obligatoria, fondos XLM, compras ni contratos en este flujo.
