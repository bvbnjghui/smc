// smc/modules/smc-analyzer.js

/**
 * @file 核心 SMC 分析引擎。
 * 包含所有 SMC 概念的計算邏輯，此模組為純函式，不依賴外部狀態。
 */

/**
 * **新增**: 計算並匯出平均真實波幅 (ATR)。
 * @param {object[]} candles - K 線數據陣列。
 * @param {number} period - ATR 的計算週期。
 * @returns {object[]} ATR 數據陣列。
 */
export function calculateATR(candles, period) {
    const atrValues = [];
    if (candles.length < period) return atrValues;

    let previousAtr = 0;
    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const prevCandle = i > 0 ? candles[i - 1] : null;

        const highLow = candle.high - candle.low;
        const highPrevClose = prevCandle ? Math.abs(candle.high - prevCandle.close) : highLow;
        const lowPrevClose = prevCandle ? Math.abs(candle.low - prevCandle.close) : highLow;
        
        const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);

        if (i < period) {
            previousAtr += trueRange;
            if (i === period - 1) {
                previousAtr /= period;
                atrValues.push({ time: candle.time, value: previousAtr });
            } else {
                atrValues.push({ time: candle.time, value: undefined });
            }
        } else {
            const currentAtr = (previousAtr * (period - 1) + trueRange) / period;
            atrValues.push({ time: candle.time, value: currentAtr });
            previousAtr = currentAtr;
        }
    }
    return atrValues;
}


/**
 * 計算並匯出指數移動平均線 (EMA)。
 * @param {object[]} candles - K 線數據陣列。
 * @param {number} period - EMA 的計算週期。
 * @returns {object[]} EMA 數據陣列。
 */
export function calculateEMA(candles, period) {
    const emaValues = [];
    if (candles.length < period) return emaValues;

    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    let prevEma = sum / period;
    
    for (let i = 0; i < candles.length; i++) {
        if (i < period -1) {
             emaValues.push({ time: candles[i].time, value: undefined });
             continue;
        }
        if (i === period -1) {
            emaValues.push({ time: candles[i].time, value: prevEma });
            continue;
        }
        const currentEma = (candles[i].close * k) + (prevEma * (1 - k));
        emaValues.push({ time: candles[i].time, value: currentEma });
        prevEma = currentEma;
    }
    return emaValues;
}


/**
 * 找出所有的波段高/低點 (Swing High/Low)。
 * @param {object[]} candles - K 線數據陣列。
 * @returns {{swingHighs: object[], swingLows: object[]}} 波段高低點物件。
 */
function analyzeAndGetSwingPoints(candles) {
    const swingHighs = [];
    const swingLows = [];
    for (let i = 1; i < candles.length - 1; i++) {
        const prev = candles[i - 1];
        const current = candles[i];
        const next = candles[i + 1];
        if (current.high > prev.high && current.high > next.high) {
            swingHighs.push({ index: i, price: current.high, time: current.time });
        }
        if (current.low < prev.low && current.low < next.low) {
            swingLows.push({ index: i, price: current.low, time: current.time });
        }
    }
    return { swingHighs, swingLows };
}

/**
 * 根據波段點判斷市場結構 (BOS/CHoCH)。
 * @param {object[]} candles - K 線數據陣列。
 * @param {{swingHighs: object[], swingLows: object[]}} swingPoints - 波段高低點物件。
 * @returns {{bosEvents: object[], chochEvents: object[]}} 市場結構事件。
 */
function analyzeMarketStructure(candles, swingPoints) {
    const bosEvents = [];
    const chochEvents = [];
    const { swingHighs, swingLows } = swingPoints;

    if (swingHighs.length < 2 || swingLows.length < 2) {
        return { bosEvents, chochEvents };
    }

    let majorTrend = 'undetermined';

    if (swingHighs[1].price > swingHighs[0].price && swingLows[1].price > swingLows[0].price) {
        majorTrend = 'bullish';
    } else if (swingHighs[1].price < swingHighs[0].price && swingLows[1].price < swingLows[0].price) {
        majorTrend = 'bearish';
    }

    for (let i = 1; i < candles.length; i++) {
        const candle = candles[i];

        const brokenHighs = swingHighs.filter(sh => sh.index < i && candle.close > sh.price && !sh.broken);
        const brokenLows = swingLows.filter(sl => sl.index < i && candle.close < sl.price && !sl.broken);

        if (brokenHighs.length > 0) {
            const lastBrokenHigh = brokenHighs[brokenHighs.length - 1];
            if (majorTrend === 'bullish') {
                bosEvents.push({
                    price: lastBrokenHigh.price,
                    marker: { time: candle.time, position: 'belowBar', color: '#2563eb', shape: 'circle', text: 'BOS' }
                });
            } else {
                chochEvents.push({
                    price: lastBrokenHigh.price,
                    marker: { time: candle.time, position: 'belowBar', color: '#f59e0b', shape: 'circle', text: 'CHoCH' }
                });
                majorTrend = 'bullish'; 
            }
            swingHighs.forEach(sh => { if(brokenHighs.includes(sh)) sh.broken = true; });
        }

        if (brokenLows.length > 0) {
            const lastBrokenLow = brokenLows[brokenLows.length - 1];
             if (majorTrend === 'bearish') {
                bosEvents.push({
                    price: lastBrokenLow.price,
                    marker: { time: candle.time, position: 'aboveBar', color: '#ef4444', shape: 'circle', text: 'BOS' }
                });
            } else {
                chochEvents.push({
                    price: lastBrokenLow.price,
                    marker: { time: candle.time, position: 'aboveBar', color: '#f59e0b', shape: 'circle', text: 'CHoCH' }
                });
                majorTrend = 'bearish'; 
            }
            swingLows.forEach(sl => { if(brokenLows.includes(sl)) sl.broken = true; });
        }
    }
    
    const uniqueBos = bosEvents.filter((v,i,a)=>a.findIndex(t=>(t.price === v.price && t.marker.time===v.marker.time))===i);
    const uniqueChoch = chochEvents.filter((v,i,a)=>a.findIndex(t=>(t.price === v.price && t.marker.time===v.marker.time))===i);

    return { bosEvents: uniqueBos, chochEvents: uniqueChoch };
}


/**
 * 根據波段點，找出流動性掠奪 (BSL/SSL) 事件。
 * @param {object[]} candles - K 線數據陣列。
 * @param {{swingHighs: object[], swingLows: object[]}} swingPoints - 波段高低點物件。
 * @returns {object} 按時間戳分組的流動性掠奪事件。
 */
function analyzeLiquidityGrabs(candles, swingPoints) {
    const grabsByTime = {};
    const { swingHighs, swingLows } = swingPoints;
    swingHighs.forEach(sh => sh.grabbed = false);
    swingLows.forEach(sl => sl.grabbed = false);

    for (let i = 0; i < candles.length; i++) {
        const time = candles[i].time;
        for (const sh of swingHighs) {
            if (!sh.grabbed && i > sh.index && candles[i].high > sh.price) {
                if (!grabsByTime[time]) grabsByTime[time] = [];
                grabsByTime[time].push({ position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'BSL', grabbedPoint: sh });
                sh.grabbed = true;
            }
        }
        for (const sl of swingLows) {
            if (!sl.grabbed && i > sl.index && candles[i].low < sl.price) {
                if (!grabsByTime[time]) grabsByTime[time] = [];
                grabsByTime[time].push({ position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: 'SSL', grabbedPoint: sl });
                sl.grabbed = true;
            }
        }
    }
    return grabsByTime;
}


/**
 * 找出所有公平價值缺口 (FVG)，並標記是否已被緩解。
 * @param {object[]} candles - K 線數據陣列。
 * @returns {object[]} FVG 事件陣列，包含 isMitigated 標記。
 */
function analyzeAndGetFVGs(candles) {
    const results = [];
    for (let i = 1; i < candles.length - 1; i++) {
        const prevCandle = candles[i - 1];
        const nextCandle = candles[i + 1];

        if (prevCandle.low > nextCandle.high) {
            const fvgTop = prevCandle.low;
            const fvgBottom = nextCandle.high;
            let isMitigated = false;
            for (let j = i + 2; j < candles.length; j++) {
                if (candles[j].low <= fvgTop) { 
                    isMitigated = true; 
                    break; 
                }
            }
            results.push({ type: 'bullish', top: fvgTop, bottom: fvgBottom, index: i, isMitigated });
        }

        if (prevCandle.high < nextCandle.low) {
            const fvgTop = nextCandle.low;
            const fvgBottom = prevCandle.high;
            let isMitigated = false;
            for (let j = i + 2; j < candles.length; j++) {
                if (candles[j].high >= fvgBottom) { 
                    isMitigated = true; 
                    break; 
                }
            }
            results.push({ type: 'bearish', top: fvgTop, bottom: fvgBottom, index: i, isMitigated });
        }
    }
    return results;
}

/**
 * 找出所有訂單塊 (OB)，並標記是否已被緩解。
 * @param {object[]} candles - K 線數據陣列。
 * @returns {object[]} OB 事件陣列，包含 isMitigated 標記。
 */
function analyzeAndGetOrderBlocks(candles) {
    const results = [];
    for (let i = 0; i < candles.length - 1; i++) {
        const orderBlockCandle = candles[i];
        const breakCandle = candles[i + 1];

        if (orderBlockCandle.close > orderBlockCandle.open && breakCandle.close < orderBlockCandle.low) {
            const obTop = orderBlockCandle.high;
            const obBottom = orderBlockCandle.low;
            let isMitigated = false;
            for (let j = i + 2; j < candles.length; j++) {
                if (candles[j].high >= obBottom) { 
                    isMitigated = true; 
                    break; 
                }
            }
            results.push({ type: 'bearish', top: obTop, bottom: obBottom, index: i, isMitigated });
        }

        if (orderBlockCandle.close < orderBlockCandle.open && breakCandle.close > orderBlockCandle.high) {
            const obTop = orderBlockCandle.high;
            const obBottom = orderBlockCandle.low;
            let isMitigated = false;
            for (let j = i + 2; j < candles.length; j++) {
                if (candles[j].low <= obTop) { 
                    isMitigated = true; 
                    break; 
                }
            }
            results.push({ type: 'bullish', top: obTop, bottom: obBottom, index: i, isMitigated });
        }
    }
    return results;
}

/**
 * 找出所有 Breaker Blocks (BB)。
 * @param {object[]} orderBlocks - 已找出的訂單塊陣列。
 * @returns {object[]} Breaker Block 事件陣列。
 */
function analyzeAndGetBreakerBlocks(orderBlocks) {
    return orderBlocks
        .filter(ob => ob.isMitigated)
        .map(ob => ({
            type: ob.type === 'bullish' ? 'bearish' : 'bullish', 
            top: ob.top,
            bottom: ob.bottom,
            index: ob.index,
            isMitigated: ob.isMitigated
        }));
}


/**
 * 統一呼叫所有分析函式的入口。
 * @param {object[]} candles - K 線數據陣列。
 * @param {object} settings - 包含分析所需設定的物件。
 * @returns {object} 包含所有分析結果的物件。
 */
export function analyzeAll(candles, settings = {}) {
    // ** 新增: 解構出 ATR 相關設定 **
    const { enableTrendFilter, emaPeriod, enableATR, atrPeriod } = settings;

    if (!candles || candles.length < 3) {
        return { swingPoints: { swingHighs: [], swingLows: [] }, liquidityGrabs: {}, bosEvents: [], chochEvents: [], orderBlocks: [], fvgs: [], breakerBlocks: [], ema: [], atr: [] };
    }
    
    const analyzableCandles = JSON.parse(JSON.stringify(candles));
    const swingPoints = analyzeAndGetSwingPoints(analyzableCandles);
    const { bosEvents, chochEvents } = analyzeMarketStructure(analyzableCandles, swingPoints);
    const orderBlocks = analyzeAndGetOrderBlocks(analyzableCandles);
    const ema = enableTrendFilter ? calculateEMA(analyzableCandles, emaPeriod) : [];
    // ** 新增: 計算 ATR **
    const atr = enableATR ? calculateATR(analyzableCandles, atrPeriod) : [];

    return {
        swingPoints,
        liquidityGrabs: analyzeLiquidityGrabs(analyzableCandles, swingPoints),
        bosEvents,
        chochEvents,
        orderBlocks,
        fvgs: analyzeAndGetFVGs(analyzableCandles),
        breakerBlocks: analyzeAndGetBreakerBlocks(orderBlocks),
        ema,
        atr, // ** 新增: 回傳 ATR 結果 **
    };
}


/**
 * 尋找最近的興趣點 (POI - Point of Interest)，即 OB, BB 或 FVG。
 * @param {number} currentIndex - 當前 K 線的索引。
 * @param {string} type - 'bullish' 或 'bearish'。
 * @param {object[]} orderBlocks - 訂單塊陣列。
 * @param {object[]} fvgs - FVG 陣列。
 * @param {object[]} breakerBlocks - 突破塊陣列。
 * @returns {object|null} 最近的 POI 物件或 null。
 */
export function findNearestPOI(currentIndex, type, orderBlocks, fvgs, breakerBlocks) {
    const pois = [...orderBlocks, ...fvgs, ...breakerBlocks]
        .filter(p => p.type === type && p.index <= currentIndex)
        .sort((a, b) => b.index - a.index); 
    return pois.length > 0 ? pois[0] : null;
}
