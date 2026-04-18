"use client";

import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Logo({ size = "md", className = "" }: LogoProps) {
  const sizes = {
    sm: { width: 120, height: 40 },
    md: { width: 160, height: 52 },
    lg: { width: 220, height: 72 },
  };

  const s = sizes[size];

  return (
    <Image
      src="/logo.webp"
      alt="BayParlays"
      width={s.width}
      height={s.height}
      className={`object-contain ${className}`}
      priority
    />
  );
}
