// 使用 Alpine.js 的標準初始化方式，確保在 Alpine 準備就緒後才註冊元件
document.addEventListener('alpine:init', () => {
    // 使用 Alpine.data 來註冊一個名為 'app' 的可重用元件
    Alpine.data('app', () => ({
        apiUrl: 'https://smc-338857749184.europe-west1.run.app/api/klines',
        symbol: 'BTCUSDT',
        interval: '15m',
        intervals: [
            { value: '1m', label: '1 分鐘' },
            { value: '5m', label: '5 分鐘' },
            { value: '15m', label: '15 分鐘' },
            { value: '1h', label: '1 小時' },
            { value: '4h', label: '4 小時' },
            { value: '1d', label: '1 日' },
        ],
        isLoading: false,
        error: '',
        chart: null,
        candleSeries: null,
        volumeSeries: null,
        fvgLines: [],
        orderBlockLines: [],
        showHelp: false,

        init() {
            // Alpine.js 會自動處理 this.$nextTick，這裡可以直接呼叫
            this.setupChart();
            if (this.chart) {
                this.fetchData();
            }
        },

        setupChart() {
            const container = document.getElementById('chart');
            if (!container) {
                console.error("找不到 ID 為 'chart' 的元素");
                return;
            }
            this.chart = LightweightCharts.createChart(container, {
                layout: {
                    background: { color: '#1f2937' },
                    textColor: '#d1d5db',
                },
                grid: {
                    vertLines: { color: '#374151' },
                    horzLines: { color: '#374151' },
                },
                handleScroll: {
                    mouseWheel: true,
                },
                handleScale: {
                    axisPressedMouseMove: true,
                    mouseWheel: true,
                    pinch: true,
                    axisDoubleClickReset: true,
                },
                rightPriceScale: {
                    borderColor: '#4b5563',
                    scaleMargins: {
                        top: 0.3,
                        bottom: 0.25,
                    },
                    formatter: price => {
                        if (price > 1000) return price.toFixed(2);
                        if (price > 1) return price.toFixed(4);
                        return price.toPrecision(4);
                    }
                },
                timeScale: {
                    borderColor: '#4b5563',
                    rightOffset: 12,
                    timeVisible: true,
                    barSpacing: 8,
                },
            });

            this.candleSeries = this.chart.addCandlestickSeries({
                upColor: '#10b981',
                downColor: '#ef4444',
                borderUpColor: '#10b981',
                borderDownColor: '#ef4444',
                wickUpColor: '#10b981',
                wickDownColor: '#ef4444',
            });

            this.volumeSeries = this.chart.addHistogramSeries({
                color: '#26a69a',
                priceFormat: {
                    type: 'volume',
                },
                priceScaleId: '', 
                scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                },
            });

            new ResizeObserver(entries => {
                if (entries.length === 0 || entries[0].target.offsetHeight === 0) {
                    return;
                }
                const { width, height } = entries[0].contentRect;
                this.chart.applyOptions({ width, height });
            }).observe(container);
        },

        analyzeAndDrawFVGs(candles) {
            for (let i = 1; i < candles.length - 1; i++) {
                const prevCandle = candles[i - 1];
                const nextCandle = candles[i + 1];
                if (prevCandle.low > nextCandle.high) {
                    const fvgTop = prevCandle.low;
                    const fvgBottom = nextCandle.high;
                    let isMitigated = false;
                    for (let j = i + 2; j < candles.length; j++) {
                        if (candles[j].low <= fvgTop) { isMitigated = true; break; }
                    }
                    if (!isMitigated) {
                        this.drawZone(this.fvgLines, fvgTop, fvgBottom, 'rgba(16, 185, 129, 0.8)', '看漲 FVG', LightweightCharts.LineStyle.Dashed);
                    }
                }
                if (prevCandle.high < nextCandle.low) {
                    const fvgTop = nextCandle.low;
                    const fvgBottom = prevCandle.high;
                    let isMitigated = false;
                    for (let j = i + 2; j < candles.length; j++) {
                        if (candles[j].high >= fvgBottom) { isMitigated = true; break; }
                    }
                    if (!isMitigated) {
                        this.drawZone(this.fvgLines, fvgTop, fvgBottom, 'rgba(239, 68, 68, 0.8)', '看跌 FVG', LightweightCharts.LineStyle.Dashed);
                    }
                }
            }
        },

        analyzeAndDrawOrderBlocks(candles) {
            for (let i = 0; i < candles.length - 1; i++) {
                const orderBlockCandle = candles[i];
                const breakCandle = candles[i + 1];
                if (orderBlockCandle.close > orderBlockCandle.open && breakCandle.close < orderBlockCandle.low) {
                    const obTop = orderBlockCandle.high;
                    const obBottom = orderBlockCandle.low;
                    let isMitigated = false;
                    for (let j = i + 2; j < candles.length; j++) {
                        if (candles[j].high >= obBottom) { isMitigated = true; break; }
                    }
                    if (!isMitigated) {
                        this.drawZone(this.orderBlockLines, obTop, obBottom, 'rgba(239, 68, 68, 0.8)', '看跌 OB', LightweightCharts.LineStyle.Solid, 2);
                    }
                }
                if (orderBlockCandle.close < orderBlockCandle.open && breakCandle.close > orderBlockCandle.high) {
                    const obTop = orderBlockCandle.high;
                    const obBottom = orderBlockCandle.low;
                    let isMitigated = false;
                    for (let j = i + 2; j < candles.length; j++) {
                        if (candles[j].low <= obTop) { isMitigated = true; break; }
                    }
                    if (!isMitigated) {
                        this.drawZone(this.orderBlockLines, obTop, obBottom, 'rgba(16, 185, 129, 0.8)', '看漲 OB', LightweightCharts.LineStyle.Solid, 2);
                    }
                }
            }
        },
        
        analyzeLiquidityGrabs(candles) {
            const markers = [];
            const swingHighs = [];
            const swingLows = [];

            for (let i = 1; i < candles.length - 1; i++) {
                const prev = candles[i - 1];
                const current = candles[i];
                const next = candles[i + 1];
                if (current.high > prev.high && current.high > next.high) {
                    swingHighs.push({ index: i, price: current.high, grabbed: false });
                }
                if (current.low < prev.low && current.low < next.low) {
                    swingLows.push({ index: i, price: current.low, grabbed: false });
                }
            }

            for (let i = 0; i < candles.length; i++) {
                for (const sh of swingHighs) {
                    if (!sh.grabbed && i > sh.index && candles[i].high > sh.price) {
                        markers.push({
                            time: candles[i].time,
                            position: 'aboveBar',
                            color: '#ef4444',
                            shape: 'arrowDown',
                            text: 'BSL'
                        });
                        sh.grabbed = true;
                    }
                }
                for (const sl of swingLows) {
                    if (!sl.grabbed && i > sl.index && candles[i].low < sl.price) {
                        markers.push({
                            time: candles[i].time,
                            position: 'belowBar',
                            color: '#10b981',
                            shape: 'arrowUp',
                            text: 'SSL'
                        });
                        sl.grabbed = true;
                    }
                }
            }
            return markers;
        },

        drawZone(lineArray, price1, price2, color, title, lineStyle, lineWidth = 1) {
            const lineOptions = {
                price: 0,
                color: color,
                lineWidth: lineWidth,
                lineStyle: lineStyle,
                axisLabelVisible: true,
                title: title,
            };
            const topLine = this.candleSeries.createPriceLine({ ...lineOptions, price: price1 });
            const bottomLine = this.candleSeries.createPriceLine({ ...lineOptions, price: price2 });
            lineArray.push(topLine, bottomLine);
        },

        clearAllDrawings() {
            this.fvgLines.forEach(line => this.candleSeries.removePriceLine(line));
            this.orderBlockLines.forEach(line => this.candleSeries.removePriceLine(line));
            this.fvgLines = [];
            this.orderBlockLines = [];
        },

        async fetchData() {
            if (!this.candleSeries || !this.volumeSeries) {
                this.error = '圖表尚未初始化，無法載入數據。';
                return;
            }

            this.isLoading = true;
            this.error = '';
            try {
                this.clearAllDrawings();

                const response = await fetch(`${this.apiUrl}?symbol=${this.symbol}&interval=${this.interval}`);
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API 請求失敗，狀態碼: ${response.status}. 回應: ${errorText}`);
                }
                const rawData = await response.json();
                
                const candles = rawData.map(d => ({
                    time: d[0] / 1000,
                    open: parseFloat(d[1]),
                    high: parseFloat(d[2]),
                    low: parseFloat(d[3]),
                    close: parseFloat(d[4]),
                }));
                
                const volumes = rawData.map(d => ({
                    time: d[0] / 1000,
                    value: parseFloat(d[5]),
                    color: parseFloat(d[4]) >= parseFloat(d[1]) ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
                }));

                this.candleSeries.setData(candles);
                this.volumeSeries.setData(volumes);

                this.analyzeAndDrawFVGs(candles);
                this.analyzeAndDrawOrderBlocks(candles);
                const liquidityMarkers = this.analyzeLiquidityGrabs(candles);
                this.candleSeries.setMarkers(liquidityMarkers);

                // ** 修正：將圖表視野設定在最新的 80 根 K 棒上，確保右側可見 **
                if (candles.length > 0) {
                    const barsToShow = 80;
                    const from = Math.max(0, candles.length - barsToShow);
                    const to = candles.length - 1;
                    this.chart.timeScale().setVisibleLogicalRange({ from, to });
                }

            } catch (e) {
                this.error = `載入數據失敗: ${e.message}`;
                console.error(e);
            } finally {
                this.isLoading = false;
            }
        }
    }));
});
