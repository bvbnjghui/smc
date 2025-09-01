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
    maxIterations: 200,
    isOptimizing: false,
    optimizationProgress: 0,
    currentTestCount: 0,
    currentTestCombination: 0,
    totalTestCombinations: 0,
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

    // 確保參數範圍的完整性
    ensureParamRangesIntegrity() {
        if (!this.paramRanges) {
            this.paramRanges = {};
        }

        // 確保所有選中的參數都有範圍設定
        this.selectedParams.forEach(param => {
            if (!this.paramRanges[param]) {
                if (DEFAULT_PARAM_RANGES[param]) {
                    this.paramRanges[param] = { ...DEFAULT_PARAM_RANGES[param] };
                } else {
                    // 如果沒有預設值，設置一個安全的預設值
                    this.paramRanges[param] = { min: 0, max: 10, step: 1, default: 1 };
                }
            }
        });
    },

    // 安全的參數範圍值訪問器
    getParamRangeValue(param, property) {
        if (!this.paramRanges || !this.paramRanges[param]) {
            this.ensureParamRangesIntegrity();
        }

        if (this.paramRanges[param] && this.paramRanges[param][property] !== undefined) {
            return this.paramRanges[param][property];
        }

        // 返回預設值
        const defaults = { min: 0, max: 10, step: 1 };
        return defaults[property] || 0;
    },

    // 設定參數範圍值
    setParamRangeValue(param, property, value) {
        if (!this.paramRanges) {
            this.paramRanges = {};
        }

        if (!this.paramRanges[param]) {
            // 初始化參數範圍
            if (DEFAULT_PARAM_RANGES[param]) {
                this.paramRanges[param] = { ...DEFAULT_PARAM_RANGES[param] };
            } else {
                this.paramRanges[param] = { min: 0, max: 10, step: 1, default: 1 };
            }
        }

        this.paramRanges[param][property] = value;
    },

    // 格式化參數敏感度值
    formatSensitivityValue(data) {
        if (!data || typeof data.correlation !== 'number') {
            return '無數據';
        }

        if (isNaN(data.correlation) || !isFinite(data.correlation)) {
            // 檢查是否有足夠的數據點
            if (this.optimizationResults && this.optimizationResults.results &&
                this.optimizationResults.results.length < 2) {
                return '數據不足';
            }
            return '計算錯誤';
        }

        const percentage = (data.correlation * 100).toFixed(1);
        return percentage + '%';
    },

    // 安全獲取最佳參數
    getBestParams() {
        console.log('getBestParams called', {
            hasResults: !!this.optimizationResults,
            hasBestResult: !!(this.optimizationResults && this.optimizationResults.bestResult),
            hasParams: !!(this.optimizationResults && this.optimizationResults.bestResult && this.optimizationResults.bestResult.params),
            params: this.optimizationResults?.bestResult?.params,
            totalResults: this.optimizationResults?.results?.length || 0
        });

        if (this.optimizationResults &&
            this.optimizationResults.bestResult &&
            this.optimizationResults.bestResult.params) {
            return this.optimizationResults.bestResult.params;
        }
        return {};
    },

    // 安全獲取最佳結果
    getBestResult() {
        console.log('getBestResult called', {
            hasResults: !!this.optimizationResults,
            hasBestResult: !!(this.optimizationResults && this.optimizationResults.bestResult),
            bestResult: this.optimizationResults?.bestResult
        });

        if (this.optimizationResults && this.optimizationResults.bestResult) {
            return this.optimizationResults.bestResult;
        }
        return null;
    },

    // 安全獲取優化結果
    getOptimizationResults() {
        return this.optimizationResults || null;
    },

    // 安全獲取最佳結果數值
    getBestResultValue(field, suffix = '') {
        const bestResult = this.getBestResult();
        if (bestResult && bestResult.results && typeof bestResult.results[field] === 'number') {
            const value = bestResult.results[field];
            if (suffix === '$') {
                return '$' + value.toFixed(2);
            } else if (suffix === '%') {
                return value.toFixed(2) + '%';
            } else {
                return value.toFixed(2);
            }
        }
        return 'N/A';
    },

    // 檢查是否有參數敏感度數據
    hasParamSensitivity() {
        return this.paramSensitivity && Object.keys(this.paramSensitivity).length > 0;
    },

    // 檢查是否有優化建議
    hasOptimizationRecommendations() {
        return this.optimizationRecommendations && this.optimizationRecommendations.length > 0;
    },

    // 安全獲取優化建議
    getOptimizationRecommendations() {
        return this.optimizationRecommendations || [];
    },

    // 安全獲取參數敏感度
    getParamSensitivity() {
        return this.paramSensitivity || {};
    },

    // 獲取敏感度條寬度
    getSensitivityBarWidth(data) {
        if (data && !isNaN(data.correlation)) {
            return Math.min(Math.abs(data.correlation) * 100, 100);
        }
        return 0;
    },

    // 取消優化
    cancelOptimization() {
        this.isOptimizing = false;
        this.optimizationProgress = 0;
        this.currentTestCombination = 0;
        this.totalTestCombinations = 0;
        this.optimizationStep = 2; // 返回到設定階段
        console.log('Optimization cancelled, step set to:', this.optimizationStep);
    },

    // 匯出優化結果
    exportOptimizationResults() {
        if (!this.optimizationResults) {
            alert('沒有優化結果可以匯出。');
            return;
        }

        // 簡單的 CSV 匯出實現
        const results = this.optimizationResults.results;
        if (!results || results.length === 0) {
            alert('沒有結果數據可以匯出。');
            return;
        }

        const headers = ['參數', '分數', '勝率%', '淨收益$', '總交易數'];
        const rows = results.slice(0, 100).map(result => {
            const params = Object.entries(result.params).map(([key, value]) => `${key}=${value}`).join('; ');
            return [
                params,
                result.score.toFixed(4),
                `${result.results.winRate.toFixed(2)}%`,
                `$${result.results.netPnl.toFixed(2)}`,
                result.results.totalTrades
            ];
        });

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `optimization-results-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // 應用最佳參數
    applyBestParams() {
        if (!this.optimizationResults || !this.optimizationResults.bestResult) {
            alert('沒有最佳參數可以應用。');
            return;
        }

        const bestParams = this.optimizationResults.bestResult.params;
        Object.entries(bestParams).forEach(([param, value]) => {
            if (param in this) {
                this[param] = value;
            }
        });

        // 保存設定
        saveCurrentSettings(this);

        alert('已應用最佳參數設定！');
        this.isOptimizationModalOpen = false;
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

        // 監聽參數優化相關的狀態變化
        this.$watch('selectedParams', (newParams, oldParams) => {
            // 確保新選擇的參數有範圍設定
            if (newParams && newParams.length > 0) {
                this.ensureParamRangesIntegrity();
            }
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

        // 初始化參數範圍 - 確保所有參數都有範圍設定
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

        // 檢查是否至少選擇了2個參數以獲得有效的參數敏感度分析
        if (this.selectedParams.length < 2) {
            alert('建議至少選擇2個參數進行優化，以獲得有效的參數敏感度分析。\n\n如果只選擇1個參數，敏感度分析將顯示"數據不足"。');
        }

        // 檢查參數範圍是否有效
        const invalidRanges = this.selectedParams.filter(param => {
            const range = this.paramRanges[param];
            if (!range) return true;
            return range.min === range.max;
        });

        if (invalidRanges.length > 0) {
            alert(`以下參數的範圍無效（最小值等於最大值）：\n${invalidRanges.join('\n')}\n\n請調整參數範圍以包含多個值。`);
            return;
        }

        // 確保參數範圍完整性
        this.ensureParamRangesIntegrity();

        console.log('Setting optimizationStep to 3');
        this.isOptimizing = true;
        this.optimizationStep = 3; // 設置為進度階段
        this.optimizationProgress = 0;
        console.log('optimizationStep is now:', this.optimizationStep);
        this.currentTestCount = 0;
        this.currentTestCombination = 0;
        this.totalTestCombinations = 0;
        this.currentBestScore = 0;
        this.currentTestParams = null;
        this.estimatedTimeRemaining = '';

        // 準備優化配置
        const paramRanges = {};
        this.selectedParams.forEach(param => {
            if (this.paramRanges[param]) {
                paramRanges[param] = this.paramRanges[param];
            } else {
                console.warn(`參數 ${param} 沒有範圍設定，使用預設值`);
                paramRanges[param] = { min: 0, max: 10, step: 1 };
            }
        });

        const config = {
            paramRanges,
            optimizationTarget: this.optimizationTarget,
            maxIterations: this.optimizationAlgorithm === 'random' ? this.maxIterations : (this.calculateTotalCombinations() > 10000 ? 1000 : undefined)
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

        // 創建完整的 baseSettings，確保包含所有必要的屬性
        const baseSettings = {
            // 從當前實例複製所有屬性
            ...this,
            // 確保關鍵屬性存在
            entryStrategy: this.entryStrategy || 'reversal_confirmation',
            htfBias: this.htfBias || 'both',
            investmentAmount: this.investmentAmount || 10000,
            riskPerTrade: this.riskPerTrade || 1,
            rrRatio: this.rrRatio || 2,
            rrRatioTP2: this.rrRatioTP2 || 3,
            enableBreakeven: this.enableBreakeven !== undefined ? this.enableBreakeven : true,
            setupExpirationCandles: this.setupExpirationCandles || 30,
            enableKillzoneFilter: this.enableKillzoneFilter || false,
            useLondonKillzone: this.useLondonKillzone || true,
            useNewYorkKillzone: this.useNewYorkKillzone || true
        };

        // 設置總測試組合數
        this.totalTestCombinations = this.optimizationAlgorithm === 'random'
            ? this.maxIterations
            : Math.min(this.calculateTotalCombinations(), 10000);

        // 開始優化
        const startTime = Date.now();
        let lastProgressUpdate = startTime;

        optimizeParameters(
            config,
            this.currentCandles,
            baseSettings,
            analyses,
            htfAnalyses,
            (progress) => {
                this.optimizationProgress = progress.progress;
                this.currentTestCount = progress.currentCombination;
                this.currentTestCombination = progress.currentCombination;
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
            this.optimizationStep = 4;
            console.log('Optimization completed, step set to:', this.optimizationStep);
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
        console.log('Optimization failed, step reset to:', this.optimizationStep);
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
