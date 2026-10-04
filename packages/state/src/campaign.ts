import type { PlayerId } from '@impulso/sim';

export type CampaignPhase = 'lobby' | 'countdown' | 'sector' | 'transition' | 'results' | 'closed';
export interface CampaignSectorResult { sector: number; winner: PlayerId | null }
export interface CampaignResult { winner: PlayerId | null; reason: 'core' | 'draw' | 'forfeit' | 'annulled' }

/** Public per-player campaign state, shared by the server and browser clients. */
export interface CampaignPhaseView {
  protocolVersion: 2;
  playerId: PlayerId;
  /** Catalog presentation chosen when this room was created. */
  renderMap?: 'sector-01';
  phase: CampaignPhase;
  sector: number;
  sectors: number;
  remainingMs: number | null;
  seats: Record<PlayerId, { name: string; ready: boolean; connected: boolean } | null>;
  pause: { by: PlayerId; remainingMs: number } | null;
  resumeInMs: number | null;
  sectorResults: CampaignSectorResult[];
  offers: string[] | null;
  myTech: string | null;
  rivalChoseTech: boolean;
  myTechnologies: string[];
  result: CampaignResult | null;
}
