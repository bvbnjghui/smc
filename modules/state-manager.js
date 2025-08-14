// smc/modules/state-manager.js

/**
 * @file 應用程式狀態管理器。
 * 負責定義、載入和保存所有使用者設定與應用程式狀態。
 */

const defaults = {
    symbol: 'BTCUSDT',
    commonSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    interval: '15m',
    showLiquidity: true,
    showBOS: true,
    showCHoCH: true,
    showOrderBlocks: true,
    showBreakerBlocks: true,
    showFVGs: true,
    showMitigated: false,
    analyzeVisibleRangeOnly: false,
    isBacktestMode: false,
    backtestStartDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    backtestEndDate: new Date().toISOString().split('T')[0],
    htfBias: 'both',
    entryStrategy: 'reversal_confirmation',
    entryScoreThreshold: 3,
    obWeight: 2,
    breakerWeight: 2,
    mtaWeight: 2,
    emaWeight: 1,
    liquidityGrabWeight: 1,
    inducementWeight: 3,
    recentLiquidityGrabLookback: 20,
    investmentAmount: 10000,
    riskPerTrade: 1,
    rrRatio: 2,
    rrRatioTP2: 3,
    enableBreakeven: true,
    setupExpirationCandles: 30,
    enableTrendFilter: false,
    emaPeriod: 50,
    enableMTA: false,
    higherTimeframe: '4h',
    enableATR: true,
    atrPeriod: 14,
    atrMultiplier: 2,
    enableKillzoneFilter: false,
    useLondonKillzone: true,
    useNewYorkKillzone: true,
};

/**
 * 從 localStorage 載入初始設定，如果不存在則使用預設值。
 * @returns {object} 應用程式的初始狀態。
 */
function loadInitialSettings() {
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
}

/**
 * 將當前狀態保存到 localStorage。
 * @param {object} currentState - 當前的應用程式狀態 (Alpine component proxy)。
 */
function saveSettings(currentState) {
    const settingsToSave = {};
    // ** 核心修正: 改用 `in` 運算子來檢查屬性是否存在 **
    // 這能正確地在 Alpine.js 的 Proxy 物件上運作。
    for (const key in defaults) {
        if (key in currentState) {
            settingsToSave[key] = currentState[key];
        }
    }
    localStorage.setItem('smcAnalyzerSettings', JSON.stringify(settingsToSave));
}

// 匯出初始狀態和保存函式
export const initialState = loadInitialSettings();
export const saveCurrentSettings = saveSettings;
