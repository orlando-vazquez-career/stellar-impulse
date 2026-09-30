# Sector 01 · Umbral Helios (Tiled)

Abre `sector-01.tmj` con Tiled 1.10 o superior. `stellar-plataformas.png` debe estar en la misma carpeta.

## Capas (de abajo hacia arriba)
- espacio: estrellas del vacío. Se ven solo donde no hay plataforma.
- plataforma: plataformas metálicas a nivel 0 (Wang set "Plataforma").
- decoracion: rejillas, cables, luces, grietas y franjas de peligro.
- obstaculos: escombros que bloquean el paso.
- rampas: conexiones entre el nivel 0 y la meseta.
- plataforma-alta: meseta elevada del centro (Wang set "Plataforma alta").
- objetos: bases, puntos de captura, recursos y núcleo.

## Pintar plataformas con bordes automáticos
1. Ver > Vistas y barras > Conjuntos de terrenos (Terrain Sets).
2. Elige la capa "plataforma" y el terreno "Plataforma".
3. Pinta con el Pincel de terreno (tecla T). Tiled elige bordes y esquinas solo.
   Para borrar, mantén Shift mientras pintas.
- Para la meseta: capa "plataforma-alta" con el terreno "Plataforma alta".
  Debajo tiene que haber plataforma normal.

## Rampas
Van en la capa "rampas", en una casilla del borde de la meseta. En esa misma casilla,
borra el tile de "plataforma-alta". Cada rampa tiene la propiedad `ramp`
(x+, x-, y+, y-) con la dirección en la que sube.

## Propiedades que leerá el juego
- walkable: si la casilla se puede recorrer (los bordes parciales no).
- level: 0 = suelo, 1 = meseta.
- ramp: dirección de subida.
- symbol: A, B, C, R o N en los objetos.

## Cambiar el tamaño
Mapa > Redimensionar mapa. Luego repinta los bordes con el pincel de terreno.
