"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface MeteorsProps {
  number?: number;
  className?: string;
}

export function Meteors({ number = 12, className }: MeteorsProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const meteors = useMemo(() => {
    return Array.from({ length: number }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 5}s`,
      duration: `${Math.random() * 3 + 2}s`,
      size: Math.random() * 1.5 + 0.5,
    }));
  }, [number]);

  if (!mounted) return null;

  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      {meteors.map((meteor) => (
        <span
          key={meteor.id}
          className="absolute animate-meteor"
          style={{
            top: "-5%",
            left: meteor.left,
            animationDelay: meteor.delay,
            animationDuration: meteor.duration,
            width: `${meteor.size}px`,
            height: `${meteor.size * 80}px`,
          }}
        >
          <span className="block w-full h-full bg-gradient-to-b from-indigo-400/60 via-indigo-400/20 to-transparent rounded-full" />
        </span>
      ))}
    </div>
  );
}
