// smc/modules/optimization-config.js

/**
 * @file 參數優化配置模組
 * 定義參數範圍和預設配置
 */

/**
 * 預設參數範圍配置
 */
export const DEFAULT_PARAM_RANGES = {
    // 權重參數
    obWeight: { min: 0, max: 5, step: 1, default: 2 },
    breakerWeight: { min: 0, max: 5, step: 1, default: 2 },
    mtaWeight: { min: 0, max: 5, step: 1, default: 2 },
    emaWeight: { min: 0, max: 3, step: 1, default: 1 },
    liquidityGrabWeight: { min: 0, max: 3, step: 1, default: 1 },
    inducementWeight: { min: 0, max: 5, step: 1, default: 3 },

    // 閾值參數
    entryScoreThreshold: { min: 1, max: 10, step: 1, default: 3 },

    // 技術指標參數
    emaPeriod: { min: 10, max: 100, step: 10, default: 50 },
    atrPeriod: { min: 5, max: 30, step: 5, default: 14 },
    atrMultiplier: { min: 1, max: 4, step: 0.5, default: 2 },

    // 風險管理參數
    riskPerTrade: { min: 0.5, max: 3, step: 0.5, default: 1 },
    rrRatio: { min: 1, max: 4, step: 0.5, default: 2 },
    rrRatioTP2: { min: 2, max: 6, step: 0.5, default: 3 },

    // 其他參數
    recentLiquidityGrabLookback: { min: 5, max: 50, step: 5, default: 20 },
    setupExpirationCandles: { min: 10, max: 100, step: 10, default: 30 }
};

/**
 * 參數分組配置
 */
export const PARAM_GROUPS = {
    weights: {
        name: '權重參數',
        description: '影響進場決策的權重設定',
        params: ['obWeight', 'breakerWeight', 'mtaWeight', 'emaWeight', 'liquidityGrabWeight', 'inducementWeight'],
        optimizationTarget: 'winRate'
    },
    technical: {
        name: '技術指標參數',
        description: '技術指標的週期和乘數設定',
        params: ['emaPeriod', 'atrPeriod', 'atrMultiplier'],
        optimizationTarget: 'sharpeRatio'
    },
    risk: {
        name: '風險管理參數',
        description: '風險控制和止盈止損設定',
        params: ['riskPerTrade', 'rrRatio', 'rrRatioTP2'],
        optimizationTarget: 'netPnl'
    },
    thresholds: {
        name: '閾值參數',
        description: '各種決策閾值設定',
        params: ['entryScoreThreshold', 'recentLiquidityGrabLookback', 'setupExpirationCandles'],
        optimizationTarget: 'profitFactor'
    }
};

/**
 * 優化目標配置
 */
export const OPTIMIZATION_TARGETS = {
    winRate: {
        name: '勝率最大化',
        description: '優先考慮交易勝率',
        unit: '%'
    },
    netPnl: {
        name: '淨收益最大化',
        description: '優先考慮總收益',
        unit: '$'
    },
    sharpeRatio: {
        name: '夏普比率最大化',
        description: '優先考慮風險調整後收益',
        unit: ''
    },
    profitFactor: {
        name: '獲利因子最大化',
        description: '優先考慮盈虧比',
        unit: ''
    }
};

/**
 * 優化算法配置
 */
export const OPTIMIZATION_ALGORITHMS = {
    grid: {
        name: '網格搜索',
        description: '系統性測試所有參數組合',
        maxParams: 4
    },
    random: {
        name: '隨機搜索',
        description: '在參數空間中隨機取樣',
        maxParams: 8
    }
};

/**
 * 創建自訂參數範圍配置
 * @param {Object} customRanges - 自訂參數範圍
 * @returns {Object} 合併後的參數範圍
 */
export function createCustomParamRanges(customRanges = {}) {
    return { ...DEFAULT_PARAM_RANGES, ...customRanges };
}

/**
 * 驗證參數範圍配置
 * @param {Object} paramRanges - 參數範圍配置
 * @returns {Object} 驗證結果 {isValid, errors}
 */
export function validateParamRanges(paramRanges) {
    const errors = [];

    Object.entries(paramRanges).forEach(([paramName, range]) => {
        if (!range.min || !range.max || !range.step) {
            errors.push(`${paramName}: 缺少必要屬性 (min, max, step)`);
        }

        if (range.min >= range.max) {
            errors.push(`${paramName}: min 必須小於 max`);
        }

        if (range.step <= 0) {
            errors.push(`${paramName}: step 必須大於 0`);
        }

        if (range.default !== undefined) {
            if (range.default < range.min || range.default > range.max) {
                errors.push(`${paramName}: default 值必須在 min 和 max 之間`);
            }
        }
    });

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * 計算參數組合總數
 * @param {Object} paramRanges - 參數範圍配置
 * @returns {number} 參數組合總數
 */
export function calculateCombinationCount(paramRanges) {
    return Object.values(paramRanges).reduce((total, range) => {
        const count = Math.floor((range.max - range.min) / range.step) + 1;
        return total * count;
    }, 1);
}

/**
 * 獲取參數的顯示名稱
 * @param {string} paramName - 參數名稱
 * @returns {string} 顯示名稱
 */
export function getParamDisplayName(paramName) {
    const displayNames = {
        obWeight: '訂單塊權重',
        breakerWeight: '突破塊權重',
        mtaWeight: '多時間週期權重',
        emaWeight: 'EMA權重',
        liquidityGrabWeight: '流動性掠奪權重',
        inducementWeight: '誘導權重',
        entryScoreThreshold: '進場分數閾值',
        emaPeriod: 'EMA週期',
        atrPeriod: 'ATR週期',
        atrMultiplier: 'ATR止損乘數',
        riskPerTrade: '單筆交易風險%',
        rrRatio: '第一止盈盈虧比',
        rrRatioTP2: '第二止盈盈虧比',
        recentLiquidityGrabLookback: '流動性回溯期間',
        setupExpirationCandles: '設定過期K棒數'
    };

    return displayNames[paramName] || paramName;
}

/**
 * 獲取參數的單位
 * @param {string} paramName - 參數名稱
 * @returns {string} 參數單位
 */
export function getParamUnit(paramName) {
    const units = {
        emaPeriod: 'K棒',
        atrPeriod: 'K棒',
        riskPerTrade: '%',
        recentLiquidityGrabLookback: 'K棒',
        setupExpirationCandles: 'K棒'
    };

    return units[paramName] || '';
}