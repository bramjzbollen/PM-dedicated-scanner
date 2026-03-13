'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { PlanningTask } from '@/lib/types';
import { generateId } from '@/lib/planning-data';

interface TaskEditModalProps {
  task: PlanningTask | null;
  isNew: boolean;
  onSave: (task: PlanningTask) => void;
  onClose: () => void;
}

export function TaskEditModal({ task, isNew, onSave, onClose }: TaskEditModalProps) {
  const [form, setForm] = useState<PlanningTask>(() => {
    if (task) return { ...task };
    return {
      id: generateId(),
      title: '',
      description: '',
      status: 'todo',
      deadline: '',
      progress: 0,
      category: 'planb-task',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (task) setForm({ ...task });
  }, [task]);

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-4 rounded-2xl bg-[#0d0d24]/95 backdrop-blur-3xl border border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/[0.06]">
          <h2 className="text-xl font-semibold text-white/95">
            {isNew ? '➕ Nieuwe Taak' : '✏️ Taak Bewerken'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-white/70">Titel *</label>
            <input
              type="text"
              className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 backdrop-blur-xl transition-all"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Taak titel..."
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-white/70">Beschrijving</label>
            <textarea
              className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 backdrop-blur-xl resize-none transition-all"
              rows={3}
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Beschrijving..."
            />
          </div>

          {/* Status & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-white/70">Status</label>
              <select
                className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 backdrop-blur-xl"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as PlanningTask['status'] })}
              >
                <option value="todo">📝 Todo</option>
                <option value="in-progress">🔄 In Progress</option>
                <option value="done">✅ Done</option>
                <option value="blocked">🚫 Blocked</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-white/70">Categorie</label>
              <select
                className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 backdrop-blur-xl"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as PlanningTask['category'] })}
              >
                <option value="prive">🏠 Privé</option>
                <option value="planb-task">💼 PLAN B - Taak</option>
                <option value="planb-project">📁 PLAN B - Project</option>
              </select>
            </div>
          </div>

          {/* Progress & Deadline */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-white/70">Voortgang: {form.progress}%</label>
              <input
                type="range"
                className="w-full mt-2 accent-indigo-500"
                min="0"
                max="100"
                step="5"
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white/70">Deadline</label>
              <input
                type="date"
                className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 backdrop-blur-xl"
                value={form.deadline || ''}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-white/70">Tags</label>
            <div className="flex gap-2 mt-1.5">
              <input
                type="text"
                className="flex-1 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 backdrop-blur-xl"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    e.preventDefault();
                    setForm({ ...form, tags: [...(form.tags || []), tagInput.trim()] });
                    setTagInput('');
                  }
                }}
                placeholder="Tag toevoegen + Enter"
              />
            </div>
            {form.tags && form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map((tag, i) => (
                  <span
                    key={`${tag}-${i}`}
                    className="text-xs px-2.5 py-1 rounded-full bg-white/[0.04] text-white/50 border border-white/[0.06] cursor-pointer hover:bg-red-500/[0.1] hover:border-red-500/[0.2] hover:text-red-400 transition-all"
                    onClick={() => setForm({ ...form, tags: form.tags?.filter((_, idx) => idx !== i) })}
                  >
                    #{tag} ✕
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-3 border-t border-white/[0.06]">
            <Button onClick={handleSave} disabled={!form.title.trim()}>
              {isNew ? '➕ Toevoegen' : '💾 Opslaan'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Annuleren
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
