'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MAX_VISIBLE = 4;

// Map skill names to subtle color variants for visual variety
function skillColor(skill: string): string {
  const colors = [
    'bg-violet-500/[0.1] text-violet-400 border-violet-500/[0.15]',
    'bg-sky-500/[0.1] text-sky-400 border-sky-500/[0.15]',
    'bg-amber-500/[0.1] text-amber-400 border-amber-500/[0.15]',
    'bg-emerald-500/[0.1] text-emerald-400 border-emerald-500/[0.15]',
    'bg-pink-500/[0.1] text-pink-400 border-pink-500/[0.15]',
    'bg-teal-500/[0.1] text-teal-400 border-teal-500/[0.15]',
    'bg-orange-500/[0.1] text-orange-400 border-orange-500/[0.15]',
    'bg-indigo-500/[0.1] text-indigo-400 border-indigo-500/[0.15]',
  ];
  // Simple hash from skill name
  let hash = 0;
  for (let i = 0; i < skill.length; i++) {
    hash = ((hash << 5) - hash + skill.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

// Clean up skill name for display (strip prefixes like bankrbot/)
function displayName(skill: string): string {
  const parts = skill.split('/');
  return parts[parts.length - 1];
}

export function SkillsBadges({ skills }: { skills: string[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!skills.length) return null;

  const visible = expanded ? skills : skills.slice(0, MAX_VISIBLE);
  const remaining = skills.length - MAX_VISIBLE;

  return (
    <div
      className="mt-3 pt-3 border-t border-white/[0.04]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">
          Skills
        </span>
        <span className="text-[10px] text-white/20">
          ({skills.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((skill) => (
          <Badge
            key={skill}
            variant="outline"
            className={cn(
              'text-[10px] px-2 py-0.5 font-normal cursor-default border',
              'transition-colors duration-150',
              skillColor(skill)
            )}
            title={skill}
          >
            {displayName(skill)}
          </Badge>
        ))}
        {!expanded && remaining > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-md border font-medium',
              'bg-white/[0.04] text-white/40 border-white/[0.08]',
              'hover:bg-white/[0.08] hover:text-white/60 hover:border-white/[0.15]',
              'transition-all duration-150 cursor-pointer'
            )}
          >
            +{remaining} more
          </button>
        )}
        {expanded && remaining > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-md border font-medium',
              'bg-white/[0.04] text-white/40 border-white/[0.08]',
              'hover:bg-white/[0.08] hover:text-white/60 hover:border-white/[0.15]',
              'transition-all duration-150 cursor-pointer'
            )}
          >
            show less
          </button>
        )}
      </div>
    </div>
  );
}
