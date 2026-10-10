# Créditos de los assets

## Descargados (licencia CC0, dominio público)

De [Kenney](https://kenney.nl). No exigen atribución; se anota igual. La licencia original está en
`herramientas/fuentes/licencia_kenney.txt`.

| Archivos en `tilesets/img/` | Paquete | Qué se hizo |
|---|---|---|
| `planeta_00.png` … `planeta_09.png` | [Planets](https://kenney.nl/assets/planets) | Reducidos de 1280 a 384 px |
| `estacion_lejana_1.png`, `estacion_lejana_2.png` | [Space Shooter Extension](https://kenney.nl/assets/space-shooter-extension) | Reducidas, oscurecidas y azuladas para que se lean como fondo |

## Fabricados para este mapa

Los dibuja `herramientas/assets_espacio.py`: `hielo.png`, `estrellas.png`, `nube_*.png`, `galaxia.png`,
`cometa_*.png`, `pulsar_*.png`, `barrera_*.png` y `cristal_gigante_*.png`.

`logo_stellar*.png` sale del logo de Stellar (`herramientas/fuentes/logo_stellar.png`) con
`herramientas/logo_stellar.py`. El logo es marca de la Stellar Development Foundation.

## Generados con IA (Codex)

`torre_vigilancia.png` (octubre de 2026) se generó con la herramienta de imágenes de Codex, anclada a dos
referencias de estilo del kit: `base_jugador.png` y una torre de defensa aprobada por el equipo. Se
recortó y se ajustó al lienzo de 80×128 con el pie en la fila 122 y el centro en la columna 40, y es
idéntica en `espiral-estelar`, `espiral-estelar_2` y `trascendencia-estelar_2`. Las torretas jugables
(`apps/web/public/assets/game/structures/turret-*-neutral.png`) salieron del mismo proceso, en vista
cenital con `command-base-top-neutral.png` como referencia.

## Heredados del Espiral Estelar

Todo lo demás de `tilesets/`, `assets-externos/` y `assets-juego/` viene del kit de `espiral-estelar_2`.
