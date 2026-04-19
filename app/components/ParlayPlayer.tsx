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
  showControls?: boolean;
  maxWidth?: number;
}

export function ParlayPlayer({
  legs,
  combinedOdds,
  evPercent,
  confidence,
  payout,
  format = "square",
  showControls,
  maxWidth,
}: ParlayPlayerProps) {
  const isStory = format === "story";
  const defaultMax = isStory ? 300 : 400;

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
        maxWidth: maxWidth ?? defaultMax,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      controls={showControls ?? false}
      autoPlay
      loop
    />
  );
}
