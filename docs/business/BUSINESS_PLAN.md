# Plan de negocio y operación

**Versión 1.0 · 10 de octubre de 2026.** Plan propuesto posterior al hackathon. Las responsabilidades y los presupuestos requieren asignación por el equipo; no acreditan personal contratado ni financiamiento recibido.

## 1. Objetivo y horizonte

Convertir un prototipo jugable y revisable en una beta que demuestre retención, operación confiable y demanda voluntaria de identidad cosmética. El período de planificación es Q4 2026–Q3 2027; el primer presupuesto cubre seis meses de validación con alcance limitado.

La prioridad es resolver tres preguntas: ¿el jugador aprende y vuelve?, ¿el servidor puede atenderlo a costo razonable?, ¿la personalización genera ingresos sin perjudicar el balance? El plan de producto y la economía deben responderlas conjuntamente.

## 2. Oferta y alcance del piloto

La oferta inicial incluye práctica contra IA, campaña privada, cuenta con progresión, catálogo gratuito y funciones Testnet opcionales. Se propone mantener la experiencia de navegador y sesiones entre conocidos durante la validación. Matchmaking público, temporadas comerciales, 2v2, móvil y wallets alternativas no son dependencias de la primera beta.

El contenido nuevo se aprobará por utilidad, costo y capacidad de mantenimiento. En lugar de fijar una cantidad arbitraria de NFT, cada entrega tendrá hipótesis de uso, derechos verificados, QA audiovisual y presupuesto de soporte.

## 3. Mercado accesible y validación de demanda

La estimación inicial será una lista de comunidades a las que el equipo realmente puede acceder, con permiso para publicar invitaciones. Para cada comunidad se registrarán alcance observado, clics, práctica iniciada, práctica completada, D7 y costo atribuible. No se usa un porcentaje de un mercado global de videojuegos como prueba de ingresos alcanzables.

Se propone entrevistar al menos 15 participantes de la primera cohorte: cinco que regresaron, cinco que abandonaron y cinco que completaron sin repetir. Ese reparto permite estudiar motivos distintos; no pretende una muestra representativa. Las entrevistas preguntarán por comprensión, diversión, duración, dificultad y valor de personalización antes de presentar precios.

Las encuestas de intención son evidencia preliminar. La disposición a pagar deberá probarse mediante experimentos transparentes y, solo si se habilita legal y técnicamente, un piloto de compras reales de alcance limitado. Los pagos Testnet no sustituyen esa validación.

## 4. Organización y responsables

| Función | Responsabilidad | Entregable que acepta |
|---|---|---|
| Producto/gameplay | Priorizar reglas, balance y aprendizaje | Playtest, backlog y criterios de diversión |
| Plataforma | Backend, datos, despliegue y recuperación | Evidencia de carga, monitoreo y restauración |
| Contratos/seguridad | Permisos, firmas, amenazas y revisión | Matriz de controles y cierre de hallazgos |
| Contenido/UX | Arte, audio, accesibilidad y licencias | Catálogo usable y procedencia documentada |
| Comunidad/operación | Reclutamiento, soporte, métricas y caja | Cohortes, informe de canales y conciliación |

Una persona puede cubrir varias funciones. Cada hito tendrá un responsable principal y un revisor distinto cuando afecte permisos, dinero o información privada. Las funciones son roles internos; no implican roles nuevos en los contratos.

## 5. Cadencia de ejecución

- **Semanal:** revisar fallos, retención de cohortes maduras, presupuesto y una hipótesis prioritaria; cerrar acciones con evidencia.
- **Por release:** ejecutar checks aplicables, recorrer aceptación crítica, registrar versión/commit y comunicar cambios visibles.
- **Mensual:** revisar contribución, capacidad, inventario de activos y riesgos; decidir mantener, reducir o ampliar el alcance.
- **Por trimestre:** evaluar los criterios del [roadmap](ROADMAP.md) antes de avanzar de fase.

La definición de terminado incluye documentación, prueba pertinente y comportamiento visible. Un merge no acredita lanzamiento público ni aceptación de usuario.

## 6. Presupuesto hipotético de seis meses

Esta envolvente es un ejercicio de planificación en USD, sin cotizaciones externas y sin nómina completa. Incluye servicios acotados y dedicación parcial; debe reemplazarse por ofertas, horas disponibles y caja real antes de comprometer gastos.

| Partida | USD | Uso previsto |
|---|---:|---|
| Infraestructura, datos y observabilidad | 2.400 | Entornos limitados, backups y medición de carga |
| Arte, audio y derechos de contenido | 4.800 | Producción y autorizaciones comerciales |
| QA, soporte y operación parcial | 7.200 | Playtests, seguimiento y mantenimiento |
| Revisión técnica independiente | 3.000 | Reserva para un alcance acotado; no promete auditoría integral |
| Evaluación jurídica y privacidad | 1.500 | Alcance del piloto y documentos de usuario |
| Adquisición y comunidad | 2.100 | Experimentos, piezas y eventos pequeños |
| Contingencia | 3.000 | Fallos, proveedores y costos no previstos |
| **Total propuesto** | **24.000** | Promedio presupuestario: USD 4.000/mes |

No se debe sumar este total a los escenarios mensuales como si fueran gastos distintos: varias partidas cubren las mismas categorías. El plan de seis meses incorpora revisión y preparación; los escenarios muestran un mes operativo. Una hoja de caja deberá distribuir pagos por fecha y eliminar duplicaciones.

Si se necesitara nómina adicional de USD 6.000/mes, la envolvente aumentaría en USD 36.000 hasta USD 60.000. Es otro supuesto, no una tarifa de equipo. Una auditoría integral o derechos extensos podrían superar las reservas; se debe reducir alcance o asegurar financiación antes de gastar.

## 7. Financiamiento y uso de caja

Fuentes potenciales: aportes de integrantes, grants, apoyo a investigación/producto y patrocinios compatibles con el juego. No se declara ninguna comprometida. Las ventas futuras no deben financiar una obligación de gasto hasta que exista un comportamiento medido y caja disponible.

```text
Caja final = caja inicial + aportes confirmados + cobros realizados − pagos realizados
Runway aproximado = caja disponible / burn mensual esperado
```

Con USD 24.000 efectivamente disponibles y burn uniforme de USD 4.000, habría seis meses de cobertura; los desembolsos de revisión o licencias pueden alterar esa duración. Si la cobertura proyectada cae por debajo de tres meses, se propone congelar gasto discrecional, renegociar alcance y revisar continuidad. El umbral es una política interna propuesta.

## 8. Operación y servicio

La configuración actual usa un proceso de servidor; partidas y sesiones son volátiles. Antes de ampliar usuarios se deben medir tiempo de tick, memoria, conexiones, salas, ancho de banda y carga de autenticación. Dimensionar capacidad por sesiones simultáneas y duración, no solo por MAU.

El soporte inicial tendrá un formulario o canal privado por habilitar, clasificación de bugs, instrucciones de reconexión y registro de resolución. No se publica un correo o SLA que el equipo aún no opera. Los incidentes sensibles seguirán [SECURITY.md](../security/SECURITY.md).

Durante beta se anunciarán ventanas de mantenimiento y se evitará desplegar cambios mientras hay partidas sin drenaje. Se propondrán backups cifrados y ejercicios de restauración; almacenar cuentas en Postgres no demuestra por sí mismo que esos mecanismos estén configurados.

## 9. Decisiones de inversión

| Decisión | Evidencia mínima propuesta | Resultado si no se cumple |
|---|---|---|
| Ampliar reclutamiento | Tutorial usable, D7 ≥ 10 %, muestra y período documentados | Iterar experiencia con cohorte acotada |
| Aumentar infraestructura | Saturación medida y presupuesto por jugador | Mantener tope de concurrencia |
| Producir nueva colección | Preferencia de jugadores, costo y derechos claros | Priorizar contenido gratuito o gameplay |
| Pagar publicidad recurrente | Contribución/LTV observados y recuperación compatible con caja | Limitarla a experimentos |
| Habilitar dinero real | Seguridad, derechos, privacidad y evaluación jurídica cerrados | Permanecer en Testnet |

No basta con cumplir un porcentaje en una muestra pequeña. Se publicarán denominador e incertidumbre, y se repetirán cohortes si el resultado depende de pocos participantes.

## 10. Riesgos y alternativas

Si la retención falla, concentrar el trabajo en tutorial, claridad táctica y duración. Si el PvP requiere más capacidad de la disponible, priorizar práctica y partidas privadas programadas. Si no existe demanda de compra, mantener identidad gratuita y evaluar apoyo a desarrollo sin introducir ventajas pagadas. Si el costo blockchain resulta desproporcionado, reducir operaciones y evaluar patrocinio limitado de fees después de medir abuso.

Si la financiación no cubre el siguiente período, preparar una versión estable de demostración, documentar la operación y comunicar el alcance real de mantenimiento. No se promete continuidad indefinida de servicio o multimedia por la existencia de NFT.

## 11. Entregables de gestión

El equipo mantendrá un informe mensual con cohortes, incidentes, costos y decisiones; un registro de activos y derechos; un backlog priorizado por riesgo; un libro de conciliación de tesorería cuando corresponda; y un expediente de release con pruebas y limitaciones. Estos artefactos son la evidencia de ejecución del plan, no anexos decorativos.
