"use client";

import { Player } from "@remotion/player";
import { ParlayVideoComposition } from "./ParlayVideo";
import type { ParlayLeg } from "./ParlayVideo";

interface ParlayPlayerProps {
  legs: ParlayLeg[];
  combinedOdds: string;
  evPercent: number;
  confidence: number;
  payout: number;
  format?: "square" | "story";
}

export function ParlayPlayer({
  legs,
  combinedOdds,
  evPercent,
  confidence,
  payout,
  format = "square",
}: ParlayPlayerProps) {
  const isStory = format === "story";

  return (
    <Player
      component={ParlayVideoComposition}
      inputProps={{ legs, combinedOdds, evPercent, confidence, payout, format }}
      durationInFrames={150}
      fps={30}
      compositionWidth={1080}
      compositionHeight={isStory ? 1920 : 1080}
      style={{
        width: "100%",
        maxWidth: isStory ? 300 : 400,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      controls
      autoPlay
      loop
    />
  );
}
