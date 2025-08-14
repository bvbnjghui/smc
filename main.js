// smc/main.js

/**
 * @file 應用程式主入口與邏輯協調者。
 * 負責載入元件、啟動 Alpine.js、並協調各模組之間的互動。
 */

import Alpine from 'https://unpkg.com/alpinejs@3.x.x/dist/module.esm.js';
import collapse from 'https://unpkg.com/@alpinejs/collapse@3.x.x/dist/module.esm.js';
import anchor from 'https://unpkg.com/@alpinejs/anchor@3.x.x/dist/module.esm.js';

import { fetchKlines } from './modules/api.js';
import { setupChart, updateChartData, fitChart, redrawAllAnalyses } from './modules/chart-controller.js';
import { analyzeAll } from './modules/smc-analyzer.js';
import { runBacktestSimulation } from './modules/backtester.js';
import { initialState, saveCurrentSettings } from './modules/state-manager.js';

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

const appComponent = () => ({
    ...initialState,

    // --- 應用程式控制狀態 (非持久化) ---
    isLoading: false,
    error: '',
    currentCandles: [],
    higherTimeframeCandles: [],
    isSidebarOpen: false,
    isHelpModalOpen: false,
    isSimulationModalOpen: false,
    isSimulationSettingsModalOpen: false,
    isSimulating: false,
    simulationResults: null,
    autoUpdate: false,
    updateIntervalId: null,
    newCustomSymbol: '',
    visibleRange: null,
    intervals: [
        { value: '1m', label: '1 分鐘' }, { value: '5m', label: '5 分鐘' },
        { value: '15m', label: '15 分鐘' }, { value: '1h', label: '1 小時' },
        { value: '4h', label: '4 小時' }, { value: '1d', label: '1 日' },
    ],
    
    // --- 計算屬性 ---
    get availableHigherTimeframes() {
        const currentIndex = this.intervals.findIndex(i => i.value === this.interval);
        return this.intervals.slice(currentIndex + 1);
    },

    // --- 初始化與監聽 ---
    init() {
        console.log('Alpine component initialized.');
        setupChart('chart', this.onVisibleRangeChanged.bind(this));

        // ** 核心修正: 整合所有設定的監聽與保存邏輯 **
        Object.keys(initialState).forEach(key => {
            this.$watch(key, (newValue, oldValue) => {
                // 1. 無論哪個設定變更，都先保存所有設定
                saveCurrentSettings(this);
                console.log(`%c[Settings Saved] '${key}' changed. All settings have been persisted.`, 'color: #10b981');

                // 2. 根據變更的特定設定，執行對應的副作用
                if (key === 'isBacktestMode' && !newValue) {
                    this.stopAutoUpdate();
                }
                if (key === 'interval') {
                    if (!this.availableHigherTimeframes.find(i => i.value === this.higherTimeframe)) {
                        this.higherTimeframe = this.availableHigherTimeframes[0]?.value || '';
                    }
                }
            });
        });

        this.fetchData();
        console.log('Initial data fetch initiated.');
    },

    // --- 方法 (Methods) ---
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
            const ltfParams = {
                symbol: this.symbol, 
                interval: this.interval, 
                isBacktestMode: this.isBacktestMode,
                backtestStartDate: this.backtestStartDate, 
                backtestEndDate: this.backtestEndDate,
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

        const globalIndicatorSettings = {
            enableTrendFilter: this.enableTrendFilter,
            emaPeriod: this.emaPeriod,
            enableATR: this.enableATR,
            atrPeriod: this.atrPeriod,
        };
        const globalAnalyses = analyzeAll(this.currentCandles, globalIndicatorSettings);

        let candlesForLocalAnalysis = this.currentCandles;
        if (this.analyzeVisibleRangeOnly && this.visibleRange) {
            const from = Math.floor(this.visibleRange.from);
            const to = Math.ceil(this.visibleRange.to);
            candlesForLocalAnalysis = this.currentCandles.slice(from, to);
        }
        
        const localAnalysisSettings = { enableTrendFilter: false, enableATR: false };
        const localAnalyses = analyzeAll(candlesForLocalAnalysis, localAnalysisSettings);
        
        const finalAnalyses = {
            ...localAnalyses,
            ema: globalAnalyses.ema,
            atr: globalAnalyses.atr,
        };
        
        let htfAnalyses = null;
        if (this.enableMTA && this.higherTimeframeCandles.length > 0) {
            htfAnalyses = analyzeAll(this.higherTimeframeCandles, { enableTrendFilter: false, enableATR: false });
        }
        
        const displaySettings = {
            showLiquidity: this.showLiquidity, 
            showBOS: this.showBOS,
            showCHoCH: this.showCHoCH, 
            showOrderBlocks: this.showOrderBlocks,
            showBreakerBlocks: this.showBreakerBlocks, 
            showFVGs: this.showFVGs,
            showMitigated: this.showMitigated, 
            enableTrendFilter: this.enableTrendFilter,
            enableATR: this.enableATR,
        };
        
        redrawAllAnalyses(finalAnalyses, displaySettings, htfAnalyses);
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
                let htfAnalyses = null;
                if (this.enableMTA && this.higherTimeframeCandles.length > 0) {
                    htfAnalyses = analyzeAll(this.higherTimeframeCandles);
                }
                
                const analysisSettings = {
                    enableTrendFilter: this.enableTrendFilter,
                    emaPeriod: this.emaPeriod,
                    enableATR: this.enableATR,
                    atrPeriod: this.atrPeriod,
                };

                const backtestParams = {
                    candles: this.currentCandles,
                    settings: this,
                    analyses: analyzeAll(this.currentCandles, analysisSettings),
                    htfAnalyses: htfAnalyses,
                };
                this.simulationResults = runBacktestSimulation(backtestParams);
                this.isSimulationModalOpen = true;
            } catch(e) {
                console.error("回測模擬時發生錯誤:", e);
                this.error = `載入數據失敗: ${e.message}`;
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
});

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
