"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export function Logo({ size = "md", showText = true, className = "" }: LogoProps) {
  const sizes = {
    sm: { bridge: 20, text: "text-sm", gap: "gap-1.5" },
    md: { bridge: 26, text: "text-xl", gap: "gap-2" },
    lg: { bridge: 36, text: "text-3xl", gap: "gap-3" },
  };

  const s = sizes[size];

  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      {/* Golden Gate Bridge icon */}
      <svg
        width={s.bridge}
        height={s.bridge}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main cables (catenary curve) */}
        <path
          d="M1 12 Q8 4, 16 8 Q24 12, 31 6"
          stroke="#FF3B3B"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Left tower */}
        <rect x="7" y="7" width="2.5" height="18" rx="0.5" fill="#FF3B3B" />
        {/* Right tower */}
        <rect x="22.5" y="5" width="2.5" height="20" rx="0.5" fill="#FF3B3B" />
        {/* Road deck */}
        <rect x="2" y="22" width="28" height="2.5" rx="1" fill="#FF3B3B" opacity="0.9" />
        {/* Suspension cables left tower */}
        <line x1="8.25" y1="10" x2="4" y2="22" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.5" />
        <line x1="8.25" y1="10" x2="12" y2="22" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.5" />
        {/* Suspension cables right tower */}
        <line x1="23.75" y1="8" x2="19" y2="22" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.5" />
        <line x1="23.75" y1="8" x2="28" y2="22" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.5" />
      </svg>

      {showText && (
        <span className={`${s.text} font-black tracking-tight leading-none`}>
          <span className="text-white">Bay</span>
          <span className="text-[#FF3B3B]">Parlays</span>
        </span>
      )}
    </span>
  );
}
