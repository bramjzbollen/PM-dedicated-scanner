"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  from?: string;
  via?: string;
  to?: string;
}

export function GradientText({
  children,
  className,
  from = "from-white",
  via = "via-indigo-200",
  to = "to-white/60",
}: GradientTextProps) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r bg-clip-text text-transparent",
        from,
        via,
        to,
        className
      )}
    >
      {children}
    </span>
  );
}
