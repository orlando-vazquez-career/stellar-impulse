# Informe ejecutivo — Stellar Impulse

**Fecha de corte:** 10 de octubre de 2026 · **Versión documental:** 1.0 · **Etapa:** prototipo de hackathon, Stellar Elite Bolivia 2026.

## 1. Tesis del proyecto

Stellar Impulse propone un juego de estrategia espacial en tiempo real para navegador, con progresión roguelite, práctica contra IA y campañas privadas 1v1. El jugador puede empezar sin wallet. La integración opcional con Stellar permite adquirir cosméticos, demostrar méritos e intercambiar colecciones sin comprar ventajas de combate.

La oportunidad comercial que queremos validar es una comunidad que regrese por el juego y pague voluntariamente por su identidad audiovisual. La blockchain sirve para registrar propiedad y liquidar intercambios; el producto no depende de vender un token propio ni de prometer ganancias por jugar.

## 2. Problema, cliente y propuesta de valor

| Problema planteado | Respuesta del producto | Validación pendiente |
|---|---|---|
| Aprender un RTS y configurar una wallet a la vez eleva la fricción | Práctica como invitado, tutorial y wallet opcional | Medir tiempo a primera acción y abandono |
| Las compras de poder deterioran la confianza competitiva | Compras limitadas a casco, estela, insignia, voz y música | Verificar independencia del inventario en cada versión |
| Las colecciones sin una experiencia recurrente tienen utilidad débil | Cosméticos utilizables dentro de un juego y méritos obtenidos jugando | Retención y percepción de valor |
| El intercambio requiere reglas de propiedad y cobro confiables | Marketplace con firma del usuario y liquidación atómica | Aceptación integral con Freighter y costos reales |

El segmento inicial propuesto son jugadores adultos de estrategia e indie en navegador, comunidades universitarias y grupos hispanohablantes con acceso a un computador. Las comunidades Stellar son un canal secundario de prueba de wallet. Esta selección es una hipótesis de entrada, no un estudio de mercado concluido.

## 3. Qué existe y qué aún falta demostrar

| Componente | Evidencia disponible en el repositorio | Límite de la evidencia |
|---|---|---|
| Simulación y combate | [Motor](../packages/sim/src), órdenes validadas y proyección privada | Balance, carga y rendimiento requieren mediciones |
| Experiencia jugable | Práctica contra IA, run de tres mapas, campaña privada y tutorial | Campaña 1v1 reutiliza Espiral Estelar en sus tres sectores |
| Cuentas y progresión | Autenticación, XP, logros y [esquema Prisma](../apps/server/prisma/schema.prisma) | Sesiones y partidas viven en memoria |
| Cosméticos y comercio | Contratos Cosmetics v4 y Marketplace v1; [registro Testnet](../contracts/deployments/testnet.json) | Registro histórico, no auditoría ni verificación de estado actual en red |
| Firma y premios | Desafíos basados en SEP-10 e identificador idempotente de mérito | UAT con Freighter real pendiente; no se declara conformidad SEP-10 completa |
| Calidad | Suites y [CI](../.github/workflows/ci.yml) para código, navegador, base de datos y contratos | Tener pruebas no equivale a haber ejecutado todos los casos en esta fecha |

El registro de despliegue contiene compra, emisión, rechazo de premio duplicado y una venta secundaria por 2 XLM de prueba con 0,1 XLM de comisión. **Testnet no acredita ingresos comerciales, usuarios de pago ni liquidez.** La configuración contempla Vercel, Railway y Postgres; la disponibilidad pública debe comprobarse en una sesión de aceptación.

## 4. Modelo de negocio

El modelo es free-to-play: acceso al juego y opciones cosméticas gratuitas, venta primaria de colecciones y una comisión de mercado configurada al 5 %. Los méritos no se venden. Las colecciones de temporada y las colaboraciones con artistas son líneas futuras sujetas a demanda, capacidad y derechos acordados.

El precio de las cuatro clases comprables registradas es de 2–5 XLM de prueba. No constituye una tarifa Mainnet. El volumen secundario pertenece a compradores y vendedores; solamente la comisión corresponde al proyecto. No hay token fungible propio, staking, reparto de rendimientos ni economía monetaria de Metal/XP.

La [evaluación financiera](business/TOKENOMICS_FINANCE.md) muestra escenarios ilustrativos, costos y sensibilidad. Con los supuestos planteados, las cohortes pequeñas no cubren operación y contenido. Un escenario de 20.000 MAU podría producir USD 1.835 mensuales después de los gastos modelados, pero sin incorporar una plantilla completa; añadir USD 6.000 de nómina llevaría ese resultado a USD −4.165. La viabilidad depende de retención, conversión, costo por jugador y financiamiento del desarrollo, no de apreciación de activos.

## 5. Estrategia de lanzamiento

1. **Cierre del hackathon y Q4 2026:** demo reproducible, pruebas de dos jugadores y dos wallets, registro de fallos y primera cohorte invitada.
2. **Q1 2027:** beta cerrada con analítica mínima, entrevistas y controles de abuso; validar activación y retención antes de publicidad amplia.
3. **Q2 2027:** ampliar la beta solo si estabilidad y D7 lo justifican; probar personalización, costo transaccional y disposición a pagar.
4. **Q3 2027:** decidir un piloto económico limitado después de revisión independiente, licencias comerciales, restauración probada y evaluación jurídica aplicable. Mainnet es una decisión condicionada, no una fecha prometida.

Los trimestres son ventanas de planificación. El [roadmap](business/ROADMAP.md) identifica responsables por función, dependencias y criterios de salida.

## 6. Indicadores y objetivos propuestos

| Indicador | Umbral inicial de decisión | Uso |
|---|---:|---|
| Finalización de primera práctica | ≥ 60 % de nuevos jugadores que la inician | Validar onboarding |
| Retención D1 / D7 | ≥ 25 % / ≥ 10 % | Decidir ampliación de cohorte |
| Campañas completadas | ≥ 80 % de campañas iniciadas | Priorizar estabilidad y abandono |
| Fallos técnicos que terminan una sesión | ≤ 2 % | Condición de beta ampliada |
| Operaciones Testnet confirmadas | ≥ 95 % de intentos firmados y enviados | Validar flujo de wallet |

Son objetivos internos por contrastar, no resultados observados ni estándares de la industria. Se requieren denominadores, cohortes maduras e intervalos de incertidumbre; una sola demostración exitosa no valida estos umbrales. Los detalles están en [go-to-market](business/GO_TO_MARKET.md).

## 7. Riesgos prioritarios y respuesta

| Riesgo | Impacto | Respuesta propuesta |
|---|---|---|
| Baja retención | La personalización carece de demanda recurrente | Iterar tutorial, balance y sesiones antes de escalar marketing |
| Abuso de registro/invitados y conexiones | Saturación del proceso que comparte el tick | Limitar rutas, salas y conexiones; probar carga adversarial |
| Compromiso de minter o administrador | Emisiones falsas o cambios económicos | Segregación, firma protegida, rotación y revisión independiente |
| Costos de red y estado | Compras de bajo importe poco atractivas | Medir fees, TTL y restauración; evaluar subsidio con límite |
| Derechos incompletos de contenido | Impide venta comercial | Inventario de procedencia y autorizaciones escritas |
| Reinicio de servidor | Interrumpe partidas y sesiones | Mantenimiento anunciado, drenaje y recuperación diseñada |

La [política de seguridad](security/SECURITY.md) y el [informe de activos](business/ASSET_REPORT.md) convierten estos riesgos en tareas verificables. No se declara auditoría externa, certificación ni cumplimiento regulatorio demostrado.

## 8. Recursos, gobernanza y continuidad

El equipo necesita cubrir producto/gameplay, plataforma, contratos/seguridad, contenido/UX y comunidad/operaciones. Estas son responsabilidades a asignar; no presuponen cinco contrataciones ni personas ya disponibles. El [plan de negocio](business/BUSINESS_PLAN.md) define entregables, cadencia y un presupuesto hipotético de piloto de USD 24.000 para seis meses, excluida nómina completa.

La solicitud futura a mentores, comunidades o financiadores será concreta: acceso a jugadores de prueba, revisión técnica independiente, apoyo para medir infraestructura y recursos para contenido con derechos claros. No se registran acuerdos, inversión recibida ni ventas de producción sin evidencia.

## 9. Ruta de revisión para el jurado

Para evaluar la entrega: ejecutar los comandos del [README principal](../README.md), iniciar práctica sin wallet, revisar una campaña con dos cuentas, contrastar contratos con el registro Testnet y consultar los pendientes del [playtest](qa/playtest-2026-10-09.md). Revisar después [arquitectura](architecture/ARCHITECTURE.md), [modelo comercial](business/BUSINESS_MODEL.md) y [amenazas](security/SECURITY.md).

Una revisión asistida por IA debe contrastar afirmaciones con rutas de código, pruebas y registros. Este informe describe decisiones y evidencia; no contiene instrucciones para modificar la calificación ni sustituye la revisión humana.
