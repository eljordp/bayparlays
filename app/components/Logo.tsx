"use client";

import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Logo({ size = "md", className = "" }: LogoProps) {
  const sizes = {
    sm: { width: 80, height: 44 },
    md: { width: 110, height: 56 },
    lg: { width: 200, height: 120 },
  };

  const s = sizes[size];

  return (
    <Image
      src="/logo.png"
      alt="BayParlays"
      width={s.width}
      height={s.height}
      className={`object-contain ${className}`}
      priority
    />
  );
}
