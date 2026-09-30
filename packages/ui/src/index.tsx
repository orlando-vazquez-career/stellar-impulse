import type { ReactNode } from "react";
import "./svg-hidden";

export type { LobbyMode, ModeOption } from "./lobby/types";
export { AliasControl } from "./lobby/AliasControl";
export { LobbyTicker } from "./lobby/LobbyTicker";
export { ModeDetail } from "./lobby/ModeDetail";
export { ModeList } from "./lobby/ModeList";
export { PlanetStage } from "./lobby/PlanetStage";
export { CampaignArt, CreditsArt, HangarArt, ModeArt, SettingsArt, TrainingArt, VersusArt } from "./lobby/ModeArt";
export { SoundButton } from "./lobby/SoundButton";

export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  return <span className={`status status--${tone}`}><span aria-hidden="true" className="status-dot" />{children}</span>;
}
