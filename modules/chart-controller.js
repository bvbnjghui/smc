// smc/modules/chart-controller.js

/**
 * @file 負責所有與圖表互動、繪圖相關的邏輯。
 * 封裝 Lightweight Charts 的實例和操作。
 */

let chart = null;
let candleSeries = null;
let volumeSeries = null;
let priceLines = []; 
let markers = []; 

/**
 * 初始化圖表，並設定外觀、座標軸、縮放等行為。
 * @param {string} containerId - 圖表容器的 DOM 元素 ID。
 * @param {Function} onVisibleRangeChanged - 當圖表可見範圍變化時的回呼函式。
 * @returns {{chart: object, candleSeries: object, volumeSeries: object}} 圖表相關的實例。
 */
export function setupChart(containerId, onVisibleRangeChanged) {
    if (chart) {
        console.warn('圖表已被初始化，中止本次 setupChart 呼叫。');
        return { chart, candleSeries, volumeSeries };
    }

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`找不到 ID 為 '${containerId}' 的圖表容器元素`);
        return {};
    }

    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#1f2937' }, textColor: '#d1d5db' },
        grid: { vertLines: { color: '#374151' }, horzLines: { color: '#374151' } },
        handleScroll: { mouseWheel: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true, axisDoubleClickReset: true },
        rightPriceScale: {
            borderColor: '#4b5563',
            scaleMargins: { top: 0.3, bottom: 0.25 },
            formatter: price => {
                if (price > 1000) return price.toFixed(2);
                if (price > 1) return price.toFixed(4);
                return price.toPrecision(4);
            }
        },
        timeScale: { borderColor: '#4b5563', rightOffset: 12, timeVisible: true, barSpacing: 8 },
        // ** 新增：設定所有覆蓋價格座標軸的預設行為 **
        overlayPriceScales: {
            // ** 修改：強制覆蓋座標軸（例如成交量）的底部邊界為 0，解決浮空問題 **
            scaleMargins: {
                top: 0.8, // 保留 80% 的頂部空間給 K 線圖本身
                bottom: 0,  // 底部邊界設為 0，讓成交量貼齊底部
            }
        }
    });

    // ** 新增：監聽圖表可見的 K 棒索引範圍變化 **
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRange => {
        if (onVisibleRangeChanged && logicalRange) {
            // 將範圍傳遞給 main.js 處理
            onVisibleRangeChanged(logicalRange);
        }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // 保持使用一個獨立的、不可見的覆蓋座標軸
        // ** 新增：強制成交量圖的基線從 0 開始 **
        base: 0,
        // ** 移除：此處的 scaleMargins 已由上方的 overlayPriceScales 全域設定取代，因此不再需要 **
    });

    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target.offsetHeight === 0) return;
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
    }).observe(container);

    return { chart, candleSeries, volumeSeries };
}

export function updateChartData(candles, volumes) {
    if (candleSeries && volumeSeries) {
        candleSeries.setData(candles);
        volumeSeries.setData(volumes);
    }
}

export function fitChart(dataLength) {
    if (chart && dataLength > 0) {
        const barsToShow = 30;
        const from = Math.max(0, dataLength - barsToShow);
        const to = dataLength - 1;
        chart.timeScale().setVisibleLogicalRange({ from, to });
    }
}

function clearDrawings() {
    if (!candleSeries) return;
    priceLines.forEach(line => candleSeries.removePriceLine(line));
    priceLines = [];
    markers = [];
    candleSeries.setMarkers([]);
}

function drawZone(price1, price2, color, title, lineStyle, lineWidth = 1) {
    const lineOptions = {
        price: 0, color: color, lineWidth: lineWidth,
        lineStyle: lineStyle, axisLabelVisible: true, title: title,
    };
    const topLine = candleSeries.createPriceLine({ ...lineOptions, price: price1 });
    const bottomLine = candleSeries.createPriceLine({ ...lineOptions, price: price2 });
    priceLines.push(topLine, bottomLine);
}

export function redrawAllAnalyses(analyses, settings) {
    if (!candleSeries) return;

    clearDrawings();

    const { showLiquidity, showMSS, showOrderBlocks, showFVGs, showMitigated } = settings;

    const fvgsToDraw = showMitigated ? analyses.fvgs : analyses.fvgs.filter(fvg => !fvg.isMitigated);
    const orderBlocksToDraw = showMitigated ? analyses.orderBlocks : analyses.orderBlocks.filter(ob => !ob.isMitigated);

    if (showFVGs && fvgsToDraw) {
        fvgsToDraw.forEach(fvg => drawZone(fvg.top, fvg.bottom, fvg.type === 'bullish' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)', fvg.type === 'bullish' ? '看漲 FVG' : '看跌 FVG', LightweightCharts.LineStyle.Dashed));
    }
    if (showOrderBlocks && orderBlocksToDraw) {
        orderBlocksToDraw.forEach(ob => drawZone(ob.top, ob.bottom, ob.type === 'bullish' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)', ob.type === 'bullish' ? '看漲 OB' : '看跌 OB', LightweightCharts.LineStyle.Solid, 2));
    }
    
    if (showLiquidity && analyses.liquidityGrabs) {
        for (const time in analyses.liquidityGrabs) {
            analyses.liquidityGrabs[time].forEach(marker => {
                markers.push({ ...marker, time: Number(time) });
            });
        }
    }
    if (showMSS && analyses.mss) {
         analyses.mss.forEach(mss => {
            drawZone(mss.price, mss.price, 'rgba(59, 130, 246, 0.8)', 'MSS', LightweightCharts.LineStyle.Dotted, 2);
            markers.push(mss.marker);
        });
    }

    candleSeries.setMarkers(markers);
}
