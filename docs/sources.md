# Fuentes y trazabilidad

Diseño de producto: brief v0.3, 22 septiembre 2026. La síntesis completa de reglas
y decisiones necesarias está en [producto](product.md). El archivo original no es
un requisito de acceso para contribuir. La imagen del roadmap anterior solo orienta
la atmósfera visual; cuatro jugadores, móvil y 3D no son alcance MVP.

Referencias técnicas consultadas el 22 septiembre 2026:

- [Colyseus Server](https://docs.colyseus.io/server): router y transporte del servidor.
- [Colyseus Rooms](https://docs.colyseus.io/room): salas y ciclo de vida.
- [SDK cliente Colyseus](https://docs.colyseus.io/sdk): creación y unión de salas.
- [Setup Soroban](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup):
  Rust y target de contratos.
- [Primer contrato](https://developers.stellar.org/docs/build/smart-contracts/getting-started/hello-world):
  pruebas y build.
- [Stellar CLI 28.0.0](https://github.com/stellar/stellar-cli/releases/tag/v28.0.0):
  binario oficial y digest para CI.
- [Guía de red e interfaz](blockchain.md): endpoints, SDK y wallet.

Las versiones exactas están en manifests y lockfiles; compilar es evidencia de
compatibilidad para esta base, no garantía de seguridad de todas las dependencias.
No se heredan como verificadas las versiones o precios de briefs anteriores.
