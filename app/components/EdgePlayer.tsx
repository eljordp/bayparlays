"use client";

import { Player } from "@remotion/player";
import { EdgeShareVideoComposition } from "./EdgeShareVideo";
import type { EdgeLegData } from "./EdgeShareVideo";

interface EdgePlayerProps {
  leg: EdgeLegData;
  format?: "square" | "story";
  showControls?: boolean;
  maxWidth?: number;
}

export function EdgePlayer({
  leg,
  format = "square",
  showControls,
  maxWidth,
}: EdgePlayerProps) {
  const isStory = format === "story";
  const compositionWidth = 1080;
  const compositionHeight = isStory ? 1920 : 1080;
  const defaultMax = isStory ? 360 : 520;

  return (
    <Player
      component={EdgeShareVideoComposition}
      inputProps={{ leg, format }}
      durationInFrames={120}
      fps={30}
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      style={{
        width: "100%",
        maxWidth: maxWidth ?? defaultMax,
        borderRadius: 16,
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
