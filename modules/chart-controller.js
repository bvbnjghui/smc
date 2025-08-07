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

export function setupChart(containerId) {
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
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a', priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.8, bottom: 0 },
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

/**
 * 根據分析結果和顯示設定，在圖表上繪製所有標示。
 * @param {object} analyses - `smc-analyzer` 回傳的分析結果。
 * @param {object} settings - 使用者的顯示設定。
 */
export function redrawAllAnalyses(analyses, settings) {
    if (!candleSeries) return;

    clearDrawings();

    const { showLiquidity, showMSS, showOrderBlocks, showFVGs, showMitigated } = settings;

    // 決定是否要顯示已緩解的區域
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
