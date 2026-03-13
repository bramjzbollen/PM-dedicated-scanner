'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faEnvelopeOpen, faStar, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';

interface EmailItem {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  starred: boolean;
  account: string;
  accountColor: string;
  gmailUrl?: string;
}

interface AccountStatus {
  label: string;
  color: string;
  unread: number;
  error?: string;
}

const colorMap: Record<string, { badge: string; text: string }> = {
  blue: { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', text: 'text-blue-400' },
  emerald: { badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', text: 'text-emerald-400' },
  violet: { badge: 'bg-violet-500/20 text-violet-400 border-violet-500/30', text: 'text-violet-400' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return 'nu';
  if (diffMin < 60) return `${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}u`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function EmailWidget() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch('/api/emails');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setEmails(data.items || []);
      setAccounts(data.accounts || []);
      setTotalUnread(data.totalUnread || 0);
      setError(data.error || null);
    } catch {
      setError('Kon emails niet ophalen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
    const interval = setInterval(fetchEmails, 5 * 60 * 1000); // 5 min refresh
    return () => clearInterval(interval);
  }, [fetchEmails]);

  if (loading) {
    return (
      <Card className="h-full border-blue-500/[0.15]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-blue-400" />
            Email
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

  return (
    <Card className="h-full border-blue-500/[0.1] hover:shadow-[0_12px_48px_0_rgba(59,130,246,0.08),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-blue-500/[0.1] glow-blue">
              <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4 text-blue-400" />
            </div>
            <span>Email</span>
            {totalUnread > 0 && (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs ml-1">
                {totalUnread} nieuw
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Account badges */}
            {accounts.map((acc) => {
              const colors = colorMap[acc.color] || colorMap.blue;
              return (
                <Badge
                  key={acc.label}
                  variant="outline"
                  className={`text-[10px] ${colors.badge} ${acc.error ? 'opacity-50' : ''}`}
                  title={acc.error || `${acc.unread} ongelezen`}
                >
                  {acc.label}
                  {acc.unread > 0 && !acc.error && (
                    <span className="ml-1 font-bold">{acc.unread}</span>
                  )}
                  {acc.error && <span className="ml-1">⚠</span>}
                </Badge>
              );
            })}
            {error && accounts.length === 0 ? (
              <Badge variant="outline" className="text-[10px] text-amber-400/60 border-amber-400/20">
                config nodig
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <PulsingDot status="online" size="sm" />
                <span>5m</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {emails.length === 0 ? (
          <div className="text-center py-8 text-white/30">
            <FontAwesomeIcon icon={faEnvelope} className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Geen emails</p>
            {error && (
              <p className="text-xs mt-2 text-amber-400/50 max-w-[250px] mx-auto">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {emails.map((email) => {
              const accColors = colorMap[email.accountColor] || colorMap.blue;
              return (
                <a
                  key={email.id}
                  href={email.gmailUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.10] hover:-translate-y-[1px] cursor-pointer"
                >
                  {/* Icon */}
                  <div className="mt-0.5 p-1.5 rounded-lg bg-white/[0.04] shrink-0 relative">
                    <FontAwesomeIcon
                      icon={email.unread ? faEnvelope : faEnvelopeOpen}
                      className={`h-3.5 w-3.5 ${email.unread ? 'text-blue-400' : 'text-white/30'}`}
                    />
                    {email.starred && (
                      <FontAwesomeIcon
                        icon={faStar}
                        className="h-2 w-2 text-yellow-400 absolute -top-0.5 -right-0.5"
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs truncate ${email.unread ? 'text-blue-300 font-semibold' : 'text-white/50'}`}>
                        {email.from}
                      </p>
                      <Badge variant="outline" className={`text-[9px] py-0 px-1.5 ${accColors.badge}`}>
                        {email.account}
                      </Badge>
                      <span className="text-[10px] text-white/25 shrink-0">{timeAgo(email.date)}</span>
                    </div>
                    <p className={`text-sm leading-snug truncate mt-0.5 group-hover:text-indigo-300 transition-colors ${email.unread ? 'text-white/90 font-medium' : 'text-white/60'}`}>
                      {email.subject}
                    </p>
                  </div>

                  {/* Arrow */}
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="h-3 w-3 text-white/15 group-hover:text-white/40 shrink-0 mt-2 transition-all duration-200"
                  />
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
