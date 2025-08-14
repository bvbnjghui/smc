// smc/modules/backtester.js

/**
 * @file 回測模擬的主協調器。
 */

import { manageActiveTrade } from './backtester/trade-manager.js';
import { manageSetup } from './backtester/setup-manager.js';
import { findSignal } from './backtester/signal-finder.js';

export function runBacktestSimulation(params) {
    const { candles, settings, analyses, htfAnalyses } = params;
    const { investmentAmount, riskPerTrade } = settings;

    console.log(`--- 開始策略回測模擬 (Strategy: ${settings.entryStrategy}) ---`);
    console.log("初始設定:", settings);

    let equity = investmentAmount;
    const trades = [];
    let activeTrade = null;
    let setup = null;

    const poisForReaction = [...analyses.orderBlocks, ...analyses.fvgs, ...analyses.breakerBlocks]
        .map(p => ({ ...p, touched: false }));

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // 1. 管理進行中的交易
        if (activeTrade) {
            const result = manageActiveTrade(candle, activeTrade, settings);
            activeTrade = result.trade;
            if (result.closedTrades.length > 0) {
                trades.push(...result.closedTrades);
                equity += result.pnl;
            }
            if (!activeTrade) setup = null; // 確保交易結束後清除 setup
        }

        if (activeTrade) continue;

        // 2. 管理等待中的設定
        if (setup) {
            const result = manageSetup(candle, i, setup, settings, analyses.atr);
            setup = result.newSetup;
            if (result.newTrade) {
                const riskPerUnit = Math.abs(result.newTrade.entryPrice - result.newTrade.stopLoss);
                const size = (equity * (riskPerTrade / 100)) / riskPerUnit;
                activeTrade = { ...result.newTrade, size, initialSize: size };
            }
        }

        // 3. 尋找新信號
        if (!setup) {
            const signal = findSignal(candle, i, settings, analyses, htfAnalyses, poisForReaction);
            if (signal) {
                if (signal.newTrade) { // Risk Entry
                    const riskPerUnit = Math.abs(signal.newTrade.entryPrice - signal.newTrade.stopLoss);
                    const size = (equity * (riskPerTrade / 100)) / riskPerUnit;
                    activeTrade = { ...signal.newTrade, size, initialSize: size };
                } else if (signal.immediateClose) { // Risk Entry - Same Bar Stop
                    const riskPerUnit = Math.abs(signal.immediateClose.entryPrice - signal.immediateClose.stopLoss);
                    const size = (equity * (riskPerTrade / 100)) / riskPerUnit;
                    const pnl = (signal.immediateClose.exitPrice - signal.immediateClose.entryPrice) * size * (signal.immediateClose.direction === 'LONG' ? 1 : -1);
                    equity += pnl;
                    trades.push({ ...signal.immediateClose, pnl, size, initialSize: size });
                } else { // Confirmation Entry
                    setup = signal;
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
        finalEquity: equity,
        netPnl,
        pnlPercent,
        winRate,
        totalTrades: totalExits,
        trades,
    };

    console.log("--- 回測模擬結束 ---");
    console.log("最終結果:", results);

    return results;
}
