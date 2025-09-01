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
import { optimizeParameters } from './modules/parameter-optimizer.js';
import { DEFAULT_PARAM_RANGES, PARAM_GROUPS, OPTIMIZATION_TARGETS, OPTIMIZATION_ALGORITHMS, getParamDisplayName, getParamUnit, calculateCombinationCount } from './modules/optimization-config.js';
import { processOptimizationResults, generateOptimizationRecommendations, exportResultsToCSV } from './modules/optimization-results.js';

// 輔助函數
function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}秒`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        return `${minutes}分${remainingSeconds}秒`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}小時${minutes}分`;
    }
}

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
        <div id="optimization-modal-placeholder"></div>
    `;
    document.getElementById('modals-container').innerHTML = modalComponents;

    await Promise.all([
        loadComponent('sidebar', 'sidebar-container'),
        loadComponent('header', 'header-container'),
        loadComponent('help-modal', 'help-modal-placeholder'),
        loadComponent('simulation-settings-modal', 'simulation-settings-modal-placeholder'),
        loadComponent('simulation-results-modal', 'simulation-results-modal-placeholder'),
        loadComponent('optimization-modal', 'optimization-modal-placeholder')
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

    // --- 參數優化狀態 ---
    isOptimizationModalOpen: false,
    optimizationStep: 1,
    selectedParams: [],
    selectedParamGroups: [],
    paramRanges: {},
    optimizationTarget: 'netPnl',
    optimizationAlgorithm: 'grid',
    maxIterations: 1000,
    isOptimizing: false,
    optimizationProgress: 0,
    currentTestCount: 0,
    totalTestCount: 0,
    currentBestScore: 0,
    currentTestParams: null,
    estimatedTimeRemaining: '',
    optimizationResults: null,
    paramSensitivity: {},
    optimizationRecommendations: [],
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

    // --- 參數優化計算屬性 ---
    get optimizationParamGroups() {
        return PARAM_GROUPS;
    },

    get optimizationTargets() {
        return OPTIMIZATION_TARGETS;
    },

    get optimizationAlgorithms() {
        return OPTIMIZATION_ALGORITHMS;
    },

    getParamDisplayName(param) {
        return getParamDisplayName(param);
    },

    getParamUnit(param) {
        return getParamUnit(param);
    },

    calculateCombinationCountForParam(param) {
        if (!this.paramRanges[param]) return 0;
        const range = this.paramRanges[param];
        return Math.floor((range.max - range.min) / range.step) + 1;
    },

    calculateTotalCombinations() {
        if (this.selectedParams.length === 0) return 0;
        return calculateCombinationCount(this.paramRanges);
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

    // --- 參數優化方法 ---
    openOptimizationModal() {
        if (!this.isBacktestMode || this.currentCandles.length === 0) {
            alert('請先在回測模式下載入歷史數據。');
            return;
        }

        // 初始化參數範圍
        this.paramRanges = {};
        Object.keys(DEFAULT_PARAM_RANGES).forEach(param => {
            this.paramRanges[param] = { ...DEFAULT_PARAM_RANGES[param] };
        });

        // 重置狀態
        this.optimizationStep = 1;
        this.selectedParams = [];
        this.selectedParamGroups = [];
        this.optimizationResults = null;
        this.paramSensitivity = {};
        this.optimizationRecommendations = [];
        this.isOptimizationModalOpen = true;
    },

    startOptimization() {
        if (this.selectedParams.length === 0) {
            alert('請至少選擇一個參數進行優化。');
            return;
        }

        this.isOptimizing = true;
        this.optimizationStep = 4;
        this.optimizationProgress = 0;
        this.currentTestCount = 0;
        this.currentBestScore = 0;
        this.currentTestParams = null;
        this.estimatedTimeRemaining = '';

        // 準備優化配置
        const paramRanges = {};
        this.selectedParams.forEach(param => {
            paramRanges[param] = this.paramRanges[param];
        });

        const config = {
            paramRanges,
            optimizationTarget: this.optimizationTarget,
            maxIterations: this.optimizationAlgorithm === 'random' ? this.maxIterations : undefined
        };

        // 準備分析數據
        const analysisSettings = {
            enableTrendFilter: this.enableTrendFilter,
            emaPeriod: this.emaPeriod,
            enableATR: this.enableATR,
            atrPeriod: this.atrPeriod,
        };
        const analyses = analyzeAll(this.currentCandles, analysisSettings);

        let htfAnalyses = null;
        if (this.enableMTA && this.higherTimeframeCandles.length > 0) {
            htfAnalyses = analyzeAll(this.higherTimeframeCandles, { enableTrendFilter: false, enableATR: false });
        }

        // 開始優化
        const startTime = Date.now();
        let lastProgressUpdate = startTime;

        optimizeParameters(
            config,
            this.currentCandles,
            this,
            analyses,
            htfAnalyses,
            (progress) => {
                this.optimizationProgress = progress.progress;
                this.currentTestCount = progress.currentCombination;
                this.totalTestCount = progress.totalCombinations;
                this.currentBestScore = progress.bestScore;
                this.currentTestParams = progress.currentParams;

                // 估算剩餘時間
                const currentTime = Date.now();
                if (currentTime - lastProgressUpdate > 1000) { // 每秒更新一次
                    const elapsed = (currentTime - startTime) / 1000;
                    const progressRatio = progress.progress / 100;
                    if (progressRatio > 0) {
                        const totalEstimated = elapsed / progressRatio;
                        const remaining = totalEstimated - elapsed;
                        this.estimatedTimeRemaining = formatTime(remaining);
                    }
                    lastProgressUpdate = currentTime;
                }
            }
        ).then(results => {
            this.optimizationResults = results;
            const processedResults = processOptimizationResults(results);
            this.paramSensitivity = processedResults.statistics.paramCorrelations;
            this.optimizationRecommendations = generateOptimizationRecommendations(processedResults);
            this.optimizationStep = 5;
        }).catch(error => {
            console.error('參數優化失敗:', error);
            this.error = `參數優化失敗: ${error.message}`;
        }).finally(() => {
            this.isOptimizing = false;
        });
    },

    stopOptimization() {
        // 由於 Web Worker 或其他異步操作的限制，這裡我們只是設置標記
        // 在實際實現中，可能需要使用 AbortController 或其他機制
        this.isOptimizing = false;
        this.optimizationStep = 1;
    },

    applyBestParams() {
        if (!this.optimizationResults?.bestResult?.params) {
            alert('沒有可應用的最佳參數。');
            return;
        }

        const bestParams = this.optimizationResults.bestResult.params;
        Object.entries(bestParams).forEach(([param, value]) => {
            if (param in this) {
                this[param] = value;
            }
        });

        alert('已應用最佳參數設定！');
        this.isOptimizationModalOpen = false;
    },

    exportOptimizationResults() {
        if (!this.optimizationResults) {
            alert('沒有優化結果可匯出。');
            return;
        }

        const csv = exportResultsToCSV(this.optimizationResults.results);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `optimization-results-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
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
