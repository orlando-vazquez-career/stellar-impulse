# Modelo de negocio

**Stellar Impulse · versión 1.0 · 10 de octubre de 2026.** Documento de hipótesis comerciales y reglas del producto. Leer junto al [informe ejecutivo](../INFORME_EJECUTIVO.md) y al [modelo financiero](TOKENOMICS_FINANCE.md).

## 1. Propuesta de valor

Ofrecer estrategia espacial accesible desde navegador, con profundidad táctica y personalización que respete la habilidad del jugador. La propuesta combina cuatro beneficios: entrada sin wallet, práctica y aprendizaje, campañas competitivas con servidor autoritativo e identidad digital opcional con propiedad verificable.

El valor de un cosmético es usarlo y expresar identidad. El valor de un mérito es representar un logro ganado. El precio de reventa no forma parte de la promesa. Las unidades, mejoras, formaciones y aumentos se rigen por el gameplay y no se adquieren comprando NFT.

## 2. Segmentos y necesidades

| Segmento | Necesidad que buscamos resolver | Experiencia inicial | Señal de validación |
|---|---|---|---|
| Jugadores RTS e indie en navegador | Partidas accesibles con decisiones tácticas y poca instalación | Invitado, tutorial y práctica | Repite sesiones por iniciativa propia |
| Grupos universitarios y comunidades de amigos | Coordinar partidas y aprender entre pares | Cuenta y campaña privada por código | Campañas completas y nuevas invitaciones |
| Usuarios del ecosistema Stellar | Utilidad visible de firmas, propiedad y contratos | Hangar y mercado Testnet | Entiende firma, compra y transferencia |
| Coleccionistas de identidad audiovisual | Personalización con origen y derechos claros | Opciones gratuitas y colecciones | Preferencias consistentes y disposición a pagar |

El lanzamiento de prueba se orientará a adultos y entornos de computador. Idiomas ES/EN están presentes en la interfaz. Ampliar a móvil, menores u otros países exige revisar UX, soporte y obligaciones; no se asume ese alcance para el piloto.

No existe todavía una medición de tamaño de mercado para el proyecto. Estimaremos la oportunidad de abajo hacia arriba: comunidades accesibles × participantes invitados × activación × retención × conversión. Se informarán cifras obtenidas y su método, sin convertir seguidores o wallets en jugadores activos.

## 3. Trabajo que el producto hace por el usuario

- **Aprender:** practicar órdenes, producción, captura y economía con un tutorial integrado.
- **Competir:** obtener un resultado determinado por el servidor y jugar sin revelar información oculta.
- **Progresar:** conservar XP y logros en una cuenta; las opciones tácticas se desbloquean jugando.
- **Personalizar:** seleccionar casco, estela, insignia, voz y música, con alternativas gratuitas.
- **Conservar e intercambiar:** consultar propiedad en Stellar y transferir únicamente las colecciones permitidas.

La propiedad blockchain no garantiza que el servicio del juego o los archivos multimedia estén disponibles indefinidamente. Esa dependencia debe explicarse en la ficha de compra y en las condiciones de uso.

## 4. Canvas operativo

| Bloque | Decisión de negocio |
|---|---|
| Propuesta | Juego primero; identidad audiovisual opcional; comercio sin custodia del mercado |
| Clientes | Jugadores de estrategia, grupos de amigos y usuarios Stellar |
| Canales | Playtests, comunidades, creadores de contenido y demostraciones |
| Relación | Tutorial, soporte, feedback y comunicación de cambios |
| Ingresos | Venta primaria de colecciones y comisión secundaria |
| Recursos | Motor, backend, catálogo, contratos, contenido licenciado y equipo |
| Actividades | Balance, desarrollo, operación, QA, seguridad, contenido y comunidad |
| Socios potenciales | Artistas, organizadores y comunidades; sin acuerdos declarados |
| Costos | Infraestructura, producción de contenido, soporte, revisión, red y adquisición |

## 5. Flujos de monetización

| Línea | Cómo se cobra | Estado | Condiciones |
|---|---|---|---|
| Colección primaria | El comprador firma; XLM se transfiere a tesorería y se emite la pieza | Implementada en Testnet | UAT, derechos, costos y política comercial antes de dinero real |
| Comisión secundaria | 5 % del precio del intercambio confirmado | Implementada en Testnet | Volumen legítimo, compradores únicos y UX transparente |
| Colecciones de temporada | Nuevos temas de apariencia/audio | Propuesta | Retención, capacidad creativa y catálogo aprobado |
| Colaboraciones | Contenido de terceros con reparto contractual | Propuesta | Licencia escrita, cálculo de margen y demanda |
| Patrocinios o grants | Contrato o convocatoria independiente | Opción de financiamiento | No contabilizar como venta recurrente del juego |

No se propone cobrar por Metal, estadísticas, acceso a aumentos superiores o méritos. Tampoco se introducen cajas de botín pagadas, staking ni recompensas monetarias de gameplay. Una nueva línea de ingreso requerirá análisis del impacto competitivo y de los derechos que promete.

## 6. Política de catálogo y precios

El registro Testnet incluye cuatro colecciones comprables: Aurora andina (5 XLM), Pulso violeta (3 XLM), Voz de Analista (4 XLM) y Gravity's Final Path (2 XLM). Primera victoria y Exploración son méritos de precio cero. Las seis clases tienen `supplyCap: 0`, que significa ausencia de cupo de emisión en ese registro; no deben anunciarse como ediciones limitadas.

Antes de un piloto comercial, cada pieza deberá mostrar categoría, derechos de uso, transferibilidad, red, contrato, precio, fees estimados y dependencia del servicio. El equipo definirá una moneda contable y un precio comercial después de entrevistas y experimentos. Los precios Testnet no prueban disposición a pagar ni se convierten automáticamente en precios Mainnet.

La comisión actual puede modificarse por el administrador del mercado hasta el máximo de 10 % permitido en el código. Una política futura deberá exigir revisión, publicación previa y protección de la comisión aceptada por el vendedor. La versión actual no fija la comisión por anuncio; esa limitación está registrada en [seguridad](../security/SECURITY.md).

## 7. Unit economics básicos

El indicador relevante es el margen por jugador activo después de servir tanto a compradores como a jugadores gratuitos. No basta con dividir el costo entre las piezas vendidas.

```text
Compradores = MAU × conversión a pago
Ingreso primario = compradores × compras por comprador × ticket medio
Ingreso de mercado = GMV legítimo × comisión
Contribución = ingreso − costos variables − reserva de incidencias
Resultado del piloto = contribución − costos fijos − adquisición
```

En el escenario base de [finanzas](TOKENOMICS_FINANCE.md), 5.000 MAU, 4 % de conversión, una compra de USD 8 y USD 2.000 de GMV producirían USD 1.700 brutos al mes. Tras USD 250 variables, USD 34 de reserva, USD 2.400 fijos y USD 600 de adquisición, el resultado sería **USD −1.584**. Son supuestos de planificación, no resultados ni cotizaciones de proveedores.

La contribución sería USD 0,2832 por MAU/mes. Un horizonte ilustrativo de tres meses activos produciría USD 0,8496 por usuario activado, antes de costos fijos; no es un LTV medido. Si adquirir una activación costara USD 2, la publicidad no se sostendría con esa contribución. Por eso el lanzamiento prioriza comunidades y mejora de retención, con presupuestos pequeños de aprendizaje.

## 8. Diferenciación que debe comprobarse

| Alternativa de la que puede venir el jugador | Motivo propuesto para probar Stellar Impulse | Cómo verificarlo |
|---|---|---|
| RTS tradicionales | Acceso en navegador y práctica inmediata | Entrevistas y tiempo a partida |
| Juegos casuales en navegador | Profundidad táctica, campaña y progresión | Repetición y finalización |
| Experiencias centradas en colección | Utilidad jugable y separación entre compra y poder | Comprensión y regreso sin incentivos |
| Inventarios digitales cerrados | Colecciones transferibles y méritos verificables | Uso real de transferencia y satisfacción |

Esta matriz expresa posicionamiento; no declara superioridad técnica ni adopción frente a competidores específicos. Los activos defensibles serán el balance, contenido, marca, comunidad y capacidad operativa. El código MIT facilita revisión y reutilización; no es una barrera exclusiva de propiedad intelectual.

## 9. Hipótesis, pruebas y decisiones

| Hipótesis | Prueba propuesta | Regla de decisión |
|---|---|---|
| La entrada sin wallet facilita activación | 100 primeras prácticas y entrevistas de abandono | Si finaliza menos del 60 %, corregir onboarding |
| El juego merece repetirse | Cohortes D1/D7 maduras | Si D7 permanece por debajo del 10 %, frenar adquisición amplia |
| La personalización tiene valor | Selección gratuita, encuesta de precio y reserva de interés sin cobro | No lanzar colecciones por respuestas aisladas |
| El mercado aporta utilidad | UAT con dos wallets y seguimiento de compradores distintos | No equiparar intercambio de pruebas con demanda |
| La operación puede sostener el modelo | Medir costo de sesiones, contenido y soporte | Ajustar catálogo o alcance si la contribución es insuficiente |

Los umbrales son propuestas internas. Todos los experimentos deben registrar tamaño de muestra, período, versión, canal y resultado. Los incentivos y cuentas del equipo se reportarán por separado.

## 10. Límites comerciales

El proyecto se encuentra en validación. No se documentan clientes empresariales, contratos con aliados, ingresos reales ni cifras de comunidad sin respaldo. La tesis de viabilidad consiste en probar demanda de identidad sobre un juego retenedor y una operación medible; la siguiente inversión debe financiar esa prueba, no una economía especulativa.
