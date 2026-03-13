#!/usr/bin/env node
import ccxt from 'ccxt';

const SCALPING_PARAMS = {
  stochRsiPeriod: 14,
  stochRsiStochPeriod: 14,
  stochRsiKSmoothing: 3,
  stochRsiDSmoothing: 3,
  stochRsiOversoldZone: 10,
  stochRsiOverboughtZone: 90,
  stochRsiLongMaxK: 50,
  stochRsiShortMinK: 50,
  bbPeriod: 20,
  bbStdDev: 2,
  volumePeriod: 20,
  volumeThreshold: 1.2,
  atrPeriod: 14,
  atrMinimum: 0.10,
  stopLoss: 0.4,
  takeProfit: 0.8,
  trailingStop: 0.3
};

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

function calculateStochRSI(closes, rsiPeriod, stochPeriod, kSmoothing, dSmoothing) {
  const requiredLength = rsiPeriod + stochPeriod + kSmoothing + dSmoothing;
  if (closes.length < requiredLength) {
    return { k: 50, d: 50, prevK: 50 };
  }
  
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
  
  const kValues = [];
  for (let i = kSmoothing - 1; i < stochRsiValues.length; i++) {
    const slice = stochRsiValues.slice(i - kSmoothing + 1, i + 1);
    const k = slice.reduce((a, b) => a + b, 0) / kSmoothing;
    kValues.push(k);
  }
  
  if (kValues.length < dSmoothing + 1) {
    return { k: kValues[kValues.length - 1] || 50, d: 50, prevK: kValues[kValues.length - 2] || 50 };
  }
  
  const dSlice = kValues.slice(-dSmoothing);
  const d = dSlice.reduce((a, b) => a + b, 0) / dSmoothing;
  const k = kValues[kValues.length - 1];
  const prevK = kValues[kValues.length - 2];
  
  return { k, d, prevK };
}

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

async function testPair() {
  try {
    console.log('Testing BTC/USDT...');
    
    const exchange = new ccxt.bybit({
      apiKey: process.env.BYBIT_API_KEY,
      secret: process.env.BYBIT_API_SECRET,
      enableRateLimit: true,
      rateLimit: 200,
    });

    const pair = 'BTC/USDT';
    const limit = Math.max(
      SCALPING_PARAMS.stochRsiPeriod + SCALPING_PARAMS.stochRsiStochPeriod + SCALPING_PARAMS.stochRsiKSmoothing + SCALPING_PARAMS.stochRsiDSmoothing,
      SCALPING_PARAMS.bbPeriod,
      SCALPING_PARAMS.volumePeriod,
      SCALPING_PARAMS.atrPeriod
    ) + 50;
    
    console.log(`Fetching ${limit} candles...`);
    const ohlcv = await exchange.fetchOHLCV(pair, '1m', undefined, limit);
    console.log(`Got ${ohlcv.length} candles`);
    
    const closes = ohlcv.map(c => c[4]);
    const highs = ohlcv.map(c => c[2]);
    const lows = ohlcv.map(c => c[3]);
    const volumes = ohlcv.map(c => c[5]);
    const currentPrice = closes[closes.length - 1];

    console.log('Calculating indicators...');
    const stochRsi = calculateStochRSI(
      closes,
      SCALPING_PARAMS.stochRsiPeriod,
      SCALPING_PARAMS.stochRsiStochPeriod,
      SCALPING_PARAMS.stochRsiKSmoothing,
      SCALPING_PARAMS.stochRsiDSmoothing
    );
    
    console.log(`Stoch RSI: k=${stochRsi.k.toFixed(2)}, prevK=${stochRsi.prevK.toFixed(2)}`);
    
    const bb = calculateBB(closes, SCALPING_PARAMS.bbPeriod, SCALPING_PARAMS.bbStdDev);
    const atr = calculateATR(highs, lows, closes, SCALPING_PARAMS.atrPeriod);
    const atrPercent = (atr / currentPrice) * 100;
    
    console.log(`ATR: ${atrPercent.toFixed(3)}%`);
    
    const recentVolumes = volumes.slice(-SCALPING_PARAMS.volumePeriod);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / SCALPING_PARAMS.volumePeriod;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / avgVolume;

    console.log(`Volume ratio: ${volumeRatio.toFixed(2)}x`);

    const bbPosition = (currentPrice - bb.lower) / (bb.upper - bb.lower);
    console.log(`BB position: ${(bbPosition * 100).toFixed(1)}%`);

    const prevK = stochRsi.prevK;
    const k = stochRsi.k;

    // Mandatory criterion 1: Stochastic RSI crossover
    const longWindow = (prevK < SCALPING_PARAMS.stochRsiOversoldZone) && (k >= SCALPING_PARAMS.stochRsiOversoldZone && k <= SCALPING_PARAMS.stochRsiLongMaxK);
    const shortWindow = (prevK > SCALPING_PARAMS.stochRsiOverboughtZone) && (k <= SCALPING_PARAMS.stochRsiOverboughtZone && k >= SCALPING_PARAMS.stochRsiShortMinK);

    console.log(`Long window: ${longWindow} (prevK<10: ${prevK < 10}, k 10-50: ${k >= 10 && k <= 50})`);
    console.log(`Short window: ${shortWindow} (prevK>90: ${prevK > 90}, k 50-90: ${k <= 90 && k >= 50})`);

    // Mandatory criterion 2: ATR filter
    const validATR = atrPercent > SCALPING_PARAMS.atrMinimum;
    console.log(`Valid ATR: ${validATR}`);

    // Bonus criteria
    const hasVolumeSpike = volumeRatio > SCALPING_PARAMS.volumeThreshold;
    console.log(`Volume spike: ${hasVolumeSpike}`);

    let signal = 'NEUTRAL';
    let confidence = 0;
    let criteriaDetails = {
      stochRsiCrossover: false,
      atr: validATR,
      volume: hasVolumeSpike,
      bbPosition: false
    };

    if (longWindow && validATR) {
      signal = 'LONG';
      confidence = 70;
      criteriaDetails.stochRsiCrossover = true;

      if (hasVolumeSpike) confidence += 10;

      if (bbPosition < 0.25) {
        confidence += 10;
        criteriaDetails.bbPosition = true;
      }

      confidence = Math.min(95, confidence);

      const criteriaMet = 2 + (hasVolumeSpike ? 1 : 0) + (criteriaDetails.bbPosition ? 1 : 0);
      const parts = [`Stoch RSI ${prevK.toFixed(0)}→${k.toFixed(0)}`, `ATR ${atrPercent.toFixed(2)}%`];
      if (hasVolumeSpike) parts.push(`Volume ${volumeRatio.toFixed(1)}x`);
      if (criteriaDetails.bbPosition) parts.push('BB lower');
      const reason = `${parts.join(' + ')} (${criteriaMet}/4 criteria)`;
      
      console.log(`\nSIGNAL: ${signal}`);
      console.log(`Confidence: ${confidence}`);
      console.log(`Reason: ${reason}`);
      console.log(`Criteria met: ${criteriaMet}/4`);
      console.log(JSON.stringify(criteriaDetails, null, 2));
    }

    if (shortWindow && validATR) {
      signal = 'SHORT';
      confidence = 70;
      criteriaDetails.stochRsiCrossover = true;

      if (hasVolumeSpike) confidence += 10;

      if (bbPosition > 0.75) {
        confidence += 10;
        criteriaDetails.bbPosition = true;
      }

      confidence = Math.min(95, confidence);

      const criteriaMet = 2 + (hasVolumeSpike ? 1 : 0) + (criteriaDetails.bbPosition ? 1 : 0);
      const parts = [`Stoch RSI ${prevK.toFixed(0)}→${k.toFixed(0)}`, `ATR ${atrPercent.toFixed(2)}%`];
      if (hasVolumeSpike) parts.push(`Volume ${volumeRatio.toFixed(1)}x`);
      if (criteriaDetails.bbPosition) parts.push('BB upper');
      const reason = `${parts.join(' + ')} (${criteriaMet}/4 criteria)`;
      
      console.log(`\nSIGNAL: ${signal}`);
      console.log(`Confidence: ${confidence}`);
      console.log(`Reason: ${reason}`);
      console.log(`Criteria met: ${criteriaMet}/4`);
      console.log(JSON.stringify(criteriaDetails, null, 2));
    }

    if (signal === 'NEUTRAL') {
      console.log(`\nSIGNAL: NEUTRAL`);
      console.log(`No crossover detected`);
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  }
}

testPair();
