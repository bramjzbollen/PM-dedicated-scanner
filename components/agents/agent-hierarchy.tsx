'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HierarchicalAgent } from '@/lib/types';
import { getAgentHierarchy } from '@/lib/agent-hierarchy-data';
import { ModelSelector, ModelBadge } from '@/components/agents/model-selector';
import { FallbackEditor } from '@/components/agents/fallback-editor';
import { SkillsBadges } from '@/components/agents/skills-badges';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot } from '@fortawesome/free-solid-svg-icons';

const statusConfig: Record<HierarchicalAgent['status'], { color: string; bg: string; label: string; dot: string }> = {
  idle: { color: 'text-gray-400', bg: 'bg-gray-500/[0.12] border-gray-500/[0.15]', label: 'Idle', dot: 'bg-gray-400' },
  working: { color: 'text-blue-400', bg: 'bg-blue-500/[0.12] border-blue-500/[0.15]', label: 'Working', dot: 'bg-blue-400 animate-pulse' },
  done: { color: 'text-emerald-400', bg: 'bg-emerald-500/[0.12] border-emerald-500/[0.15]', label: 'Done', dot: 'bg-emerald-400' },
  blocked: { color: 'text-red-400', bg: 'bg-red-500/[0.12] border-red-500/[0.15]', label: 'Blocked', dot: 'bg-red-400' },
};

function progressColor(progress: number): string {
  if (progress < 25) return 'bg-gradient-to-r from-red-500 to-red-400';
  if (progress < 75) return 'bg-gradient-to-r from-orange-500 to-amber-400';
  return 'bg-gradient-to-r from-emerald-500 to-green-400';
}

// Toast notification component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl',
        'backdrop-blur-xl animate-in slide-in-from-bottom-5 fade-in-0 duration-300',
        type === 'success'
          ? 'bg-emerald-500/[0.12] border-emerald-500/[0.2] text-emerald-400'
          : 'bg-red-500/[0.12] border-red-500/[0.2] text-red-400'
      )}
    >
      <span className="text-lg">{type === 'success' ? '✅' : '❌'}</span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-white/40 hover:text-white/70 text-xs">✕</button>
    </div>
  );
}

function AgentAvatar({ agent }: { agent: HierarchicalAgent }) {
  const [imgError, setImgError] = useState(false);

  if (agent.avatar && !imgError) {
    return (
      <div className="relative shrink-0 w-12 h-12 rounded-xl overflow-hidden ring-2 ring-white/[0.08] hover:ring-white/[0.2] transition-all duration-200 hover:scale-105">
        <Image
          src={agent.avatar}
          alt={agent.name}
          width={48}
          height={48}
          className="object-cover w-full h-full"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Font Awesome fallback
  return (
    <div className="shrink-0 w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.1] hover:border-white/[0.15] transition-all duration-200 hover:scale-105">
      <FontAwesomeIcon icon={faRobot} className="h-5 w-5 text-purple-400/80" />
    </div>
  );
}

function AgentNode({
  agent,
  depth = 0,
  onModelChange,
  onFallbacksChange,
  savingAgent,
}: {
  agent: HierarchicalAgent;
  depth?: number;
  onModelChange: (agentId: string, newModel: string) => void;
  onFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  savingAgent: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const status = statusConfig[agent.status];
  const hasChildren = agent.children && agent.children.length > 0;

  return (
    <div className={cn(depth > 0 && 'ml-6 border-l border-white/[0.06] pl-4')}>
      <Card
        className={cn(
          'cursor-pointer',
          agent.status === 'working' && 'border-blue-500/[0.15] shadow-[0_0_16px_rgba(59,130,246,0.08)]',
          agent.status === 'blocked' && 'border-red-500/[0.15] shadow-[0_0_16px_rgba(239,68,68,0.08)]'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            {/* Left */}
            <div className="flex items-center gap-3 min-w-0">
              <AgentAvatar agent={agent} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-white/90">{agent.name}</h3>
                  <div className={cn('h-2 w-2 rounded-full shrink-0', status.dot)} />
                  <Badge className={cn('text-xs', status.bg, status.color)}>
                    {status.label}
                  </Badge>
                  {/* Model Selector */}
                  {agent.model && (
                    <ModelSelector
                      agentId={agent.id}
                      agentName={agent.name}
                      currentModel={agent.model.primary}
                      onModelChange={onModelChange}
                      disabled={savingAgent === agent.id}
                    />
                  )}
                </div>
                <p className="text-xs text-white/45 mt-0.5">
                  {agent.role}
                </p>
              </div>
            </div>

            {/* Right - Toggle */}
            {hasChildren && (
              <span className="text-white/40 text-sm shrink-0">
                {expanded ? '▼' : '▶'} {agent.children!.length}
              </span>
            )}
          </div>

          {/* Current Task */}
          {agent.currentTask && (
            <div className="mt-4 space-y-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">
                  📌 {agent.currentTask.title}
                </span>
                {agent.currentTask.eta && (
                  <span className="text-xs text-white/40">
                    ETA: {agent.currentTask.eta}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/40">Voortgang</span>
                  <span className="font-semibold text-white/70">{agent.currentTask.progress}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      progressColor(agent.currentTask.progress)
                    )}
                    style={{ width: `${agent.currentTask.progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fallback Models Editor */}
          {agent.model && (
            <FallbackEditor
              agentId={agent.id}
              agentName={agent.name}
              fallbacks={agent.model.fallbacks ?? []}
              onFallbacksChange={onFallbacksChange}
              disabled={savingAgent === agent.id}
            />
          )}

          {/* Skills */}
          {agent.skills && agent.skills.length > 0 && (
            <SkillsBadges skills={agent.skills} />
          )}
        </CardContent>
      </Card>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-2 space-y-2">
          {agent.children!.map((child) => (
            <AgentNode
              key={child.id}
              agent={child}
              depth={depth + 1}
              onModelChange={onModelChange}
              onFallbacksChange={onFallbacksChange}
              savingAgent={savingAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Recursively update fallbacks in agent tree
function updateAgentFallbacks(agent: HierarchicalAgent, agentId: string, fallbacks: string[]): HierarchicalAgent {
  if (agent.id === agentId) {
    return {
      ...agent,
      model: {
        primary: agent.model?.primary ?? '',
        fallbacks,
      },
    };
  }
  if (agent.children) {
    return {
      ...agent,
      children: agent.children.map((c) => updateAgentFallbacks(c, agentId, fallbacks)),
    };
  }
  return agent;
}

// Recursively update model in agent tree
function updateAgentModel(agent: HierarchicalAgent, agentId: string, newModel: string): HierarchicalAgent {
  if (agent.id === agentId) {
    return {
      ...agent,
      model: {
        ...agent.model,
        primary: newModel,
        fallbacks: agent.model?.fallbacks ?? [],
      },
    };
  }
  if (agent.children) {
    return {
      ...agent,
      children: agent.children.map((c) => updateAgentModel(c, agentId, newModel)),
    };
  }
  return agent;
}

export function AgentHierarchy() {
  const [root, setRoot] = useState<HierarchicalAgent>(getAgentHierarchy());
  const [savingAgent, setSavingAgent] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load real status + config from API on mount
  useEffect(() => {
    // Fetch agent status first
    fetch('/api/agents/status')
      .then((res) => res.json())
      .then((statusData) => {
        if (statusData.agents && Array.isArray(statusData.agents)) {
          // Update agent statuses and current tasks
          setRoot((prev) => {
            let updated = { ...prev };
            const updateFromStatus = (agent: HierarchicalAgent): HierarchicalAgent => {
              const liveStatus = statusData.agents.find((a: any) => a.id === agent.id);
              if (liveStatus) {
                return {
                  ...agent,
                  status: liveStatus.status,
                  currentTask: liveStatus.currentTask || undefined,
                };
              }
              if (agent.children) {
                return { ...agent, children: agent.children.map(updateFromStatus) };
              }
              return agent;
            };
            return updateFromStatus(updated);
          });
        }
      })
      .catch((err) => console.error('Failed to load agent status:', err));
    
    // Also fetch config
    fetch('/api/agents/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.agents && Array.isArray(data.agents)) {
          setRoot((prev) => {
            let updated = { ...prev };
            for (const agentConfig of data.agents) {
              if (agentConfig.model?.primary) {
                updated = updateAgentModel(updated, agentConfig.id, agentConfig.model.primary);
                // Also update fallbacks and avatar
                const updateFromConfig = (agent: HierarchicalAgent): HierarchicalAgent => {
                  if (agent.id === agentConfig.id) {
                    return {
                      ...agent,
                      ...(agentConfig.avatar ? { avatar: agentConfig.avatar } : {}),
                      ...(agentConfig.skills?.length ? { skills: agentConfig.skills } : {}),
                      model: agentConfig.model?.fallbacks
                        ? {
                            primary: agent.model?.primary ?? agentConfig.model.primary,
                            fallbacks: agentConfig.model.fallbacks,
                          }
                        : agent.model,
                    };
                  }
                  if (agent.children) {
                    return { ...agent, children: agent.children.map(updateFromConfig) };
                  }
                  return agent;
                };
                updated = updateFromConfig(updated);
              }
            }
            return updated;
          });
          setConfigLoaded(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load agent config:', err);
        setConfigLoaded(true); // Still show with defaults
      });
  }, []);

  // Poll for real status updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/agents/status')
        .then((res) => res.json())
        .then((statusData) => {
          if (statusData.agents && Array.isArray(statusData.agents)) {
            setRoot((prev) => {
              const updateFromStatus = (agent: HierarchicalAgent): HierarchicalAgent => {
                const liveStatus = statusData.agents.find((a: any) => a.id === agent.id);
                if (liveStatus) {
                  return {
                    ...agent,
                    status: liveStatus.status,
                    currentTask: liveStatus.currentTask || undefined,
                  };
                }
                if (agent.children) {
                  return { ...agent, children: agent.children.map(updateFromStatus) };
                }
                return agent;
              };
              return updateFromStatus(prev);
            });
          }
        })
        .catch((err) => console.error('Failed to poll agent status:', err));
    }, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const handleFallbacksChange = useCallback(async (agentId: string, fallbacks: string[]) => {
    setSavingAgent(agentId);
    try {
      const res = await fetch('/api/agents/update-fallbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, fallbacks }),
      });
      const data = await res.json();

      if (data.success) {
        setRoot((prev) => updateAgentFallbacks(prev, agentId, fallbacks));
        setToast({ message: `Fallbacks updated (${fallbacks.length} models)`, type: 'success' });
      } else {
        setToast({ message: data.error || 'Failed to update fallbacks', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: 'Network error: ' + (err.message || 'unknown'), type: 'error' });
    } finally {
      setSavingAgent(null);
    }
  }, []);

  const handleModelChange = useCallback(async (agentId: string, newModel: string) => {
    setSavingAgent(agentId);
    try {
      const res = await fetch('/api/agents/update-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, model: newModel }),
      });
      const data = await res.json();

      if (data.success) {
        // Update local state
        setRoot((prev) => updateAgentModel(prev, agentId, newModel));
        const modelLabel = newModel.split('/').pop() ?? newModel;
        setToast({ message: `Model updated to ${modelLabel}`, type: 'success' });
      } else {
        setToast({ message: data.error || 'Failed to update model', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: 'Network error: ' + (err.message || 'unknown'), type: 'error' });
    } finally {
      setSavingAgent(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-5 text-sm p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-white/50">Working</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-gray-400" />
          <span className="text-white/50">Idle</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-white/50">Done</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-400" />
          <span className="text-white/50">Blocked</span>
        </div>
        <div className="ml-auto text-[10px] text-white/25 uppercase tracking-wider">
          {configLoaded ? '● Live Config' : '○ Loading...'}
        </div>
      </div>

      <AgentNode
        agent={root}
        onModelChange={handleModelChange}
        onFallbacksChange={handleFallbacksChange}
        savingAgent={savingAgent}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function updateProgress(agent: HierarchicalAgent): HierarchicalAgent {
  const updated = { ...agent };
  if (updated.currentTask && updated.status === 'working' && updated.currentTask.progress < 100) {
    updated.currentTask = {
      ...updated.currentTask,
      progress: Math.min(100, updated.currentTask.progress + Math.random() * 3),
    };
  }
  if (updated.children) {
    updated.children = updated.children.map(updateProgress);
  }
  return updated;
}
