"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /share/edge previously rendered an animated single-leg edge card via
// Remotion. Replaced by the unified static OG card flow at /share, which
// works for any pick (parlay or single leg). Redirect old shares forward.

export default function ShareEdgeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/share");
  }, [router]);
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FAFAF7",
        color: "rgba(0,0,0,0.5)",
        fontSize: 14,
      }}
    >
      Redirecting to share card…
    </div>
  );
}
