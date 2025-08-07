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
    // ** 修改：從 settings 中解構出 setupExpirationCandles **
    const { 
        investmentAmount, 
        riskPerTrade, 
        riskMultiGrab2, 
        riskMultiGrab3plus, 
        rrRatio,
        setupExpirationCandles // 新增的參數
    } = settings;

    console.log("--- 開始策略回測模擬 ---");
    console.log("初始設定:", settings);

    let equity = investmentAmount;
    const trades = [];
    const analyses = analyzeAll(candles); 
    const { liquidityGrabs, mss, orderBlocks, fvgs } = analyses;

    let activeTrade = null;
    let setup = null; 

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const candleTime = new Date(candle.time * 1000).toLocaleString();

        // 步驟 1: 檢查當前活躍交易是否需要出場
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
                console.log(`%c[${candleTime}] TRADE CLOSED: ${exitReason}`, 'color: orange;', tradeResult);
                activeTrade = null;
                setup = null;
            }
        }

        if (activeTrade) continue;

        // 步驟 2: 管理和推進當前的交易設定 (Setup)
        if (setup) {
            // ** 修改：使用傳入的 setupExpirationCandles 變數 **
            if (i > setup.creationIndex + setupExpirationCandles) {
                console.log(`%c[${candleTime}] SETUP EXPIRED: 超過 ${setupExpirationCandles} 根 K 棒未進場`, 'color: #f59e0b;');
                setup = null;
            }
            else if ((setup.direction === 'LONG' && candle.low <= setup.protectionPoint) ||
                (setup.direction === 'SHORT' && candle.high >= setup.protectionPoint)) {
                console.log(`%c[${candleTime}] SETUP INVALIDATED: 價格突破保護點 ${setup.protectionPoint}`, 'color: #f59e0b;');
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
                        console.log(`%c[${candleTime}] TRADE ENTERED:`, 'color: #22c55e;', activeTrade);
                        setup = null;
                    }
                }
            }
        }

        // 步驟 3: 如果沒有任何交易設定，則尋找新的交易機會
        if (!setup) {
            const mssOnThisCandle = mss.find(m => m.marker.time === candle.time);
            
            if (mssOnThisCandle) {
                const mssCandleIndex = i;
                const direction = mssOnThisCandle.marker.position === 'belowBar' ? 'LONG' : 'SHORT';
                console.log(`%c[${candleTime}] MSS Confirmed: ${direction}`, 'color: #3b82f6;');

                const poiDirection = direction === 'LONG' ? 'bullish' : 'bearish';
                const poi = findNearestPOI(mssCandleIndex, poiDirection, orderBlocks, fvgs);

                if (poi) {
                    console.log(`%c[${candleTime}] Found POI for MSS:`, 'color: #a78bfa;', poi);
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
                            console.log(`%c[${candleTime}] SETUP CREATED: Waiting for entry.`, 'color: #eab308;', setup);
                        }
                    } else {
                         console.log(`[${candleTime}] MSS 發生，但找不到相關的流動性掠奪事件。`);
                    }
                } else {
                     console.log(`[${candleTime}] MSS 發生，但找不到可用的 POI。`);
                }
            }
        }
    }

    // 計算最終統計數據
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
