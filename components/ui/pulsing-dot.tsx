"use client";

import { cn } from "@/lib/utils";

interface PulsingDotProps {
  status?: "online" | "offline" | "warning" | "idle";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusColors = {
  online: "bg-emerald-400",
  offline: "bg-red-400",
  warning: "bg-amber-400",
  idle: "bg-gray-400",
};

const statusGlows = {
  online: "shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  offline: "shadow-[0_0_8px_rgba(248,113,113,0.6)]",
  warning: "shadow-[0_0_8px_rgba(251,191,36,0.6)]",
  idle: "shadow-[0_0_8px_rgba(156,163,175,0.4)]",
};

const sizes = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function PulsingDot({ status = "online", size = "md", className }: PulsingDotProps) {
  return (
    <span className={cn("relative flex", sizes[size], className)}>
      {status === "online" && (
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-40",
            statusColors[status]
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex rounded-full h-full w-full",
          statusColors[status],
          statusGlows[status]
        )}
      />
    </span>
  );
}
