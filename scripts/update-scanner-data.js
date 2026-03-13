#!/usr/bin/env node
/**
 * Update scanner data from Bybit
 * Runs independently from Next.js to avoid ccxt/protobuf compatibility issues
 * 
 * Scalping Scanner: 2-Criteria System
 * MANDATORY (both must match):
 *   1. Stochastic RSI crossover (LONG: prevK<10, k 10-50 | SHORT: prevK>90, k 50-90)
 *   2. ATR filter: atrPercent > 0.10
 * BONUS (+10 confidence each):
 *   3. Volume spike: volumeRatio > 1.2
 *   4. BB position: < 0.25 (LONG) or > 0.75 (SHORT)
 */

import ccxt from 'ccxt';
import { writeFileSync, renameSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fetch top 250 coins by market cap from Bybit
async function getTop250Pairs(exchange) {
  try {
    console.log('  Fetching markets...');
    const markets = await exchange.loadMarkets();
    
    console.log(`  Total markets: ${Object.keys(markets).length}`);
    
    const usdtPairs = Object.values(markets).filter(m => 
      m.quote === 'USDT' && 
      m.type === 'spot' && 
      m.active
    );
    
    console.log(`  USDT spot pairs: ${usdtPairs.length}`);
    
    // Get tickers for volume data
    console.log('  Fetching tickers...');
    const tickers = await exchange.fetchTickers();
    
    console.log(`  Tickers received: ${Object.keys(tickers).length}`);
    
    // Sort by 24h volume with minimum $100K filter
    const MIN_VOLUME = 100000; // $100K minimum 24h volume
    
    const pairsWithVolume = usdtPairs
      .map(m => {
        // CRITICAL FIX: Bybit spot markets use futures ticker keys with :USDT suffix
        const ticker = tickers[`${m.symbol}:USDT`] || tickers[m.symbol];
        if (!ticker) {
          return { symbol: m.symbol, volume: 0 };
        }
        
        // Parse volume - quoteVolume is the USDT volume
        const volume = ticker.quoteVolume || parseFloat(ticker.info?.turnover24h) || 0;
        
        return {
          symbol: m.symbol,
          volume: volume
        };
      })
      .filter(p => p.volume >= MIN_VOLUME)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 250);
    
    const sorted = pairsWithVolume.map(p => p.symbol);
    
    console.log(`âœ“ Found ${sorted.length} top volume pairs (min \$${MIN_VOLUME.toLocaleString()}/24h)`);
    
    // Extra debug: show top 5 volumes
    if (sorted.length > 0) {
      const top5Debug = pairsWithVolume.slice(0, Math.min(5, pairsWithVolume.length)).map(p => {
        return `${p.symbol.replace('/USDT', '')}: \$${(p.volume / 1000000).toFixed(1)}M`;
      });
      console.log(`  Top 5: ${top5Debug.join(', ')}`);
    }
    
    return sorted.length > 0 ? sorted : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
  } catch (error) {
    console.error('Error fetching top pairs:', error.message);
    // Fallback to major pairs
    return ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT', 'LINK/USDT'];
  }
}

// Scalping parameters - 2-Criteria System
const SCALPING_PARAMS = {
  stochRsiPeriod: 14,
  stochRsiStochPeriod: 14,
  stochRsiKSmoothing: 3,
  stochRsiDSmoothing: 3,
  // Stoch RSI crossover thresholds (mandatory criterion 1)
  stochRsiOversoldZone: 20,     // prevK must be below this for LONG
  stochRsiOverboughtZone: 80,   // prevK must be above this for SHORT
  stochRsiLongMaxK: 45,         // k must be <= this for LONG
  stochRsiShortMinK: 55,        // k must be >= this for SHORT
  bbPeriod: 20,
  bbStdDev: 2,
  volumePeriod: 20,
  volumeThreshold: 1.2,         // Bonus: volume spike threshold
  atrPeriod: 14,
  atrMinimum: 0.08,            // Mandatory criterion 2: ATR filter
  stopLoss: 0.8,
  takeProfit: 1.5,
  trailingStop: 0.5
};

const SWING_PARAMS = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  volumePeriod: 20,
  stopLossPercent: 2.5,
  tp1Percent: 4,
  tp2Percent: 8,
  trailingPercent: 2.0
};

// Calculate RSI
function calculateRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate Stochastic RSI
function calculateStochRSI(closes, rsiPeriod, stochPeriod, kSmoothing, dSmoothing) {
  // Need enough data for RSI calculation over stochPeriod
  const requiredLength = rsiPeriod + stochPeriod + kSmoothing + dSmoothing;
  if (closes.length < requiredLength) {
    return { k: 50, d: 50, prevK: 50 };
  }
  
  // Calculate RSI values for the last stochPeriod + kSmoothing candles
  const rsiValues = [];
  const lookback = stochPeriod + kSmoothing + dSmoothing;
  
  for (let i = closes.length - lookback; i < closes.length; i++) {
    const slice = closes.slice(Math.max(0, i - rsiPeriod - 1), i + 1);
    if (slice.length >= rsiPeriod + 1) {
      rsiValues.push(calculateRSI(slice, rsiPeriod));
    }
  }
  
  if (rsiValues.length < stochPeriod) {
    return { k: 50, d: 50, prevK: 50 };
  }
  
  // Calculate Stochastic of RSI values
  const stochRsiValues = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const maxRsi = Math.max(...slice);
    const minRsi = Math.min(...slice);
    
    if (maxRsi === minRsi) {
      stochRsiValues.push(50);
    } else {
      const currentRsi = rsiValues[i];
      const stochRsi = ((currentRsi - minRsi) / (maxRsi - minRsi)) * 100;
      stochRsiValues.push(stochRsi);
    }
  }
  
  if (stochRsiValues.length < kSmoothing) {
    return { k: 50, d: 50, prevK: 50 };
  }
  
  // Calculate %K (SMA of Stoch RSI)
  const kValues = [];
  for (let i = kSmoothing - 1; i < stochRsiValues.length; i++) {
    const slice = stochRsiValues.slice(i - kSmoothing + 1, i + 1);
    const k = slice.reduce((a, b) => a + b, 0) / kSmoothing;
    kValues.push(k);
  }
  
  if (kValues.length < dSmoothing + 1) {
    return { k: kValues[kValues.length - 1] || 50, d: 50, prevK: kValues[kValues.length - 2] || 50 };
  }
  
  // Calculate %D (SMA of %K)
  const dSlice = kValues.slice(-dSmoothing);
  const d = dSlice.reduce((a, b) => a + b, 0) / dSmoothing;
  const k = kValues[kValues.length - 1];
  const prevK = kValues[kValues.length - 2];
  
  return { k, d, prevK };
}

// Calculate Bollinger Bands
function calculateBB(closes, period, stdDev) {
  if (closes.length < period) {
    const mid = closes[closes.length - 1];
    return { upper: mid, middle: mid, lower: mid };
  }
  
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  
  const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDeviation = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDeviation * stdDev),
    middle: sma,
    lower: sma - (stdDeviation * stdDev)
  };
}

// Calculate ATR
function calculateATR(highs, lows, closes, period) {
  if (highs.length < period + 1) return 0;
  
  const trueRanges = [];
  for (let i = highs.length - period; i < highs.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}

// Calculate EMA
function calculateEMA(closes, period) {
  if (closes.length < period) return closes[closes.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate MACD
function calculateMACD(closes, fast, slow, signal) {
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const macdLine = emaFast - emaSlow;
  
  const macdValues = closes.slice(-signal).map((_, i) => {
    const slice = closes.slice(0, closes.length - signal + i + 1);
    const f = calculateEMA(slice, fast);
    const s = calculateEMA(slice, slow);
    return f - s;
  });
  
  const signalLine = macdValues.reduce((a, b) => a + b, 0) / macdValues.length;
  const histogram = macdLine - signalLine;
  
  return { macdLine, signalLine, histogram };
}

async function updateScalpingData(exchange, pairs) {
  const signals = await Promise.all(pairs.map(async (pair) => {
    try {
      const limit = Math.max(
        SCALPING_PARAMS.stochRsiPeriod + SCALPING_PARAMS.stochRsiStochPeriod + SCALPING_PARAMS.stochRsiKSmoothing + SCALPING_PARAMS.stochRsiDSmoothing,
        SCALPING_PARAMS.bbPeriod,
        SCALPING_PARAMS.volumePeriod,
        SCALPING_PARAMS.atrPeriod
      ) + 50;
      const ohlcv = await exchange.fetchOHLCV(pair, '1m', undefined, limit);
      
      if (!ohlcv || ohlcv.length < 30) {
        return {
          pair,
          signal: 'NEUTRAL',
          symbol: pair,
          direction: 'NEUTRAL',
          confidence: 0,
          reason: 'Insufficient data',
          criteriaMet: 0,
          criteriaTotal: 4,
          criteriaDetails: {
            stochRsiCrossover: false,
            atr: false,
            volume: false,
            bbPosition: false
          },
          indicators: {}
        };
      }

      const closes = ohlcv.map(c => c[4]);
      const highs = ohlcv.map(c => c[2]);
      const lows = ohlcv.map(c => c[3]);
      const volumes = ohlcv.map(c => c[5]);
      const currentPrice = closes[closes.length - 1];

      // Calculate indicators
      const stochRsi = calculateStochRSI(
        closes,
        SCALPING_PARAMS.stochRsiPeriod,
        SCALPING_PARAMS.stochRsiStochPeriod,
        SCALPING_PARAMS.stochRsiKSmoothing,
        SCALPING_PARAMS.stochRsiDSmoothing
      );
      
      const bb = calculateBB(closes, SCALPING_PARAMS.bbPeriod, SCALPING_PARAMS.bbStdDev);
      const atr = calculateATR(highs, lows, closes, SCALPING_PARAMS.atrPeriod);
      const atrPercent = (atr / currentPrice) * 100;
      
      const recentVolumes = volumes.slice(-SCALPING_PARAMS.volumePeriod);
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / SCALPING_PARAMS.volumePeriod;
      const currentVolume = volumes[volumes.length - 1];
      const volumeRatio = currentVolume / avgVolume;

      const bbPosition = (currentPrice - bb.lower) / (bb.upper - bb.lower);

      const prevK = stochRsi.prevK;
      const k = stochRsi.k;

      // === 2-CRITERIA SYSTEM ===
      
      // Mandatory criterion 1: Stochastic RSI crossover
      const longWindow = (prevK < SCALPING_PARAMS.stochRsiOversoldZone) && (k > prevK) && (k <= SCALPING_PARAMS.stochRsiLongMaxK);
      const shortWindow = (prevK > SCALPING_PARAMS.stochRsiOverboughtZone) && (k <= SCALPING_PARAMS.stochRsiOverboughtZone && k >= SCALPING_PARAMS.stochRsiShortMinK);

      // Mandatory criterion 2: ATR filter
      const validATR = atrPercent > SCALPING_PARAMS.atrMinimum;

      // Bonus criteria
      const hasVolumeSpike = volumeRatio > SCALPING_PARAMS.volumeThreshold;

      let signal = 'NEUTRAL';
      let confidence = 0;
      let reason = '';
      let criteriaDetails = {
        stochRsiCrossover: false,
        atr: validATR,
        volume: hasVolumeSpike,
        bbPosition: false
      };

      // LONG signal: both mandatory criteria must match
      if (longWindow) {
        signal = 'LONG';
        confidence = 60;
        if (validATR) confidence += 10;
        criteriaDetails.stochRsiCrossover = true;

        // Bonus: volume spike
        if (hasVolumeSpike) confidence += 10;

        // Bonus: BB position (lower band area for LONG)
        if (bbPosition < 0.25) {
          confidence += 10;
          criteriaDetails.bbPosition = true;
        }

        confidence = Math.min(95, confidence);

        // Build reason string
        const criteriaMet = 2 + (hasVolumeSpike ? 1 : 0) + (criteriaDetails.bbPosition ? 1 : 0);
        const parts = [`Stoch RSI ${prevK.toFixed(0)}â†’${k.toFixed(0)}`, `ATR ${atrPercent.toFixed(2)}%`];
        if (hasVolumeSpike) parts.push(`Volume ${volumeRatio.toFixed(1)}x`);
        if (criteriaDetails.bbPosition) parts.push('BB lower');
        reason = `${parts.join(' + ')} (${criteriaMet}/4 criteria)`;
      }

      // SHORT signal: both mandatory criteria must match
      if (shortWindow) {
        signal = 'SHORT';
        confidence = 60;
        if (validATR) confidence += 10;
        criteriaDetails.stochRsiCrossover = true;

        // Bonus: volume spike
        if (hasVolumeSpike) confidence += 10;

        // Bonus: BB position (upper band area for SHORT)
        if (bbPosition > 0.75) {
          confidence += 10;
          criteriaDetails.bbPosition = true;
        }

        confidence = Math.min(95, confidence);

        // Build reason string
        const criteriaMet = 2 + (hasVolumeSpike ? 1 : 0) + (criteriaDetails.bbPosition ? 1 : 0);
        const parts = [`Stoch RSI ${prevK.toFixed(0)}â†’${k.toFixed(0)}`, `ATR ${atrPercent.toFixed(2)}%`];
        if (hasVolumeSpike) parts.push(`Volume ${volumeRatio.toFixed(1)}x`);
        if (criteriaDetails.bbPosition) parts.push('BB upper');
        reason = `${parts.join(' + ')} (${criteriaMet}/4 criteria)`;
      }

      // NEUTRAL reasons
      if (signal === 'NEUTRAL') {
        if (!validATR) {
          reason = `Low volatility (ATR ${atrPercent.toFixed(2)}% < ${SCALPING_PARAMS.atrMinimum}%)`;
        } else if (prevK < SCALPING_PARAMS.stochRsiOversoldZone && k < SCALPING_PARAMS.stochRsiOversoldZone) {
          reason = `Stoch RSI deep oversold (${k.toFixed(1)}), waiting for cross-up above ${SCALPING_PARAMS.stochRsiOversoldZone}`;
          confidence = 30;
        } else if (prevK > SCALPING_PARAMS.stochRsiOverboughtZone && k > SCALPING_PARAMS.stochRsiOverboughtZone) {
          reason = `Stoch RSI deep overbought (${k.toFixed(1)}), waiting for cross-down below ${SCALPING_PARAMS.stochRsiOverboughtZone}`;
          confidence = 30;
        } else {
          reason = `No crossover (Stoch RSI ${k.toFixed(1)}, prevK ${prevK.toFixed(1)})`;
        }
      }

      const criteriaMet = Object.values(criteriaDetails).filter(Boolean).length;

      return {
        pair,
        signal: signal,
        symbol: pair,
        direction: signal,
        confidence: Math.round(confidence),
        reason,
        criteriaMet,
        criteriaTotal: 4,
        criteriaDetails,
        indicators: {
          stochRsiK: parseFloat(k.toFixed(2)),
          stochRsiD: parseFloat(stochRsi.d.toFixed(2)),
          stochRsiPrevK: parseFloat(prevK.toFixed(2)),
          bbPosition: parseFloat((bbPosition * 100).toFixed(1)),
          bbUpper: parseFloat(bb.upper.toFixed(2)),
          bbMiddle: parseFloat(bb.middle.toFixed(2)),
          bbLower: parseFloat(bb.lower.toFixed(2)),
          volumeRatio: parseFloat(volumeRatio.toFixed(2)),
          atr: parseFloat(atr.toFixed(2)),
          atrPercent: parseFloat(atrPercent.toFixed(3)),
          price: parseFloat(currentPrice.toFixed(2))
        },
        exitRules: {
          stopLoss: `${SCALPING_PARAMS.stopLoss}%`,
          takeProfit: `${SCALPING_PARAMS.takeProfit}%`,
          trailingStop: `${SCALPING_PARAMS.trailingStop}% after +${(SCALPING_PARAMS.takeProfit * 0.75).toFixed(1)}%`
        }
      };

    } catch (error) {
      console.error(`Error fetching scalping ${pair}:`, error.message);
      return {
          pair,
          signal: 'NEUTRAL',
          symbol: pair,
          direction: 'NEUTRAL',
        confidence: 0,
        reason: 'API error',
        criteriaMet: 0,
        criteriaTotal: 4,
        criteriaDetails: {
          stochRsiCrossover: false,
          atr: false,
          volume: false,
          bbPosition: false
        },
        indicators: {}
      };
    }
  }));

  return {
    success: true,
    timestamp: new Date().toISOString(),
    params: SCALPING_PARAMS,
    signals
  };
}

async function updateSwingData(exchange, pairs) {
  const signals = await Promise.all(pairs.map(async (pair) => {
    try {
      const limit = Math.max(SWING_PARAMS.ema200, SWING_PARAMS.macdSlow) + 50;
      const ohlcv = await exchange.fetchOHLCV(pair, '15m', undefined, limit);
      
      if (!ohlcv || ohlcv.length < SWING_PARAMS.ema200) {
        return {
          pair,
          signal: 'NEUTRAL',
          symbol: pair,
          direction: 'NEUTRAL',
          confidence: 0,
          reason: 'Insufficient data',
          trend: 'RANGING',
          indicators: {}
        };
      }

      const closes = ohlcv.map(c => c[4]);
      const volumes = ohlcv.map(c => c[5]);
      const currentPrice = closes[closes.length - 1];

      const ema20 = calculateEMA(closes, SWING_PARAMS.ema20);
      const ema50 = calculateEMA(closes, SWING_PARAMS.ema50);
      const ema200 = calculateEMA(closes, SWING_PARAMS.ema200);
      const rsi = calculateRSI(closes, SWING_PARAMS.rsiPeriod);
      const macd = calculateMACD(closes, SWING_PARAMS.macdFast, SWING_PARAMS.macdSlow, SWING_PARAMS.macdSignal);
      
      const recentVolumes = volumes.slice(-SWING_PARAMS.volumePeriod);
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / SWING_PARAMS.volumePeriod;
      const currentVolume = volumes[volumes.length - 1];
      const volumeRatio = currentVolume / avgVolume;

      let trend = 'RANGING';
      const emaAlignedBullish = ema20 > ema50 && ema50 > ema200;
      const emaAlignedBearish = ema20 < ema50 && ema50 < ema200;
      
      if (emaAlignedBullish) trend = 'BULLISH';
      else if (emaAlignedBearish) trend = 'BEARISH';

      let signal = 'NEUTRAL';
      let confidence = 0;
      let reason = '';

      const distToEma20 = ((currentPrice - ema20) / currentPrice) * 100;
      const distToEma50 = ((currentPrice - ema50) / currentPrice) * 100;

      if (trend === 'BULLISH') {
        const nearEma20 = Math.abs(distToEma20) < 1.5;
        const rsiHealthy = rsi >= 35 && rsi <= 65;
        const macdPositive = macd.histogram > 0;
        const macdRising = macd.macdLine > macd.signalLine;
        
        if (nearEma20 && rsiHealthy && macdPositive && macdRising) {
          signal = 'LONG';
          confidence = Math.min(90, 70 + (volumeRatio > 1.2 ? 10 : 0) + (macd.histogram > 0 ? 10 : 0));
          reason = `Uptrend pullback to EMA20, RSI ${rsi.toFixed(0)}, MACD+`;
        } else if (nearEma20 || (rsiHealthy && macdRising)) {
          confidence = 40;
          reason = `Uptrend, watching for pullback entry (RSI ${rsi.toFixed(0)})`;
        }
      }

      if (trend === 'BEARISH') {
        const nearEma20 = Math.abs(distToEma20) < 1.5;
        const rsiHealthy = rsi >= 35 && rsi <= 65;
        const macdNegative = macd.histogram < 0;
        const macdFalling = macd.macdLine < macd.signalLine;
        
        if (nearEma20 && rsiHealthy && macdNegative && macdFalling) {
          signal = 'SHORT';
          confidence = Math.min(90, 70 + (volumeRatio > 1.2 ? 10 : 0) + (macd.histogram < 0 ? 10 : 0));
          reason = `Downtrend rally to EMA20, RSI ${rsi.toFixed(0)}, MACD-`;
        } else if (nearEma20 || (rsiHealthy && macdFalling)) {
          confidence = 40;
          reason = `Downtrend, watching for rally entry (RSI ${rsi.toFixed(0)})`;
        }
      }

      if (trend === 'RANGING') {
        reason = `No clear trend (EMA20 ${ema20.toFixed(0)}, EMA50 ${ema50.toFixed(0)}, EMA200 ${ema200.toFixed(0)})`;
        confidence = 0;
      }

      const stopLossLong = ema50 * (1 - SWING_PARAMS.stopLossPercent / 100);
      const stopLossShort = ema50 * (1 + SWING_PARAMS.stopLossPercent / 100);
      const tp1Long = currentPrice * (1 + SWING_PARAMS.tp1Percent / 100);
      const tp2Long = currentPrice * (1 + SWING_PARAMS.tp2Percent / 100);
      const tp1Short = currentPrice * (1 - SWING_PARAMS.tp1Percent / 100);
      const tp2Short = currentPrice * (1 - SWING_PARAMS.tp2Percent / 100);

      return {
        pair,
        signal: signal,
        symbol: pair,
        direction: signal,
        confidence: Math.round(confidence),
        reason,
        trend,
        indicators: {
          ema20: parseFloat(ema20.toFixed(2)),
          ema50: parseFloat(ema50.toFixed(2)),
          ema200: parseFloat(ema200.toFixed(2)),
          rsi: parseFloat(rsi.toFixed(2)),
          macdLine: parseFloat(macd.macdLine.toFixed(4)),
          macdSignal: parseFloat(macd.signalLine.toFixed(4)),
          macdHistogram: parseFloat(macd.histogram.toFixed(4)),
          volumeRatio: parseFloat(volumeRatio.toFixed(2)),
          price: parseFloat(currentPrice.toFixed(2)),
          distToEma20: parseFloat(distToEma20.toFixed(2)),
          distToEma50: parseFloat(distToEma50.toFixed(2))
        },
        zones: {
          entryZone: signal === 'LONG' ? `${(ema20 * 0.995).toFixed(2)} - ${(ema20 * 1.005).toFixed(2)}` :
                     signal === 'SHORT' ? `${(ema20 * 0.995).toFixed(2)} - ${(ema20 * 1.005).toFixed(2)}` : '-',
          stopLoss: signal === 'LONG' ? stopLossLong.toFixed(2) :
                    signal === 'SHORT' ? stopLossShort.toFixed(2) : '-',
          tp1: signal === 'LONG' ? tp1Long.toFixed(2) :
               signal === 'SHORT' ? tp1Short.toFixed(2) : '-',
          tp2: signal === 'LONG' ? tp2Long.toFixed(2) :
               signal === 'SHORT' ? tp2Short.toFixed(2) : '-'
        },
        positionManagement: {
          initial: '100%',
          atTP1: `Take 50% (${SWING_PARAMS.tp1Percent}%)`,
          atTP2: `Take 25% (${SWING_PARAMS.tp2Percent}%)`,
          trailing: `Rest with ${SWING_PARAMS.trailingPercent}% trail`
        }
      };

    } catch (error) {
      console.error(`Error fetching swing ${pair}:`, error.message);
      return {
          pair,
          signal: 'NEUTRAL',
          symbol: pair,
          direction: 'NEUTRAL',
        confidence: 0,
        reason: 'API error',
        trend: 'RANGING',
        indicators: {}
      };
    }
  }));

  return {
    success: true,
    timestamp: new Date().toISOString(),
    params: SWING_PARAMS,
    signals
  };
}

async function main() {
  try {
    console.log('ðŸ“Š Updating scanner data from Bybit...');
    
    const exchange = new ccxt.bybit({
      apiKey: process.env.BYBIT_API_KEY,
      secret: process.env.BYBIT_API_SECRET,
      enableRateLimit: true,
      rateLimit: 200, // 200ms between requests (5 req/s max)
      options: {
        adjustForTimeDifference: true,
        recvWindow: 15000,
      },
    });

    // Fix Bybit timestamp drift issues (retCode 10002)
    await exchange.loadTimeDifference();

    console.log('ðŸ” Fetching top 250 tradable pairs...');
    const pairs = await getTop250Pairs(exchange);
    console.log(`âœ“ Scanning ${pairs.length} pairs`);

    // Process in batches to avoid overwhelming the system
    const BATCH_SIZE = 50;
    const scalpingSignals = [];
    const swingSignals = [];

    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pairs.length / BATCH_SIZE)}...`);
      
      const [scalpBatch, swingBatch] = await Promise.all([
        updateScalpingData(exchange, batch),
        updateSwingData(exchange, batch)
      ]);
      
      scalpingSignals.push(...scalpBatch.signals);
      swingSignals.push(...swingBatch.signals);
      
      // Small delay between batches
      if (i + BATCH_SIZE < pairs.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const timestamp = new Date().toISOString();

    // Keep a broad live price map so open positions keep getting price updates
    // even when a symbol is currently NEUTRAL.
    const scalpingPrices = Object.fromEntries(
      scalpingSignals
        .filter(s => Number.isFinite(s?.indicators?.price) && s.indicators.price > 0)
        .map(s => [s.symbol, s.indicators.price])
    );

    const swingPrices = Object.fromEntries(
      swingSignals
        .filter(s => Number.isFinite(s?.indicators?.price) && s.indicators.price > 0)
        .map(s => [s.symbol, s.indicators.price])
    );

    const scalpingData = {
      success: true,
      timestamp,
      scannedPairs: pairs.length,
      params: SCALPING_PARAMS,
      prices: scalpingPrices,
      signals: scalpingSignals
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 250)
    };

    const swingData = {
      success: true,
      timestamp,
      scannedPairs: pairs.length,
      params: SWING_PARAMS,
      prices: swingPrices,
      signals: swingSignals
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 250)
    };

    const publicDir = join(__dirname, '..', 'public');
    const scalpingPath = join(publicDir, 'scalping-scanner-data.json');
    const swingPath = join(publicDir, 'swing-scanner-data.json');

    // Atomic write: write temp then rename to reduce risk of partial/corrupt reads.
    const scalpingTmp = `${scalpingPath}.tmp`;
    const swingTmp = `${swingPath}.tmp`;

    writeFileSync(scalpingTmp, JSON.stringify(scalpingData, null, 2));
    writeFileSync(swingTmp, JSON.stringify(swingData, null, 2));

    renameSync(scalpingTmp, scalpingPath);
    renameSync(swingTmp, swingPath);

    console.log('âœ… Scanner data updated successfully');
    console.log(`   Scalping: ${scalpingData.signals.filter(s => s.direction !== 'NEUTRAL').length}/${scalpingData.signals.length} signals (from ${pairs.length} pairs scanned)`);
    console.log(`   Swing: ${swingData.signals.filter(s => s.direction !== 'NEUTRAL').length}/${swingData.signals.length} signals (from ${pairs.length} pairs scanned)`);

  } catch (error) {
    console.error('âŒ Error updating scanner data:', error);
    process.exit(1);
  }
}

main();




