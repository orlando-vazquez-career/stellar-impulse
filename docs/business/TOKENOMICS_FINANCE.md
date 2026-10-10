# Economía de activos y plan financiero

**Versión 1.0 · 10 de octubre de 2026.** Las cifras en USD son supuestos internos ilustrativos. No son pronósticos, presupuesto aprobado, valoración del proyecto ni conversión del precio de XLM.

## 1. Diseño económico

Stellar Impulse no tiene un token fungible propio. XLM es el activo configurado para pagos Testnet mediante Stellar Asset Contract. Los cosméticos son piezas de colección; los méritos son reconocimientos no transferibles. Metal, XP y aumentos pertenecen al sistema de juego, sin derecho de rescate monetario.

| Elemento | Creación o entrada | Uso o salida | Naturaleza |
|---|---|---|---|
| Metal | Reglas de economía y captura de nodos | Producción y mejoras de partida | Recurso interno; no negociable |
| XP y desbloqueos | Resultado oficial y desafíos | Progresión de cuenta | Registro interno; no saldo financiero |
| Colecciones | Compra primaria; emisión autorizada por contrato | Equipar, transferir o listar | NFT cosmético; no rendimiento prometido |
| Méritos | Logro reconocido por servidor y minter | Equipar y verificar | NFT intransferible; no comprado |
| XLM de prueba | Fondeo de cuentas Testnet | Precio, comisión y fees de red | Sin ingreso real de producción |

No hay asignación de tokens a fundadores, vesting ni emisiones de recompensas monetarias. Por ello, una tabla tradicional de distribución de token sería engañosa. La disciplina económica recae en el catálogo, costos, tesorería y adquisición.

## 2. Oferta, emisión y concentración

Las seis clases registradas tienen cupo cero (`supplyCap: 0`, sin límite de clase). El contrato limita las listas de inventario por propietario y separa piezas transferibles de intransferibles. Estos límites operativos no crean escasez global.

El minter puede emitir mediante `grant`; la idempotencia exige un `reward_id` único. Ese mecanismo bloquea repetir el mismo identificador, pero no impide a una clave comprometida emitir con identificadores nuevos. La oferta está subordinada al control del rol y a la evidencia de mérito. Se deben medir emisiones por clase, concentración por propietario y anomalías de premios antes de producción.

Los méritos ya emitidos permanecen en la wallet original aunque el usuario desvincule su cuenta. El identificador actual se deriva de cuenta + mérito + contrato; cambiar de wallet no debe emitir una segunda copia. Recuperación o migración requerirían una política y un mecanismo específicos.

## 3. Tarifas y costo total de una operación

```text
Venta primaria: pago del cosmético → tesorería
Venta secundaria: precio → vendedor menos comisión + comisión → tesorería
Costo del comprador = precio + fees de red y restauración atribuibles
Neto del vendedor = precio − comisión − costos de red asumidos por él
```

La comisión configurada es 500 puntos básicos (5 %), con límite de contrato de 1.000 puntos básicos. Para una venta de 2 XLM, el reparto contractual es 1,9 XLM al vendedor y 0,1 XLM a tesorería, antes de costos de red.

El [registro de humo](../../contracts/deployments/testnet.json) informa un aumento observado de saldo del vendedor de 16.417.977 stroops. Ese delta no equivale por sí solo al reparto contractual neto de fees y otras operaciones. La conciliación requiere revisar las transacciones completas. No se usará ese campo como prueba de un margen constante.

Los fees y costos de estado dependen de recursos y operaciones; no se promete una tarifa permanente a partir de una prueba. En Soroban, extender TTL y restaurar estado pueden generar costos adicionales. La planificación técnica sigue la [documentación de almacenamiento de Stellar](https://developers.stellar.org/docs/build/guides/storage/storage-strategies).

## 4. Separación entre Testnet, moneda contable y caja

Los escenarios en XLM del [README](../../README.md) explican volumen e ingreso bruto de prueba. Aquí se usan USD hipotéticos para comparar ingresos con gastos en una misma unidad; no se aplica ningún tipo de cambio implícito ni se fija la tarifa comercial futura.

Si se aprueba un piloto con pagos reales, finanzas deberá registrar red, activo, importe en unidades mínimas, precio contable a la fecha de operación, fuente y hora del cambio, fees, contraparte y recibo. Una apreciación posterior de la tesorería se informaría por separado de las ventas del juego. No se financia el presupuesto suponiendo apreciación de XLM.

## 5. Escenarios mensuales ilustrativos

Las hipótesis suponen una compra primaria mensual por comprador. GMV es volumen secundario legítimo y no se suma íntegro a ingresos. La reserva de incidencias es una provisión presupuestaria del 2 % de ingresos, no una tasa histórica de reembolsos.

| Variable | Exploratorio | Base | Expansión |
|---|---:|---:|---:|
| MAU | 1.000 | 5.000 | 20.000 |
| Conversión primaria | 3 % | 4 % | 5 % |
| Compradores | 30 | 200 | 1.000 |
| Ticket primario supuesto, USD | 6 | 8 | 10 |
| Ingreso primario, USD | 180 | 1.600 | 10.000 |
| GMV secundario, USD | 120 | 2.000 | 15.000 |
| Comisión secundaria al 5 %, USD | 6 | 100 | 750 |
| **Ingreso bruto, USD** | **186** | **1.700** | **10.750** |
| Costos variables: USD 0,05 por MAU | 50 | 250 | 1.000 |
| Reserva de incidencias: 2 % | 3,72 | 34 | 215 |
| Infraestructura fija, USD | 120 | 400 | 1.200 |
| Producción de contenido, USD | 300 | 800 | 2.000 |
| Operación y soporte acotados, USD | 400 | 1.200 | 2.500 |
| Adquisición experimental, USD | 150 | 600 | 2.000 |
| **Egresos modelados, USD** | **1.023,72** | **3.284** | **8.915** |
| **Resultado del piloto, USD** | **−837,72** | **−1.584** | **1.835** |

La infraestructura fija representa una base operativa y los USD 0,05/MAU un consumo incremental supuesto: no se debe contar la misma factura en ambas categorías. Contenido y soporte representan servicios acotados o dedicación parcial. El modelo excluye nómina completa, impuestos, asesoría legal, auditoría independiente, amortización y costos de conversión no presupuestados. Un resultado positivo del piloto no es beneficio neto de una empresa.

## 6. Fórmulas y punto de equilibrio

```text
R = MAU × conversión × compras × ticket + GMV × 0,05
V = MAU × costo variable por MAU
Contribución = R × (1 − reserva) − V
Resultado = contribución − infraestructura − contenido − operación − adquisición
ARPU bruto = R / MAU
Contribución por MAU = contribución / MAU
Equilibrio aproximado = costos fijos totales / contribución por MAU
```

| Indicador | Exploratorio | Base | Expansión |
|---|---:|---:|---:|
| ARPU bruto mensual, USD | 0,186 | 0,340 | 0,5375 |
| Contribución por MAU/mes, USD | 0,13228 | 0,2832 | 0,47675 |
| Costos fijos incluidos, USD | 970 | 3.000 | 7.700 |
| MAU mínimos aproximados, redondeados arriba | 7.333 | 10.594 | 16.152 |

La última fila supone conversión, ticket, GMV por MAU y capacidad constantes. Es una aproximación dentro de cada estructura de costos; al crecer pueden cambiar infraestructura, soporte y contenido. No se extrapola el costo del escenario pequeño para servir indefinidamente a una audiencia mayor.

## 7. Sensibilidad del escenario base

| Cambio aislado respecto de la base | Resultado mensual, USD | Implicación |
|---|---:|---|
| Conversión baja a 2 % | −2.368 | El volumen de usuarios no compensa por sí solo |
| Conversión sube a 6 % | −800 | Mejorar conversión ayuda, pero todavía hay déficit |
| No existe GMV secundario | −1.682 | El mercado no debe sostener la tesis principal |
| Costo variable sube a USD 0,10/MAU | −1.834 | Medir carga y costo por sesión es necesario |
| Se agrega nómina mensual de USD 6.000 | −7.584 | El presupuesto de piloto no paga una plantilla completa |

En expansión, la misma nómina adicional reduce USD 1.835 a USD −4.165. Esa diferencia muestra la necesidad de presupuesto de desarrollo, mayor margen validado o un alcance operativo menor. No se cubrirá con un supuesto retorno especulativo.

## 8. Retención, CAC y LTV

CAC por activación = gasto atribuible al canal / jugadores nuevos que completan la primera práctica. CAC por comprador = gasto atribuible / compradores nuevos del mismo canal y ventana. Son métricas distintas y deben conservar su denominador.

LTV de contribución se estimará sumando contribución observada por cohorte durante su vida, con censura de usuarios recientes y costos de usuarios gratuitos. En la base, tres meses activos a contribución constante darían USD 0,8496 por activación. Es una sensibilidad y no una predicción basada en D7. Con CAC de USD 2, el escenario no justifica ampliar publicidad.

Criterio propuesto: invertir para aprender con un tope aprobado; ampliar gasto solo con contribución positiva observada, plazo de recuperación compatible con caja y una relación LTV/CAC objetivo de al menos 3. Ese múltiplo es una regla interna, no una garantía ni un benchmark validado para el proyecto.

## 9. Tesorería, conciliación y presupuesto

La dirección de tesorería recibe pagos; no debe compartir clave operativa con admin o minter. Antes de producción se propone firma con umbral para decisiones de tesorería, límites de gasto, presupuesto de fees y conciliación semanal independiente de quien emite premios. El contrato no implementa contabilidad empresarial ni reembolsos administrativos.

Cada conciliación deberá separar ventas primarias, GMV secundario, comisión, grants, aportes del equipo, subsidios, gastos de red y ajustes. No se asume que el saldo de una wallet sea ingreso reconocido. La política de reembolso se diseñará con revisión jurídica y técnica: revertir una transferencia blockchain no es una función actual.

El presupuesto semestral y la gobernanza se desarrollan en [BUSINESS_PLAN.md](BUSINESS_PLAN.md). Revisar mensualmente consumo de caja, contribución por cohorte y fondos comprometidos. La decisión de continuar deberá basarse en caja disponible y evidencia, no solo en usuarios registrados.
