// 使用 Alpine.js 的標準初始化方式，確保在 Alpine 準備就緒後才註冊元件
document.addEventListener('alpine:init', () => {
    // 使用 Alpine.data 來註冊一個名為 'app' 的可重用元件
    Alpine.data('app', () => {
        const loadInitialSettings = () => {
            const defaults = {
                symbol: 'BTCUSDT',
                interval: '15m',
                showLiquidity: true,
                showOrderBlocks: true,
                showFVGs: true,
            };
            const commonSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

            try {
                const savedSettings = localStorage.getItem('smcAnalyzerSettings');
                const settings = savedSettings ? { ...defaults, ...JSON.parse(savedSettings) } : defaults;

                const savedSymbol = (settings.symbol || defaults.symbol).toUpperCase();
                let selectedPreset;
                let customSymbol;

                if (commonSymbols.includes(savedSymbol)) {
                    selectedPreset = savedSymbol;
                    customSymbol = '';
                } else {
                    selectedPreset = 'CUSTOM';
                    customSymbol = savedSymbol;
                }

                return {
                    selectedPreset,
                    customSymbol,
                    interval: settings.interval,
                    showLiquidity: settings.showLiquidity,
                    showOrderBlocks: settings.showOrderBlocks,
                    showFVGs: settings.showFVGs,
                };

            } catch (e) {
                console.error('Failed to load settings from localStorage, using defaults.', e);
                return {
                    selectedPreset: defaults.symbol,
                    customSymbol: '',
                    interval: defaults.interval,
                    showLiquidity: defaults.showLiquidity,
                    showOrderBlocks: defaults.showOrderBlocks,
                    showFVGs: defaults.showFVGs,
                };
            }
        };

        const initialSettings = loadInitialSettings();

        return {
            apiUrl: 'https://smc-338857749184.europe-west1.run.app/api/klines',
            commonSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
            selectedPreset: initialSettings.selectedPreset,
            customSymbol: initialSettings.customSymbol,
            interval: initialSettings.interval,
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
            autoUpdate: false,
            updateIntervalId: null,
            currentCandles: [],
            isSidebarOpen: false,
            isHelpModalOpen: false,
            showLiquidity: initialSettings.showLiquidity,
            showOrderBlocks: initialSettings.showOrderBlocks,
            showFVGs: initialSettings.showFVGs,

            get symbol() {
                if (this.selectedPreset === 'CUSTOM') {
                    return this.customSymbol.toUpperCase();
                }
                return this.selectedPreset;
            },

            init() {
                this.setupChart();
                if (this.chart) {
                    this.fetchData();
                }
                this.$watch('symbol', () => this.saveSettings());
                this.$watch('interval', () => this.saveSettings());
                this.$watch('showLiquidity', () => this.saveSettings());
                this.$watch('showOrderBlocks', () => this.saveSettings());
                this.$watch('showFVGs', () => this.saveSettings());
            },

            saveSettings() {
                const settings = {
                    symbol: this.symbol,
                    interval: this.interval,
                    showLiquidity: this.showLiquidity,
                    showOrderBlocks: this.showOrderBlocks,
                    showFVGs: this.showFVGs,
                };
                localStorage.setItem('smcAnalyzerSettings', JSON.stringify(settings));
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
                        // ** 修正：移除固定的邊界設定，改由下方的 autoscaleInfoProvider 全權控制 **
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
                
                // ** 新增：使用 autoscaleInfoProvider 來手動控制縱軸的縮放行為 **
                this.candleSeries.priceScale().applyOptions({
                    autoscaleInfoProvider: () => {
                        if (!this.currentCandles || this.currentCandles.length === 0) {
                            return null;
                        }

                        const visibleRange = this.chart.timeScale().getVisibleLogicalRange();
                        if (!visibleRange) {
                            return null;
                        }

                        const visibleCandles = this.currentCandles.slice(
                            Math.max(0, Math.floor(visibleRange.from)),
                            Math.min(this.currentCandles.length, Math.ceil(visibleRange.to))
                        );

                        if (visibleCandles.length === 0) {
                            return null;
                        }
                        
                        let minPrice = visibleCandles[0].low;
                        let maxPrice = visibleCandles[0].high;

                        for (let i = 1; i < visibleCandles.length; i++) {
                            minPrice = Math.min(minPrice, visibleCandles[i].low);
                            maxPrice = Math.max(maxPrice, visibleCandles[i].high);
                        }

                        // 手動增加固定的上下邊界，確保空間永遠足夠
                        const padding = (maxPrice - minPrice) * 0.2; // 上下各增加 20% 的空間
                        
                        return {
                            priceRange: {
                                minValue: minPrice - padding,
                                maxValue: maxPrice + padding,
                            },
                        };
                    },
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

            toggleAutoUpdate() {
                if (this.autoUpdate) {
                    this.updateIntervalId = setInterval(() => {
                        this.fetchData(true);
                    }, 15000);
                } else {
                    this.stopAutoUpdate();
                }
            },

            stopAutoUpdate() {
                clearInterval(this.updateIntervalId);
                this.updateIntervalId = null;
                this.autoUpdate = false;
            },

            redrawAllAnalyses() {
                this.clearAllDrawings();
                if (this.currentCandles.length === 0) return;

                if (this.showFVGs) {
                    this.analyzeAndDrawFVGs(this.currentCandles);
                }
                if (this.showOrderBlocks) {
                    this.analyzeAndDrawOrderBlocks(this.currentCandles);
                }
                if (this.showLiquidity) {
                    const liquidityMarkers = this.analyzeLiquidityGrabs(this.currentCandles);
                    this.candleSeries.setMarkers(liquidityMarkers);
                } else {
                    this.candleSeries.setMarkers([]);
                }
                
                // ** 新增：手動觸發價格軸的重新計算 **
                // 透過輕微調整可視範圍，來強制 autoscaleInfoProvider 重新執行
                const logicalRange = this.chart.timeScale().getVisibleLogicalRange();
                if (logicalRange) {
                    this.chart.timeScale().setVisibleLogicalRange(logicalRange);
                }
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
                this.candleSeries.setMarkers([]);
            },

            async fetchData(isUpdate = false) {
                if (!this.candleSeries || !this.volumeSeries) {
                    this.error = '圖表尚未初始化，無法載入數據。';
                    return;
                }

                if (!isUpdate) {
                    this.stopAutoUpdate();
                    this.isLoading = true;
                }

                this.error = '';
                try {
                    const limit = isUpdate ? 2 : 500;
                    const response = await fetch(`${this.apiUrl}?symbol=${this.symbol}&interval=${this.interval}&limit=${limit}`);
                    
                    if (!response.ok) {
                        throw new Error(`API 請求失敗，狀態碼: ${response.status}`);
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

                    if (isUpdate) {
                        const lastCandle = this.currentCandles[this.currentCandles.length - 1];
                        const newCandle = candles[candles.length - 1];
                        
                        if (newCandle && (!lastCandle || newCandle.time > lastCandle.time)) {
                            this.currentCandles.push(newCandle);
                        } else if (newCandle && lastCandle && newCandle.time === lastCandle.time) {
                            this.currentCandles[this.currentCandles.length - 1] = newCandle;
                        }
                        this.candleSeries.setData(this.currentCandles);
                        this.volumeSeries.setData(volumes.map((v, i) => ({...v, time: this.currentCandles[i].time}))); // This is a simplification
                        this.redrawAllAnalyses();

                    } else {
                        this.currentCandles = candles;
                        this.candleSeries.setData(candles);
                        this.volumeSeries.setData(volumes);
                        this.redrawAllAnalyses();

                        if (candles.length > 0) {
                            const barsToShow = 30;
                            const from = Math.max(0, candles.length - barsToShow);
                            const to = candles.length - 1;
                            this.chart.timeScale().setVisibleLogicalRange({ from, to });
                        }
                    }

                } catch (e) {
                    this.error = `載入數據失敗: ${e.message}`;
                    console.error(e);
                    this.stopAutoUpdate();
                } finally {
                    if (!isUpdate) {
                        this.isLoading = false;
                    }
                }
            }
        }
    });
});
