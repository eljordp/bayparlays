"use client";

// Drop-in replacement for the Remotion ParlayPlayer — renders the same data
// as a static PNG via /api/og/parlay (edge runtime, free Vercel function).
// 1200x630 white card, identical to what users save and post to social.
//
// Why static beats animated for this surface: pattern-breaks dark-mode social
// feeds, saves cleanly to mobile camera roll, no Remotion bundle / license.

interface Leg {
  sport: string;
  pick: string;
  game: string;
  odds: number;
  book?: string;
  commenceTime?: string;
}

interface StaticParlayCardProps {
  legs: Leg[];
  combinedOdds: string;
  evPercent?: number;
  confidence?: number;
  payout: number;
  /** CSS max-width — defaults to 480px so the card has presence without
      blowing out narrow columns */
  maxWidth?: number | string;
  className?: string;
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function StaticParlayCard({
  legs,
  combinedOdds,
  evPercent = 0,
  confidence = 0,
  payout,
  maxWidth = 480,
  className = "",
}: StaticParlayCardProps) {
  const params = new URLSearchParams({
    legs: JSON.stringify(
      legs.map((l) => ({
        sport: l.sport,
        pick: l.pick,
        game: l.game,
        odds: formatOdds(l.odds),
        ...(l.commenceTime ? { commenceTime: l.commenceTime } : {}),
      })),
    ),
    combined: combinedOdds || "—",
    payout: `$${Math.round(payout)}`,
    ev: evPercent.toFixed(1),
    confidence: confidence.toFixed(0),
  });
  const url = `/api/og/parlay?${params.toString()}`;

  return (
    <div
      className={className}
      style={{
        maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
        width: "100%",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="BayParlays card"
        width={1200}
        height={630}
        loading="lazy"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          background: "#ffffff",
        }}
      />
    </div>
  );
}
