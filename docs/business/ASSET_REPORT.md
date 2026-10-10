# Informe de activos del proyecto

**Fecha de corte:** 10 de octubre de 2026 · **Versión:** 1.0 · **Método:** revisión del repositorio, manifiestos, catálogo y registro histórico de despliegue. No se consultaron balances o inventarios actuales en la red para este informe.

## 1. Objetivo y alcance

Identificar activos técnicos, de producto, digitales y creativos; registrar procedencia, función, transferibilidad, limitaciones y riesgos previos a comercialización. El informe no atribuye un valor contable a código, música, NFT o marca, ni certifica títulos de propiedad por la mera presencia de archivos.

Fuentes principales: [registro Testnet](../../contracts/deployments/testnet.json), [catálogo chain](../../packages/chain/src/cosmetics.ts), [catálogo del hangar](../../apps/web/src/visual/hangar/catalog.ts), [contratos](../../contracts), [metadatos](../../apps/web/public/cosmetics), [licencia](../../LICENSE) y créditos de contenido.

## 2. Registro de contratos y activo de pago

| Activo | Versión registrada | Identificador público |
|---|---:|---|
| Cosmetics | 4 | `CBKQMFOSP2RFRXL6KQH3VTLVOKJCUU6K3XJLRNEUJHJJM7AZT2JSLA6L` |
| Marketplace | 1 | `CDB77C2EVQFHI6DNOK7Q7FZNJ6OMRRONMS5EI5BLIKV3UMENYE7NQ53C` |
| SAC de XLM Testnet | Activo nativo de prueba | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

El registro incluye fecha UTC `2026-10-09T03:22:16.970Z`, commit `6a18b1e`, hashes WASM y transacciones de despliegue. Corresponde a Testnet; el informe no declara un despliegue Mainnet ni verifica que el estado actual sea idéntico al registrado. Los hashes deben contrastarse con el artefacto de release cuando se reproduzca la entrega.

## 3. Inventario de clases registradas

1 XLM = 10.000.000 stroops. Los importes siguientes son precios de clase en Testnet, no valoración de cada NFT en un mercado ni ingreso recibido.

| Clase | Activo | Slot / familia | Transferible | Stroops | XLM prueba | Cupo |
|---:|---|---|---|---:|---:|---|
| 1 | Aurora andina | Livery / Collection | Sí | 50.000.000 | 5 | Sin máximo configurado |
| 2 | Pulso violeta | Trail / Collection | Sí | 30.000.000 | 3 | Sin máximo configurado |
| 3 | Primera victoria | Emblem / Merit | No | 0 | Mérito | Sin máximo configurado |
| 4 | Exploración | Emblem / Merit | No | 0 | Mérito | Sin máximo configurado |
| 5 | Voz de Analista | Announcer / Collection | Sí | 40.000.000 | 4 | Sin máximo configurado |
| 6 | Gravity's Final Path | Music / Collection | Sí | 20.000.000 | 2 | Sin máximo configurado |

Las seis tienen `supplyCap: 0`. No existe una clase Veteran registrada. El hangar contiene además opciones gratuitas y piezas bloqueadas/futuras, que no se deben sumar a oferta NFT lanzada. Voz de Comandante aparece bloqueada hasta disponer de sus grabaciones; su archivo de metadatos no prueba disponibilidad comercial.

## 4. Metadatos y contenido asociado

Existen JSON e imágenes SVG para las seis clases en `apps/web/public/cosmetics`. El cliente chain referencia rutas como `/cosmetics/aurora-andina.json`. La propiedad vive en contrato; imágenes, música, voces y metadatos dependen de archivos y alojamiento.

| Grupo | Evidencia | Estado / pendiente |
|---|---|---|
| Librea/estela/insignias | Catálogo, JSON y SVG | Validar correspondencia clase-URI-imagen en sitio publicado |
| Voz de Analista | Catálogo y audio procesado de VELA | Revisar permiso de uso/distribución y UAT de equipamiento |
| Música de colección | Catálogo y banda sonora | Autorización comercial escrita pendiente de documentar |
| Apariencia entre rivales | Selección del hangar | Sincronización/aceptación pendiente |
| Disponibilidad permanente | Archivos en repositorio | Política de hosting, versionado y recuperación por definir |

No se declara pinning IPFS, alojamiento inmutable o disponibilidad indefinida. Antes de comercializar se propone registrar URI pública resoluble, hash de contenido, copia de respaldo, responsable y política ante cambio de dominio. Revisar que el contenido siga disponible después de transferencia.

## 5. Inventario técnico y operativo

| Activo | Ubicación | Utilidad | Riesgo o condición |
|---|---|---|---|
| Motor de simulación | `packages/sim` | Reglas y balance | Balance continuo y no dependencia del inventario |
| Validación de entrada | `packages/input` | Órdenes y formatos | Cobertura de mensajes nuevos |
| Vistas de estado | `packages/state` | Privacidad y snapshots | Evitar fuga en campos/eventos nuevos |
| Cliente chain | `packages/chain` | Firma, inventario y operaciones | Configuración de red, RPC y respuesta ambigua |
| Cliente web | `apps/web` | Interfaz, render, audio y acceso | Rendimiento, sesiones y accesibilidad |
| Servidor | `apps/server` | Salas, cuentas y progresión | Proceso único, abuso y volatilidad de partidas |
| Datos de cuenta | Prisma/migraciones | Persistencia de perfil/resultados | Privacidad, backups y recuperación |
| Contratos y scripts | `contracts`, `scripts` | Propiedad y liquidación | Roles, TTL, fees y revisión independiente |
| QA y CI | `tests`, `.github/workflows` | Reproducibilidad | Registrar ejecución real y entorno |
| Documentación y diseño | `docs`, `DESIGN.md`, `tokens.json` | Transferencia de conocimiento | Mantener coherencia con implementación |

Los datos de usuarios son información bajo responsabilidad del operador, no una mercancía propuesta por este plan. Las claves privadas no son activos para distribuir ni deben aparecer en el registro público.

## 6. Procedencia y derechos

| Grupo | Base documental | Conclusión operativa |
|---|---|---|
| Código y documentación | [MIT con exclusión de audio](../../LICENSE) | Reutilización según licencia; conservar avisos |
| Música Llama Kachera | LICENSE y [créditos de audio](../../apps/web/public/audio/CREDITOS.md) | Todos los derechos reservados; no asumir autorización comercial |
| Voces/efectos ElevenLabs | Créditos y [documentación de generación](../audio-elevenlabs.md) | Cuenta paga y uso comercial declarados por el equipo; conservar términos/evidencias |
| Planetas/estaciones Kenney | [Créditos de mapa](../../packages/sim/src/tiled-maps/trascendencia-estelar/CREDITOS.md) | Procedencia CC0 documentada allí; revisar licencia incluida y cada archivo |
| Assets fabricados para mapas | Herramientas y créditos de mapa | Documentar autoría y permiso de distribución |
| Assets heredados | Referencias a kits anteriores | Inventario individual y licencia por completar |
| Logos de Stellar | Créditos reconocen marca SDF | Revisar uso de marca y presentación sin afiliación implícita |

Estas conclusiones no son una auditoría de licencias. La autorización debe cubrir exactamente distribución, comercialización y uso ligado a piezas transferibles. Comprar un NFT no autoriza al titular a extraer o explotar la banda sonora.

## 7. Evidencia de operaciones históricas

La prueba de humo registrada contiene `boughtToken: 1`, `grantedToken: 2`, rechazo de doble grant y un listado vendido entre dos cuentas. La venta registrada tiene `listingId: 1`, precio de 20.000.000 stroops y comisión de 1.000.000 stroops, con nuevo propietario indicado.

No se puede inferir de esos dos tokens el suministro total actual, titulares únicos, volumen acumulado, saldo de tesorería o liquidez. La lista `tokensOf` del registro es una fotografía de la prueba, no un inventario completo actualizado. El campo `sellerReceived` es un delta observado que requiere conciliación con fees, como explica [finanzas](TOKENOMICS_FINANCE.md).

## 8. Riesgos del inventario y acciones

| ID | Hallazgo o dependencia | Acción propuesta | Función responsable | Gate |
|---|---|---|---|---|
| A01 | Derechos musicales comerciales no acreditados aquí | Obtener autorización escrita suficiente | Contenido/operación | Antes de venta real |
| A02 | Clases sin cupo | Evitar mensajes de escasez; definir oferta futura explícita | Producto/contratos | Antes de campaña comercial |
| A03 | Metadatos y archivos fuera de chain | Versionar, alojar, respaldar y probar recuperación | Plataforma/contenido | Beta ampliada |
| A04 | Estado actual no consultado | Reconciliar clase, emisión, propietario y roles al release | Contratos | Cada release económico |
| A05 | Assets heredados con procedencia parcial | Revisar archivo por archivo; retirar/reemplazar los no aclarados | Contenido | Antes de producción |
| A06 | Apariencia rival pendiente | Sincronizar solo equipamiento autorizado | UX/plataforma | Antes de prometer visibilidad compartida |
| A07 | Privilegios de emisión y fee | Proteger claves, auditar y comunicar cambios | Seguridad/contratos | Antes de dinero real |
| A08 | Méritos no recuperables automáticamente | Publicar política de pérdida/cambio de wallet | Producto/seguridad | Antes de promoción de propiedad |

## 9. Control del inventario

Se propone mantener por activo: ID, clase/red/contrato si aplica, archivo/hash, titular, licencia, evidencia, costo de producción, responsable y estado. Registrar altas, cambios y retiros de oferta con revisión. Para red, recoger cantidades emitidas, propietarios y transacciones con fecha de consulta; conservar los datos de prueba separados de producción.

**Conclusión de preparación:** hay un catálogo Testnet coherente con seis clases y recursos de presentación existentes. Las siguientes tareas necesarias son aceptación integral, reconciliación de red, derechos comerciales, disponibilidad de metadatos y seguridad operativa. No se asigna una valoración monetaria al inventario ni se declara listo para fondos reales.
