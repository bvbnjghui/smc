// 使用 Alpine.js 的標準初始化方式，確保在 Alpine 準備就緒後才註冊元件
document.addEventListener('alpine:init', () => {
    // 使用 Alpine.data 來註冊一個名為 'app' 的可重用元件
    Alpine.data('app', () => {
        const loadInitialSettings = () => {
            const defaults = {
                symbol: 'BTCUSDT',
                interval: '15m',
                showLiquidity: true,
                showMSS: true,
                showOrderBlocks: true,
                showFVGs: true,
                isBacktestMode: false,
                backtestStartDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
                backtestEndDate: new Date().toISOString().split('T')[0],
                investmentAmount: 10000,
                riskPerTrade: 1,
                riskMultiGrab2: 1.5,
                riskMultiGrab3plus: 2,
                rrRatio: 2,
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

                return { ...settings, selectedPreset, customSymbol };

            } catch (e) {
                console.error('Failed to load settings from localStorage, using defaults.', e);
                return { ...defaults, selectedPreset: defaults.symbol, customSymbol: '' };
            }
        };

        const initialSettings = loadInitialSettings();

        return {
            apiUrl: 'https://smc-338857749184.europe-west1.run.app',
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
            mssLines: [],
            autoUpdate: false,
            updateIntervalId: null,
            currentCandles: [],
            isSidebarOpen: false,
            isHelpModalOpen: false,
            showLiquidity: initialSettings.showLiquidity,
            showMSS: initialSettings.showMSS,
            showOrderBlocks: initialSettings.showOrderBlocks,
            showFVGs: initialSettings.showFVGs,
            isBacktestMode: initialSettings.isBacktestMode,
            backtestStartDate: initialSettings.backtestStartDate,
            backtestEndDate: initialSettings.backtestEndDate,
            investmentAmount: initialSettings.investmentAmount,
            riskPerTrade: initialSettings.riskPerTrade,
            riskMultiGrab2: initialSettings.riskMultiGrab2,
            riskMultiGrab3plus: initialSettings.riskMultiGrab3plus,
            rrRatio: initialSettings.rrRatio,
            isSimulating: false,
            simulationResults: null,
            isSimulationModalOpen: false,

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
                this.$watch('showMSS', () => this.saveSettings());
                this.$watch('showOrderBlocks', () => this.saveSettings());
                this.$watch('showFVGs', () => this.saveSettings());
                this.$watch('isBacktestMode', (newValue) => {
                    if (!newValue) this.stopAutoUpdate();
                    this.saveSettings();
                });
                this.$watch('backtestStartDate', () => this.saveSettings());
                this.$watch('backtestEndDate', () => this.saveSettings());
                this.$watch('investmentAmount', () => this.saveSettings());
                this.$watch('riskPerTrade', () => this.saveSettings());
                this.$watch('riskMultiGrab2', () => this.saveSettings());
                this.$watch('riskMultiGrab3plus', () => this.saveSettings());
                this.$watch('rrRatio', () => this.saveSettings());
            },

            saveSettings() {
                const settings = {
                    symbol: this.symbol,
                    interval: this.interval,
                    showLiquidity: this.showLiquidity,
                    showMSS: this.showMSS,
                    showOrderBlocks: this.showOrderBlocks,
                    showFVGs: this.showFVGs,
                    isBacktestMode: this.isBacktestMode,
                    backtestStartDate: this.backtestStartDate,
                    backtestEndDate: this.backtestEndDate,
                    investmentAmount: this.investmentAmount,
                    riskPerTrade: this.riskPerTrade,
                    riskMultiGrab2: this.riskMultiGrab2,
                    riskMultiGrab3plus: this.riskMultiGrab3plus,
                    rrRatio: this.rrRatio,
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

            toggleAutoUpdate() {
                if (this.autoUpdate && !this.isBacktestMode) {
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

                const analyses = this.analyzeAll(this.currentCandles);

                if (this.showFVGs) {
                    analyses.fvgs.forEach(fvg => this.drawZone(this.fvgLines, fvg.top, fvg.bottom, fvg.type === 'bullish' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)', fvg.type === 'bullish' ? '看漲 FVG' : '看跌 FVG', LightweightCharts.LineStyle.Dashed));
                }
                if (this.showOrderBlocks) {
                    analyses.orderBlocks.forEach(ob => this.drawZone(this.orderBlockLines, ob.top, ob.bottom, ob.type === 'bullish' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)', ob.type === 'bullish' ? '看漲 OB' : '看跌 OB', LightweightCharts.LineStyle.Solid, 2));
                }
                
                let markersToDraw = [];
                if (this.showLiquidity) {
                    for (const time in analyses.liquidityGrabs) {
                        analyses.liquidityGrabs[time].forEach(marker => {
                            markersToDraw.push({ ...marker, time: Number(time) });
                        });
                    }
                }
                if (this.showMSS) {
                     analyses.mss.forEach(mss => {
                        this.drawZone(this.mssLines, mss.price, mss.price, 'rgba(59, 130, 246, 0.8)', 'MSS', LightweightCharts.LineStyle.Dotted, 2);
                        markersToDraw.push(mss.marker);
                    });
                }
                this.candleSeries.setMarkers(markersToDraw);
            },

            analyzeAll(candles) {
                const swingPoints = this.analyzeAndGetSwingPoints(candles);
                const liquidityGrabs = this.analyzeLiquidityGrabs(candles, swingPoints);
                return {
                    swingPoints,
                    liquidityGrabs,
                    mss: this.analyzeAndGetMSS(candles, swingPoints, liquidityGrabs),
                    orderBlocks: this.analyzeAndGetOrderBlocks(candles),
                    fvgs: this.analyzeAndGetFVGs(candles),
                };
            },

            analyzeAndGetSwingPoints(candles) {
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
            },

            analyzeLiquidityGrabs(candles, swingPoints) {
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
            },

            analyzeAndGetMSS(candles, swingPoints, liquidityGrabs) {
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
                                    const protectionHigh = swingHighs.filter(sh => sh.index > relevantLow.index && sh.index < i).pop();
                                    // ** 修正：新增空值檢查 **
                                    if (protectionHigh) {
                                        for (let j = i + 1; j < candles.length; j++) {
                                            if (candles[j].close > protectionHigh.price) {
                                                isInvalidated = true;
                                                break;
                                            }
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
                                    const protectionLow = swingLows.filter(sl => sl.index > relevantHigh.index && sl.index < i).pop();
                                     // ** 修正：新增空值檢查 **
                                     if (protectionLow) {
                                        for (let j = i + 1; j < candles.length; j++) {
                                            if (candles[j].close < protectionLow.price) {
                                                isInvalidated = true;
                                                break;
                                            }
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
            },
            
            analyzeAndGetFVGs(candles) {
                const results = [];
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
                            results.push({ type: 'bullish', top: fvgTop, bottom: fvgBottom, index: i });
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
                            results.push({ type: 'bearish', top: fvgTop, bottom: fvgBottom, index: i });
                        }
                    }
                }
                return results;
            },

            analyzeAndGetOrderBlocks(candles) {
                const results = [];
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
                            results.push({ type: 'bearish', top: obTop, bottom: obBottom, index: i });
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
                            results.push({ type: 'bullish', top: obTop, bottom: obBottom, index: i });
                        }
                    }
                }
                return results;
            },

            findNearestPOI(currentIndex, type, orderBlocks, fvgs) {
                const pois = [...orderBlocks, ...fvgs]
                    .filter(p => p.type === type && p.index < currentIndex)
                    .sort((a, b) => b.index - a.index);
                return pois.length > 0 ? pois[0] : null;
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
                this.mssLines.forEach(line => this.candleSeries.removePriceLine(line));
                this.fvgLines = [];
                this.orderBlockLines = [];
                this.mssLines = [];
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
                    let response;
                    let url;
                    if (this.isBacktestMode) {
                        const startTime = new Date(this.backtestStartDate).getTime();
                        const endTime = new Date(this.backtestEndDate).getTime();
                        url = `${this.apiUrl}/api/historical-klines?symbol=${this.symbol}&interval=${this.interval}&startTime=${startTime}&endTime=${endTime}`;
                    } else {
                        const limit = isUpdate ? 2 : 500;
                        url = `${this.apiUrl}/api/klines?symbol=${this.symbol}&interval=${this.interval}&limit=${limit}`;
                    }
                    response = await fetch(url);
                    
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

                    if (isUpdate && !this.isBacktestMode) {
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
            },
            
            runBacktestSimulation() {
                if (!this.isBacktestMode || this.currentCandles.length === 0) {
                    alert('請先在回測模式下，載入歷史數據。');
                    return;
                }
                this.isSimulating = true;
                
                setTimeout(() => {
                    let equity = this.investmentAmount;
                    const trades = [];
                    const rrRatio = this.rrRatio;

                    const analyses = this.analyzeAll(this.currentCandles);
                    const { liquidityGrabs, mss, orderBlocks, fvgs } = analyses;

                    let activeTrade = null;
                    let waitingForMSS = null;

                    for (let i = 0; i < this.currentCandles.length; i++) {
                        const candle = this.currentCandles[i];

                        if (activeTrade) {
                            let exitPrice = null;
                            if (activeTrade.direction === 'LONG' && candle.high >= activeTrade.takeProfit) exitPrice = activeTrade.takeProfit;
                            if (activeTrade.direction === 'LONG' && candle.low <= activeTrade.stopLoss) exitPrice = activeTrade.stopLoss;
                            if (activeTrade.direction === 'SHORT' && candle.low <= activeTrade.takeProfit) exitPrice = activeTrade.takeProfit;
                            if (activeTrade.direction === 'SHORT' && candle.high >= activeTrade.stopLoss) exitPrice = activeTrade.stopLoss;

                            if (exitPrice) {
                                const pnl = (exitPrice - activeTrade.entryPrice) * activeTrade.size * (activeTrade.direction === 'LONG' ? 1 : -1);
                                equity += pnl;
                                trades.push({ ...activeTrade, exitPrice, pnl });
                                activeTrade = null;
                            }
                        }
                        
                        const mssEvent = mss.find(m => m.marker.time === candle.time);
                        if (mssEvent && waitingForMSS) {
                            const direction = waitingForMSS.type === 'SSL' ? 'bullish' : 'bearish';
                            const poi = this.findNearestPOI(i, direction, orderBlocks, fvgs);
                            if (poi) {
                                let riskPercent = this.riskPerTrade;
                                if (waitingForMSS.grabCount === 2) riskPercent = this.riskMultiGrab2;
                                if (waitingForMSS.grabCount >= 3) riskPercent = this.riskMultiGrab3plus;
                                const riskPerTrade = riskPercent / 100;

                                if (direction === 'bullish') {
                                    const entryPrice = poi.top;
                                    const stopLoss = poi.bottom;
                                    const risk = entryPrice - stopLoss;
                                    if (risk > 0) {
                                        const takeProfit = entryPrice + risk * rrRatio;
                                        const size = (equity * riskPerTrade) / risk;
                                        activeTrade = { direction: 'LONG', entryTime: candle.time, entryPrice, stopLoss, takeProfit, size };
                                    }
                                } else { // bearish
                                    const entryPrice = poi.bottom;
                                    const stopLoss = poi.top;
                                    const risk = stopLoss - entryPrice;
                                    if (risk > 0) {
                                        const takeProfit = entryPrice - risk * rrRatio;
                                        const size = (equity * riskPerTrade) / risk;
                                        activeTrade = { direction: 'SHORT', entryTime: candle.time, entryPrice, stopLoss, takeProfit, size };
                                    }
                                }
                            }
                            waitingForMSS = null;
                        }

                        if (activeTrade) continue;

                        const grabsOnThisCandle = liquidityGrabs[candle.time];
                        if (grabsOnThisCandle && grabsOnThisCandle.length > 0) {
                            const grabType = grabsOnThisCandle[0].text;
                            waitingForMSS = { type: grabType, grabCount: grabsOnThisCandle.length };
                        }
                    }

                    const totalTrades = trades.length;
                    const wins = trades.filter(t => t.pnl > 0).length;
                    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
                    const netPnl = equity - this.investmentAmount;
                    const pnlPercent = (netPnl / this.investmentAmount) * 100;

                    this.simulationResults = {
                        finalEquity: equity,
                        netPnl,
                        pnlPercent,
                        winRate,
                        totalTrades,
                        trades,
                    };

                    this.isSimulating = false;
                    this.isSimulationModalOpen = true;
                }, 100);
            },
        }
    });
});
