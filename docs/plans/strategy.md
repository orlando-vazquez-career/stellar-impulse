# Estrategia de la primera demo

## Resultado a defender

Una campaña comprensible en navegador: dos jugadores, tres sectores, PvE que habilita
captura, progresión temporal y propiedad cosmética verificable en testnet.
La habilidad define resultados; las compras solo cambian apariencia.

Este bootstrap permite empezar a integrar y probar. No sustituye las 180 horas de producto
previstas. La fecha oficial, disponibilidad y presupuesto siguen por confirmar.

## Responsabilidad y capacidad

| Frente | Dueño | Apoyo | Revisor | Horas de equipo |
|---|---|---|---|---:|
| Simulación | Yamil | Diego | Orlando | 26 |
| Servidor y red | Orlando | Yamil | Hans, con apoyo técnico | 21 |
| Cliente e interfaz | Yamil | Ismael | Diego | 24 |
| Contratos e integración | Orlando | Yamil | Hans para evidencia, revisión técnica separada | 18 |
| Arte | Ismael | Diego | Yamil | 22 |
| Diseño y balance | Diego | Hans | Ismael | 26 |
| QA e integración | Hans | Todos | Diego | 29 |
| Gestión y demo | Hans | Ismael | Diego | 14 |
| Total | | | | 180 |

Hipótesis: 36 h por persona, 180 h totales. Del 23 sep al 11 oct son 19 días;
15 h semanales equivalen a 203,6 h teóricas de equipo. Reserva: 23,6 h (~12 %).
Las horas incluyen apoyo y revisión; no se suman por segunda vez. La táctica presenta
45 tarjetas de cuatro horas por dueño para repartir inicialmente; Hans ajusta la carga
entre frentes conservando el techo de 180 h. Ninguna asignación confirma disponibilidad.

## Hitos y puertas de aceptación

| Fecha propuesta | Hito | Evidencia para cerrar |
|---|---|---|
| 23–25 sep | Contratos de interfaces y primer sector | Mover, combatir guardián y capturar nodo; reglas de reset escritas |
| 26–28 sep | Run contra bot y cosmetics inicial | Tres sectores completos; propiedad de pieza consultable en testnet |
| 29 sep–2 oct | 1v1 autoritativo | Dos navegadores, vistas filtradas, sustitución y reconexión |
| 3–5 oct | Propiedad y premios | Compra, premio idempotente y equipamiento visible; cero pay-to-win |
| 6–7 oct | Candidata y cierre de funciones | Ningún fallo bloquea completar campaña |
| 8–10 oct | Revisión, evidencia y ensayo | Contratos revisados, video de 2–3 min, contingencia repetible |
| 11 oct | Entrega | URL, repo, video y documentación verificadas |

Playtests: 25 sep, 2 oct y 9 oct. Freeze: 7 oct. Son fechas del plan, no compromisos
ya confirmados por el programa ni constancia de trabajo terminado.

## Dependencias

Reglas/input → sim → vistas → servidor/cliente → campaña 1v1 → pruebas.
En paralelo: arte con interfaz estable; contrato con especificación aprobada;
identidad y persistencia antes de premios. No usar mercado como sustituto de jugabilidad.

## Riesgos y decisiones de recorte

- Bola de nieve: medir ganador por sector previo, lado y tecnología; reset y reroll limitado.
- Captura estancada: combatir antes de capturar, scout sin bloqueo y desempate explícito.
- Sin dos clientes completos el 2 oct: detener contenido adicional y resolver integración.
- Arte/rutas retrasados: mantener cuadrícula y sprites reutilizables.
- Testnet/RPC indisponible: juego independiente, premios pendientes y redespliegue documentado.
- Horas insuficientes: revisar capacidad a diario; recortar antes de consumir la reserva.
- Claves y permisos: no incluir secretos, separar admin/emisor/tesorería y exigir revisión técnica.

Orden de recorte: mercado/actas → efectos y variantes → tecnologías de 12–15 a 6 →
una plantilla reutilizada y jefe simple. Preservar 1v1, tres etapas, captura final,
vistas autorizadas y propiedad sin ventajas. Si no alcanza, renegociar alcance/fecha:
un solo sector sigue siendo prototipo.

## Cadencia

Tarjetas de 3–4 h con dueño, apoyo, revisor distinto, dependencia, fecha y prueba.
Actualización diaria de 15 minutos o escrita. Una persona revisa cada PR.
Hans recopila evidencias; los riesgos de contratos requieren criterio técnico.
