// smc/modules/smc-analyzer.js

/**
 * @file 核心 SMC 分析引擎。
 * 包含所有 SMC 概念的計算邏輯，此模組為純函式，不依賴外部狀態。
 */

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
 * 根據流動性掠奪，找出市場結構轉變 (MSS) 事件，並包含失效規則。
 * @param {object[]} candles - K 線數據陣列。
 * @param {{swingHighs: object[], swingLows: object[]}} swingPoints - 波段高低點物件。
 * @param {object} liquidityGrabs - 流動性掠奪事件物件。
 * @returns {object[]} MSS 事件陣列。
 */
function analyzeAndGetMSS(candles, swingPoints, liquidityGrabs) {
    const mssEvents = [];
    const { swingHighs, swingLows } = swingPoints;

    for (const timeStr in liquidityGrabs) {
        const time = Number(timeStr);
        const grabs = liquidityGrabs[time];
        const grabCandleIndex = candles.findIndex(c => c.time === time);

        for (const grab of grabs) {
            if (grab.text === 'BSL') {
                const relevantLow = swingLows.filter(sl => sl.index < grab.grabbedPoint.index).pop();
                if (!relevantLow) continue;

                for (let i = grabCandleIndex + 1; i < candles.length; i++) {
                    if (candles[i].close < relevantLow.price) {
                        let isInvalidated = false;
                        const protectionHigh = grab.grabbedPoint; 
                        for (let j = grabCandleIndex + 1; j < i; j++) {
                            if (candles[j].high > protectionHigh.price) {
                                isInvalidated = true;
                                break;
                            }
                        }
                        if (!isInvalidated) {
                            mssEvents.push({
                                price: relevantLow.price,
                                marker: { time: candles[i].time, position: 'aboveBar', color: '#3b82f6', shape: 'circle', text: 'MSS' }
                            });
                        }
                        break;
                    }
                }
            } else if (grab.text === 'SSL') {
                const relevantHigh = swingHighs.filter(sh => sh.index < grab.grabbedPoint.index).pop();
                if (!relevantHigh) continue;

                for (let i = grabCandleIndex + 1; i < candles.length; i++) {
                    if (candles[i].close > relevantHigh.price) {
                        let isInvalidated = false;
                        const protectionLow = grab.grabbedPoint;
                        for (let j = grabCandleIndex + 1; j < i; j++) {
                            if (candles[j].low < protectionLow.price) {
                                isInvalidated = true;
                                break;
                            }
                        }
                        if (!isInvalidated) {
                            mssEvents.push({
                                price: relevantHigh.price,
                                marker: { time: candles[i].time, position: 'belowBar', color: '#3b82f6', shape: 'circle', text: 'MSS' }
                            });
                        }
                        break;
                    }
                }
            }
        }
    }
    return mssEvents.filter((event, index, self) =>
        index === self.findIndex((e) => (
            e.price === event.price && e.marker.time === event.marker.time
        ))
    );
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

        // 看漲 FVG (Bullish FVG)
        if (prevCandle.low > nextCandle.high) {
            const fvgTop = prevCandle.low;
            const fvgBottom = nextCandle.high;
            let isMitigated = false;
            // 檢查未來是否有 K 線的低點觸及此 FVG 的頂部
            for (let j = i + 2; j < candles.length; j++) {
                if (candles[j].low <= fvgTop) { 
                    isMitigated = true; 
                    break; 
                }
            }
            results.push({ type: 'bullish', top: fvgTop, bottom: fvgBottom, index: i, isMitigated });
        }

        // 看跌 FVG (Bearish FVG)
        if (prevCandle.high < nextCandle.low) {
            const fvgTop = nextCandle.low;
            const fvgBottom = prevCandle.high;
            let isMitigated = false;
            // 檢查未來是否有 K 線的高點觸及此 FVG 的底部
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

        // 看跌 OB (Bearish OB)
        if (orderBlockCandle.close > orderBlockCandle.open && breakCandle.close < orderBlockCandle.low) {
            const obTop = orderBlockCandle.high;
            const obBottom = orderBlockCandle.low;
            let isMitigated = false;
            // 檢查未來是否有 K 線的高點觸及此 OB 的底部
            for (let j = i + 2; j < candles.length; j++) {
                if (candles[j].high >= obBottom) { 
                    isMitigated = true; 
                    break; 
                }
            }
            results.push({ type: 'bearish', top: obTop, bottom: obBottom, index: i, isMitigated });
        }

        // 看漲 OB (Bullish OB)
        if (orderBlockCandle.close < orderBlockCandle.open && breakCandle.close > orderBlockCandle.high) {
            const obTop = orderBlockCandle.high;
            const obBottom = orderBlockCandle.low;
            let isMitigated = false;
            // 檢查未來是否有 K 線的低點觸及此 OB 的頂部
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
 * 統一呼叫所有分析函式的入口。
 * @param {object[]} candles - K 線數據陣列。
 * @returns {object} 包含所有分析結果的物件。
 */
export function analyzeAll(candles) {
    if (!candles || candles.length < 3) {
        return { swingPoints: { swingHighs: [], swingLows: [] }, liquidityGrabs: {}, mss: [], orderBlocks: [], fvgs: [] };
    }
    const swingPoints = analyzeAndGetSwingPoints(candles);
    const liquidityGrabs = analyzeLiquidityGrabs(candles, swingPoints);
    return {
        swingPoints,
        liquidityGrabs,
        mss: analyzeAndGetMSS(candles, swingPoints, liquidityGrabs),
        orderBlocks: analyzeAndGetOrderBlocks(candles),
        fvgs: analyzeAndGetFVGs(candles),
    };
}

/**
 * 尋找最近的興趣點 (POI - Point of Interest)，即 OB 或 FVG。
 * **此函式專為回測引擎設計，它不關心 POI 是否已被緩解，只關心其結構有效性。**
 * @param {number} currentIndex - 當前 K 線的索引。
 * @param {string} type - 'bullish' 或 'bearish'。
 * @param {object[]} orderBlocks - 訂單塊陣列。
 * @param {object[]} fvgs - FVG 陣列。
 * @returns {object|null} 最近的 POI 物件或 null。
 */
export function findNearestPOI(currentIndex, type, orderBlocks, fvgs) {
    const pois = [...orderBlocks, ...fvgs]
        .filter(p => p.type === type && p.index <= currentIndex)
        .sort((a, b) => b.index - a.index); 
    return pois.length > 0 ? pois[0] : null;
}
