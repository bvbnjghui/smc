// smc/modules/backtester.js

/**
 * @file 獨立的回測模擬引擎。
 */

import { findNearestPOI } from './smc-analyzer.js';

/**
 * 檢查 LTF K 棒是否位於 HTF POI 內部。
 * @param {object} candle - 當前的 LTF K 線。
 * @param {string} direction - 'LONG' 或 'SHORT'。
 * @param {object} htfAnalyses - 高時間週期的分析結果。
 * @returns {boolean} 是否在 HTF POI 內部。
 */
function isInsideHtfPoi(candle, direction, htfAnalyses) {
    if (!htfAnalyses) return false;

    const poiType = direction === 'LONG' ? 'bullish' : 'bearish';
    const htfPois = [
        ...htfAnalyses.orderBlocks,
        ...htfAnalyses.fvgs,
        ...htfAnalyses.breakerBlocks
    ].filter(p => p.type === poiType && !p.isMitigated);

    for (const poi of htfPois) {
        if (direction === 'LONG' && candle.low <= poi.top && candle.high >= poi.bottom) {
            return true;
        }
        if (direction === 'SHORT' && candle.high >= poi.bottom && candle.low <= poi.top) {
            return true;
        }
    }
    return false;
}


/**
 * 執行策略回測模擬。
 * @param {object} params - 回測所需的所有參數。
 * @returns {object} 回測結果。
 */
export function runBacktestSimulation(params) {
    const { candles, settings, analyses, htfAnalyses } = params;
    const { 
        investmentAmount, 
        riskPerTrade, 
        rrRatio,
        setupExpirationCandles,
        enableTrendFilter,
        emaPeriod,
        enableMTA,
        htfBias,
        enableATR,
        atrMultiplier
    } = settings;

    console.log("--- 開始策略回測模擬 (ATR Enabled: " + enableATR + ", Bias: " + htfBias + ") ---");
    console.log("初始設定:", settings);

    let equity = investmentAmount;
    const trades = [];
    
    const { liquidityGrabs, chochEvents, orderBlocks, fvgs, breakerBlocks, ema, atr } = analyses;

    let activeTrade = null;
    let setup = null; 

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const candleTime = new Date(candle.time * 1000).toLocaleString();

        // 處理進行中的交易 (止損/止盈)
        if (activeTrade) {
            let exitPrice = null;
            let exitReason = '';

            if (activeTrade.direction === 'LONG') {
                if (candle.low <= activeTrade.stopLoss) { exitPrice = activeTrade.stopLoss; exitReason = 'StopLoss'; }
                // ** 修正: 將 active.takeProfit 改為 activeTrade.takeProfit **
                else if (candle.high >= activeTrade.takeProfit) { exitPrice = activeTrade.takeProfit; exitReason = 'TakeProfit'; }
            } else { // SHORT
                if (candle.high >= activeTrade.stopLoss) { exitPrice = activeTrade.stopLoss; exitReason = 'StopLoss'; }
                else if (candle.low <= activeTrade.takeProfit) { exitPrice = activeTrade.takeProfit; exitReason = 'TakeProfit'; }
            }

            if (exitPrice) {
                const pnl = (exitPrice - activeTrade.entryPrice) * activeTrade.size * (activeTrade.direction === 'LONG' ? 1 : -1);
                equity += pnl;
                trades.push({ ...activeTrade, exitPrice, exitTime: candle.time, pnl, exitReason });
                activeTrade = null;
                setup = null; 
            }
        }

        if (activeTrade) continue; 

        // 處理等待中的交易設定
        if (setup) {
            if (i > setup.creationIndex + setupExpirationCandles) { setup = null; }
            else if ((setup.direction === 'LONG' && candle.low <= setup.protectionPoint) || (setup.direction === 'SHORT' && candle.high >= setup.protectionPoint)) { setup = null; }
            else if (setup.state === 'WAITING_FOR_ENTRY') {
                let entryPrice = null;
                if (setup.direction === 'LONG' && candle.low <= setup.poi.top) { entryPrice = setup.poi.top; }
                else if (setup.direction === 'SHORT' && candle.high >= setup.poi.bottom) { entryPrice = setup.poi.bottom; }

                if (entryPrice) {
                    const riskPercent = riskPerTrade;
                    
                    let stopLoss;
                    if (enableATR && atr[i] && atr[i].value) {
                        const atrValue = atr[i].value;
                        stopLoss = setup.direction === 'LONG' 
                            ? entryPrice - (atrValue * atrMultiplier)
                            : entryPrice + (atrValue * atrMultiplier);
                    } else {
                        stopLoss = setup.direction === 'LONG' ? setup.poi.bottom : setup.poi.top;
                    }
                    
                    const riskPerUnit = Math.abs(entryPrice - stopLoss);
                    
                    if (riskPerUnit > 0) {
                        const takeProfit = setup.direction === 'LONG' ? entryPrice + riskPerUnit * rrRatio : entryPrice - riskPerUnit * rrRatio;
                        
                        const size = (equity * (riskPercent / 100)) / riskPerUnit;
                        
                        activeTrade = {
                            direction: setup.direction, entryTime: candle.time, entryPrice,
                            stopLoss, takeProfit, size, setupType: setup.type,
                        };
                        setup = null; 
                    }
                }
            }
        }

        // 如果沒有等待中的設定，則尋找新的交易機會
        if (!setup) {
            const confirmationSignal = chochEvents.find(c => c.marker.time === candle.time);

            if (confirmationSignal) {
                const signalCandleIndex = i;
                const direction = confirmationSignal.marker.position === 'belowBar' ? 'LONG' : 'SHORT';

                if ((htfBias === 'long_only' && direction === 'SHORT') || (htfBias === 'short_only' && direction === 'LONG')) {
                    continue; 
                }

                if (enableTrendFilter && ema[signalCandleIndex]?.value) {
                    if ((direction === 'LONG' && candle.close < ema[signalCandleIndex].value) || (direction === 'SHORT' && candle.close > ema[signalCandleIndex].value)) {
                        continue; 
                    }
                }
                
                if (enableMTA) {
                    if (!isInsideHtfPoi(candle, direction, htfAnalyses)) {
                        continue; 
                    }
                     console.log(`%c[${candleTime}] MTA Confirmed: 價格進入 HTF POI`, 'color: #a78bfa;');
                }

                const poiDirection = direction === 'LONG' ? 'bullish' : 'bearish';
                const poi = findNearestPOI(signalCandleIndex, poiDirection, orderBlocks, fvgs, breakerBlocks);

                if (poi) {
                    const grabCandleTime = Object.keys(liquidityGrabs).reverse().find(time => Number(time) < candle.time && liquidityGrabs[time].some(g => (direction === 'LONG' ? g.text === 'SSL' : g.text === 'BSL')));
                    if (grabCandleTime) {
                        const grabCandle = candles.find(c => c.time === Number(grabCandleTime));
                        if(grabCandle) {
                             setup = {
                                state: 'WAITING_FOR_ENTRY', 
                                type: direction === 'LONG' ? 'SSL_then_CHoCH' : 'BSL_then_CHoCH',
                                direction: direction, 
                                poi: poi,
                                protectionPoint: direction === 'LONG' ? grabCandle.low : grabCandle.high,
                                grabCount: liquidityGrabs[grabCandleTime].length, 
                                creationIndex: i
                            };
                        }
                    }
                }
            }
        }
    }

    const totalTrades = trades.length;
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const netPnl = equity - investmentAmount;
    const pnlPercent = (netPnl / investmentAmount) * 100;

    const results = {
        finalEquity: equity, netPnl, pnlPercent, winRate, totalTrades, trades,
    };
    
    console.log("--- 回測模擬結束 ---");
    console.log("最終結果:", results);

    return results;
}
