import mapa from '../tiled-maps/trascendencia-estelar_2/trascendencia-estelar_2.json';
import { leerEspiral } from './espiral.js';

/** Trascendencia Estelar for two fleets (115×115): an archipelago with capturable stations and destructible barriers. */
export const TRASCENDENCIA = leerEspiral(mapa);
