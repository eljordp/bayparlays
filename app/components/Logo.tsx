"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export function Logo({ size = "md", showText = true, className = "" }: LogoProps) {
  const sizes = {
    sm: { bridge: 22, text: "text-base", gap: "gap-2" },
    md: { bridge: 30, text: "text-xl", gap: "gap-2.5" },
    lg: { bridge: 42, text: "text-3xl", gap: "gap-3" },
  };

  const s = sizes[size];

  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <svg
        width={s.bridge}
        height={s.bridge}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Road deck */}
        <rect x="2" y="32" width="44" height="3" rx="1.5" fill="#FF3B3B" />

        {/* Left tower */}
        <rect x="12" y="10" width="3" height="22" rx="1" fill="#FF3B3B" />
        {/* Left tower cross beams */}
        <rect x="11.5" y="14" width="4" height="1.5" rx="0.5" fill="#FF3B3B" />
        <rect x="11.5" y="20" width="4" height="1.5" rx="0.5" fill="#FF3B3B" />

        {/* Right tower */}
        <rect x="33" y="10" width="3" height="22" rx="1" fill="#FF3B3B" />
        {/* Right tower cross beams */}
        <rect x="32.5" y="14" width="4" height="1.5" rx="0.5" fill="#FF3B3B" />
        <rect x="32.5" y="20" width="4" height="1.5" rx="0.5" fill="#FF3B3B" />

        {/* Main cable — elegant catenary arc */}
        <path
          d="M2 18 C6 8, 12 10, 13.5 10.5 C15 11, 20 22, 24 22 C28 22, 33 11, 34.5 10.5 C36 10, 42 8, 46 18"
          stroke="#FF3B3B"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Vertical suspender cables — left span */}
        <line x1="7" y1="14" x2="7" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />
        <line x1="10" y1="11.5" x2="10" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />

        {/* Vertical suspender cables — center span */}
        <line x1="18" y1="17" x2="18" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />
        <line x1="21" y1="20.5" x2="21" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />
        <line x1="24" y1="22" x2="24" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />
        <line x1="27" y1="20.5" x2="27" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />
        <line x1="30" y1="17" x2="30" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />

        {/* Vertical suspender cables — right span */}
        <line x1="38" y1="11.5" x2="38" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />
        <line x1="41" y1="14" x2="41" y2="32" stroke="#FF3B3B" strokeWidth="0.8" opacity="0.35" />

        {/* Tower tops — pointed */}
        <path d="M12 10 L13.5 7 L15 10" fill="#FF3B3B" />
        <path d="M33 10 L34.5 7 L36 10" fill="#FF3B3B" />
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
