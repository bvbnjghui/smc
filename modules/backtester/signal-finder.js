// smc/modules/backtester/signal-finder.js

/**
 * @file 根據不同策略尋找交易信號。
 */

import { findNearestPOI } from '../smc-analyzer.js';

function isInsideHtfPoi(candle, direction, htfAnalyses) {
    if (!htfAnalyses) return false;
    const htfPois = [ ...htfAnalyses.orderBlocks, ...htfAnalyses.fvgs, ...htfAnalyses.breakerBlocks ];
    for (const poi of htfPois) {
        if (direction === 'LONG' && candle.low <= poi.top && candle.high >= poi.bottom) return true;
        if (direction === 'SHORT' && candle.high >= poi.bottom && candle.low <= poi.top) return true;
    }
    return false;
}

function calculateConfluenceScore(candle, poi, currentIndex, analyses, htfAnalyses, settings) {
    let score = 0;
    let scoreDetails = []; 
    const { obWeight, breakerWeight, mtaWeight, emaWeight, liquidityGrabWeight, inducementWeight, recentLiquidityGrabLookback } = settings;
    const { liquidityGrabs, ema, candles, swingPoints } = analyses;
    const { swingHighs, swingLows } = swingPoints;
    const direction = poi.type === 'bullish' ? 'LONG' : 'SHORT';

    if (poi.poiType === 'OB') { score += obWeight; scoreDetails.push(`OB(${obWeight})`); }
    if (poi.poiType === 'Breaker') { score += breakerWeight; scoreDetails.push(`Breaker(${breakerWeight})`); }
    if (settings.enableMTA && isInsideHtfPoi(candle, direction, htfAnalyses)) { score += mtaWeight; scoreDetails.push(`MTA(${mtaWeight})`); }
    if (settings.enableTrendFilter && ema[currentIndex]?.value) {
        if ((direction === 'LONG' && candle.close > ema[currentIndex].value) || (direction === 'SHORT' && candle.close < ema[currentIndex].value)) {
            score += emaWeight; scoreDetails.push(`EMA(${emaWeight})`);
        }
    }

    const lookbackStartIndex = Math.max(0, currentIndex - recentLiquidityGrabLookback);
    let inducementFound = false;
    if (direction === 'LONG') {
        const potentialInducementPoints = swingLows.filter(sl => sl.index > lookbackStartIndex && sl.index < currentIndex && sl.price > poi.top);
        if (potentialInducementPoints.length > 0) {
            const inducementPoint = potentialInducementPoints[potentialInducementPoints.length - 1];
            if (candle.low < inducementPoint.price) {
                score += inducementWeight; scoreDetails.push(`Inducement(${inducementWeight})`); inducementFound = true;
            }
        }
    } else {
        const potentialInducementPoints = swingHighs.filter(sh => sh.index > lookbackStartIndex && sh.index < currentIndex && sh.price < poi.bottom);
        if (potentialInducementPoints.length > 0) {
            const inducementPoint = potentialInducementPoints[potentialInducementPoints.length - 1];
            if (candle.high > inducementPoint.price) {
                score += inducementWeight; scoreDetails.push(`Inducement(${inducementWeight})`); inducementFound = true;
            }
        }
    }

    if (!inducementFound) {
        for (let j = currentIndex; j >= lookbackStartIndex; j--) {
            if (!candles[j]) continue;
            const grabsAtTime = liquidityGrabs[candles[j].time];
            if (grabsAtTime && grabsAtTime.some(g => (direction === 'LONG' && g.text === 'SSL') || (direction === 'SHORT' && g.text === 'BSL'))) {
                score += liquidityGrabWeight; scoreDetails.push(`LiqGrab(${liquidityGrabWeight})`); break;
            }
        }
    }
    
    if (score > 0) {
        console.log(`%c[Score Calculation] Time: ${new Date(candle.time * 1000).toLocaleString()}, POI Type: ${poi.poiType}, Score: ${score} (${scoreDetails.join(' + ')})`, 'color: #2dd4bf');
    }
    return score;
}

function findConfirmationSignal(candle, currentIndex, settings, analyses, htfAnalyses) {
    const { htfBias, enableTrendFilter, enableMTA } = settings;
    const { chochEvents, orderBlocks, fvgs, breakerBlocks, ema, liquidityGrabs, candles } = analyses;

    const confirmationSignal = chochEvents.find(c => c.marker.time === candle.time);
    if (confirmationSignal) {
        const direction = confirmationSignal.marker.position === 'belowBar' ? 'LONG' : 'SHORT';
        if ((htfBias === 'long_only' && direction === 'SHORT') || (htfBias === 'short_only' && direction === 'LONG')) return null;
        if (enableTrendFilter && ema[currentIndex]?.value && ((direction === 'LONG' && candle.close < ema[currentIndex].value) || (direction === 'SHORT' && candle.close > ema[currentIndex].value))) return null;
        if (enableMTA && !isInsideHtfPoi(candle, direction, htfAnalyses)) return null;

        const poi = findNearestPOI(currentIndex, direction === 'LONG' ? 'bullish' : 'bearish', orderBlocks, fvgs, breakerBlocks);
        if (poi) {
            const grabCandleTime = Object.keys(liquidityGrabs).reverse().find(time => Number(time) < candle.time && liquidityGrabs[time].some(g => (direction === 'LONG' ? g.text === 'SSL' : g.text === 'BSL')));
            if (grabCandleTime) {
                const grabCandle = candles.find(c => c.time === Number(grabCandleTime));
                if (grabCandle) {
                    return { state: 'WAITING_FOR_ENTRY', type: direction === 'LONG' ? 'SSL_then_CHoCH' : 'BSL_then_CHoCH', direction, poi, protectionPoint: direction === 'LONG' ? grabCandle.low : grabCandle.high, creationIndex: currentIndex };
                }
            }
        }
    }
    return null;
}

function findRiskEntrySignal(candle, currentIndex, settings, analyses, htfAnalyses, poisForReaction) {
    const { htfBias, entryScoreThreshold, rrRatio, rrRatioTP2, enableATR, atrMultiplier } = settings;
    const { atr, candles } = analyses;

    for (const poi of poisForReaction) {
        if (poi.touched || poi.index >= currentIndex) continue;
        const direction = poi.type === 'bullish' ? 'LONG' : 'SHORT';
        if ((htfBias === 'long_only' && direction === 'SHORT') || (htfBias === 'short_only' && direction === 'LONG')) continue;
        
        const isTouched = (direction === 'LONG' && candle.low <= poi.top) || (direction === 'SHORT' && candle.high >= poi.bottom);
        if (isTouched) {
            const score = calculateConfluenceScore(candle, poi, currentIndex, { ...analyses, candles }, htfAnalyses, settings);
            if (score >= entryScoreThreshold) {
                poi.touched = true;

                const entryPrice = direction === 'LONG' ? poi.top : poi.bottom;
                let stopLoss;
                if (enableATR && atr[currentIndex] && atr[currentIndex].value) {
                    stopLoss = direction === 'LONG' ? entryPrice - (atr[currentIndex].value * atrMultiplier) : entryPrice + (atr[currentIndex].value * atrMultiplier);
                } else {
                    stopLoss = direction === 'LONG' ? poi.bottom : poi.top;
                }

                const riskPerUnit = Math.abs(entryPrice - stopLoss);
                if (riskPerUnit > 0) {
                    const stoppedOnSameBar = (direction === 'LONG' && candle.low <= stopLoss) || (direction === 'SHORT' && candle.high >= stopLoss);
                    const tradeData = { direction, entryTime: candle.time, entryPrice, stopLoss, takeProfit1: entryPrice + (stopLoss - entryPrice) * -rrRatio, takeProfit2: entryPrice + (stopLoss - entryPrice) * -rrRatioTP2, tp1Hit: false, setupType: `POI_Reaction_${poi.poiType}_Score${score}` };
                    
                    return stoppedOnSameBar ? { immediateClose: { ...tradeData, exitPrice: stopLoss, exitTime: candle.time, exitReason: 'StopLoss (Same Bar)' } } : { newTrade: tradeData };
                }
            }
        }
    }
    return null;
}

export function findSignal(candle, currentIndex, settings, analyses, htfAnalyses, poisForReaction) {
    const { entryStrategy, enableKillzoneFilter, useLondonKillzone, useNewYorkKillzone } = settings;

    if (enableKillzoneFilter) {
        const candleDate = new Date(candle.time * 1000);
        const hourUTC = candleDate.getUTCHours();
        if (!((useLondonKillzone && hourUTC >= 7 && hourUTC < 10) || (useNewYorkKillzone && hourUTC >= 12 && hourUTC < 15))) {
            return null;
        }
    }

    if (entryStrategy === 'reversal_confirmation') {
        return findConfirmationSignal(candle, currentIndex, settings, analyses, htfAnalyses);
    } else if (entryStrategy === 'poi_reaction') {
        return findRiskEntrySignal(candle, currentIndex, settings, analyses, htfAnalyses, poisForReaction);
    }
    return null;
}
