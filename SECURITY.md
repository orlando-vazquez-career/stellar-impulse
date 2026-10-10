# Seguridad

Stellar Impulse es un prototipo de hackathon con compras, propiedad cosmética y mercado en
**Stellar Testnet**. No se declara auditoría externa ni preparación para fondos reales.

La política completa está en [docs/security/SECURITY.md](docs/security/SECURITY.md):
modelo de amenazas, controles presentes, gestión de secretos, acceso, plan de auditoría,
respuesta a incidentes y requisitos previos a producción. La preparación de privacidad y
derechos está en [COMPLIANCE.md](docs/security/COMPLIANCE.md).

No publiques claves privadas, semillas, tokens o detalles explotables en un issue público.
Usa el [reporte privado de GitHub](https://github.com/orlando-vazquez-career/stellar-impulse/security/advisories/new)
si está habilitado; si no, solicita un canal privado a los mantenedores sin incluir información
sensible. No se anuncia un programa de recompensas ni tiempos de respuesta garantizados.

La vinculación de wallet utiliza un desafío firmado y verificado. El jugador firma compras
y transferencias; el servidor firma premios con un rol minter separado. Los contratos procesan
XLM de prueba. Validación de órdenes, vistas privadas, roles e idempotencia son controles
implementados; admisión global, abuso, recuperación, claves operativas y revisión independiente
requieren validación adicional. Consulta la política completa antes de exposición pública.
