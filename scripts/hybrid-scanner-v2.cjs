/**
 * Hybrid Scanner V2 — Continuation Strategy
 * 
 * Two modes:
 *   1m micro-scalp continuation (bias: 5m EMA50 + RSI)
 *   15m pullback continuation (bias: 1h EMA200)
 * 
 * Runs alongside the existing StochRSI scanner (v1).
 * Writes to: public/v2-scalp-signals.json and public/v2-swing-signals.json
 */

const WebSocket = require('ws');
const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const OUTPUT_SCALP = path.join(__dirname, '..', 'public', 'v2-scalp-signals.json');
const OUTPUT_SWING = path.join(__dirname, '..', 'public', 'v2-swing-signals.json');
const WRITE_INTERVAL = 5 * 1000; // 5s voor stabielere feed
const LOG_INTERVAL = 60 * 1000;
const MAX_CANDLES = 250; // Need more for EMA200 on 1h
const TOP_PAIRS = 250;  // Increased from 35 for more trading opportunities
const ALL_PAIRS_MAX = 250;  // Increased from 80 for more coverage
const FETCH_RETRIES = 3;
const FETCH_RETRY_DELAY_MS = 900;

// ── Indicator Library ──

function calcEMA(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < data.length; i++) {
    ema.push(data[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes, period) {
  if (closes.length < period + 1) return [];
  const rsi = [];
  let avgGain = 0, avgLoss = 0;
  // Seed
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= period;
  avgLoss /= period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function calcMACD(closes, fast, slow, signal) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  if (emaFast.length === 0 || emaSlow.length === 0) return { line: [], signal: [], histogram: [] };

  // Align: emaSlow starts later
  const offset = slow - fast;
  const line = [];
  for (let i = 0; i < emaSlow.length; i++) {
    line.push(emaFast[i + offset] - emaSlow[i]);
  }

  const sigLine = calcEMA(line, signal);
  const sigOffset = line.length - sigLine.length;
  const histogram = [];
  for (let i = 0; i < sigLine.length; i++) {
    histogram.push(line[i + sigOffset] - sigLine[i]);
  }

  return { line, signal: sigLine, histogram };
}

function calcATR(highs, lows, closes, period) {
  if (highs.length < period + 1) return 0;
  let sum = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    sum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  return sum / period;
}

function last(arr) { return arr.length > 0 ? arr[arr.length - 1] : null; }
function prev(arr, n = 1) { return arr.length > n ? arr[arr.length - 1 - n] : null; }

// ── Candle Storage ──
// Keyed by "symbol:timeframe"
const candles = Object.create(null);

function candleKey(symbol, tf) { return symbol + ':' + tf; }

function getCandles(symbol, tf) {
  return candles[candleKey(symbol, tf)] || null;
}

function setCandles(symbol, tf, data) {
  candles[candleKey(symbol, tf)] = data;
}

function trimCandleData(data) {
  if (data.closes.length > MAX_CANDLES) {
    const excess = data.closes.length - MAX_CANDLES;
    data.closes.splice(0, excess);
    data.highs.splice(0, excess);
    data.lows.splice(0, excess);
    data.volumes.splice(0, excess);
  }
}

// ── 1m StochRSI Momentum Scanner (V5) ──
// Pure StochRSI crossover strategy:
//   LONG:  K crosses above D in oversold zone (K < 40, from below 15)
//   SHORT: K crosses below D in overbought zone (K > 60, from above 85)
//   Gate:  5m EMA50 bias must agree
//   Confirm: Volume > 1.2x average

function calcStochRSI(closes, rsiPeriod, stochPeriod, kSmooth, dSmooth) {
  // Calculate RSI first
  const rsiValues = [];
  if (closes.length < rsiPeriod + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= rsiPeriod; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= rsiPeriod; avgLoss /= rsiPeriod;
  rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = rsiPeriod + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (rsiPeriod - 1) + (ch > 0 ? ch : 0)) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + (ch < 0 ? -ch : 0)) / rsiPeriod;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  if (rsiValues.length < stochPeriod) return null;

  // Stochastic of RSI
  const stochRaw = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const lo = Math.min(...slice), hi = Math.max(...slice);
    stochRaw.push(hi === lo ? 50 : ((rsiValues[i] - lo) / (hi - lo)) * 100);
  }

  if (stochRaw.length < kSmooth) return null;

  // K = SMA of stochastic
  const kValues = [];
  for (let i = kSmooth - 1; i < stochRaw.length; i++) {
    let sum = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) sum += stochRaw[j];
    kValues.push(sum / kSmooth);
  }

  if (kValues.length < dSmooth + 1) return null;

  // D = SMA of K
  const dValues = [];
  for (let i = dSmooth - 1; i < kValues.length; i++) {
    let sum = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) sum += kValues[j];
    dValues.push(sum / dSmooth);
  }

  if (dValues.length < 2) return null;

  return {
    k: kValues[kValues.length - 1],
    kPrev: kValues[kValues.length - 2],
    d: dValues[dValues.length - 1],
    dPrev: dValues[dValues.length - 2],
    kHist: kValues.slice(-5),  // last 5 K values for zone detection
  };
}

// -- 1m V2 Clean Scanner � StochRSI + EMA + ATR + Volume --
const SCANNER_CONFIG_PATH = path.join(__dirname, '..', 'public', 'scanner-config.json');
let scannerConfig = null;
function loadScannerConfig() {
  try { scannerConfig = JSON.parse(fs.readFileSync(SCANNER_CONFIG_PATH, 'utf-8')); }
  catch(e) { if (!scannerConfig) scannerConfig = { stochRsi:{rsiPeriod:5,stochPeriod:5,kSmoothing:3,dSmoothing:3}, entryZones:{oversoldThreshold:20,oversoldExitMax:35,overboughtThreshold:80,overboughtExitMin:65}, ema:{fast:9,slow:21,trend:50}, atr:{period:10}, volume:{spikeThreshold:1.5,smaPeriod:20}, risk:{slAtrMultiple:1.5,tpAtrMultiple:2.25,minSlPercent:0.3,roundtripFeePct:0.11,timeStopCandles:10} }; }
}
loadScannerConfig();

// -- Market Regime Monitor (V14 robust) --
const REGIME_CFG = {
  neutralBandPct: 0.35,
  hysteresisPct: 0.15,
  slopeLookback: 3,
  slopeNeutralPct: 0.08,
};
let _regimeData = {
  regime: 'neutral', longEnabled: true, shortEnabled: true,
  btcPrice: 0, ema50_1h: 0, ema200_1h: 0,
  ema50SlopePct: 0, emaSpreadPct: 0, distancePct: 0,
  updatedAt: '',
};
function updateMarketRegime() {
  try {
    const btc1h = getCandles('BTC/USDT', '1h');
    if (!btc1h || btc1h.closes.length < 210) return;
    const closes = btc1h.closes;
    const btcPrice = closes[closes.length - 1];
    const ema50 = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, 200);
    if (ema50.length < REGIME_CFG.slopeLookback + 1 || ema200.length < 2) return;

    const ema50Now = ema50[ema50.length - 1];
    const ema50Prev = ema50[ema50.length - 1 - REGIME_CFG.slopeLookback];
    const ema200Now = ema200[ema200.length - 1];
    const slopePct = ((ema50Now - ema50Prev) / ema50Prev) * 100;
    const spreadPct = ((ema50Now - ema200Now) / ema200Now) * 100;
    const distTo200Pct = ((btcPrice - ema200Now) / ema200Now) * 100;

    const bullishCore = btcPrice > ema200Now && spreadPct > REGIME_CFG.neutralBandPct && slopePct > REGIME_CFG.slopeNeutralPct;
    const bearishCore = btcPrice < ema200Now && spreadPct < -REGIME_CFG.neutralBandPct && slopePct < -REGIME_CFG.slopeNeutralPct;

    let regime = 'neutral';
    const prev = _regimeData.regime;
    if (prev === 'bullish') {
      if (spreadPct < -(REGIME_CFG.neutralBandPct + REGIME_CFG.hysteresisPct) && slopePct < -REGIME_CFG.slopeNeutralPct) regime = 'bearish';
      else if (!bullishCore && Math.abs(spreadPct) <= REGIME_CFG.neutralBandPct) regime = 'neutral';
      else regime = 'bullish';
    } else if (prev === 'bearish') {
      if (spreadPct > (REGIME_CFG.neutralBandPct + REGIME_CFG.hysteresisPct) && slopePct > REGIME_CFG.slopeNeutralPct) regime = 'bullish';
      else if (!bearishCore && Math.abs(spreadPct) <= REGIME_CFG.neutralBandPct) regime = 'neutral';
      else regime = 'bearish';
    } else {
      if (spreadPct > (REGIME_CFG.neutralBandPct + REGIME_CFG.hysteresisPct) && slopePct > REGIME_CFG.slopeNeutralPct) regime = 'bullish';
      else if (spreadPct < -(REGIME_CFG.neutralBandPct + REGIME_CFG.hysteresisPct) && slopePct < -REGIME_CFG.slopeNeutralPct) regime = 'bearish';
      else regime = 'neutral';
    }

    const changed = regime !== _regimeData.regime;
    _regimeData = {
      regime,
      btcPrice: +btcPrice.toFixed(2),
      ema50_1h: +ema50Now.toFixed(2),
      ema200_1h: +ema200Now.toFixed(2),
      ema50SlopePct: +slopePct.toFixed(3),
      emaSpreadPct: +spreadPct.toFixed(3),
      distancePct: +distTo200Pct.toFixed(3),
      updatedAt: new Date().toISOString(),
      longEnabled: regime !== 'bearish',
      shortEnabled: regime !== 'bullish',
      config: REGIME_CFG,
    };
    try { fs.writeFileSync(path.join(__dirname, '..', 'public', 'market-regime.json'), JSON.stringify(_regimeData, null, 2)); } catch(e) {}
    if (changed) {
      console.log('[REGIME] *** ' + regime.toUpperCase() + ' *** BTC: $' + btcPrice.toFixed(0) +
        ' | EMA50/200: ' + ema50Now.toFixed(0) + '/' + ema200Now.toFixed(0) +
        ' | spread: ' + spreadPct.toFixed(2) + '% | slope: ' + slopePct.toFixed(2) + '%');
    }
  } catch(e) {}
}
function getRegime() { return _regimeData; }

// (duplicate calcStochRSI removed — using the one defined at line 126)

function scan1m(symbol) {
  loadScannerConfig();

  const sc = scannerConfig;
  const d1 = getCandles(symbol, '1m');
  if (!d1 || d1.closes.length < 60) return null;
  const c=d1.closes, h=d1.highs, l=d1.lows, v=d1.volumes;
  const price = c[c.length-1];
  const emaFast=calcEMA(c,sc.ema.fast), emaSlow=calcEMA(c,sc.ema.slow), emaTrend=calcEMA(c,sc.ema.trend);
  if (emaFast.length<2||emaSlow.length<2||emaTrend.length<2) return null;
  const emaFv=emaFast[emaFast.length-1], emaSv=emaSlow[emaSlow.length-1], emaTv=emaTrend[emaTrend.length-1];
  const bullTrend = emaFv > emaSv && price > emaTv;
  const bearTrend = emaFv < emaSv && price < emaTv;
  const stoch = calcStochRSI(c, sc.stochRsi.rsiPeriod, sc.stochRsi.stochPeriod, sc.stochRsi.kSmoothing, sc.stochRsi.dSmoothing);
  if (!stoch) return null;
  const {k,kPrev,d,dPrev} = stoch;
  const kCrossAboveD = kPrev<=dPrev && k>d;
  const kCrossBelowD = kPrev>=dPrev && k<d;
  const inOversold = k<sc.entryZones.oversoldExitMax && (k<sc.entryZones.oversoldThreshold || kPrev<sc.entryZones.oversoldThreshold);
  const inOverbought = k>sc.entryZones.overboughtExitMin && (k>sc.entryZones.overboughtThreshold || kPrev>sc.entryZones.overboughtThreshold);
  const volLen=v.length, volStart=Math.max(0,volLen-sc.volume.smaPeriod);
  let volSum=0; for(let i=volStart;i<volLen;i++) volSum+=v[i];
  const avgVol=volSum/Math.min(sc.volume.smaPeriod,volLen-volStart);
  const volRatio=avgVol>0?v[volLen-1]/avgVol:1;
  const volSpike=volRatio>=sc.volume.spikeThreshold;
  const atr=calcATR(h,l,c,sc.atr.period);
  const atrPct=(atr/price)*100;
  // Multi-timeframe: 5m EMA50 trend confirmation
  const d5m = getCandles(symbol, '5m');
  let htfBull = true, htfBear = true, htfTag = '';
  if (d5m && d5m.closes.length >= 55) {
    const ema50_5m = calcEMA(d5m.closes, 50);
    if (ema50_5m.length > 0) {
      const e50_5m = ema50_5m[ema50_5m.length - 1];
      const px5m = d5m.closes[d5m.closes.length - 1];
      htfBull = px5m > e50_5m;
      htfBear = px5m < e50_5m;
      htfTag = '5m' + (htfBull ? '↑' : htfBear ? '↓' : '~');
    }
  }
  // Volume penalty: reduce confidence when volume is below average (low-conviction entry)
  const volWeak = volRatio < 0.8;

  let signal='NEUTRAL',direction='NEUTRAL',confidence=0,reason='';
  const longSignal = kCrossAboveD && inOversold && getRegime().longEnabled && htfBull;  // V14: regime + 5m HTF gate
  const shortSignal = kCrossBelowD && inOverbought && getRegime().shortEnabled && htfBear;  // V14: regime + 5m HTF gate
  if (longSignal) {
    signal='LONG'; direction='LONG'; confidence=60;
    if(volSpike) confidence+=10; if(k<sc.entryZones.oversoldThreshold) confidence+=10; if(emaFv>emaSv&&emaSv>emaTv) confidence+=5;
    if(volWeak) confidence-=5; // Low volume penalty
    reason=['StochRSI K='+k.toFixed(0)+' xD='+d.toFixed(0),'EMA '+sc.ema.fast+'>'+sc.ema.slow+' P>'+sc.ema.trend,htfTag,volSpike?'Vol '+volRatio.toFixed(1)+'x':volWeak?'VolLow '+volRatio.toFixed(1)+'x':null,'ATR '+atrPct.toFixed(2)+'%'].filter(Boolean).join(' | ');
  } else if (shortSignal) {
    signal='SHORT'; direction='SHORT'; confidence=60;
    if(volSpike) confidence+=10; if(k>sc.entryZones.overboughtThreshold) confidence+=10; if(emaFv<emaSv&&emaSv<emaTv) confidence+=5;
    if(volWeak) confidence-=5; // Low volume penalty
    reason=['StochRSI K='+k.toFixed(0)+' xD='+d.toFixed(0),'EMA '+sc.ema.fast+'<'+sc.ema.slow+' P<'+sc.ema.trend,htfTag,volSpike?'Vol '+volRatio.toFixed(1)+'x':volWeak?'VolLow '+volRatio.toFixed(1)+'x':null,'ATR '+atrPct.toFixed(2)+'%'].filter(Boolean).join(' | ');
  }
  confidence=Math.min(95,confidence);
  let riskPerUnit=atr*sc.risk.slAtrMultiple;
  const minSlDist=price*(sc.risk.minSlPercent/100);
  if(riskPerUnit<minSlDist) riskPerUnit=minSlDist;
  const tpDist=atr*sc.risk.tpAtrMultiple;
  const effTp=Math.max(tpDist,minSlDist*1.5);
  const minTpFees=price*(sc.risk.roundtripFeePct/100)*2.5;
  const tpOk=effTp>minTpFees;
  const skipTrade=signal==='NEUTRAL'||!tpOk;
  return { pair:symbol,symbol,signal,direction,confidence:Math.round(confidence), reason:skipTrade&&signal!=='NEUTRAL'?reason+' [SKIP: TP<fees]':reason, skipTrade, criteriaMet:(longSignal||shortSignal?3:0)+(volSpike?1:0), criteriaTotal:4,
    trade:skipTrade?null:{ stopLoss:+(direction==='LONG'?price-riskPerUnit:price+riskPerUnit).toFixed(6), takeProfit:+(price+effTp*(direction==='LONG'?1:-1)).toFixed(6), breakEvenAt:+(price+riskPerUnit*0.5*(direction==='LONG'?1:-1)).toFixed(6), riskR:+riskPerUnit.toFixed(6), feeCostPct:sc.risk.roundtripFeePct, tpToFeeRatio:+(effTp/(price*sc.risk.roundtripFeePct/100)).toFixed(2), timeStopCandles:sc.risk.timeStopCandles },
    indicators:{ price:+price.toFixed(6), stochK:+k.toFixed(2), stochD:+d.toFixed(2), stochKprev:+kPrev.toFixed(2), stochDprev:+dPrev.toFixed(2), emaFast:+emaFv.toFixed(6), emaSlow:+emaSv.toFixed(6), emaTrend:+emaTv.toFixed(6), volumeRatio:+volRatio.toFixed(2), atrPercent:+atrPct.toFixed(3), atr:+atr.toFixed(6) } };
}


function scan15m(symbol) {
  const d15=getCandles(symbol,'15m');
  if(!d15||d15.closes.length<110) return null;
  const c=d15.closes,h=d15.highs,l=d15.lows,v=d15.volumes;
  const price=c[c.length-1];
  const ema21=calcEMA(c,21),ema50=calcEMA(c,50),ema100=calcEMA(c,100);
  if(ema21.length<2||ema50.length<2||ema100.length<2) return null;
  const e21=last(ema21),e50=last(ema50),e100=last(ema100);
  const bullTrend=price>e21&&price>e50&&price>e100;
  const bearTrend=price<e21&&price<e50&&price<e100;
  const rsi=calcRSI(c,21); if(rsi.length<2) return null;
  const rsiVal=last(rsi);
  // Asymmetric RSI: longs need pullback zone (35-55), shorts need overbought fade (45-65)
  const rsiBullOk=rsiVal>35&&rsiVal<55, rsiBearOk=rsiVal>45&&rsiVal<65;
  const macd=calcMACD(c,8,17,9); if(macd.histogram.length<3) return null;
  const hist=last(macd.histogram), macdLine=last(macd.line), macdSig=last(macd.signal);
  const macdBull=macdLine>macdSig&&hist>0, macdBear=macdLine<macdSig&&hist<0;
  const atr=calcATR(h,l,c,14), atrPct=(atr/price)*100;
  const volLen=v.length, volStart=Math.max(0,volLen-20);
  let volSum=0; for(let i=volStart;i<volLen;i++) volSum+=v[i];
  const avgVol=volSum/Math.min(20,volLen-volStart);
  const volRatio=avgVol>0?v[volLen-1]/avgVol:1;
  let signal='NEUTRAL',direction='NEUTRAL',confidence=0,reason='';
  // V14: regime-gated + shorts re-enabled with regime filter
  const longSignal=bullTrend&&rsiBullOk&&macdBull&&getRegime().longEnabled;
  const shortSignal=bearTrend&&rsiBearOk&&macdBear&&getRegime().shortEnabled;
  if(longSignal) {
    signal='LONG'; direction='LONG'; confidence=65;
    if(e21>e50&&e50>e100) confidence+=10; if(volRatio>=1.3) confidence+=5; if(rsiVal>40&&rsiVal<50) confidence+=5;
    if(volRatio<0.8) confidence-=5; // Low volume penalty
    reason=['P>EMA21>50>100','RSI='+rsiVal.toFixed(0),'MACD+ H='+hist.toFixed(4),volRatio>=1.3?'Vol '+volRatio.toFixed(1)+'x':volRatio<0.8?'VolLow '+volRatio.toFixed(1)+'x':null].filter(Boolean).join(' | ');
  } else if(shortSignal) {
    signal='SHORT'; direction='SHORT'; confidence=65;
    if(e21<e50&&e50<e100) confidence+=10; if(volRatio>=1.3) confidence+=5; if(rsiVal>50&&rsiVal<60) confidence+=5;
    if(volRatio<0.8) confidence-=5; // Low volume penalty
    reason=['P<EMA21<50<100','RSI='+rsiVal.toFixed(0),'MACD- H='+hist.toFixed(4),volRatio>=1.3?'Vol '+volRatio.toFixed(1)+'x':volRatio<0.8?'VolLow '+volRatio.toFixed(1)+'x':null].filter(Boolean).join(' | ');
  }
  confidence=Math.min(95,Math.max(0,confidence));
  loadScannerConfig(); // Ensure fresh config for fee calc
  const sc15 = scannerConfig;
  const feePct = (sc15 && sc15.risk && sc15.risk.roundtripFeePct) || 0.11;
  const slBuffer=atr*0.5;
  let riskPerUnit=direction==='LONG'?Math.abs(price-(e21-slBuffer)):Math.abs((e21+slBuffer)-price);
  const minSl=price*0.005; if(riskPerUnit<minSl) riskPerUnit=minSl;
  const tpDist=riskPerUnit*3;
  const minTpFees=price*(feePct/100)*2.5;
  const tpOk=tpDist>minTpFees;
  const skipTrade=signal==='NEUTRAL'||!tpOk;
  return { pair:symbol,symbol,signal,direction,confidence:Math.round(confidence), reason:skipTrade&&signal!=='NEUTRAL'?reason+' [SKIP: TP<fees]':reason, skipTrade, criteriaMet:(longSignal||shortSignal?3:0)+(volRatio>=1.3?1:0), criteriaTotal:4, criteriaDetails:{emaTrend:bullTrend||bearTrend,rsiOk:rsiBullOk||rsiBearOk,macdOk:macdBull||macdBear,volume:volRatio>=1.3},
    trade:skipTrade?null:{ stopLoss:+(direction==='LONG'?e21-slBuffer:e21+slBuffer).toFixed(6), takeProfit:+(price+tpDist*(direction==='LONG'?1:-1)).toFixed(6), breakEvenAt:+(price+riskPerUnit*1.0*(direction==='LONG'?1:-1)).toFixed(6), riskR:+riskPerUnit.toFixed(6), feeCostPct:feePct, tpToFeeRatio:+(tpDist/(price*feePct/100)).toFixed(2), timeStopCandles:12 },
    indicators:{ price:+price.toFixed(6), ema21:+e21.toFixed(6), ema50:+e50.toFixed(6), ema100:+e100.toFixed(6), rsi21:+rsiVal.toFixed(2), macdLine:+macdLine.toFixed(6), macdSignal:+macdSig.toFixed(6), macdHist:+hist.toFixed(6), volumeRatio:+volRatio.toFixed(2), atrPercent:+atrPct.toFixed(3), atr:+atr.toFixed(6) } };
}


let exchange = null;
let allPairNames = [];
let topPairNames = [];
let lastLog = 0;

async function fetchOneOHLCVWithRetry(pair, tf, limit) {
  let lastErr = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const ohlcv = await exchange.fetchOHLCV(pair, tf, undefined, limit);
      if (!ohlcv || ohlcv.length < 30) return false;
      const key = candleKey(pair, tf);
      if (!candles[key]) candles[key] = { closes: [], highs: [], lows: [], volumes: [] };
      const c = candles[key];
      c.closes.length = 0; c.highs.length = 0; c.lows.length = 0; c.volumes.length = 0;
      const start = Math.max(0, ohlcv.length - MAX_CANDLES);
      for (let j = start; j < ohlcv.length; j++) {
        c.closes.push(ohlcv[j][4]);
        c.highs.push(ohlcv[j][2]);
        c.lows.push(ohlcv[j][3]);
        c.volumes.push(ohlcv[j][5]);
      }
      return true;
    } catch (e) {
      lastErr = e;
      if (attempt < FETCH_RETRIES) await sleep(FETCH_RETRY_DELAY_MS * attempt);
    }
  }
  console.error('[V2] OHLCV failed', pair, tf, '-', lastErr?.message || 'unknown error');
  return false;
}

async function fetchOHLCV(pairs, tf, limit) {
  const BATCH = 8;
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((pair) => fetchOneOHLCVWithRetry(pair, tf, limit)));
    for (const r of results) r ? ok++ : failed++;
    if (i + BATCH < pairs.length) await sleep(500);
  }
  if (failed > 0) {
    console.warn('[V2] OHLCV partial ' + tf + ': ok=' + ok + ' failed=' + failed + ' total=' + pairs.length);
  }
  return { ok, failed, total: pairs.length };
}

// ── WebSocket for 1m candles (top pairs) ──
let wsInstance = null;

function connectWS() {
  if (wsInstance) { try { wsInstance.terminate(); } catch {} }
  wsInstance = new WebSocket('wss://stream.bybit.com/v5/public/spot', { maxPayload: 1024 * 1024 });

  wsInstance.on('open', () => {
    console.log('[V2-WS] Connected, subscribing to ' + topPairNames.length + ' pairs (1m klines)...');
    const args = topPairNames.map(p => 'kline.1.' + p.replace('/', ''));
    for (let i = 0; i < args.length; i += 10) {
      const batch = args.slice(i, i + 10);
      setTimeout(() => {
        if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
          wsInstance.send(JSON.stringify({ op: 'subscribe', args: batch }));
        }
      }, (i / 10) * 100);
    }
  });

  wsInstance.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg.topic || !msg.topic.startsWith('kline.1.') || !msg.data) return;
      const sym = msg.topic.slice(8).replace('USDT', '/USDT');
      const d = Array.isArray(msg.data) ? msg.data[0] : msg.data;
      if (!d) return;
      const c = getCandles(sym, '1m');
      if (!c) return;

      const close = parseFloat(d.close);
      const high = parseFloat(d.high);
      const low = parseFloat(d.low);
      const vol = parseFloat(d.volume);

      if (d.confirm) {
        c.closes.push(close); c.highs.push(high); c.lows.push(low); c.volumes.push(vol);
        trimCandleData(c);
      } else {
        const last = c.closes.length - 1;
        if (last >= 0) {
          c.closes[last] = close;
          c.highs[last] = Math.max(c.highs[last], high);
          c.lows[last] = Math.min(c.lows[last], low);
          c.volumes[last] = vol;
        }
      }
    } catch (e) { /* skip */ }
  });

  wsInstance.on('close', () => { setTimeout(connectWS, 5000); });
  wsInstance.on('error', (e) => console.error('[V2-WS] Error:', e.message));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeWriteJsonAtomic(outPath, data) {
  try {
    const tmp = outPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, outPath);
    return true;
  } catch (e) {
    console.error('[V2] Write error (' + path.basename(outPath) + '):', e.message);
    return false;
  }
}

function writeHeartbeatFiles(errorMessage = null) {
  const nowIso = new Date().toISOString();
  safeWriteJsonAtomic(OUTPUT_SCALP, {
    success: !errorMessage,
    version: 'v2-continuation',
    scanner: '1m-micro-scalp',
    timestamp: nowIso,
    scannedPairs: topPairNames.length || 0,
    prices: {},
    signals: [],
    error: errorMessage || undefined,
  });

  safeWriteJsonAtomic(OUTPUT_SWING, {
    success: !errorMessage,
    version: 'v2-continuation',
    scanner: '15m-pullback',
    timestamp: nowIso,
    scannedPairs: allPairNames.length || 0,
    prices: {},
    signals: [],
    error: errorMessage || undefined,
  });
}

// ── Write results ──

function writeScalpResults() {
  const signals = [];
  const prices = Object.create(null);
  for (const pair of topPairNames) {
    try {
      const sig = scan1m(pair);
      if (sig) {
        signals.push(sig);
        if (sig.indicators.price > 0) prices[sig.symbol] = sig.indicators.price;
      }
    } catch (e) {
      console.error('[V2-1m] scan error for', pair, '-', e.message);
    }
  }

  const active = signals.filter(s => s.signal !== 'NEUTRAL' && !s.skipTrade);
  signals.sort((a, b) =>
    (b.confidence - a.confidence) ||
    ((b.indicators?.volumeRatio || 0) - (a.indicators?.volumeRatio || 0)) ||
    ((b.indicators?.atrPercent || 0) - (a.indicators?.atrPercent || 0)) ||
    a.symbol.localeCompare(b.symbol)
  );

  const data = {
    success: true,
    version: 'v2-continuation',
    scanner: '1m-micro-scalp',
    timestamp: new Date().toISOString(),
    scannedPairs: topPairNames.length,
    prices,
    signals: signals.slice(0, 200),
  };

  safeWriteJsonAtomic(OUTPUT_SCALP, data);

  const now = Date.now();
  if (now - lastLog > LOG_INTERVAL) {
    console.log('[V2-1m] Signals: ' + active.length + ' (' +
      active.filter(s => s.signal === 'LONG').length + 'L/' +
      active.filter(s => s.signal === 'SHORT').length + 'S) from ' +
      topPairNames.length + ' pairs');
    lastLog = now;
  }
}

function writeSwingResults() {
  const signals = [];
  const prices = Object.create(null);
  for (const pair of allPairNames) {
    try {
      const sig = scan15m(pair);
      if (sig) {
        signals.push(sig);
        if (sig.indicators.price > 0) prices[sig.symbol] = sig.indicators.price;
      }
    } catch (e) {
      console.error('[V2-15m] scan error for', pair, '-', e.message);
    }
  }

  const active = signals.filter(s => s.signal !== 'NEUTRAL' && !s.skipTrade);
  signals.sort((a, b) =>
    (b.confidence - a.confidence) ||
    ((b.indicators?.volumeRatio || 0) - (a.indicators?.volumeRatio || 0)) ||
    ((b.indicators?.atrPercent || 0) - (a.indicators?.atrPercent || 0)) ||
    a.symbol.localeCompare(b.symbol)
  );

  const data = {
    success: true,
    version: 'v2-continuation',
    scanner: '15m-pullback',
    timestamp: new Date().toISOString(),
    scannedPairs: allPairNames.length,
    prices,
    signals: signals.slice(0, 400),
  };

  safeWriteJsonAtomic(OUTPUT_SWING, data);

  console.log('[V2-15m] Signals: ' + active.length + ' (' +
    active.filter(s => s.signal === 'LONG').length + 'L/' +
    active.filter(s => s.signal === 'SHORT').length + 'S) from ' +
    allPairNames.length + ' pairs');
}

// ── Main ──

async function main() {
  console.log('=== V2 Continuation Scanner starting ===');
  exchange = new ccxt.bybit({ enableRateLimit: true, rateLimit: 250 });

  try {
    await exchange.loadTimeDifference();
  } catch (e) {
    console.warn('[V2] loadTimeDifference failed, continuing:', e.message);
  }

  try {
    console.log('[V2] Fetching markets...');
    const markets = await exchange.loadMarkets();
    const tickers = await exchange.fetchTickers();

    const usdtPairs = Object.values(markets)
      .filter(m => m.quote === 'USDT' && m.type === 'spot' && m.active)
      .map(m => {
        const t = tickers[m.symbol + ':USDT'] || tickers[m.symbol];
        return { symbol: m.symbol, volume: t?.quoteVolume || 0 };
      })
      .filter(p => p.volume >= 50000)
      .sort((a, b) => b.volume - a.volume)
      .filter(p => p.volume >= 1_000_000);  // $1M min volume (was $10M - too restrictive)

    topPairNames = usdtPairs.slice(0, TOP_PAIRS).map(p => p.symbol);
    allPairNames = usdtPairs.slice(0, ALL_PAIRS_MAX).map(p => p.symbol);
  } catch (e) {
    console.error('[V2] Market bootstrap failed, falling back to BTC/USDT only:', e.message);
    topPairNames = ['BTC/USDT'];
    allPairNames = ['BTC/USDT'];
  }

  console.log('[V2] Top ' + topPairNames.length + ' pairs (1m scalp)');
  console.log('[V2] All ' + allPairNames.length + ' pairs (15m swing)');

  // Fetch multi-timeframe candles (best effort, no fatal exits)
  console.log('[V2] Fetching 1m candles for top pairs...');
  try { await fetchOHLCV(topPairNames, '1m', MAX_CANDLES); } catch (e) { console.error('[V2] 1m bootstrap error:', e.message); }

  console.log('[V2] Fetching 5m candles for top pairs (bias filter)...');
  try { await fetchOHLCV(topPairNames, '5m', 100); } catch (e) { console.error('[V2] 5m bootstrap error:', e.message); }

  console.log('[V2] Fetching 15m candles for all pairs...');
  try { await fetchOHLCV(allPairNames, '15m', MAX_CANDLES); } catch (e) { console.error('[V2] 15m bootstrap error:', e.message); }

  console.log('[V2] Fetching 1h candles for all pairs (HTF bias)...');
  try { await fetchOHLCV(allPairNames, '1h', MAX_CANDLES); } catch (e) { console.error('[V2] 1h bootstrap error:', e.message); }

  console.log('[V2] Initial data loaded. Candle sets: ' + Object.keys(candles).length);

  connectWS();

  writeScalpResults();
  setInterval(() => {
    try { updateMarketRegime(); writeScalpResults(); }
    catch (e) { console.error('[V2] writeScalpResults loop error:', e.message); writeHeartbeatFiles(e.message); }
  }, WRITE_INTERVAL);

  writeSwingResults();
  setInterval(() => {
    try { writeSwingResults(); }
    catch (e) { console.error('[V2] writeSwingResults loop error:', e.message); writeHeartbeatFiles(e.message); }
  }, 60 * 1000);

  setInterval(async () => {
    try { await fetchOHLCV(topPairNames, '5m', 100); }
    catch (e) { console.error('[V2] 5m refresh error:', e.message); }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    try {
      await fetchOHLCV(allPairNames, '15m', MAX_CANDLES);
      await fetchOHLCV(allPairNames, '1h', MAX_CANDLES);
    } catch (e) { console.error('[V2] 15m/1h refresh error:', e.message); }
  }, 15 * 60 * 1000);

  setInterval(() => {
    const active = new Set();
    for (const p of topPairNames) { active.add(candleKey(p, '1m')); active.add(candleKey(p, '5m')); }
    for (const p of allPairNames) { active.add(candleKey(p, '15m')); active.add(candleKey(p, '1h')); }
    let cleaned = 0;
    for (const k in candles) { if (!active.has(k)) { delete candles[k]; cleaned++; } }
    if (cleaned > 0) console.log('[V2] Cleaned ' + cleaned + ' stale candle sets');
    if (global.gc) global.gc();
  }, 30 * 60 * 1000);

  // Heartbeat: update timestamp every 3s to prevent stale detection
  setInterval(() => {
    try {
      const scalpPath = OUTPUT_SCALP;
      if (fs.existsSync(scalpPath)) {
        const data = JSON.parse(fs.readFileSync(scalpPath, 'utf8'));
        data.timestamp = new Date().toISOString();
        safeWriteJsonAtomic(scalpPath, data);
      }
    } catch (e) {
      console.warn('[V2-heartbeat] Failed to update timestamp:', e.message);
    }
  }, 3000);

  console.log('=== V2 Continuation Scanner running ===');
}

main().catch(e => {
  console.error('[V2] Fatal (kept alive):', e);
  writeHeartbeatFiles(e?.message || 'fatal error');
  setInterval(() => writeHeartbeatFiles(e?.message || 'fatal error'), WRITE_INTERVAL);
});
