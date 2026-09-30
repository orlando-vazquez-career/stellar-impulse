import type { CSSProperties } from "react";
import { CAMPAIGN_ART, CREDITS_ART, HANGAR_ART, SETTINGS_ART, TRAINING_ART, VERSUS_ART } from "./art-markup";

const ART_STYLE: CSSProperties = { position: "absolute", inset: 0, overflow: "visible" };

interface ArtProps {
  visible: boolean;
}

export function CampaignArt({ visible }: ArtProps) {
  return <ArtSvg id="campaign" markup={CAMPAIGN_ART} visible={visible} />;
}

export function VersusArt({ visible }: ArtProps) {
  return <ArtSvg id="versus" markup={VERSUS_ART} visible={visible} />;
}

export function TrainingArt({ visible }: ArtProps) {
  return <ArtSvg id="training" markup={TRAINING_ART} visible={visible} />;
}

export function HangarArt({ visible }: ArtProps) {
  return <ArtSvg id="hangar" markup={HANGAR_ART} visible={visible} />;
}

export function SettingsArt({ visible }: ArtProps) {
  return <ArtSvg id="settings" markup={SETTINGS_ART} visible={visible} />;
}

export function CreditsArt({ visible }: ArtProps) {
  return <ArtSvg id="credits" markup={CREDITS_ART} visible={visible} />;
}

export function ModeArt({ activeId, entered }: { activeId: string; entered: boolean }) {
  return (
    <>
      <CampaignArt visible={entered && activeId === "campaign"} />
      <VersusArt visible={entered && activeId === "versus"} />
      <TrainingArt visible={entered && activeId === "training"} />
      <HangarArt visible={entered && activeId === "hangar"} />
      <SettingsArt visible={entered && activeId === "settings"} />
      <CreditsArt visible={entered && activeId === "credits"} />
    </>
  );
}

function ArtSvg({ id, markup, visible }: { id: string; markup: string; visible: boolean }) {
  return (
    <svg
      className="art"
      data-art={id}
      hidden={!visible}
      width="760"
      height="760"
      viewBox="0 0 760 760"
      style={ART_STYLE}
      fill="none"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
