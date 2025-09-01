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

    console.log('開始參數優化...', { paramRanges, optimizationTarget, maxIterations });

    // 生成所有參數組合
    const combinations = generateParameterCombinations(paramRanges);
    console.log(`生成 ${combinations.length} 個參數組合`);

    if (combinations.length > maxIterations) {
        // 如果組合太多，使用隨機抽樣
        const sampledCombinations = [];
        for (let i = 0; i < maxIterations; i++) {
            const randomIndex = Math.floor(Math.random() * combinations.length);
            sampledCombinations.push(combinations[randomIndex]);
        }
        combinations.splice(0, combinations.length, ...sampledCombinations);
        console.log(`使用隨機抽樣，縮減至 ${maxIterations} 個組合`);
    }

    const results = [];
    let bestResult = null;
    let bestScore = -Infinity;

    for (let i = 0; i < combinations.length; i++) {
        const params = combinations[i];

        // 合併參數到設定中
        const testSettings = { ...baseSettings, ...params };

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

            // 回報進度
            if (onProgress) {
                const progress = ((i + 1) / combinations.length) * 100;
                onProgress({
                    progress,
                    currentCombination: i + 1,
                    totalCombinations: combinations.length,
                    currentParams: params,
                    currentScore: score,
                    bestScore
                });
            }

        } catch (error) {
            console.error(`參數組合 ${i} 測試失敗:`, params, error);
            // 繼續下一個組合
        }
    }

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

    console.log('參數優化完成', {
        bestScore,
        bestParams: bestResult?.params,
        totalTests: results.length
    });

    return optimizationResults;
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

        // 計算相關係數
        const correlation = calculateCorrelation(paramValues, scores);

        // 計算參數範圍
        const min = Math.min(...paramValues);
        const max = Math.max(...paramValues);
        const range = max - min;

        sensitivity[paramName] = {
            correlation: Math.abs(correlation),
            range,
            impact: Math.abs(correlation) * range,
            direction: correlation > 0 ? 'positive' : 'negative'
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
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
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