# Balance de aumentos: primera corrida, pendiente de ajustes

Estado al 4 de octubre de 2026. Resultados parciales de 200 partidas por carta: IA Media contra IA Media, ambos mapas y modos, semillas fijas y lados alternados. La corrida usa una copia congelada de la simulación de `ab39471`; integrar main no cambió esa simulación.

No es una validación de balance: varias cartas quedan fuera del rango y hay empates tras el límite de seguridad de 45 minutos, incluso con muerte súbita. Falta completar las 44 cartas, revisar la IA y ajustar los efectos que lo requieran, luego repetir el experimento.

| Carta | Nivel | Partidas | Victorias | Derrotas | Empates | Victoria | Rango solicitado |
|---|---|---:|---:|---:|---:|---:|---|
| g-calibracion | gold | 200 | 111 | 85 | 4 | 55.5 % | 54–61 % |
| g-campo | gold | 200 | 177 | 23 | 0 | 88.5 % | 54–61 % |
| g-cazadores | gold | 200 | 87 | 111 | 2 | 43.5 % | 54–61 % |
| g-chatarra | gold | 200 | 99 | 99 | 2 | 49.5 % | 54–61 % |
| g-corazas | gold | 200 | 89 | 110 | 1 | 44.5 % | 54–61 % |
| g-escolta | gold | 200 | 109 | 89 | 2 | 54.5 % | 54–61 % |
| g-impulso | gold | 200 | 72 | 127 | 1 | 36 % | 54–61 % |
| g-linea | gold | 200 | 95 | 101 | 4 | 47.5 % | 54–61 % |
| g-logistica | gold | 200 | 92 | 102 | 6 | 46 % | 54–61 % |
| g-mineria | gold | 200 | 99 | 99 | 2 | 49.5 % | 54–61 % |
| g-sensores | gold | 200 | 85 | 109 | 6 | 42.5 % | 54–61 % |
| g-senuelos | gold | 200 | 110 | 90 | 0 | 55 % | 54–61 % |
| g-serie | gold | 200 | 99 | 99 | 2 | 49.5 % | 54–61 % |
| g-tripulacion | gold | 200 | 105 | 93 | 2 | 52.5 % | 54–61 % |
| p-asalto | prismatic | 200 | 96 | 102 | 2 | 48 % | 57–66 % |
| p-enjambre | prismatic | 200 | 109 | 89 | 2 | 54.5 % | 57–66 % |
| s-aceleradores | silver | 200 | 97 | 101 | 2 | 48.5 % | 51–57 % |
| s-blindaje | silver | 200 | 112 | 85 | 3 | 56 % | 51–57 % |
| s-carga | silver | 200 | 118 | 77 | 5 | 59 % | 51–57 % |
| s-cartografia | silver | 200 | 100 | 100 | 0 | 50 % | 51–57 % |
| s-contratos | silver | 200 | 79 | 117 | 4 | 39.5 % | 51–57 % |
| s-espoletas | silver | 200 | 106 | 92 | 2 | 53 % | 51–57 % |
| s-exploradores | silver | 200 | 107 | 91 | 2 | 53.5 % | 51–57 % |
| s-hangar | silver | 200 | 105 | 93 | 2 | 52.5 % | 51–57 % |
| s-mamparos | silver | 200 | 103 | 94 | 3 | 51.5 % | 51–57 % |
| s-mantenimiento | silver | 200 | 102 | 97 | 1 | 51 % | 51–57 % |
| s-nanorep | silver | 200 | 145 | 53 | 2 | 72.5 % | 51–57 % |
| s-optica | silver | 200 | 87 | 110 | 3 | 43.5 % | 51–57 % |
| s-refuerzos | silver | 200 | 104 | 95 | 1 | 52 % | 51–57 % |
| s-reservas | silver | 200 | 100 | 100 | 0 | 50 % | 51–57 % |

30 de 44 cartas completadas en esta captura. Reparación de campo y Nanorreparadores superan el máximo del 70 %; requieren ajustes antes de aprobar el balance. Las filas futuras y los resultados crudos permanecen en `.local/balance-run-44/.local/balance`.
