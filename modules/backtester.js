// smc/modules/backtester.js

/**
 * @file 獨立的回測模擬引擎。
 */

import { analyzeAll, findNearestPOI } from './smc-analyzer.js';

/**
 * 執行策略回測模擬。
 * @param {object} params - 回測所需的所有參數。
 * @param {object[]} params.candles - 用於回測的歷史 K 線數據。
 * @param {object} params.settings - 回測策略的設定。
 * @returns {object} 回測結果。
 */
export function runBacktestSimulation(params) {
    const { candles, settings } = params;
    const { 
        investmentAmount, 
        riskPerTrade, 
        riskMultiGrab2, 
        riskMultiGrab3plus, 
        rrRatio,
        setupExpirationCandles,
        // ** 新增：解構出趨勢過濾器設定 **
        enableTrendFilter,
        emaPeriod
    } = settings;

    console.log("--- 開始策略回測模擬 ---");
    console.log("初始設定:", settings);

    let equity = investmentAmount;
    const trades = [];
    
    // ** 修改：將設定傳入分析器 **
    const analyses = analyzeAll(candles, { enableTrendFilter, emaPeriod }); 
    const { liquidityGrabs, mss, choch, orderBlocks, fvgs, breakerBlocks, ema } = analyses;

    let activeTrade = null;
    let setup = null; 

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const candleTime = new Date(candle.time * 1000).toLocaleString();

        if (activeTrade) {
            let exitPrice = null;
            let exitReason = '';

            if (activeTrade.direction === 'LONG') {
                if (candle.low <= activeTrade.stopLoss) {
                    exitPrice = activeTrade.stopLoss;
                    exitReason = 'StopLoss';
                } else if (candle.high >= activeTrade.takeProfit) {
                    exitPrice = activeTrade.takeProfit;
                    exitReason = 'TakeProfit';
                }
            } else { // SHORT
                if (candle.high >= activeTrade.stopLoss) {
                    exitPrice = activeTrade.stopLoss;
                    exitReason = 'StopLoss';
                } else if (candle.low <= activeTrade.takeProfit) {
                    exitPrice = activeTrade.takeProfit;
                    exitReason = 'TakeProfit';
                }
            }

            if (exitPrice) {
                const pnl = (exitPrice - activeTrade.entryPrice) * activeTrade.size * (activeTrade.direction === 'LONG' ? 1 : -1);
                equity += pnl;
                const tradeResult = { ...activeTrade, exitPrice, exitTime: candle.time, pnl, exitReason };
                trades.push(tradeResult);
                activeTrade = null;
                setup = null;
            }
        }

        if (activeTrade) continue;

        if (setup) {
            if (i > setup.creationIndex + setupExpirationCandles) {
                setup = null;
            }
            else if ((setup.direction === 'LONG' && candle.low <= setup.protectionPoint) ||
                (setup.direction === 'SHORT' && candle.high >= setup.protectionPoint)) {
                setup = null;
            }
            else if (setup.state === 'WAITING_FOR_ENTRY') {
                let entryPrice = null;
                if (setup.direction === 'LONG' && candle.low <= setup.poi.top) {
                    entryPrice = setup.poi.top;
                } else if (setup.direction === 'SHORT' && candle.high >= setup.poi.bottom) {
                    entryPrice = setup.poi.bottom;
                }

                if (entryPrice) {
                    let riskPercent = riskPerTrade;
                    if (setup.grabCount === 2) riskPercent = riskMultiGrab2;
                    if (setup.grabCount >= 3) riskPercent = riskMultiGrab3plus;
                    
                    const stopLoss = setup.direction === 'LONG' ? setup.poi.bottom : setup.poi.top;
                    const risk = Math.abs(entryPrice - stopLoss);
                    
                    if (risk > 0) {
                        const takeProfit = setup.direction === 'LONG' ? entryPrice + risk * rrRatio : entryPrice - risk * rrRatio;
                        const size = (equity * (riskPercent / 100)) / risk;
                        
                        activeTrade = {
                            direction: setup.direction,
                            entryTime: candle.time,
                            entryPrice,
                            stopLoss,
                            takeProfit,
                            size,
                            setupType: setup.type,
                        };
                        setup = null;
                    }
                }
            }
        }

        if (!setup) {
            const confirmationSignal = mss.find(m => m.marker.time === candle.time) || choch.find(c => c.marker.time === candle.time);

            if (confirmationSignal) {
                const signalCandleIndex = i;
                const direction = confirmationSignal.marker.position === 'belowBar' ? 'LONG' : 'SHORT';

                // ** 新增：趨勢過濾邏輯 **
                if (enableTrendFilter && ema[signalCandleIndex]?.value) {
                    const currentEma = ema[signalCandleIndex].value;
                    if (direction === 'LONG' && candle.close < currentEma) {
                        console.log(`%c[${candleTime}] 過濾做多訊號：價格低於 EMA (${currentEma.toFixed(2)})`, 'color: #888;');
                        continue; // 逆勢，跳過此交易機會
                    }
                    if (direction === 'SHORT' && candle.close > currentEma) {
                        console.log(`%c[${candleTime}] 過濾做空訊號：價格高於 EMA (${currentEma.toFixed(2)})`, 'color: #888;');
                        continue; // 逆勢，跳過此交易機會
                    }
                }

                const poiDirection = direction === 'LONG' ? 'bullish' : 'bearish';
                const poi = findNearestPOI(signalCandleIndex, poiDirection, orderBlocks, fvgs, breakerBlocks);

                if (poi) {
                    const grabCandleTime = Object.keys(liquidityGrabs).reverse().find(time => {
                        return Number(time) < candle.time && liquidityGrabs[time].some(g => (direction === 'LONG' ? g.text === 'SSL' : g.text === 'BSL'));
                    });

                    if (grabCandleTime) {
                        const grabCandle = candles.find(c => c.time === Number(grabCandleTime));
                        if(grabCandle) {
                             setup = {
                                state: 'WAITING_FOR_ENTRY',
                                type: direction === 'LONG' ? 'SSL' : 'BSL',
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
        finalEquity: equity,
        netPnl,
        pnlPercent,
        winRate,
        totalTrades,
        trades,
    };
    
    console.log("--- 回測模擬結束 ---");
    console.log("最終結果:", results);

    return results;
}
