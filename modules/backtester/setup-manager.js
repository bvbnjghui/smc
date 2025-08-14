// smc/modules/backtester/setup-manager.js

/**
 * @file 管理等待中的交易設定 (Setup)，並在觸發時建立新交易。
 */

/**
 * 管理一個等待中的交易設定。
 * @param {object} candle - 當前的 K 棒。
 * @param {number} currentIndex - 當前 K 棒的索引。
 * @param {object} setup - 等待中的交易設定物件。
 * @param {object} settings - 回測設定。
 * @param {object[]} atr - ATR 數據陣列。
 * @returns {{newTrade: object|null, newSetup: object|null}} 包含新交易或更新後設定的物件。
 */
export function manageSetup(candle, currentIndex, setup, settings, atr) {
    const {
        riskPerTrade, rrRatio, rrRatioTP2, enableATR, atrMultiplier, setupExpirationCandles
    } = settings;

    // 1. 檢查設定是否過期或失效
    if (currentIndex > setup.creationIndex + setupExpirationCandles ||
        (setup.direction === 'LONG' && candle.low <= setup.protectionPoint) ||
        (setup.direction === 'SHORT' && candle.high >= setup.protectionPoint)) {
        return { newTrade: null, newSetup: null }; // 設定失效
    }

    // 2. 檢查是否觸發進場
    let entryPrice = null;
    if (setup.direction === 'LONG' && candle.low <= setup.poi.top) {
        entryPrice = setup.poi.top;
    } else if (setup.direction === 'SHORT' && candle.high >= setup.poi.bottom) {
        entryPrice = setup.poi.bottom;
    }

    if (entryPrice) {
        let stopLoss;
        if (enableATR && atr[currentIndex] && atr[currentIndex].value) {
            const atrValue = atr[currentIndex].value;
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
            
            const newTrade = {
                direction: setup.direction,
                entryTime: candle.time,
                entryPrice,
                stopLoss,
                takeProfit1,
                takeProfit2,
                tp1Hit: false,
                setupType: setup.type,
            };
            return { newTrade, newSetup: null }; // 建立新交易，清除設定
        }
    }

    return { newTrade: null, newSetup: setup }; // 設定仍然有效
}
