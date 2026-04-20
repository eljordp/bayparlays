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
  const defaultMax = 520;

  return (
    <Player
      component={ParlayVideoComposition}
      inputProps={{ legs, combinedOdds, evPercent, confidence, payout, format }}
      durationInFrames={180}
      fps={30}
      compositionWidth={720}
      compositionHeight={720}
      style={{
        width: "100%",
        maxWidth: maxWidth ?? defaultMax,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 0 60px rgba(255,59,59,0.1)",
      }}
      controls={showControls ?? false}
      autoPlay
      loop
    />
  );
}
