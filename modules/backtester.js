// smc/modules/backtester.js

import { findNearestPOI } from './smc-analyzer.js';

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

export function runBacktestSimulation(params) {
    const { candles, settings, analyses, htfAnalyses } = params;
    const { 
        investmentAmount, 
        riskPerTrade, 
        rrRatio,
        rrRatioTP2,
        enableBreakeven,
        setupExpirationCandles,
        enableTrendFilter,
        emaPeriod,
        enableMTA,
        htfBias,
        enableATR,
        atrMultiplier,
        enableKillzoneFilter,
        useLondonKillzone,
        useNewYorkKillzone
    } = settings;

    console.log("--- 開始策略回測模擬 (Multi-TP Enabled) ---");
    console.log("初始設定:", settings);

    let equity = investmentAmount;
    const trades = [];
    
    const { liquidityGrabs, chochEvents, orderBlocks, fvgs, breakerBlocks, ema, atr } = analyses;

    let activeTrade = null;
    let setup = null; 

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        if (activeTrade) {
            let exitPrice = null;
            let exitReason = '';
            let exitSize = 0;

            const isLong = activeTrade.direction === 'LONG';
            const isShort = activeTrade.direction === 'SHORT';

            if (!activeTrade.tp1Hit && 
                ((isLong && candle.high >= activeTrade.takeProfit1) || 
                 (isShort && candle.low <= activeTrade.takeProfit1))) {
                
                exitPrice = activeTrade.takeProfit1;
                exitReason = 'TP1';
                exitSize = activeTrade.initialSize / 2;

                const pnl = (exitPrice - activeTrade.entryPrice) * exitSize * (isLong ? 1 : -1);
                equity += pnl;
                trades.push({ ...activeTrade, exitPrice, exitTime: candle.time, pnl, exitReason, size: exitSize });

                activeTrade.size -= exitSize;
                activeTrade.tp1Hit = true;
                if (enableBreakeven) {
                    activeTrade.stopLoss = activeTrade.entryPrice;
                }
                // Reset exitPrice for the next check in the same candle
                exitPrice = null; 
            }

            if ((isLong && candle.low <= activeTrade.stopLoss) || (isShort && candle.high >= activeTrade.stopLoss)) {
                exitPrice = activeTrade.stopLoss;
                exitReason = activeTrade.tp1Hit && enableBreakeven ? 'Breakeven' : 'StopLoss';
            } else if (activeTrade.tp1Hit && 
                       ((isLong && candle.high >= activeTrade.takeProfit2) || 
                        (isShort && candle.low <= activeTrade.takeProfit2))) {
                exitPrice = activeTrade.takeProfit2;
                exitReason = 'TP2';
            }

            if (exitPrice) {
                exitSize = activeTrade.size;
                const pnl = (exitPrice - activeTrade.entryPrice) * exitSize * (isLong ? 1 : -1);
                equity += pnl;
                trades.push({ ...activeTrade, exitPrice, exitTime: candle.time, pnl, exitReason, size: exitSize });
                
                activeTrade = null;
                setup = null; 
            }
        }

        if (activeTrade) continue; 

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
                        const takeProfit1 = setup.direction === 'LONG' ? entryPrice + riskPerUnit * rrRatio : entryPrice - riskPerUnit * rrRatio;
                        const takeProfit2 = setup.direction === 'LONG' ? entryPrice + riskPerUnit * rrRatioTP2 : entryPrice - riskPerUnit * rrRatioTP2;
                        const size = (equity * (riskPercent / 100)) / riskPerUnit;
                        
                        activeTrade = {
                            direction: setup.direction,
                            entryTime: candle.time,
                            entryPrice,
                            stopLoss,
                            takeProfit1,
                            takeProfit2,
                            size,
                            initialSize: size,
                            tp1Hit: false,
                            setupType: setup.type,
                        };
                        setup = null; 
                    }
                }
            }
        }

        if (!setup) {
            if (enableKillzoneFilter) {
                const candleDate = new Date(candle.time * 1000);
                const hourUTC = candleDate.getUTCHours();
                
                const inLondonKillzone = useLondonKillzone && (hourUTC >= 7 && hourUTC < 10);
                const inNewYorkKillzone = useNewYorkKillzone && (hourUTC >= 12 && hourUTC < 15);

                if (!inLondonKillzone && !inNewYorkKillzone) {
                    continue; 
                }
            }

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

    const totalExits = trades.length;
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRate = totalExits > 0 ? (wins / totalExits) * 100 : 0;
    const netPnl = equity - investmentAmount;
    const pnlPercent = (netPnl / investmentAmount) * 100;

    const results = {
        finalEquity: equity, netPnl, pnlPercent, winRate, 
        totalTrades: totalExits,
        trades,
    };
    
    console.log("--- 回測模擬結束 ---");
    console.log("最終結果:", results);

    return results;
}
