"use client";

import Image from "next/image";

// BayParlays logo — uses the brand PNG at /public/logo.png so brand
// recognition (existing equity on jdlo.site, social, share cards) is
// preserved. The image is a square illustration so the wordmark sits
// inside the asset itself; we only render the image, no separate text.

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Kept for back-compat with old call sites — ignored, the wordmark
      is baked into the PNG. */
  showWordmark?: boolean;
}

export function Logo({ size = "md", className = "" }: LogoProps) {
  const dims = {
    sm: { w: 48, h: 48 },
    md: { w: 64, h: 64 },
    lg: { w: 128, h: 128 },
  };
  const d = dims[size];

  return (
    <Image
      src="/logo.png"
      alt="BayParlays"
      width={d.w}
      height={d.h}
      priority
      className={`object-contain ${className}`}
      style={{ height: "auto", width: d.w }}
    />
  );
}
