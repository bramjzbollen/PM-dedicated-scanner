'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faNewspaper,
  faMicrochip,
  faCoins,
  faBullhorn,
  faFlagCheckered,
  faBriefcase,
  faRotate,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  topic: string;
  lang: 'nl' | 'en';
  publishedAt: string;
  breaking?: boolean;
}

const TOPIC_CONFIG: Record<string, { icon: IconDefinition; color: string; label: string }> = {
  tech: { icon: faMicrochip, color: 'text-indigo-400', label: 'Tech' },
  crypto: { icon: faCoins, color: 'text-amber-400', label: 'Crypto' },
  marketing: { icon: faBullhorn, color: 'text-pink-400', label: 'Marketing' },
  f1: { icon: faFlagCheckered, color: 'text-red-400', label: 'F1' },
  business: { icon: faBriefcase, color: 'text-emerald-400', label: 'Business' },
};

const CACHE_KEY = 'bavo-news-cache';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface CachedData {
  items: NewsItem[];
  breaking: NewsItem | null;
  timestamp: number;
}

function loadCached(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCache(items: NewsItem[], breaking: NewsItem | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, breaking, timestamp: Date.now() }));
  } catch {
    // localStorage full or unavailable
  }
}

export function BavoNewsCard() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [breaking, setBreaking] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = useCallback(async (skipCache = false) => {
    // Check local cache first
    if (!skipCache) {
      const cached = loadCached();
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setItems(cached.items);
        setBreaking(cached.breaking);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/bavo-news');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setItems(data.items || []);
      setBreaking(data.breaking || null);
      setStale(!!data.stale);
      saveCache(data.items || [], data.breaking || null);
    } catch {
      // Fallback to stale cache
      const cached = loadCached();
      if (cached) {
        setItems(cached.items);
        setBreaking(cached.breaking);
        setStale(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(() => fetchNews(true), CACHE_TTL_MS);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/trigger-bavo', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Wait a bit then refresh
        setTimeout(() => {
          fetchNews(true);
          setRefreshing(false);
        }, 5000);
      } else {
        setRefreshing(false);
      }
    } catch {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Card className="h-full border-violet-500/[0.15]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faNewspaper} className="h-5 w-5 text-violet-400" />
            Nieuws
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl shimmer" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-violet-500/[0.1] hover:shadow-[0_12px_48px_0_rgba(139,92,246,0.08),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-violet-500/[0.1] glow-purple">
              <FontAwesomeIcon icon={faNewspaper} className="h-4 w-4 text-violet-400" />
            </div>
            <span>Nieuws</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-violet-500/[0.1] hover:bg-violet-500/[0.15] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
              title="Bavo nieuws verversen"
            >
              <FontAwesomeIcon 
                icon={faRotate} 
                className={`h-3 w-3 text-violet-400 transition-transform ${refreshing ? 'animate-spin' : 'group-hover:rotate-180'}`}
              />
            </button>
            {stale && (
              <Badge variant="outline" className="text-[10px] text-amber-400/60 border-amber-400/20">
                cached
              </Badge>
            )}
            <Badge variant="outline" className="text-xs text-white/45">
              Bavo 📡
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Breaking News */}
        {breaking && (
          <a
            href={breaking.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block p-3.5 rounded-xl bg-red-500/[0.06] border border-red-500/20 transition-all duration-200 hover:bg-red-500/[0.10] hover:border-red-500/30 hover:-translate-y-[1px] mb-3"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm">🚨</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Breaking News</span>
              <span className="relative flex h-2 w-2 ml-auto">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            </div>
            <p className="text-sm font-semibold text-white/90 leading-snug group-hover:text-white transition-colors">
              {breaking.lang === 'nl' && '🇳🇱 '}{breaking.title}
            </p>
            <p className="text-xs text-white/40 mt-1.5 flex items-center gap-1.5">
              {breaking.source}
              <span className="text-red-400/50">·</span>
              <span className="text-red-400/70 font-medium group-hover:underline">Lees meer →</span>
            </p>
          </a>
        )}

        {/* Regular News */}
        {items.length === 0 && !breaking ? (
          <div className="text-center py-8 text-white/30">
            <FontAwesomeIcon icon={faNewspaper} className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Geen nieuws beschikbaar</p>
            <p className="text-xs mt-1">Bavo is nog aan het opstarten...</p>
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-2">
            {breaking && (
              <p className="text-[10px] font-medium text-white/35 uppercase tracking-widest mb-1">📰 Nieuws</p>
            )}
            {items.map((item) => {
              const topicCfg = TOPIC_CONFIG[item.topic] || TOPIC_CONFIG.tech;
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.10] hover:-translate-y-[1px] cursor-pointer"
                >
                  <div className={`mt-0.5 p-1.5 rounded-lg bg-white/[0.04] shrink-0`}>
                    <FontAwesomeIcon
                      icon={topicCfg.icon}
                      className={`h-3.5 w-3.5 ${topicCfg.color}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/85 leading-snug group-hover:text-indigo-300 group-hover:underline underline-offset-2 decoration-indigo-400/50 transition-colors line-clamp-2">
                      {item.lang === 'nl' && '🇳🇱 '}{item.title}
                    </p>
                    <p className="text-xs text-white/35 mt-1">
                      {item.source}
                      <span className="mx-1.5 opacity-30">·</span>
                      <span className={topicCfg.color + ' opacity-70'}>{topicCfg.label}</span>
                    </p>
                  </div>
                  <svg
                    className="h-4 w-4 text-white/20 group-hover:text-white/40 shrink-0 mt-1 transition-all duration-200 group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
