# Desarrollo desde un clon limpio

## JavaScript

Instala Node 24.19.0 (la versión está en `.nvmrc`) y pnpm 11.25.0.
En Windows usa PowerShell para frontend/servidor; no hace falta mover Node a WSL.
En Linux/macOS los mismos comandos funcionan en la terminal nativa.

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

La instalación permite el build de esbuild y usa el fallback JavaScript de msgpackr;
su extensión nativa está deshabilitada para facilitar portabilidad.
El core de Colyseus está fijado por versión y exceptuado explícitamente de la edad mínima
de publicación de pnpm. Revisa esa excepción al actualizar dependencias.

La terminal inicia ambos procesos. Detén con Ctrl+C. No necesitas copiar un archivo
de entorno con la configuración predeterminada.

| Proceso | Dirección | Inicio separado |
|---|---|---|
| Cliente | http://127.0.0.1:5173 | `pnpm --filter @impulso/web dev` |
| Servidor | http://127.0.0.1:2567/health | `pnpm --filter @impulso/server start` |

Para cambiar el backend, copia `apps/web/.env.example` a `apps/web/.env.local`
y reinicia Vite. Las variables `VITE_` son públicas. Para el servidor configura
`HOST`, `PORT` y `WEB_ORIGIN` en el entorno de la terminal; el archivo de ejemplo
no se carga automáticamente. PowerShell: `$env:PORT='2568'`.
Bash: `PORT=2568 pnpm --filter @impulso/server start`.

## Rust y WSL

Sigue [blockchain](blockchain.md). En Windows instala Ubuntu en WSL2 y confirma la
distribución predeterminada con `wsl --list --verbose`. Si no es tu distribución
de desarrollo, configura `$env:IMPULSO_WSL_DISTRO='Ubuntu-24.04'` o el nombre real
de tu distribución. No instales el toolchain de contratos sobre Rust nativo de Windows.

El wrapper convierte la ruta del clon a WSL y entra en `contracts`.
Puedes ejecutar `pnpm contracts:test` desde PowerShell.
Alternativamente, clona dentro del filesystem Linux y trabaja todo desde WSL; instala
Node Linux y reinstala dependencias allí. No reutilices módulos compilados para otro SO.

## Problemas habituales

- Puerto ocupado: detén el proceso que lo usa o cambia ambos extremos y el origin.
- Fallo al unir sala: usa el código de una sala con un asiento libre. Los asientos
  consumidos no se reasignan. Esta base no tiene recuperación de sesión.
- Ambos escuadrones destruidos: salir y crear otra sala; reconstrucción está pendiente.
- Wallet no disponible: instala/abre Freighter, elige testnet y concede acceso en su UI.
  Jugar no depende de ello.
- WSL sin Rust o Stellar: ejecuta el setup dentro de la distribución correcta.
- RPC caído: reintenta después. El entrenamiento no consulta blockchain durante el tick.
- pnpm dice versión de Node incorrecta: comprueba `node --version` y qué terminal usas.

## Compilar y ejecutar el resultado web

```sh
pnpm build
pnpm --filter @impulso/web preview
```

Vite muestra la URL del preview. Para jugar necesitas además el servidor y configurar
`WEB_ORIGIN` al origin exacto del preview (normalmente http://127.0.0.1:4173).
El build de server es una verificación de tipos; `start` ejecuta sus fuentes con tsx.
No existe aún una imagen de producción ni despliegue automático.
