export interface ModeOption {
  name: string;
  meta: string;
}

export interface LobbyMode {
  id: string;
  num: string;
  name: string;
  code: string;
  meta: string;
  accent: string;
  x: number;
  y: number;
  blurb: string;
  sprite: string;
  options: readonly ModeOption[];
}
