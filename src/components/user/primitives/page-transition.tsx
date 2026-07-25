"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

// Fade + small x-nudge on route change, as a pure-CSS keyframe
// (`.animate-page-slide` in globals.css, which also honours
// `prefers-reduced-motion`) so framer-motion stays out of the client bundle.
// Keying on the pathname re-mounts the wrapper so the animation replays.
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-slide">
      {children}
    </div>
  );
}
