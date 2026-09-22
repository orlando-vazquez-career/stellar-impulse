# Contribuir

1. Instala el proyecto siguiendo README y ejecuta `pnpm check`.
2. Crea una rama `feat/tema`, `fix/tema` o `docs/tema`.
3. Toma una tarea de [táctica](docs/plans/tactics.md), confirma dueño y revisor distinto.
4. Cambia un alcance pequeño, añade pruebas de comportamiento cuando corresponda.
5. Ejecuta los checks relevantes y abre un pull request con evidencia.
6. Una persona revisa antes de fusionar. Código generado también requiere revisión humana.

Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`. Documentación en español;
identificadores y comandos en inglés. Usa enlaces relativos y comandos ejecutables desde
un clon limpio. No publiques archivos de credenciales, material privado ni rutas del equipo.

La simulación es pura y no conoce cosméticos. Nunca aceptar wallet conectada como
autenticación. Nunca añadir claves de firma a variables del frontend.
Los cambios de contratos requieren pruebas de autorización, límites e idempotencia y
revisión técnica independiente. Ningún cambio de esta base habilita mainnet.

CI corre en cada PR y push a main. No asumas protección del proveedor sin verificar la
configuración del repositorio. Los responsables de revisión son roles, no cuentas inventadas.
