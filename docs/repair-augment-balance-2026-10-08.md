# Ajuste de reparación — 8 de octubre de 2026

Alcance: únicamente los valores de **Reparación de campo** (`g-campo`) y
**Nanorreparadores** (`s-nanorep`), sus textos ES/EN y las comprobaciones de esos
valores. No se cambian reglas de combate, IA, otros aumentos, cliente ni contratos.
Los efectos siguen declarados en `packages/sim/src/augments/catalog.ts`; no fue
necesario modificar `effects.ts` ni el motor que aplica la reparación.

## Antes y después

| Aumento | Antes | Después |
| --- | --- | --- |
| Reparación de campo | +2 de vida/s después de 5 s sin atacar ni recibir daño | +0,05 de vida/s después de 60 s sin atacar ni recibir daño |
| Nanorreparadores | Reparación en base de 3 de vida/s y radio 3 | Reparación en base de 1,15 de vida/s y radio 2 |

La reparación de base sin este aumento permanece en 1 de vida/s, radio 2.
Nanorreparadores añade así 0,15 de vida/s sobre la reparación normal, sin ampliar
su cobertura. Reparación de campo conserva su alcance global, pero su espera y
su tasa reducen la ventaja de curar una flota entera entre enfrentamientos.
Ambas cartas siguen siendo gratuitas y no modifican la vida máxima.

## Resultados de balance

La referencia anterior es la [corrida histórica](augment-balance-report.md),
congelada en `ab39471`: Reparación de campo obtuvo 177 victorias, 23 derrotas y
0 empates (88,5 %); Nanorreparadores obtuvo 145 victorias, 53 derrotas y 2 empates
(72,5 %). Cada carta tuvo 200 partidas.

La medición nueva usa el motor de esta rama, basado en `09eae5e` y el commit
previo `d0cf481`. La simulación evolucionó desde la corrida histórica: esos
porcentajes anteriores son la referencia reportada, no un control ejecutado de
nuevo sobre el motor actual. No se atribuye toda la diferencia entre corridas
exclusivamente a estos dos valores.

| Aumento | Antes (histórico) | Partidas nuevas | Victorias | Derrotas | Empates | Después | Objetivo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Reparación de campo | 88,5 % | 200 | 104 | 96 | 0 | 52,0 % | Cumple 45–60 % |
| Nanorreparadores | 72,5 % | 200 | 92 | 108 | 0 | 46,0 % | Cumple 45–60 % |

Desglose de la corrida nueva; el objetivo se evalúa en las 200 partidas de cada
carta, no como un límite independiente por cada mapa/modo:

| Aumento | Mapa | Modo | Partidas | Victorias | Derrotas | Empates | Victoria |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `g-campo` | sector-01 | complete | 50 | 25 | 25 | 0 | 50,0 % |
| `g-campo` | sector-01 | skirmish | 50 | 28 | 22 | 0 | 56,0 % |
| `g-campo` | espiral | complete | 50 | 27 | 23 | 0 | 54,0 % |
| `g-campo` | espiral | skirmish | 50 | 24 | 26 | 0 | 48,0 % |
| `s-nanorep` | sector-01 | complete | 50 | 25 | 25 | 0 | 50,0 % |
| `s-nanorep` | sector-01 | skirmish | 50 | 16 | 34 | 0 | 32,0 % |
| `s-nanorep` | espiral | complete | 50 | 25 | 25 | 0 | 50,0 % |
| `s-nanorep` | espiral | skirmish | 50 | 26 | 24 | 0 | 52,0 % |

[Datos crudos de las 400 partidas](qa/repair-augment-balance-2026-10-08.csv): aumento, semilla, mapa, modo, lado aumentado y resultado oficial.


## Método y reproducción

- IA Media contra IA Media, una con la carta fija y otra sin aumentos.
- Se aplica la carta en su momento normal: plata al inicio; oro al minuto 5 en
  Partida completa o al minuto 2 en Escaramuza. Se suprimen otras ofertas.
- 200 partidas por carta: 50 por combinación de mapa y modo; `sector-01` y
  `espiral`, Partida completa y Escaramuza.
- Para el índice `i` de 0 a 199: semilla `1000 + floor(i / 2)`; lado aumentado
  `p1` si `i` es par y `p2` si es impar. La combinación se elige con
  `floor(i / 2) % 4`, en el orden de mapas/modos del ejecutor existente.
- Se conserva el resultado oficial, incluida muerte súbita, hasta ganar o
  alcanzar 27.000 ticks (45 minutos). Un empate permanece empate y forma parte
  del denominador; no se reparte como media victoria.
- Objetivo nuevo para ambas cartas: **45–60 % de victorias observadas**. El
  experimento mide cartas aisladas con esa IA; no mide combinaciones ni jugadores
  humanos.

```powershell
pnpm exec tsx scripts/balance-augments.ts --id g-campo --samples 200
pnpm exec tsx scripts/balance-augments.ts --id s-nanorep --samples 200
```

El ejecutor existente escribe resultados crudos en `.local/balance/<id>.json`.
Esta corrida distribuye los mismos índices entre procesos locales independientes
y reúne sus resultados; no cambia el motor ni sustituye la simulación por una
fórmula de victoria.

## Validación

Los tests verifican las cantidades exactas, que una nave a distancia 3 ya no se
repara con Nanorreparadores, y que recibir daño reinicia los 60 s completos de
espera de Reparación de campo. `pnpm check` pasó: 654 tests aprobados y 9 omitidos
por las condiciones existentes de la suite, además de tipos, límites de paquetes
y compilación. La primera ejecución coincidió con seis procesos de balance y el
test extenso de formaciones excedió 120 s; repetir el chequeo sin esos procesos
pasó sin ampliar el timeout ni cambiar ese test.
