# Seguridad

Esta base es experimental y usa Stellar testnet. No se ha auditado para fondos reales.
No publiques claves privadas, semillas, tokens o detalles explotables en un issue público.
Usa el reporte privado de vulnerabilidad de GitHub si está disponible; si no, solicita
un canal privado al mantenedor sin incluir el contenido sensible.

Antes de una demo pública: límites globales de salas y conexiones, CORS/origin configurados,
HTTPS/WSS, sesiones autenticadas, validación de órdenes, retención y cierre de salas,
pruebas de abuso y revisión de dependencias. El servidor inicial es para uso local.

La wallet solo comparte dirección. Una sesión de identidad futura requiere challenge
firmado y verificado. El contrato de arranque no recibe fondos ni administra activos.
