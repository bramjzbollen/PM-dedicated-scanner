"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface AnimatedGradientBorderProps {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  gradientClassName?: string;
  duration?: number;
}

export function AnimatedGradientBorder({
  children,
  className,
  containerClassName,
  gradientClassName,
  duration = 3,
}: AnimatedGradientBorderProps) {
  return (
    <div className={cn("relative rounded-2xl p-[1px] overflow-hidden group", containerClassName)}>
      {/* Animated gradient border */}
      <div
        className={cn(
          "absolute inset-0 rounded-2xl opacity-40 group-hover:opacity-70 transition-opacity duration-500",
          gradientClassName
        )}
        style={{
          background: "conic-gradient(from var(--border-angle, 0deg), transparent 40%, rgba(99,102,241,0.5) 50%, rgba(139,92,246,0.5) 55%, rgba(34,211,238,0.3) 60%, transparent 70%)",
          animation: `border-rotate ${duration}s linear infinite`,
        }}
      />
      {/* Content */}
      <div className={cn("relative rounded-2xl bg-[#0a0a1a] z-10", className)}>
        {children}
      </div>
    </div>
  );
}
