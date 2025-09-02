// smc/modules/parameter-optimizer.js

/**
 * @file 參數優化模組
 * 負責執行參數範圍掃描並找出最佳參數組合
 */

import { runBacktestSimulation } from './backtester.js';
import { analyzeAll } from './smc-analyzer.js';

/**
 * 生成參數組合
 * @param {Object} paramRanges - 參數範圍配置
 * @returns {Array} 所有參數組合的陣列
 */
function generateParameterCombinations(paramRanges) {
    const paramNames = Object.keys(paramRanges);
    const combinations = [];

    function generateCombinations(index, current) {
        if (index === paramNames.length) {
            combinations.push({ ...current });
            return;
        }

        const paramName = paramNames[index];
        const range = paramRanges[paramName];

        for (let value = range.min; value <= range.max; value += range.step) {
            current[paramName] = value;
            generateCombinations(index + 1, current);
        }
    }

    generateCombinations(0, {});
    return combinations;
}

/**
 * 計算優化指標
 * @param {Object} results - 回測結果
 * @param {string} optimizationTarget - 優化目標
 * @returns {number} 優化分數
 */
function calculateOptimizationScore(results, optimizationTarget) {
    switch (optimizationTarget) {
        case 'winRate':
            return results.winRate;
        case 'netPnl':
            return results.netPnl;
        case 'sharpeRatio':
            // 簡化的夏普比率計算
            const avgReturn = results.netPnl / results.totalTrades;
            const volatility = Math.sqrt(results.trades.reduce((sum, trade) => {
                return sum + Math.pow(trade.pnl - avgReturn, 2);
            }, 0) / results.totalTrades);
            return volatility > 0 ? avgReturn / volatility : 0;
        case 'profitFactor':
            const grossProfit = results.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
            const grossLoss = Math.abs(results.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
            return grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
        default:
            return results.netPnl;
    }
}

/**
 * 執行參數優化
 * @param {Object} config - 優化配置
 * @param {Array} candles - K線數據
 * @param {Object} baseSettings - 基礎設定
 * @param {Object} analyses - 分析結果
 * @param {Object} htfAnalyses - 高時間週期分析結果
 * @param {Function} onProgress - 進度回調函數
 * @returns {Promise<Object>} 優化結果
 */
export async function optimizeParameters(config, candles, baseSettings, analyses, htfAnalyses, onProgress) {
    const { paramRanges, optimizationTarget, maxIterations } = config;

    // 開始參數優化

    // 生成所有參數組合
    const combinations = generateParameterCombinations(paramRanges);

    // 處理隨機搜索或組合過多的情況
    if (maxIterations && maxIterations > 0) {
        // 如果指定了 maxIterations，始終使用隨機抽樣
        const sampledCombinations = [];
        const sampleSize = Math.min(maxIterations, combinations.length);

        for (let i = 0; i < sampleSize; i++) {
            const randomIndex = Math.floor(Math.random() * combinations.length);
            sampledCombinations.push(combinations[randomIndex]);
        }
        combinations.splice(0, combinations.length, ...sampledCombinations);
    } else if (combinations.length > 10000) {
        // 如果沒有指定 maxIterations 但組合太多，自動使用隨機抽樣
        const sampledCombinations = [];
        const sampleSize = Math.min(1000, combinations.length);

        for (let i = 0; i < sampleSize; i++) {
            const randomIndex = Math.floor(Math.random() * combinations.length);
            sampledCombinations.push(combinations[randomIndex]);
        }
        combinations.splice(0, combinations.length, ...sampledCombinations);
    }

    return new Promise((resolve, reject) => {
        const results = [];
        let bestResult = null;
        let bestScore = -Infinity;
        let currentIndex = 0;
        const batchSize = 5; // 每批處理5個組合

        const processBatch = () => {
            const endIndex = Math.min(currentIndex + batchSize, combinations.length);

            for (let i = currentIndex; i < endIndex; i++) {
                const params = combinations[i];

                // 合併參數到設定中，只覆蓋指定的優化參數
                const testSettings = { ...baseSettings };

                // 只覆蓋用戶選擇要優化的參數
                Object.keys(params).forEach(param => {
                    if (paramRanges[param]) { // 確保這是用戶選擇優化的參數
                        testSettings[param] = params[param];
                    }
                });

                try {
                    // 執行回測
                    const backtestParams = {
                        candles,
                        settings: testSettings,
                        analyses,
                        htfAnalyses
                    };

                    const backtestResult = runBacktestSimulation(backtestParams);

                    // 計算優化分數
                    const score = calculateOptimizationScore(backtestResult, optimizationTarget);

                    const result = {
                        params,
                        results: backtestResult,
                        score,
                        combinationIndex: i
                    };

                    results.push(result);

                    // 更新最佳結果
                    if (score > bestScore) {
                        bestScore = score;
                        bestResult = result;
                    }

                } catch (error) {
                    console.error(`參數組合 ${i} 測試失敗:`, params, error);
                    // 繼續下一個組合
                }
            }

            currentIndex = endIndex;

            // 回報進度
            if (onProgress) {
                const progress = (currentIndex / combinations.length) * 100;
                onProgress({
                    progress,
                    currentCombination: currentIndex,
                    totalCombinations: combinations.length,
                    currentParams: combinations[Math.min(currentIndex - 1, combinations.length - 1)]?.params || {},
                    currentScore: results[results.length - 1]?.score || 0,
                    bestScore
                });
            }

            // 檢查是否完成
            if (currentIndex >= combinations.length) {
                // 按分數排序結果
                results.sort((a, b) => b.score - a.score);

                const optimizationResults = {
                    results,
                    bestResult,
                    totalCombinations: combinations.length,
                    optimizationTarget,
                    paramRanges,
                    timestamp: new Date().toISOString()
                };

                // 參數優化完成

                resolve(optimizationResults);
            } else {
                // 繼續處理下一批，使用 setTimeout 讓出控制權給UI
                setTimeout(processBatch, 10);
            }
        };

        // 開始處理第一批
        processBatch();
    });
}

/**
 * 分析參數敏感度
 * @param {Array} results - 優化結果陣列
 * @returns {Object} 參數敏感度分析
 */
export function analyzeParameterSensitivity(results) {
    if (results.length === 0) return {};

    const paramNames = Object.keys(results[0].params);
    const sensitivity = {};

    paramNames.forEach(paramName => {
        const paramValues = results.map(r => r.params[paramName]);
        const scores = results.map(r => r.score);

        // 檢查參數值是否有變化
        const min = Math.min(...paramValues);
        const max = Math.max(...paramValues);
        const range = max - min;

        // 如果參數值沒有變化，無法計算相關性
        if (range === 0) {
            sensitivity[paramName] = {
                correlation: 0,
                range: 0,
                impact: 0,
                direction: 'neutral',
                interpretation: '參數值無變化'
            };
            return;
        }

        // 計算相關係數
        const correlation = calculateCorrelation(paramValues, scores);

        // 檢查相關係數是否有效
        const validCorrelation = isNaN(correlation) ? 0 : correlation;

        sensitivity[paramName] = {
            correlation: Math.abs(validCorrelation),
            range,
            impact: Math.abs(validCorrelation) * range,
            direction: validCorrelation > 0 ? 'positive' : 'negative',
            interpretation: interpretCorrelation(validCorrelation)
        };
    });

    return sensitivity;
}

/**
 * 計算相關係數
 * @param {Array} x - X變數陣列
 * @param {Array} y - Y變數陣列
 * @returns {number} 相關係數
 */
function calculateCorrelation(x, y) {
    const n = x.length;

    // 檢查數據長度
    if (n < 2) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    // 檢查分母是否為 0 或 NaN
    if (denominator === 0 || isNaN(denominator) || !isFinite(denominator)) {
        return 0;
    }

    const correlation = numerator / denominator;

    // 檢查結果是否有效
    return isNaN(correlation) || !isFinite(correlation) ? 0 : correlation;
}

/**
 * 解釋相關係數
 * @param {number} correlation - 相關係數
 * @returns {string} 解釋文字
 */
function interpretCorrelation(correlation) {
    const absCorr = Math.abs(correlation);
    if (absCorr >= 0.8) return '強相關';
    if (absCorr >= 0.6) return '中等相關';
    if (absCorr >= 0.3) return '弱相關';
    return '無顯著相關';
}

/**
 * 生成優化報告
 * @param {Object} optimizationResults - 優化結果
 * @returns {string} 格式化的報告
 */
export function generateOptimizationReport(optimizationResults) {
    const { bestResult, results, optimizationTarget, totalCombinations } = optimizationResults;

    let report = `# 參數優化報告\n\n`;
    report += `**優化目標:** ${optimizationTarget}\n`;
    report += `**測試組合數:** ${totalCombinations}\n`;
    report += `**生成時間:** ${new Date(optimizationResults.timestamp).toLocaleString()}\n\n`;

    if (bestResult) {
        report += `## 最佳參數組合\n\n`;
        report += `**最佳分數:** ${bestResult.score.toFixed(4)}\n\n`;
        report += `### 參數設定\n`;
        Object.entries(bestResult.params).forEach(([key, value]) => {
            report += `- **${key}:** ${value}\n`;
        });

        report += `\n### 回測結果\n`;
        report += `- **最終權益:** $${bestResult.results.finalEquity.toFixed(2)}\n`;
        report += `- **淨收益:** $${bestResult.results.netPnl.toFixed(2)}\n`;
        report += `- **收益率:** ${bestResult.results.pnlPercent.toFixed(2)}%\n`;
        report += `- **勝率:** ${bestResult.results.winRate.toFixed(2)}%\n`;
        report += `- **總交易數:** ${bestResult.results.totalTrades}\n`;
    }

    report += `\n## 參數敏感度分析\n\n`;
    const sensitivity = analyzeParameterSensitivity(results);
    Object.entries(sensitivity)
        .sort(([, a], [, b]) => b.impact - a.impact)
        .forEach(([param, data]) => {
            report += `- **${param}:** 影響力 ${data.impact.toFixed(4)} (${data.direction})\n`;
        });

    return report;
}