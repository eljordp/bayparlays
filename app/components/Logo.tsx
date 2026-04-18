"use client";

import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Logo({ size = "md", className = "" }: LogoProps) {
  const sizes = {
    sm: { width: 100, height: 60 },
    md: { width: 140, height: 80 },
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
