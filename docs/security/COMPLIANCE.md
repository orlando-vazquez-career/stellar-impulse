# Privacidad, derechos y preparación de cumplimiento

**Versión 1.0 · 10 de octubre de 2026.** Registro de trabajo previo a comercialización. No constituye una opinión jurídica, certificación ni declaración de cumplimiento normativo.

## 1. Alcance y decisiones pendientes

Stellar Impulse es un juego con propiedad cosmética opcional. Usar una blockchain y un mercado sin custodia no resuelve por sí mismo las obligaciones de protección al usuario, privacidad, impuestos, derechos o tratamiento de pagos. La evaluación dependerá de quién opera el servicio, países atendidos, edad del usuario y funciones realmente habilitadas.

Antes de dinero real se debe definir entidad/persona operadora, jurisdicción, contacto de soporte, mercados del piloto, condiciones comerciales y responsabilidades de contenido. Bolivia es el contexto del programa y una hipótesis de comunidad inicial; no equivale a una determinación de jurisdicción exclusiva.

No se afirma que los NFT sean instrumentos financieros, ni que estén exentos de regulación. Esa clasificación y cualquier requisito de identificación se evaluarán con asesoría competente según el alcance. No añadir KYC masivo sin necesidad definida y controles para los datos que generaría.

## 2. Inventario de datos

| Dato | Uso actual o propuesto | Ubicación / exposición | Acción previa a beta ampliada |
|---|---|---|---|
| Email, alias e ID de cuenta | Acceso y perfil | Backend/store; alias visible según UI | Aviso de privacidad y acceso por rol |
| Salt y hash de contraseña | Verificar acceso | Backend/Postgres o archivo | Backups protegidos; no exportar a analítica |
| Token de sesión | Autorizar solicitudes | Memoria de servidor y `sessionStorage` | Revisar exposición por XSS y revocación |
| Dirección vinculada | Premios y propiedad | Store; dirección pública en chain | Explicar vínculo identificable cuenta-wallet |
| XP, logros y resultados | Progresión | Store y vistas autorizadas | Política de conservación y exportación |
| Transacciones y propiedad | Compra/mérito/mercado | Ledger público | No introducir email o datos sensibles on-chain |
| Eventos de producto | Cohortes y experiencia | Pipeline propuesto | Minimización, finalidad y opción aplicable |
| Logs operativos | Diagnóstico e incidentes | Infraestructura | Redacción y acceso restringido |

La pseudonimización reduce exposición, pero un ID o wallet correlacionable no debe tratarse automáticamente como anónimo. Publicar méritos puede revelar actividad asociada a una dirección.

## 3. Conservación y solicitudes

Política interna propuesta, pendiente de aprobación y configuración:

| Categoría | Ventana inicial propuesta | Tratamiento |
|---|---|---|
| Sesión | 24 h actuales; eliminar al vencer/logout | Revisar limpieza activa de memoria |
| Desafío de wallet | 5 min actuales | Consumir al aceptar; limpiar vencidos |
| Logs rutinarios redactados | 30 días | Rotación automática y acceso mínimo |
| Eventos pseudónimos | 90 días de detalle | Agregar cohortes y eliminar identificadores al vencer |
| Backups | Ventana rotativa de 30 días | Cifrado y procedimiento de borrado/expiración |
| Perfil y progresión | Durante cuenta activa; revisión tras 12 meses de inactividad | Notificación y política por definir |
| Recibos comerciales | Plazo que determine la evaluación contable/jurídica | Separar de analítica; justificar conservación |

La eliminación de cuenta deberá retirar datos del servicio y documentar qué copias expiran después. **No elimina ni modifica el historial público de Stellar.** El usuario deberá conocer esa diferencia antes de vincularse o reclamar premios. No se promete recuperación de una wallet cuya clave se pierda.

Preparar procesos de acceso, corrección, exportación y eliminación con verificación de identidad, responsables y registro de respuesta. Los plazos legales y excepciones se definirán en la evaluación territorial; no se inventan aquí.

## 4. Condiciones comerciales del piloto

Antes de cobrar, las condiciones deberán explicar precio y activo, red, contrato, comisión, fees externos, transferibilidad, cupos, permiso de uso, disponibilidad del servicio y atención de errores. No afirmar escasez para clases de cupo cero.

La política de cancelación/reembolso debe distinguir una solicitud comercial de la imposibilidad técnica de revertir arbitrariamente una transacción confirmada. El contrato actual no contiene un mecanismo general de reembolso. Cualquier solución futura necesita reglas, fondos y revisión; no basta un texto legal.

Se debe resolver el tratamiento de menores, promociones, sorteos, premios, consumo, identificación y fiscalidad de acuerdo con las funciones del piloto. No existen apuestas ni cajas de botín pagadas en el modelo propuesto; añadirlas cambiaría la evaluación de alcance.

## 5. Derechos de contenido y marca

El [LICENSE](../../LICENSE) aplica MIT a código/documentación y excluye expresamente la música de Llama Kachera. No deducir autorización comercial para vender piezas musicales de la presencia de archivos en el repositorio. Obtener permiso escrito suficiente para uso en juego, distribución y uso ligado a un cosmético transferible.

Los créditos documentan audio sintético de ElevenLabs y recursos de mapas de Kenney, además de assets heredados. La documentación de una licencia es un punto de partida: guardar evidencia de procedencia, fecha, términos, modificaciones y alcance de distribución. Revisar marcas de Stellar y cualquier contenido cuyo derecho no esté identificado.

El NFT no transfiere derechos de autor, propiedad de una voz, licencia de explotación o marca salvo un acuerdo expreso que lo establezca. La ficha del activo debe explicar el permiso real de uso y sus límites. Véase [ASSET_REPORT.md](../business/ASSET_REPORT.md).

## 6. Matriz de preparación

| Tema | Estado al corte | Evidencia necesaria para cerrar |
|---|---|---|
| Operador y mercados | Por definir | Identificación y alcance aprobados |
| Privacidad | Inventario y propuesta documental | Aviso, procesos y configuración verificados |
| Consentimiento/analítica | Diseño propuesto | Flujo aplicable y minimización probados |
| Derechos de música y assets | Créditos/licencia existentes, alcance comercial por revisar | Contratos/autorizaciones y registro completo |
| Condiciones del catálogo | Propuesta; pagos en Testnet | Fichas y condiciones comerciales revisadas |
| Tratamiento regulatorio de pagos/mercado | No evaluado aquí | Informe específico por jurisdicción y función |
| Contabilidad/impuestos | Modelo ilustrativo | Política y conciliación con asesoría |
| Auditoría/certificaciones | No declaradas | Informe real con alcance, fecha y versión |

## 7. Gate de comercialización

No se presenta una checklist marcada de cumplimiento. El responsable de operación debe reunir evaluación aplicable, documentos de usuario, derechos suficientes y controles técnicos de [SECURITY.md](SECURITY.md); el equipo registra una decisión explícita con versión y límites de exposición. Las revisiones se repiten ante cambios de país, activo de pago, modelo económico o proveedores.
