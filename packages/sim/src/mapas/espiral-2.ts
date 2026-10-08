import mapa from '../tiled-maps/espiral-estelar_2/espiral-estelar_2.json';
import { leerEspiral } from './espiral.js';

/** Espiral Estelar II: horizontal layout, alternating satellite zones and drifting purple nebula. */
export const ESPIRAL_2 = leerEspiral(mapa);
