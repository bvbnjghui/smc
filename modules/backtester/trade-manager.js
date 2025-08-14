// smc/modules/backtester/trade-manager.js

/**
 * @file 管理進行中的交易，檢查止損、止盈和保本。
 */

/**
 * 管理一筆進行中的交易。
 * @param {object} candle - 當前的 K 棒。
 * @param {object} activeTrade - 進行中的交易物件。
 * @param {object} settings - 回測設定。
 * @returns {{trade: object|null, closedTrades: object[], pnl: number}} 更新後的交易狀態。
 */
export function manageActiveTrade(candle, activeTrade, settings) {
    const { enableBreakeven } = settings;
    const closedTrades = [];
    let pnl = 0;
    let updatedTrade = { ...activeTrade };

    const isLong = updatedTrade.direction === 'LONG';
    const isShort = updatedTrade.direction === 'SHORT';

    // 1. 檢查 TP1
    if (!updatedTrade.tp1Hit &&
        ((isLong && candle.high >= updatedTrade.takeProfit1) ||
         (isShort && candle.low <= updatedTrade.takeProfit1))) {
        
        const exitPrice = updatedTrade.takeProfit1;
        const exitSize = updatedTrade.initialSize / 2;
        const tradePnl = (exitPrice - updatedTrade.entryPrice) * exitSize * (isLong ? 1 : -1);
        pnl += tradePnl;

        closedTrades.push({
            ...updatedTrade,
            exitPrice,
            exitTime: candle.time,
            pnl: tradePnl,
            exitReason: 'TP1',
            size: exitSize
        });

        updatedTrade.size -= exitSize;
        updatedTrade.tp1Hit = true;
        if (enableBreakeven) {
            updatedTrade.stopLoss = updatedTrade.entryPrice;
        }
    }

    // 2. 檢查最終出場 (SL / Breakeven / TP2)
    let finalExitPrice = null;
    let finalExitReason = '';

    if ((isLong && candle.low <= updatedTrade.stopLoss) || (isShort && candle.high >= updatedTrade.stopLoss)) {
        finalExitPrice = updatedTrade.stopLoss;
        finalExitReason = updatedTrade.tp1Hit && enableBreakeven ? 'Breakeven' : 'StopLoss';
    } else if (updatedTrade.tp1Hit &&
               ((isLong && candle.high >= updatedTrade.takeProfit2) ||
                (isShort && candle.low <= updatedTrade.takeProfit2))) {
        finalExitPrice = updatedTrade.takeProfit2;
        finalExitReason = 'TP2';
    }

    if (finalExitPrice) {
        const exitSize = updatedTrade.size;
        const tradePnl = (finalExitPrice - updatedTrade.entryPrice) * exitSize * (isLong ? 1 : -1);
        pnl += tradePnl;

        closedTrades.push({
            ...updatedTrade,
            exitPrice: finalExitPrice,
            exitTime: candle.time,
            pnl: tradePnl,
            exitReason: finalExitReason,
            size: exitSize
        });

        updatedTrade = null; // 交易完全結束
    }

    return { trade: updatedTrade, closedTrades, pnl };
}
