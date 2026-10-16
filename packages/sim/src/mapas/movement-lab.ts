import mapa from '../tiled-maps/espiral-estelar_2/laboratorio-movimiento.json';
import { leerEspiral } from './espiral.js';

/** Compact, mirrored Tiled layout used only by the movement sandbox. */
export const MOVEMENT_LAB = leerEspiral(mapa);
