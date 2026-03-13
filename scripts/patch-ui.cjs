const fs = require('fs');
const path = require('path');
const base = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'components', 'trading');
['scalping-auto-trader.tsx', 'swing-auto-trader.tsx'].forEach(fn => {
  const f = path.join(base, fn);
  let c = fs.readFileSync(f, 'utf-8');
  let fixes = 0;
  // 1. Add showHistory state
  if (!c.includes('showHistory')) {
    c = c.replace('const [confirmReset,', 'const [showHistory, setShowHistory] = useState(false);\n  const [confirmReset,');
    fixes++;
  }
  // 2. Replace Recent Closes with collapsible Trade History
  if (c.includes('Recent Closes') && !c.includes('Trade History')) {
    const start = c.indexOf('Recent Closes');
    const cardStart = c.lastIndexOf('{/*', start);
    const cardTag = c.indexOf('<Card', cardStart);
    let endSearch = c.indexOf('</Card>', cardTag);
    let endBlock = c.indexOf(')}\n', endSearch);
    if (endBlock === -1) endBlock = c.indexOf(')}', endSearch);
    const replacement = `{/* Trade History (collapsible) */}
      {engine.closedPositions.length > 0 && (
        <Card className="hover:-translate-y-0">
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
            <CardTitle className="text-base flex items-center gap-2 text-white/60">
              <FontAwesomeIcon icon={faList} className="h-4 w-4" />
              Trade History
              <Badge variant="secondary" className="ml-2 text-xs">{engine.closedPositions.length}</Badge>
              <span className="text-[9px] text-white/25 ml-1">W: {engine.stats.winCount} / L: {engine.stats.lossCount}</span>
              <FontAwesomeIcon icon={showHistory ? faChevronUp : faChevronDown} className="h-3 w-3 ml-auto text-white/30" />
            </CardTitle>
          </CardHeader>
          {showHistory && (
            <CardContent>
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                {engine.closedPositions.map(pos => {
                  const isWin = (pos.pnl || 0) > 0;
                  return (
                    <div key={pos.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/[0.02] text-xs">
                      <span className={pos.direction === 'LONG' ? 'text-emerald-400/60 font-bold' : 'text-red-400/60 font-bold'}>{pos.direction}</span>
                      <span className="text-white/60 min-w-[80px]">{pos.symbol}</span>
                      <span className={(isWin ? 'text-emerald-400' : 'text-red-400') + ' font-mono font-bold'}>{isWin ? '+' : ''}{(pos.pnl || 0).toFixed(2)}$</span>
                      <span className="text-white/30">{pos.closeReason?.toUpperCase()}</span>
                      <span className="text-white/20 ml-auto">{pos.closedAt ? new Date(pos.closedAt).toLocaleTimeString() : ''}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}`;
    c = c.slice(0, cardStart) + replacement + c.slice(endBlock + 2);
    fixes++;
  }
  // 3. Filter price-0 signals from pending
  if (!c.includes('price > 0 filter')) {
    c = c.replace(
      /sig\.confidence >= engine\.config\.minConfidence &&\n\s+!activeSymbols\.has\(key\)/,
      'sig.confidence >= engine.config.minConfidence &&\n            !activeSymbols.has(key) &&\n            (sig.price > 0 || sig.indicators?.price > 0) /* price > 0 filter */'
    );
    fixes++;
  }
  fs.writeFileSync(f, c);
  console.log(fn + ': ' + fixes + ' fixes');
});
