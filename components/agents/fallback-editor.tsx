'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { MODEL_OPTIONS, getModelOption } from './model-selector';

interface FallbackEditorProps {
  agentId: string;
  agentName: string;
  fallbacks: string[];
  onFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  disabled?: boolean;
}

function InlineModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opt = getModelOption(value);

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
    <div ref={ref} className="relative flex-1">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen(!open);
        }}
        disabled={disabled}
        className={cn(
          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200',
          opt.bgColor,
          opt.borderColor,
          opt.color,
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-pointer hover:brightness-125'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', opt.dotColor)} />
        <span className="flex-1 text-left">{opt.label}</span>
        <span className="text-[9px] text-white/30">{opt.tier}</span>
        <svg
          className={cn('h-3 w-3 transition-transform shrink-0', open && 'rotate-180')}
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
            'absolute z-50 mt-1 left-0 w-full min-w-[200px] py-1 rounded-xl border',
            'bg-gray-900/95 backdrop-blur-xl border-white/[0.08]',
            'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {MODEL_OPTIONS.map((m) => {
            const isActive = m.value === value;
            return (
              <button
                key={m.value}
                onClick={() => {
                  if (!isActive) onChange(m.value);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                  isActive
                    ? cn(m.bgColor, m.color)
                    : 'text-white/70 hover:bg-white/[0.06] hover:text-white/90'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full shrink-0', m.dotColor)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[10px] text-white/40">{m.tier}</div>
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

export function FallbackEditor({
  agentId,
  agentName,
  fallbacks,
  onFallbacksChange,
  disabled,
}: FallbackEditorProps) {
  const [localFallbacks, setLocalFallbacks] = useState<string[]>(fallbacks);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync when prop changes from parent
  useEffect(() => {
    setLocalFallbacks(fallbacks);
    setHasChanges(false);
  }, [fallbacks]);

  const updateLocal = useCallback((newFallbacks: string[]) => {
    setLocalFallbacks(newFallbacks);
    setHasChanges(true);
  }, []);

  const handleAdd = useCallback(() => {
    const existing = new Set(localFallbacks);
    const next = MODEL_OPTIONS.find((m) => !existing.has(m.value));
    if (next) {
      updateLocal([...localFallbacks, next.value]);
    }
  }, [localFallbacks, updateLocal]);

  const handleRemove = useCallback((index: number) => {
    updateLocal(localFallbacks.filter((_, i) => i !== index));
  }, [localFallbacks, updateLocal]);

  const handleChange = useCallback((index: number, newValue: string) => {
    const updated = [...localFallbacks];
    updated[index] = newValue;
    updateLocal(updated);
  }, [localFallbacks, updateLocal]);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    const updated = [...localFallbacks];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    updateLocal(updated);
  }, [localFallbacks, updateLocal]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= localFallbacks.length - 1) return;
    const updated = [...localFallbacks];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updateLocal(updated);
  }, [localFallbacks, updateLocal]);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...localFallbacks];
    const [removed] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, removed);
    updateLocal(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, localFallbacks, updateLocal]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      onFallbacksChange(agentId, localFallbacks);
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  }, [agentId, localFallbacks, onFallbacksChange]);

  return (
    <div
      className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">
          Fallback Models
        </span>
        {localFallbacks.length > 0 && (
          <span className="text-[10px] text-white/20">
            Priority: top → bottom
          </span>
        )}
      </div>

      {localFallbacks.length === 0 ? (
        <p className="text-xs text-white/25 italic py-1">No fallbacks configured</p>
      ) : (
        <div className="space-y-1.5">
          {localFallbacks.map((fb, i) => (
            <div
              key={`${i}-${fb}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              className={cn(
                'flex items-center gap-2 group transition-all duration-150',
                dragIndex === i && 'opacity-40',
                dragOverIndex === i && dragIndex !== i && 'border-t-2 border-purple-400/40'
              )}
            >
              {/* Drag handle */}
              <span
                className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/40 shrink-0 select-none text-sm"
                title="Drag to reorder"
              >
                ⠿
              </span>

              {/* Index */}
              <span className="text-[10px] text-white/25 font-mono w-4 text-right shrink-0 select-none">
                {i + 1}.
              </span>

              {/* Model picker */}
              <InlineModelPicker
                value={fb}
                onChange={(newVal) => handleChange(i, newVal)}
                disabled={disabled || saving}
              />

              {/* Move up/down */}
              <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                {i > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveUp(i); }}
                    className="text-white/30 hover:text-white/60 p-0.5"
                    title="Move up"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                )}
                {i < localFallbacks.length - 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveDown(i); }}
                    className="text-white/30 hover:text-white/60 p-0.5"
                    title="Move down"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Remove button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled && !saving) handleRemove(i);
                }}
                disabled={disabled || saving}
                className={cn(
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'p-1 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/[0.1]',
                  (disabled || saving) && 'cursor-not-allowed'
                )}
                title="Remove fallback"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {localFallbacks.length < MODEL_OPTIONS.length && (
          <button
            onClick={(e) => { e.stopPropagation(); handleAdd(); }}
            disabled={disabled || saving}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
              'border border-dashed border-white/[0.1] text-white/40',
              'hover:border-purple-400/30 hover:text-purple-400/70 hover:bg-purple-500/[0.05]',
              'transition-all duration-200',
              (disabled || saving) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Fallback
          </button>
        )}

        {hasChanges && (
          <button
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold',
              'bg-emerald-500/[0.15] border border-emerald-500/[0.25] text-emerald-400',
              'hover:bg-emerald-500/[0.25] hover:border-emerald-500/[0.35]',
              'transition-all duration-200',
              saving && 'opacity-50 cursor-not-allowed animate-pulse'
            )}
          >
            {saving ? (
              <>
                <span className="h-3 w-3 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Save Fallbacks
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
