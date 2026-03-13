'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faFire, faExclamationTriangle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';

interface DeadlineItem {
  id: string;
  title: string;
  dueDate: string;
  minutesLeft: number;
  urgency: 'red' | 'orange' | 'green';
}

function formatTimeLeft(minutesLeft: number): string {
  if (minutesLeft <= 0) return 'Verlopen!';
  if (minutesLeft < 60) return `Over ${minutesLeft} min`;
  const hours = Math.floor(minutesLeft / 60);
  if (hours < 24) return `Over ${hours}u`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Morgen';
  if (days < 7) return `Over ${days} dagen`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Over 1 week';
  return `Over ${weeks} weken`;
}

function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  if (isToday) return `Vandaag ${d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
  if (isTomorrow) return `Morgen`;
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

const urgencyConfig = {
  red: {
    icon: faFire,
    iconColor: 'text-red-400',
    bgColor: 'bg-red-500/[0.06]',
    borderColor: 'border-red-500/[0.15]',
    textColor: 'text-red-400',
    badgeBg: 'bg-red-500/20 border-red-500/30',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.1)]',
  },
  orange: {
    icon: faExclamationTriangle,
    iconColor: 'text-amber-400',
    bgColor: 'bg-amber-500/[0.04]',
    borderColor: 'border-amber-500/[0.12]',
    textColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 border-amber-500/30',
    glow: '',
  },
  green: {
    icon: faCheckCircle,
    iconColor: 'text-emerald-400',
    bgColor: 'bg-white/[0.02]',
    borderColor: 'border-white/[0.04]',
    textColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/30',
    glow: '',
  },
};

export function DeadlinesWidget() {
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchDeadlines = useCallback(async () => {
    try {
      const res = await fetch('/api/deadlines');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setDeadlines(data.items || []);
      setSource(data.source || '');
      setError(data.error || null);
    } catch {
      setError('Kon deadlines niet ophalen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeadlines();
    // Poll every 10 seconds to catch planning changes quickly
    const interval = setInterval(fetchDeadlines, 10 * 1000);
    return () => clearInterval(interval);
  }, [fetchDeadlines]);

  if (loading) {
    return (
      <Card className="h-full border-amber-500/[0.15]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faClock} className="h-5 w-5 text-amber-400" />
            Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl shimmer" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const urgentCount = deadlines.filter(d => d.urgency === 'red').length;

  return (
    <Card className="h-full border-amber-500/[0.1] hover:shadow-[0_12px_48px_0_rgba(245,158,11,0.08),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-amber-500/[0.1] glow-orange">
              <FontAwesomeIcon icon={faClock} className="h-4 w-4 text-amber-400" />
            </div>
            <span>Deadlines</span>
            {urgentCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs ml-1">
                {urgentCount} urgent
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-white/40 border-white/10">
              Top 5
            </Badge>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <PulsingDot status="online" size="sm" />
              <span>Planning</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {deadlines.length === 0 ? (
          <div className="text-center py-8 text-white/30">
            <FontAwesomeIcon icon={faCheckCircle} className="h-8 w-8 mb-2 text-emerald-400/40" />
            <p className="text-sm">Geen openstaande deadlines 🎉</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deadlines.map((deadline) => {
              const cfg = urgencyConfig[deadline.urgency];
              return (
                <div
                  key={deadline.id}
                  className={`flex items-center gap-3 p-3 rounded-xl ${cfg.bgColor} border ${cfg.borderColor} ${cfg.glow} transition-all duration-200 hover:bg-white/[0.06]`}
                >
                  {/* Urgency Icon */}
                  <div className="p-1.5 rounded-lg bg-white/[0.04] shrink-0">
                    <FontAwesomeIcon
                      icon={cfg.icon}
                      className={`h-3.5 w-3.5 ${cfg.iconColor}`}
                    />
                  </div>

                  {/* Task Name + Due Date */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/85 truncate">
                      {deadline.title}
                    </p>
                    <p className="text-xs text-white/35 mt-0.5">
                      {formatDueDate(deadline.dueDate)}
                    </p>
                  </div>

                  {/* Time Left */}
                  <Badge className={`${cfg.badgeBg} ${cfg.textColor} text-xs font-semibold shrink-0`}>
                    {formatTimeLeft(deadline.minutesLeft)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
