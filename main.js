// smc/main.js

/**
 * @file 應用程式主入口檔案。
 * 負責載入 HTML 元件、匯入並啟動 Alpine.js、整合所有模組並管理 UI 狀態。
 */

import Alpine from 'https://unpkg.com/alpinejs@3.x.x/dist/module.esm.js';
import collapse from 'https://unpkg.com/@alpinejs/collapse@3.x.x/dist/module.esm.js';
import anchor from 'https://unpkg.com/@alpinejs/anchor@3.x.x/dist/module.esm.js';

import { fetchKlines } from './modules/api.js';
import { setupChart, updateChartData, fitChart, redrawAllAnalyses } from './modules/chart-controller.js';
import { analyzeAll, calculateEMA } from './modules/smc-analyzer.js';
import { runBacktestSimulation } from './modules/backtester.js';

async function loadComponent(componentName, containerId) {
    try {
        const response = await fetch(`/smc/components/${componentName}.html`);
        if (!response.ok) throw new Error(`無法載入元件 ${componentName}: ${response.statusText}`);
        const html = await response.text();
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = html;
        else console.error(`找不到 ID 為 '${containerId}' 的容器`);
    } catch (error) {
        console.error(`載入元件 ${componentName} 失敗:`, error);
    }
}

async function loadAllComponents() {
    const modalComponents = `
        <div id="help-modal-placeholder"></div>
        <div id="simulation-settings-modal-placeholder"></div>
        <div id="simulation-results-modal-placeholder"></div>
    `;
    document.getElementById('modals-container').innerHTML = modalComponents;

    await Promise.all([
        loadComponent('sidebar', 'sidebar-container'),
        loadComponent('header', 'header-container'),
        loadComponent('help-modal', 'help-modal-placeholder'),
        loadComponent('simulation-settings-modal', 'simulation-settings-modal-placeholder'),
        loadComponent('simulation-results-modal', 'simulation-results-modal-placeholder')
    ]);
}

const appComponent = () => {
    const loadInitialSettings = () => {
        const defaults = {
            symbol: 'BTCUSDT',
            commonSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
            interval: '15m',
            showLiquidity: true,
            showMSS: true,
            showCHoCH: true,
            showOrderBlocks: true,
            showBreakerBlocks: true,
            showFVGs: true,
            showMitigated: false,
            analyzeVisibleRangeOnly: false,
            isBacktestMode: false,
            backtestStartDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
            backtestEndDate: new Date().toISOString().split('T')[0],
            investmentAmount: 10000,
            riskPerTrade: 1,
            riskMultiGrab2: 1.5,
            riskMultiGrab3plus: 2,
            rrRatio: 2,
            setupExpirationCandles: 30,
            enableTrendFilter: false,
            emaPeriod: 50,
            // ** 新增：MTA 預設值 **
            enableMTA: false,
            higherTimeframe: '4h',
        };

        try {
            const savedSettings = localStorage.getItem('smcAnalyzerSettings');
            const settings = savedSettings ? { ...defaults, ...JSON.parse(savedSettings) } : defaults;
            
            if (!Array.isArray(settings.commonSymbols) || settings.commonSymbols.length === 0) {
                settings.commonSymbols = defaults.commonSymbols;
            }
            if (!settings.commonSymbols.includes(settings.symbol)) {
                settings.symbol = settings.commonSymbols[0] || defaults.symbol;
            }

            return settings;
        } catch (e) {
            console.error('從 localStorage 載入設定失敗，將使用預設值。', e);
            return defaults;
        }
    };

    const initialSettings = loadInitialSettings();

    return {
        // --- 狀態 (State) ---
        symbol: initialSettings.symbol,
        commonSymbols: initialSettings.commonSymbols,
        newCustomSymbol: '',
        
        interval: initialSettings.interval,
        intervals: [
            { value: '1m', label: '1 分鐘' }, { value: '5m', label: '5 分鐘' },
            { value: '15m', label: '15 分鐘' }, { value: '1h', label: '1 小時' },
            { value: '4h', label: '4 小時' }, { value: '1d', label: '1 日' },
        ],
        isLoading: false,
        error: '',
        currentCandles: [],
        isSidebarOpen: false,
        isHelpModalOpen: false,
        autoUpdate: false,
        updateIntervalId: null,

        // --- 圖表顯示設定 ---
        showLiquidity: initialSettings.showLiquidity,
        showMSS: initialSettings.showMSS,
        showCHoCH: initialSettings.showCHoCH,
        showOrderBlocks: initialSettings.showOrderBlocks,
        showBreakerBlocks: initialSettings.showBreakerBlocks,
        showFVGs: initialSettings.showFVGs,
        showMitigated: initialSettings.showMitigated,
        analyzeVisibleRangeOnly: initialSettings.analyzeVisibleRangeOnly,
        visibleRange: null,
        enableTrendFilter: initialSettings.enableTrendFilter,
        emaPeriod: initialSettings.emaPeriod,
        // ** 新增：MTA 狀態 **
        enableMTA: initialSettings.enableMTA,
        higherTimeframe: initialSettings.higherTimeframe,
        higherTimeframeCandles: [],
        
        // --- 回測相關狀態 ---
        isBacktestMode: initialSettings.isBacktestMode,
        backtestStartDate: initialSettings.backtestStartDate,
        backtestEndDate: initialSettings.backtestEndDate,
        investmentAmount: initialSettings.investmentAmount,
        riskPerTrade: initialSettings.riskPerTrade,
        riskMultiGrab2: initialSettings.riskMultiGrab2,
        riskMultiGrab3plus: initialSettings.riskMultiGrab3plus,
        rrRatio: initialSettings.rrRatio,
        setupExpirationCandles: initialSettings.setupExpirationCandles,
        isSimulating: false,
        simulationResults: null,
        isSimulationModalOpen: false,
        isSimulationSettingsModalOpen: false,

        // ** 新增：計算可用的高時間週期選項 **
        get availableHigherTimeframes() {
            const currentIndex = this.intervals.findIndex(i => i.value === this.interval);
            return this.intervals.slice(currentIndex + 1);
        },

        init() {
            console.log('Alpine component initialized.');
            setupChart('chart', this.onVisibleRangeChanged.bind(this));
            this.fetchData();

            const settingsToWatch = [
                'symbol', 'commonSymbols', 'interval', 'showLiquidity', 'showMSS', 'showCHoCH', 'showOrderBlocks', 'showBreakerBlocks', 'showFVGs', 'showMitigated', 'analyzeVisibleRangeOnly',
                'isBacktestMode', 'backtestStartDate', 'backtestEndDate', 'investmentAmount',
                'riskPerTrade', 'riskMultiGrab2', 'riskMultiGrab3plus', 'rrRatio', 'setupExpirationCandles',
                'enableTrendFilter', 'emaPeriod', 'enableMTA', 'higherTimeframe'
            ];
            settingsToWatch.forEach(setting => {
                this.$watch(setting, (newValue, oldValue) => {
                    if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
                       this.saveSettings();
                    }
                });
            });
            
            this.$watch('isBacktestMode', (newValue) => {
                if (!newValue) this.stopAutoUpdate();
            });
            
            // ** 新增：當 LTF 改變時，確保 HTF 仍然有效 **
            this.$watch('interval', () => {
                if (!this.availableHigherTimeframes.find(i => i.value === this.higherTimeframe)) {
                    this.higherTimeframe = this.availableHigherTimeframes[0]?.value || '';
                }
            });
        },

        saveSettings() {
            const settings = {
                symbol: this.symbol, commonSymbols: this.commonSymbols,
                interval: this.interval, showLiquidity: this.showLiquidity,
                showMSS: this.showMSS, showCHoCH: this.showCHoCH, showOrderBlocks: this.showOrderBlocks,
                showBreakerBlocks: this.showBreakerBlocks, showFVGs: this.showFVGs,
                showMitigated: this.showMitigated, analyzeVisibleRangeOnly: this.analyzeVisibleRangeOnly,
                isBacktestMode: this.isBacktestMode, backtestStartDate: this.backtestStartDate,
                backtestEndDate: this.backtestEndDate, investmentAmount: this.investmentAmount,
                riskPerTrade: this.riskPerTrade, riskMultiGrab2: this.riskMultiGrab2,
                riskMultiGrab3plus: this.riskMultiGrab3plus, rrRatio: this.rrRatio,
                setupExpirationCandles: this.setupExpirationCandles,
                enableTrendFilter: this.enableTrendFilter, emaPeriod: this.emaPeriod,
                enableMTA: this.enableMTA, higherTimeframe: this.higherTimeframe,
            };
            localStorage.setItem('smcAnalyzerSettings', JSON.stringify(settings));
        },

        selectSymbol(selected) {
            this.symbol = selected;
            this.stopAutoUpdate();
        },

        addSymbol() {
            const newSymbol = this.newCustomSymbol.trim().toUpperCase();
            if (newSymbol && !this.commonSymbols.includes(newSymbol)) {
                this.commonSymbols.push(newSymbol);
                this.newCustomSymbol = '';
            }
        },

        removeSymbol(symbolToRemove) {
            this.commonSymbols = this.commonSymbols.filter(s => s !== symbolToRemove);
            if (this.symbol === symbolToRemove) {
                this.symbol = this.commonSymbols[0] || '';
            }
        },

        async fetchData() {
            if (this.isLoading || !this.symbol) return;
            this.stopAutoUpdate();
            this.isLoading = true;
            this.error = '';
            try {
                // ** 修改：同時獲取 LTF 和 HTF 數據 **
                const ltfParams = {
                    symbol: this.symbol, interval: this.interval, isBacktestMode: this.isBacktestMode,
                    backtestStartDate: this.backtestStartDate, backtestEndDate: this.backtestEndDate,
                };
                const ltfPromise = fetchKlines(ltfParams);

                let htfPromise = Promise.resolve(null);
                if (this.enableMTA && this.higherTimeframe) {
                    const htfParams = { ...ltfParams, interval: this.higherTimeframe };
                    htfPromise = fetchKlines(htfParams);
                }

                const [ltfResult, htfResult] = await Promise.all([ltfPromise, htfPromise]);
                
                this.currentCandles = ltfResult.candles;
                this.higherTimeframeCandles = htfResult ? htfResult.candles : [];
                
                updateChartData(ltfResult.candles, ltfResult.volumes);
                this.redrawChartAnalyses();
                fitChart(ltfResult.candles.length);
            } catch (e) {
                this.error = `載入數據失敗: ${e.message}`;
                console.error(e);
            } finally {
                this.isLoading = false;
            }
        },

        onVisibleRangeChanged(newRange) {
            this.visibleRange = newRange;
            if (this.analyzeVisibleRangeOnly) {
                this.redrawChartAnalyses();
            }
        },

        redrawChartAnalyses() {
            if (this.currentCandles.length === 0) return;

            let candlesForStandardAnalysis = this.currentCandles;
            if (this.analyzeVisibleRangeOnly && this.visibleRange) {
                const from = Math.floor(this.visibleRange.from);
                const to = Math.ceil(this.visibleRange.to);
                candlesForStandardAnalysis = this.currentCandles.slice(from, to);
            }
            
            const analyses = analyzeAll(candlesForStandardAnalysis, { enableTrendFilter: false });

            if (this.enableTrendFilter) {
                analyses.ema = calculateEMA(this.currentCandles, this.emaPeriod);
            }
            
            // ** 新增：如果啟用 MTA，則分析 HTF 數據 **
            let htfAnalyses = null;
            if (this.enableMTA && this.higherTimeframeCandles.length > 0) {
                htfAnalyses = analyzeAll(this.higherTimeframeCandles, { enableTrendFilter: false });
            }
            
            const displaySettings = {
                showLiquidity: this.showLiquidity, showMSS: this.showMSS,
                showCHoCH: this.showCHoCH, showOrderBlocks: this.showOrderBlocks,
                showBreakerBlocks: this.showBreakerBlocks, showFVGs: this.showFVGs,
                showMitigated: this.showMitigated, enableTrendFilter: this.enableTrendFilter,
            };
            
            redrawAllAnalyses(analyses, displaySettings, htfAnalyses);
        },

        runSimulationFromModal() {
            if (!this.isBacktestMode || this.currentCandles.length === 0) {
                alert('請先在回測模式下，載入歷史數據。');
                return;
            }
            this.isSimulationSettingsModalOpen = false;
            this.isSimulating = true;
            setTimeout(() => {
                try {
                    // ** 新增：為回測準備 HTF 分析數據 **
                    let htfAnalyses = null;
                    if (this.enableMTA && this.higherTimeframeCandles.length > 0) {
                        htfAnalyses = analyzeAll(this.higherTimeframeCandles);
                    }

                    const backtestParams = {
                        candles: this.currentCandles,
                        settings: {
                            investmentAmount: this.investmentAmount, riskPerTrade: this.riskPerTrade,
                            riskMultiGrab2: this.riskMultiGrab2, riskMultiGrab3plus: this.riskMultiGrab3plus,
                            rrRatio: this.rrRatio,
                            setupExpirationCandles: this.setupExpirationCandles,
                            enableTrendFilter: this.enableTrendFilter,
                            emaPeriod: this.emaPeriod,
                            enableMTA: this.enableMTA,
                        },
                        htfAnalyses: htfAnalyses,
                    };
                    this.simulationResults = runBacktestSimulation(backtestParams);
                    this.isSimulationModalOpen = true;
                } catch(e) {
                    console.error("回測模擬時發生錯誤:", e);
                    this.error = `回測模擬失敗: ${e.message}`;
                } finally {
                    this.isSimulating = false;
                }
            }, 100);
        },

        rerunWithNewSettings() {
            this.isSimulationModalOpen = false;
            this.isSimulationSettingsModalOpen = true;
        },

        toggleAutoUpdate() {
            if (this.autoUpdate && !this.isBacktestMode) {
                this.updateIntervalId = setInterval(() => this.fetchData(), 15000);
            } else {
                this.stopAutoUpdate();
            }
        },

        stopAutoUpdate() {
            if (this.updateIntervalId) {
                clearInterval(this.updateIntervalId);
                this.updateIntervalId = null;
            }
            this.autoUpdate = false;
        },
    };
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM 已載入，開始載入元件...');
    await loadAllComponents();
    console.log('所有元件已載入。');

    Alpine.plugin(anchor);
    Alpine.plugin(collapse);
    Alpine.data('app', appComponent);
    
    window.Alpine = Alpine;
    Alpine.start();
    console.log('Alpine.js 已啟動。');
});
