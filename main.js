// smc/main.js

/**
 * @file 應用程式主入口檔案。
 * 負責載入 HTML 元件、匯入並啟動 Alpine.js、整合所有模組並管理 UI 狀態。
 */

import Alpine from 'https://unpkg.com/alpinejs@3.x.x/dist/module.esm.js';
import collapse from 'https://unpkg.com/@alpinejs/collapse@3.x.x/dist/module.esm.js';

import { fetchKlines } from './modules/api.js';
import { setupChart, updateChartData, fitChart, redrawAllAnalyses } from './modules/chart-controller.js';
import { analyzeAll } from './modules/smc-analyzer.js';
import { runBacktestSimulation } from './modules/backtester.js';

/**
 * 非同步載入 HTML 元件並將其注入到指定的容器中。
 * @param {string} componentName - 元件的檔案名稱 (不含 .html)。
 * @param {string} containerId - 目標容器的 DOM ID。
 */
async function loadComponent(componentName, containerId) {
    try {
        const response = await fetch(`/smc/components/${componentName}.html`);
        if (!response.ok) {
            throw new Error(`無法載入元件 ${componentName}: ${response.statusText}`);
        }
        const html = await response.text();
        const container = document.getElementById(containerId);
        if (container) {
            // 使用 innerHTML 注入，因為我們的元件是獨立的 HTML 塊
            container.innerHTML = html;
        } else {
            console.error(`找不到 ID 為 '${containerId}' 的容器`);
        }
    } catch (error) {
        console.error(`載入元件 ${componentName} 失敗:`, error);
    }
}

/**
 * 載入所有 UI 元件。
 */
async function loadAllComponents() {
    // 將所有 Modal 統一載入到一個容器中，簡化管理
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

// Alpine.js 元件定義 (與之前相同)
const appComponent = () => {
    // ... (這裡的內容與您之前的 main.js 完全相同，為節省篇幅故省略)
    const loadInitialSettings = () => {
        const defaults = {
            symbol: 'BTCUSDT',
            interval: '15m',
            showLiquidity: true,
            showMSS: true,
            showOrderBlocks: true,
            showFVGs: true,
            showMitigated: false,
            isBacktestMode: false,
            backtestStartDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
            backtestEndDate: new Date().toISOString().split('T')[0],
            investmentAmount: 10000,
            riskPerTrade: 1,
            riskMultiGrab2: 1.5,
            riskMultiGrab3plus: 2,
            rrRatio: 2,
            setupExpirationCandles: 30,
        };
        const commonSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

        try {
            const savedSettings = localStorage.getItem('smcAnalyzerSettings');
            const settings = savedSettings ? { ...defaults, ...JSON.parse(savedSettings) } : defaults;

            const savedSymbol = (settings.symbol || defaults.symbol).toUpperCase();
            let selectedPreset = commonSymbols.includes(savedSymbol) ? savedSymbol : 'CUSTOM';
            let customSymbol = commonSymbols.includes(savedSymbol) ? '' : savedSymbol;

            return { ...settings, selectedPreset, customSymbol };
        } catch (e) {
            console.error('從 localStorage 載入設定失敗，將使用預設值。', e);
            return { ...defaults, selectedPreset: defaults.symbol, customSymbol: '' };
        }
    };

    const initialSettings = loadInitialSettings();

    return {
        commonSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
        selectedPreset: initialSettings.selectedPreset,
        customSymbol: initialSettings.customSymbol,
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
        showLiquidity: initialSettings.showLiquidity,
        showMSS: initialSettings.showMSS,
        showOrderBlocks: initialSettings.showOrderBlocks,
        showFVGs: initialSettings.showFVGs,
        showMitigated: initialSettings.showMitigated,
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
        get symbol() {
            return this.selectedPreset === 'CUSTOM' ? this.customSymbol.toUpperCase() : this.selectedPreset;
        },
        init() {
            console.log('Alpine component initialized.');
            setupChart('chart');
            this.fetchData();
            const settingsToWatch = [
                'symbol', 'interval', 'showLiquidity', 'showMSS', 'showOrderBlocks', 'showFVGs', 'showMitigated',
                'isBacktestMode', 'backtestStartDate', 'backtestEndDate', 'investmentAmount',
                'riskPerTrade', 'riskMultiGrab2', 'riskMultiGrab3plus', 'rrRatio', 'setupExpirationCandles'
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
        },
        saveSettings() {
            const settings = {
                symbol: this.symbol, interval: this.interval, showLiquidity: this.showLiquidity,
                showMSS: this.showMSS, showOrderBlocks: this.showOrderBlocks, showFVGs: this.showFVGs,
                showMitigated: this.showMitigated,
                isBacktestMode: this.isBacktestMode, backtestStartDate: this.backtestStartDate,
                backtestEndDate: this.backtestEndDate, investmentAmount: this.investmentAmount,
                riskPerTrade: this.riskPerTrade, riskMultiGrab2: this.riskMultiGrab2,
                riskMultiGrab3plus: this.riskMultiGrab3plus, rrRatio: this.rrRatio,
                setupExpirationCandles: this.setupExpirationCandles,
            };
            localStorage.setItem('smcAnalyzerSettings', JSON.stringify(settings));
            console.log('Settings saved to localStorage.');
        },
        async fetchData() {
            if (this.isLoading) return;
            this.stopAutoUpdate();
            this.isLoading = true;
            this.error = '';
            try {
                const { candles, volumes } = await fetchKlines({
                    symbol: this.symbol, interval: this.interval, isBacktestMode: this.isBacktestMode,
                    backtestStartDate: this.backtestStartDate, backtestEndDate: this.backtestEndDate,
                });
                this.currentCandles = candles;
                updateChartData(candles, volumes);
                this.redrawChartAnalyses();
                fitChart(candles.length);
            } catch (e) {
                this.error = `載入數據失敗: ${e.message}`;
                console.error(e);
            } finally {
                this.isLoading = false;
            }
        },
        redrawChartAnalyses() {
            if (this.currentCandles.length === 0) return;
            const analyses = analyzeAll(this.currentCandles);
            const displaySettings = {
                showLiquidity: this.showLiquidity, showMSS: this.showMSS,
                showOrderBlocks: this.showOrderBlocks, showFVGs: this.showFVGs,
                showMitigated: this.showMitigated,
            };
            redrawAllAnalyses(analyses, displaySettings);
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
                    const backtestParams = {
                        candles: this.currentCandles,
                        settings: {
                            investmentAmount: this.investmentAmount, riskPerTrade: this.riskPerTrade,
                            riskMultiGrab2: this.riskMultiGrab2, riskMultiGrab3plus: this.riskMultiGrab3plus,
                            rrRatio: this.rrRatio,
                            setupExpirationCandles: this.setupExpirationCandles,
                        }
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

// 應用程式啟動主流程
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM 已載入，開始載入元件...');
    await loadAllComponents();
    console.log('所有元件已載入。');

    // 註冊 Alpine.js 外掛和元件
    Alpine.plugin(collapse);
    Alpine.data('app', appComponent);
    
    // 啟動 Alpine.js
    window.Alpine = Alpine;
    Alpine.start();
    console.log('Alpine.js 已啟動。');
});
