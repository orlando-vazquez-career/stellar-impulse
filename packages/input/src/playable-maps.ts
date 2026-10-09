/** The maps available to players, shared by campaign/practice and multiplayer admission. */
export const PLAYABLE_MAPS = [{
  id: 'espiral',
  name: { es: 'Espiral Estelar', en: 'Stellar Spiral' },
  description: {
    es: '96×96. Carriles de impulso, nebulosas y núcleo con escudo.',
    en: '96×96. Boost lanes, nebulas and a shielded core.',
  },
}, {
  id: 'espiral-2',
  name: { es: 'Caos Estelar', en: 'Stellar Chaos' },
  description: {
    es: '96×96. Carriles anchos, niebla morada que avanza y satélites que se turnan.',
    en: '96×96. Wide lanes, a drifting purple nebula and taking-turn satellites.',
  },
}] as const;

export type PlayableMapId = typeof PLAYABLE_MAPS[number]['id'];
export const DEFAULT_CAMPAIGN_MAP: PlayableMapId = PLAYABLE_MAPS[0].id;
