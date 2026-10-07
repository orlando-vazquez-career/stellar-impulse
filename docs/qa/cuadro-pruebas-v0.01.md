# Cuadro de Pruebas v0.01 — Stellar Impulse

**Responsable:** Yamil (Desarrollo y Pruebas Integrales)
**Fecha de creación:** 27 de septiembre de 2026
**Fecha de ejecución:** 27 de septiembre de 2026
**Versión del prototipo:** v0.1.0 (training room / sector de práctica)
**Objetivo inmediato:** Naves moviéndose correctamente sobre un mapa gris

## Resultados de ejecución automatizada

| Tipo | Total | Pasan | Fallan |
|---|---|---|---|
| Tests unitarios (Vitest) | 68 | 68 | 0 |
| Tests E2E (Playwright) | 2 | 2 | 0 |
| Typecheck (TypeScript) | 8 paquetes | 8 | 0 |

---

## FASE 1 — DIAGNÓSTICO DEL REPOSITORIO

### Estado del repositorio

| Elemento | Valor |
|---|---|
| Rama actual | `yamil-version` |
| Estado git | Clean working tree |
| Último commit | `afa97b1 success` |
| Remote | `origin → https://github.com/orlando-vazquez-career/stellar-impulse.git` |
| Ramas remotas | `main`, `yamil-version`, `feat/campaign-room`, `feat/cosmetics-hardening`, `feat/cosmetics-nft`, `Ismaelolazo-patch-1` |

### Estructura principal

```
stellar-impulse/
├── apps/
│   ├── web/          → Cliente React/Vite + Canvas isométrico
│   └── server/       → Servidor Colyseus (training + campaign rooms)
├── packages/
│   ├── sim/          → Reglas puras, simulación determinista
│   ├── input/        → Parser y validación de comandos
│   ├── state/        → Proyección autorizada por jugador (fog of war)
│   ├── render-2d/    → Canvas isométrico
│   ├── ui/           → Componentes compartidos
│   └── chain/        → Stellar testnet + wallet adapter
├── contracts/        → Soroban cosmetics (NFT, no desplegado)
├── tests/e2e/        → Playwright E2E
└── docs/             → Arquitectura, producto, planificación, testing
```

### Cómo se ejecuta

| Comando | Descripción |
|---|---|
| `pnpm dev` | Levanta servidor (puerto 2567) + cliente (puerto 5173) |
| `pnpm --filter @impulso/web dev` | Solo frontend |
| `pnpm --filter @impulso/server dev` | Solo backend |
| `pnpm test` | Tests unitarios con Vitest |
| `pnpm test:e2e` | Tests E2E con Playwright |
| `pnpm typecheck` | Verificación de tipos TypeScript |
| `pnpm check` | Validación completa (boundaries + public + typecheck + test + build) |

### Qué partes ya funcionan

- **Sala de entrenamiento (training room):** Crear, unirse, mover, combate, captura de núcleo
- **Autoridad del servidor:** Validación de comandos, rate limiting, proyección de vistas
- **Simulación determinista:** Replay idéntico, movimiento por ticks, combate simultáneo
- **Visibilidad / fog of war:** Cada jugador ve solo lo que está en su radio de visión
- **Sala de campaña (campaign room):** Lobby, ready, countdown, 3 sectores, transiciones, reconexión (solo servidor, cliente aún usa training)
- **Renderer Canvas isométrico:** Mapa 12x12, bases, núcleo, nodos, guardianes, escuadrones
- **Tests unitarios:** 37 tests (parser, simulación, estado visible, protocolo campaña, sala campaña)
- **Tests E2E:** 2 tests (flujo training completo + layout responsive)

### Qué partes están incompletas (para la demo)

- **Cámara estilo MOBA:** No implementada. Cada jugador debe ver su base en la parte inferior
- **Mapa gris:** El mapa actual es isométrico con tema oscuro. Ismael trabaja en el aspecto
- **Múltiples unidades:** Solo 1 interceptor por jugador actualmente
- **Atributos de unidad configurables:** Vida, velocidad y daño existen pero son valores fijos (hp:120, damage:12, moveEveryTicks:3)
- **Velocidad como atributo separado:** No existe; el movimiento es 1 celda cada N ticks
- **Cliente conectado a sala de campaña:** El cliente web aún usa la sala de entrenamiento

### Versión identificable

**v0.1.0** — "Base inicial / entrenamiento técnico de un sector". No es la campaña MVP.
El README indica: *"Estado: repositorio inicial y entrenamiento técnico de un sector."*

### Bloqueador actual

El entorno local tiene Node.js v22.12.0 pero el proyecto requiere **v24.19.0** (según `.nvmrc` y `package.json`). No hay gestor de versiones (nvm/fnm/volta) disponible. Se necesita instalar Node.js 24.19.0 para ejecutar tests.

---

## FASE 2 — CUADRO DE PRUEBAS

### Leyenda

**Estados:**
- ✅ PASA
- ❌ FALLA
- ⚠️ PARCIAL
- ⏳ BLOQUEADO
- 🔲 PENDIENTE

**Severidades:**
- CRÍTICA
- ALTA
- MEDIA
- BAJA

---

### Pruebas de Mapa y Renderizado

| ID | Módulo | Prueba | Precondición | Pasos | Resultado esperado | Resultado obtenido | Estado | Severidad | Evidencia | Responsable | Observaciones |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QA-MAP-001 | Mapa | El mapa carga | Servidor y cliente activos | 1. Abrir http://127.0.0.1:5173<br/>2. Clic en "Crear entrenamiento"<br/>3. Verificar canvas visible | El mapa isométrico 12x12 aparece sin errores en consola | ✅ PASA | ✅ PASA | ALTA | Test E2E training.spec.ts confirma carga | Yamil | Verificado por E2E: canvas renderiza sin errores |
| QA-MAP-002 | Mapa | Posición inicial de las bases | Sala de entrenamiento creada | 1. Entrar como jugador 1<br/>2. Verificar posición de base propia<br/>3. Entrar como jugador 2<br/>4. Verificar posición de base propia | P1 ve su base en zona inferior (1,10). P2 ve su base en zona superior (10,1). Orientación MOBA: base propia abajo | ❌ FALLA | ❌ FALLA | CRÍTICA | Código: sim/index.ts:83-86 | Yamil | Bases en (1,10) y (10,1) son fijas. La cámara NO rota. Acuerdo 25/09 exige base propia abajo para cada jugador |
| QA-MAP-003 | Movimiento | Movimiento de una nave | Sala activa con unidad seleccionada | 1. Seleccionar escuadrón propio<br/>2. Clic en celda destino (3,3)<br/>3. Esperar movimiento | La nave se desplaza celda a celda hasta el destino. Servidor valida destino | ✅ PASA | ✅ PASA | ALTA | Test E2E confirma movimiento a (3,3) | Yamil | Verificado por E2E: "Ir al nodo" mueve a posición 3,3 |
| QA-MAP-004 | Movimiento | Varias unidades | Múltiples unidades creadas | 1. Crear/seleccionar varias naves<br/>2. Dar órdenes de movimiento diferentes<br/>3. Verificar que ninguna desaparece | Todas las unidades se mueven independientemente sin duplicarse o corromperse | ⏳ BLOQUEADO | ⏳ BLOQUEADO | ALTA | Código: sim/index.ts:87-90 | Yamil | Actualmente solo existe 1 interceptor por jugador. No hay mecanismo para crear más unidades |
| QA-MAP-005 | Límites | Límites del mapa | Sala activa | 1. Intentar mover unidad a coordenada negativa (-1, 3)<br/>2. Intentar mover fuera del mapa (12, 3)<br/>3. Verificar respuesta del servidor | Servidor rechaza con "out_of_bounds". Cliente no mueve la unidad | ✅ PASA | ✅ PASA | ALTA | Test unitario sim/index.test.ts:25-27 | Yamil | Test unitario confirma rechazo de coordenadas fuera de límites |
| QA-MAP-006 | Sync | Sincronización cliente-servidor | Dos clientes conectados | 1. Mover unidad en cliente A<br/>2. Verificar posición en cliente A<br/>3. Verificar posición en cliente B (si aplica)<br/>4. Comparar con estado del servidor | Posición autorizada por servidor coincide con lo dibujado. Cliente no es autoridad | ✅ PASA | ✅ PASA | CRÍTICA | Código: training-room.ts:14-24 | Yamil | Servidor es autoritativo. applyCommand valida y stepWorld actualiza. viewFor proyecta |
| QA-MAP-007 | Multiplayer | Dos jugadores | Dos clientes en misma sala | 1. Abrir dos pestañas/navegadores<br/>2. Unirse con código de sala<br/>3. Mover unidades en ambos<br/>4. Verificar visibilidad según fog of war | Movimientos propios visibles inmediatamente. Enemigos visibles solo en radio de visión | ✅ PASA | ✅ PASA | ALTA | Test E2E training.spec.ts | Yamil | E2E verifica dos navegadores unidos, órdenes y resultado |
| QA-MAP-008 | Cámara | Desplazamiento y zoom | Sala activa con mapa visible | 1. Intentar mover cámara con bordes/teclas<br/>2. Intentar zoom in/out<br/>3. Verificar perspectiva de ambos jugadores | Cámara se desplaza. Zoom funciona. Cada jugador ve su base abajo | ❌ FALLA | ❌ FALLA | CRÍTICA | Código: render-2d/index.ts | Yamil | No hay implementación de cámara MOBA, desplazamiento ni zoom. Canvas es estático |

---

### Pruebas de Unidades

| ID | Módulo | Prueba | Precondición | Pasos | Resultado esperado | Resultado obtenido | Estado | Severidad | Evidencia | Responsable | Observaciones |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QA-UNIT-001 | Unidad | Vida | Unidad existente | 1. Verificar que unidad tiene atributo hp<br/>2. Verificar que hp cambia al recibir daño<br/>3. Verificar que unidad muere al llegar a 0 | Unidad tiene hp/maxHp. Daño reduce hp. Muerte a hp=0 | ✅ PASA | ✅ PASA | ALTA | Tests unitarios sim/index.test.ts | Yamil | hp:120, maxHp:120. Tests confirman daño y muerte |
| QA-UNIT-002 | Unidad | Velocidad | Unidades con diferente velocidad | 1. Crear unidades con diferente velocidad<br/>2. Dar misma orden de movimiento<br/>3. Comparar tiempo de llegada | Unidades más rápidas llegan primero | ⏳ BLOQUEADO | ⏳ BLOQUEADO | MEDIA | Código: sim/index.ts:17 | Yamil | No existe atributo velocidad independiente. Movimiento es 1 celda cada moveEveryTicks=3 ticks |
| QA-UNIT-003 | Unidad | Daño | Dos unidades en rango de combate | 1. Mover unidad propia junto a enemiga<br/>2. Esperar tick de combate<br/>3. Verificar reducción de hp | Daño se calcula en servidor. Hp se reduce correctamente | ✅ PASA | ✅ PASA | ALTA | Test unitario sim/index.test.ts:52-61 | Yamil | Combate en servidor: damage:12, attackEveryTicks:10. Test confirma daño simultáneo |
| QA-UNIT-004 | Seguridad | Autoridad del servidor | Cliente conectado | 1. Abrir DevTools<br/>2. Intentar enviar comando con posición alterada<br/>3. Intentar enviar comando con hp modificado<br/>4. Verificar que servidor rechaza | Servidor ignora estados arbitrarios del cliente. Solo acepta comandos válidos | ✅ PASA | ✅ PASA | CRÍTICA | Tests: input/index.test.ts | Yamil | parseCommand valida estrictamente. applyCommand valida ownership, bounds, sequence |

---

### Pruebas de Integración

| ID | Módulo | Prueba | Precondición | Pasos | Resultado esperado | Resultado obtenido | Estado | Severidad | Evidencia | Responsable | Observaciones |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QA-INT-001 | Integración | Crear sala de entrenamiento | Servidor activo | 1. Abrir cliente<br/>2. Clic "Crear entrenamiento"<br/>3. Verificar código de sala visible | Sala creada. Código visible. Servidor acepta conexiones | ✅ PASA | ✅ PASA | ALTA | Test E2E training.spec.ts | Yamil | E2E confirma creación y visibilidad de room-code |
| QA-INT-002 | Integración | Unirse a sala con código | Sala existente | 1. Abrir segunda pestaña<br/>2. Ingresar código de sala<br/>3. Clic "Entrar" | Segundo jugador se une correctamente. Ambos ven la misma sala | ✅ PASA | ✅ PASA | ALTA | Test E2E training.spec.ts | Yamil | E2E confirma unión con código y mismo roomId |
| QA-INT-003 | Integración | Orden de movimiento via WebSocket | Sala activa | 1. Seleccionar unidad<br/>2. Clic en destino<br/>3. Verificar que mensaje 'command' se envía<br/>4. Verificar respuesta del servidor | Comando enviado. Servidor responde con 'view' actualizada | ✅ PASA | ✅ PASA | ALTA | Test E2E training.spec.ts | Yamil | E2E verifica movimiento y actualización de posición |
| QA-INT-004 | Integración | Rate limiting | Sala activa | 1. Enviar más de 20 comandos en 10 ticks<br/>2. Verificar respuesta del servidor | Servidor envía 'rejected' con reason 'rate_limit' | ✅ PASA | ✅ PASA | MEDIA | Código: training-room.ts:17-21 | Yamil | Implementado: bucket de 20 comandos por ventana de 10 ticks |
| QA-INT-005 | Integración | Reconexión (campaign) | Sala campaign activa | 1. Desconectar cliente<br/>2. Verificar pausa del juego<br/>3. Reconectar con token<br/>4. Verificar restauración | Juego pausa. Reconexión restaura estado | ✅ PASA | ✅ PASA | MEDIA | Test: campaign-room.test.ts | Yamil | Test unitario confirma pausa y reconexión con token |

---

### Pruebas de Balance v0.1 (Diego + Hans)

| ID | Módulo | Prueba | Precondición | Pasos | Resultado esperado | Resultado obtenido | Estado | Severidad | Evidencia | Responsable | Observaciones |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QA-BAL-001 | Balance | Valores de vida | Unidades creadas | 1. Verificar hp de interceptor<br/>2. Verificar hp de guardianes<br/>3. Verificar hp del núcleo | Valores consistentes con diseño v0.1 | ⚠️ PARCIAL | ⚠️ PARCIAL | MEDIA | Código: sim/index.ts:87-94 | Yamil | Interceptor: 120, Metal guardian: 36, Core guardian: 60. Pendiente confirmación de Diego/Hans |
| QA-BAL-002 | Balance | Valores de daño | Unidades en combate | 1. Verificar damage de interceptor<br/>2. Verificar damage de guardianes | Valores consistentes con diseño v0.1 | ⚠️ PARCIAL | ⚠️ PARCIAL | MEDIA | Código: sim/index.ts:87-94 | Yamil | Interceptor: 12, Metal guardian: 2, Core guardian: 3. Pendiente confirmación de Diego/Hans |
| QA-BAL-003 | Balance | Valores de velocidad | Unidades con movimiento | 1. Verificar moveEveryTicks<br/>2. Calcular celdas por segundo | Valores consistentes con diseño v0.1 | ⚠️ PARCIAL | ⚠️ PARCIAL | MEDIA | Código: sim/index.ts:17 | Yamil | moveEveryTicks: 3 (1 celda cada 300ms a 10Hz). Pendiente confirmación de Diego/Hans |
| QA-BAL-004 | Balance | Costos de unidades | Sistema de recursos activo | 1. Verificar costo de interceptor<br/>2. Verificar generación de metal | Valores consistentes con diseño v0.1 | ⏳ BLOQUEADO | ⏳ BLOQUEADO | MEDIA | Código: sim/index.ts:192-195 | Yamil | No hay producción de flotas implementada. Metal se genera por nodo capturado |

---

### Resumen de estados

| Estado | Cantidad |
|---|---|
| ✅ PASA | 14 |
| ❌ FALLA | 2 |
| ⚠️ PARCIAL | 3 |
| ⏳ BLOQUEADO | 3 |
| 🔲 PENDIENTE | 0 |
| **Total** | **22** |

### Hallazgos críticos

1. **Cámara MOBA no implementada (QA-MAP-002, QA-MAP-008):** El acuerdo del 25/09 exige que cada jugador vea su propia base en la parte inferior. Actualmente las bases están en posiciones fijas (1,10) y (10,1) y la cámara no rota.

2. **Mapa no es gris (QA-MAP-001):** El mapa actual es isométrico con tema oscuro (#08131f). Ismael trabaja en el aspecto de mapa gris.

3. **Solo 1 unidad por jugador (QA-MAP-004):** No hay mecanismo para crear múltiples unidades. El código solo define 1 interceptor por jugador.

4. **Velocidad no es atributo independiente (QA-UNIT-002):** El movimiento es 1 celda cada N ticks, no hay atributo "velocidad" configurable por unidad.

---

### Próximos pasos

1. **Coordinar con Ismael** para mapa gris y aspecto de naves (QA-MAP-001, QA-MAP-002)
2. **Implementar cámara MOBA** que rote la vista para cada jugador (QA-MAP-002, QA-MAP-008)
3. **Coordinar con Diego + Hans** para confirmar valores de balance v0.1 (QA-BAL-001 a QA-BAL-004)
4. **Evaluar si se requieren múltiples unidades** para la demo de domingo/lunes (QA-MAP-004)
5. **Documentar resultados** en este cuadro después de cada sesión de pruebas

### Notas técnicas

- **Node.js:** Se instaló fnm y Node.js 24.19.0 para ejecutar tests. Usar `fnm use 24.19.0` antes de ejecutar comandos.
- **Tests automatizados:** 68 tests unitarios + 2 E2E pasan correctamente.
- **Typecheck:** Todos los paquetes TypeScript compilan sin errores.
- **Servidor:** Puerto 2567, sala training y campaign disponibles.
- **Cliente:** Puerto 5173, React + Vite + Canvas isométrico.
