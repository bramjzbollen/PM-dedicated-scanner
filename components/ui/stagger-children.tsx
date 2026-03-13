"use client";

import { cn } from "@/lib/utils";
import { ReactNode, Children } from "react";

interface StaggerChildrenProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  initialDelay?: number;
}

export function StaggerChildren({
  children,
  className,
  staggerDelay = 80,
  initialDelay = 0,
}: StaggerChildrenProps) {
  return (
    <div className={className}>
      {Children.map(children, (child, index) => (
        <div
          key={index}
          className="animate-stagger-in"
          style={{
            animationDelay: `${initialDelay + index * staggerDelay}ms`,
            animationFillMode: "backwards",
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
