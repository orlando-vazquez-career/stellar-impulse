# Backend de cuentas y salas multijugador

## Flujo para el frontend

1. Registrar con `POST /auth/register` o iniciar sesión con `POST /auth/login`, enviando JSON `{ "email": "ana@example.com", "password": "secret-1234" }` a la URL del servidor Colyseus. Registro responde `201`, login `200`; ambos devuelven `{ token, expiresAt, user: { id, email } }`.
2. Conservar `token` durante la sesión del navegador. `GET /auth/me` y `POST /auth/logout` usan `Authorization: Bearer <token>`. El logout responde `204`; el frontend debe abandonar la sala activa antes de cerrar sesión.
3. Crear una sala con `client.create('campaign', { protocolVersion: 2, name: alias, token })`. El `room.roomId` es el código privado de 12 caracteres hexadecimales que se muestra al anfitrión.
4. El segundo usuario inicia sesión con otra cuenta y usa `client.joinById(code.trim().toUpperCase(), { protocolVersion: 2, name: alias, token })`. El código admite dos jugadores y deja de aceptar nuevos participantes cuando empieza la campaña.
5. Cada cliente envía `ready` con `{ protocolVersion: 2, body: {} }`. Desde ahí se usa el protocolo de [campaña](protocol.md) para fases, vistas, órdenes y reconexión.

`campaign` rechaza invitados (`authentication_required`) y la misma cuenta no puede ocupar ambos asientos (`already_in_room`). `training` conserva su acceso actual para el modo de práctica contra IA. El login visual y el lobby visual todavía necesitan enlazarse a este flujo; actualmente muestran un alias y una sala simulada.

## Almacenamiento y despliegue

Las contraseñas se guardan como hashes `scrypt` con salt aleatorio en `AUTH_DATA_FILE` (por defecto `./data/users.json`, ignorado por Git). El correo se normaliza a minúsculas. La contraseña debe medir entre 8 y 128 caracteres. Los tokens aleatorios duran 24 horas y viven en memoria: reiniciar el servidor obliga a iniciar sesión otra vez, aunque las cuentas sobreviven si el archivo persiste. Para GCP o Railway, configurar `AUTH_DATA_FILE` en un volumen persistente y usar HTTPS/WSS en el acceso público. La sala y las sesiones viven en un solo proceso para esta demo de hasta 20 testers.

No hay billetera obligatoria, fondos XLM, compras ni contratos en este flujo.
