// smc/modules/chart-controller.js

/**
 * @file 負責所有與圖表互動、繪圖相關的邏輯。
 * 封裝 Lightweight Charts 的實例和操作。
 */

let chart = null;
let candleSeries = null;
let volumeSeries = null;
let emaSeries = null;
// ** 新增: ATR series **
let atrSeries = null;
let priceLines = []; 
let markers = []; 
let htfPriceLines = [];

/**
 * 初始化圖表，並設定外觀、座標軸、縮放等行為。
 */
export function setupChart(containerId, onVisibleRangeChanged) {
    if (chart) {
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
        // ** 修改: 移除全域覆蓋，因為 ATR 需要自己的座標軸 **
        // overlayPriceScales: {
        //     scaleMargins: {
        //         top: 0.8,
        //         bottom: 0,
        //     }
        // }
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRange => {
        if (onVisibleRangeChanged && logicalRange) {
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
        priceScaleId: '', // 附著在左側不可見的價格軸上
        scaleMargins: { top: 0.8, bottom: 0 }, // 佔用下方 20% 的空間
    });
    
    emaSeries = chart.addLineSeries({
        color: 'rgba(236, 239, 241, 0.8)',
        lineWidth: 2,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
    });
    
    // ** 新增: 初始化 ATR series **
    atrSeries = chart.addLineSeries({
        color: 'rgba(234, 179, 8, 0.8)',
        lineWidth: 1,
        priceScaleId: 'atr_scale', // 使用獨立的價格軸
        scaleMargins: { top: 0, bottom: 0.8 }, // 佔用上方 20% 的空間
        lastValueVisible: true,
        priceLineVisible: false,
    });
    chart.priceScale('atr_scale').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 } // ATR 指標顯示在底部
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
    if (emaSeries) emaSeries.setData([]);
    // ** 新增: 清除 ATR 數據 **
    if (atrSeries) atrSeries.setData([]);
    htfPriceLines.forEach(line => chart.removePriceLine(line));
    htfPriceLines = [];
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

function drawHtfZone(price1, price2, color, title) {
    const lineOptions = {
        price: 0,
        color: color,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: `HTF ${title}`,
        axisLabelColor: '#1f2937',
        axisLabelTextColor: color,
    };
    const topLine = candleSeries.createPriceLine({ ...lineOptions, price: price1 });
    const bottomLine = candleSeries.createPriceLine({ ...lineOptions, price: price2 });
    
    priceLines.push(topLine, bottomLine);
}


export function redrawAllAnalyses(analyses, settings, htfAnalyses = null) {
    if (!candleSeries) return;

    clearDrawings();

    const { showLiquidity, showBOS, showCHoCH, showOrderBlocks, showBreakerBlocks, showFVGs, showMitigated, enableTrendFilter, enableATR } = settings;

    if (enableTrendFilter && analyses.ema) {
        const validEmaData = analyses.ema.filter(d => d.value !== undefined);
        emaSeries.setData(validEmaData);
    }

    // ** 新增: 繪製 ATR **
    if (enableATR && analyses.atr) {
        const validAtrData = analyses.atr.filter(d => d.value !== undefined);
        atrSeries.setData(validAtrData);
    }
    
    if (htfAnalyses) {
        const htfPois = [
            ...htfAnalyses.orderBlocks,
            ...htfAnalyses.fvgs,
            ...htfAnalyses.breakerBlocks
        ].filter(p => !p.isMitigated);

        htfPois.forEach(poi => {
            const color = poi.type === 'bullish' ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)';
            drawHtfZone(poi.top, poi.bottom, color, poi.type.toUpperCase());
        });
    }

    const fvgsToDraw = showMitigated ? analyses.fvgs : analyses.fvgs.filter(fvg => !fvg.isMitigated);
    const orderBlocksToDraw = showMitigated ? analyses.orderBlocks : analyses.orderBlocks.filter(ob => !ob.isMitigated);
    const breakerBlocksToDraw = showMitigated ? analyses.breakerBlocks : analyses.breakerBlocks.filter(bb => !bb.isMitigated);

    if (showFVGs && fvgsToDraw) {
        fvgsToDraw.forEach(fvg => drawZone(fvg.top, fvg.bottom, fvg.type === 'bullish' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)', 'FVG', LightweightCharts.LineStyle.Dashed));
    }
    if (showOrderBlocks && orderBlocksToDraw) {
        orderBlocksToDraw.forEach(ob => drawZone(ob.top, ob.bottom, ob.type === 'bullish' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)', 'OB', LightweightCharts.LineStyle.Solid, 2));
    }
    if (showBreakerBlocks && breakerBlocksToDraw) {
        breakerBlocksToDraw.forEach(bb => drawZone(bb.top, bb.bottom, 'rgba(139, 92, 246, 0.8)', 'Breaker', LightweightCharts.LineStyle.Solid, 2));
    }
    
    if (showLiquidity && analyses.liquidityGrabs) {
        for (const time in analyses.liquidityGrabs) {
            analyses.liquidityGrabs[time].forEach(marker => {
                markers.push({ ...marker, time: Number(time) });
            });
        }
    }
    
    if (showBOS && analyses.bosEvents) {
         analyses.bosEvents.forEach(bos => {
            const color = bos.marker.position === 'belowBar' ? 'rgba(59, 130, 246, 0.9)' : 'rgba(239, 68, 68, 0.9)'; 
            drawZone(bos.price, bos.price, color, 'BOS', LightweightCharts.LineStyle.Dotted, 2);
            markers.push(bos.marker);
        });
    }

    if (showCHoCH && analyses.chochEvents) {
         analyses.chochEvents.forEach(choch => {
            drawZone(choch.price, choch.price, 'rgba(245, 158, 11, 0.9)', 'CHoCH', LightweightCharts.LineStyle.Dotted, 2);
            markers.push(choch.marker);
        });
    }

    candleSeries.setMarkers(markers);
}
