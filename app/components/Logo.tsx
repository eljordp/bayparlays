"use client";

// BayParlays logo — pure SVG, no PNG dependency. Editorial monochrome:
// stylized Golden Gate Bridge silhouette + DM Serif Display wordmark.
// Uses currentColor so it renders correctly on any background.
//
// Three sizes (sm/md/lg) for nav, footer, and hero use cases. Set
// `showWordmark={false}` for icon-only contexts (favicon, share thumbnails).

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showWordmark?: boolean;
  /** Color override — defaults to currentColor (inherits from parent). */
  color?: string;
}

export function Logo({
  size = "md",
  className = "",
  showWordmark = true,
  color,
}: LogoProps) {
  const dims = {
    sm: { mark: 22, wordmark: 16, gap: 8 },
    md: { mark: 28, wordmark: 20, gap: 10 },
    lg: { mark: 48, wordmark: 36, gap: 14 },
  };
  const d = dims[size];

  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{
        gap: d.gap,
        color: color ?? "currentColor",
      }}
    >
      <BridgeMark size={d.mark} />
      {showWordmark && (
        <span
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: d.wordmark,
            fontWeight: 400,
            letterSpacing: -0.4,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          BayParlays
        </span>
      )}
    </span>
  );
}

function BridgeMark({ size }: { size: number }) {
  // Geometric Golden Gate Bridge — two towers, suspension catenary, deck.
  // Three small hangers double as visual cues for "multi-leg parlay."
  // ViewBox is 64x40; height proportional to keep the bridge silhouette.
  const height = Math.round(size * 0.625);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 64 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Suspension cable (catenary curve between towers) */}
      <path
        d="M 14 8 Q 32 30, 50 8"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Hangers — vertical thin lines from cable down to deck */}
      <line x1="22" y1="16" x2="22" y2="32" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      <line x1="32" y1="22" x2="32" y2="32" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      <line x1="42" y1="16" x2="42" y2="32" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      {/* Left tower */}
      <line x1="14" y1="2" x2="14" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* Right tower */}
      <line x1="50" y1="2" x2="50" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* Bridge deck */}
      <line x1="3" y1="32" x2="61" y2="32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
