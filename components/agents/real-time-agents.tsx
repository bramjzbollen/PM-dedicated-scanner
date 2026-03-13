'use client';

import { useEffect, useState, useRef } from 'react';
import { AgentCard } from './agent-card';
import type { Agent } from '@/lib/types';
import { getMockAgents } from '@/lib/agent-data';

const POLL_INTERVAL = 30000; // 30s — agent status is slow-changing
const POLL_INTERVAL_HIDDEN = 120000; // 2 min when hidden

export function RealTimeAgents() {
  const [agents, setAgents] = useState<Agent[]>(getMockAgents());
  const mountedRef = useRef(true);
  const visibleRef = useRef(true);

  useEffect(() => {
    // Track page visibility for adaptive polling
    const onChange = () => { visibleRef.current = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/agents/status');
        if (!res.ok) return;
        const data = await res.json();
        if (!mountedRef.current) return;

        // Merge API data with mock agents for display
        setAgents(prev => prev.map(agent => {
          const apiAgent = data.agents?.find((a: any) => a.id === agent.id);
          if (!apiAgent) return agent;
          return {
            ...agent,
            status: apiAgent.status === 'working' ? 'active' : apiAgent.status === 'idle' ? 'idle' : agent.status,
            currentTask: apiAgent.currentTask?.title || agent.currentTask,
            lastSeen: apiAgent.status === 'working' ? new Date() : agent.lastSeen,
          };
        }));
      } catch {
        // Keep existing data on error
      }
    };

    fetchAgents();
    const interval = setInterval(() => {
      if (mountedRef.current) fetchAgents();
    }, visibleRef.current ? POLL_INTERVAL : POLL_INTERVAL_HIDDEN);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {agents.map(agent => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </>
  );
}
