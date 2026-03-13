'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface ModelOption {
  value: string;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  tier: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: 'anthropic/claude-haiku-4-5',
    label: 'Haiku 4.5',
    shortLabel: 'Haiku',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/[0.12]',
    borderColor: 'border-sky-500/[0.2]',
    dotColor: 'bg-sky-400',
    tier: '\u26A1 Fast & Cheap',
  },
  {
    value: 'anthropic/claude-sonnet-4-5',
    label: 'Sonnet 4.5',
    shortLabel: 'Sonnet 4.5',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/[0.12]',
    borderColor: 'border-violet-500/[0.2]',
    dotColor: 'bg-violet-400',
    tier: '\u2696\uFE0F Balanced',
  },
  {
    value: 'anthropic/claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    shortLabel: 'Sonnet 4.6',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/[0.12]',
    borderColor: 'border-purple-500/[0.2]',
    dotColor: 'bg-purple-400',
    tier: '\u2728 Latest Balanced',
  },
  {
    value: 'anthropic/claude-opus-4-6',
    label: 'Opus 4.6',
    shortLabel: 'Opus',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/[0.12]',
    borderColor: 'border-amber-500/[0.2]',
    dotColor: 'bg-amber-400',
    tier: '\uD83C\uDFC6 Best Quality',
  },
  {
    value: 'openai-codex/gpt-5.3-codex',
    label: 'Codex 5.3',
    shortLabel: 'Codex',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/[0.12]',
    borderColor: 'border-emerald-500/[0.2]',
    dotColor: 'bg-emerald-400',
    tier: '\uD83C\uDD93 Free (OAuth)',
  },
];

export function getModelOption(modelValue: string): ModelOption {
  return MODEL_OPTIONS.find((m) => m.value === modelValue) ?? {
    value: modelValue,
    label: modelValue.split('/').pop() ?? modelValue,
    shortLabel: modelValue.split('/').pop()?.split('-')[0] ?? '?',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/[0.12]',
    borderColor: 'border-gray-500/[0.2]',
    dotColor: 'bg-gray-400',
    tier: 'Unknown',
  };
}

interface ModelBadgeProps {
  model: string;
  className?: string;
}

export function ModelBadge({ model, className }: ModelBadgeProps) {
  const opt = getModelOption(model);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border',
        opt.bgColor,
        opt.borderColor,
        opt.color,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', opt.dotColor)} />
      {opt.shortLabel}
    </span>
  );
}

interface ModelSelectorProps {
  agentId: string;
  agentName: string;
  currentModel: string;
  onModelChange: (agentId: string, newModel: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  agentId,
  agentName,
  currentModel,
  onModelChange,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentOpt = getModelOption(currentModel);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen(!open);
        }}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-200',
          'hover:scale-[1.02] active:scale-[0.98]',
          currentOpt.bgColor,
          currentOpt.borderColor,
          currentOpt.color,
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-pointer hover:brightness-125'
        )}
        title={`Model: ${currentOpt.label} \u2014 Click to change`}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', currentOpt.dotColor)} />
        {currentOpt.shortLabel}
        <svg
          className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1.5 left-0 min-w-[220px] py-1.5 rounded-xl border',
            'bg-gray-900/95 backdrop-blur-xl border-white/[0.08]',
            'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-white/30 font-semibold">
            Model for {agentName}
          </div>
          {MODEL_OPTIONS.map((opt) => {
            const isActive = opt.value === currentModel;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  if (!isActive) {
                    onModelChange(agentId, opt.value);
                  }
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                  isActive
                    ? cn(opt.bgColor, opt.color)
                    : 'text-white/70 hover:bg-white/[0.06] hover:text-white/90'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full shrink-0', opt.dotColor)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] text-white/40">{opt.tier}</div>
                </div>
                {isActive && (
                  <svg className="h-4 w-4 shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
