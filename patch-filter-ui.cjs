#!/usr/bin/env node
const fs = require('node:fs');
const PANEL = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage\\components\\trading\\pm-bot-panel.tsx';

let src = fs.readFileSync(PANEL, 'utf-8');

if (src.includes('{/* Filter bar */}')) {
  console.log('Filter UI already present — skipping');
  process.exit(0);
}

const anchor = `        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">`;

const replacement = `        <CardContent>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-white/30">TF</span>
              {allTimeframes.map((tf: number) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setFilterTimeframes(prev => {
                    const next = new Set(prev);
                    next.has(tf) ? next.delete(tf) : next.add(tf);
                    return next;
                  })}
                  className={cn(
                    'px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-all',
                    filterTimeframes.has(tf)
                      ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
                      : 'border-white/10 bg-white/[0.02] text-white/30 hover:text-white/50'
                  )}
                >
                  {tf < 60 ? tf + 'm' : (tf / 60) + 'h'}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-white/[0.08]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-white/30">Pairs</span>
              {allPairs.map((pair: string) => (
                <button
                  key={pair}
                  type="button"
                  onClick={() => setFilterPairs(prev => {
                    const next = new Set(prev);
                    next.has(pair) ? next.delete(pair) : next.add(pair);
                    return next;
                  })}
                  className={cn(
                    'px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-all',
                    filterPairs.has(pair)
                      ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300'
                      : 'border-white/10 bg-white/[0.02] text-white/30 hover:text-white/50'
                  )}
                >
                  {pair.replace('/USDT', '')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">`;

if (src.includes(anchor)) {
  src = src.replace(anchor, replacement);
  fs.writeFileSync(PANEL, src, 'utf-8');
  console.log('✅ Filter UI inserted before event cards grid');
} else {
  console.error('❌ Anchor not found — check CardContent + grid pattern');
}
