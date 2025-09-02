import { getParamDisplayName } from './optimization-config.js';

// smc/modules/optimization-results.js

/**
 * @file 優化結果處理模組
 * 負責處理和分析優化結果
 */

/**
 * 處理優化結果並生成統計數據
 * @param {Object} optimizationResults - 原始優化結果
 * @returns {Object} 處理後的結果統計
 */
export function processOptimizationResults(optimizationResults) {
    const { results, bestResult, optimizationTarget } = optimizationResults;

    if (!results || results.length === 0) {
        return { error: '沒有有效的優化結果' };
    }

    // 基本統計
    const scores = results.map(r => r.score);
    const bestScore = Math.max(...scores);
    const worstScore = Math.min(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // 分數分布
    const scoreDistribution = createHistogram(scores, 10);

    // 參數相關性分析
    const paramCorrelations = analyzeParameterCorrelations(results);

    // 熱力圖數據 (適用於兩個參數的情況)
    const heatmapData = generateHeatmapData(results);

    // 帕累托前沿 (多目標優化)
    const paretoFront = calculateParetoFront(results);

    return {
        summary: {
            totalTests: results.length,
            bestScore,
            worstScore,
            avgScore,
            optimizationTarget,
            bestParams: bestResult?.params || {}
        },
        statistics: {
            scoreDistribution,
            paramCorrelations,
            heatmapData,
            paretoFront
        },
        rawResults: results
    };
}

/**
 * 創建直方圖數據
 * @param {Array} values - 數值陣列
 * @param {number} bins - 分箱數量
 * @returns {Array} 直方圖數據
 */
function createHistogram(values, bins) {
    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const binSize = range / bins;

    const histogram = new Array(bins).fill(0);

    values.forEach(value => {
        let binIndex = Math.floor((value - min) / binSize);
        if (binIndex >= bins) binIndex = bins - 1;
        if (binIndex < 0) binIndex = 0;
        histogram[binIndex]++;
    });

    return histogram.map((count, index) => ({
        binStart: min + index * binSize,
        binEnd: min + (index + 1) * binSize,
        count,
        percentage: (count / values.length) * 100
    }));
}

/**
 * 分析參數相關性
 * @param {Array} results - 優化結果陣列
 * @returns {Object} 參數相關性分析
 */
function analyzeParameterCorrelations(results) {
    if (results.length === 0) return {};

    const paramNames = Object.keys(results[0].params);
    const correlations = {};

    paramNames.forEach(paramName => {
        const paramValues = results.map(r => r.params[paramName]);
        const scores = results.map(r => r.score);

        // 檢查參數值是否有變化
        const min = Math.min(...paramValues);
        const max = Math.max(...paramValues);
        const range = max - min;

        // 如果參數值沒有變化，無法計算相關性
        if (range === 0) {
            correlations[paramName] = {
                correlation: 0,
                strength: 0,
                direction: 'neutral',
                interpretation: '參數值無變化'
            };
            return;
        }

        const correlation = calculateCorrelation(paramValues, scores);

        // 確保相關係數有效
        const validCorrelation = isNaN(correlation) || !isFinite(correlation) ? 0 : correlation;

        correlations[paramName] = {
            correlation: validCorrelation,
            strength: Math.abs(validCorrelation),
            direction: validCorrelation > 0 ? 'positive' : 'negative',
            interpretation: interpretCorrelation(validCorrelation)
        };
    });

    return correlations;
}

/**
 * 計算相關係數
 * @param {Array} x - X變數
 * @param {Array} y - Y變數
 * @returns {number} 相關係數
 */
function calculateCorrelation(x, y) {
    const n = x.length;

    // 檢查數據長度
    if (n < 2) return 0;

    // 檢查數據是否有效
    if (!x.every(val => typeof val === 'number' && isFinite(val)) ||
        !y.every(val => typeof val === 'number' && isFinite(val))) {
        return 0;
    }

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
 * 生成熱力圖數據
 * @param {Array} results - 優化結果
 * @returns {Object} 熱力圖數據
 */
function generateHeatmapData(results) {
    // 簡化版本：只處理兩個參數的情況
    const paramNames = Object.keys(results[0]?.params || {});
    if (paramNames.length !== 2) return null;

    const [paramX, paramY] = paramNames;
    const data = {};

    results.forEach(result => {
        const x = result.params[paramX];
        const y = result.params[paramY];
        const score = result.score;

        const key = `${x},${y}`;
        if (!data[key] || score > data[key].score) {
            data[key] = { x, y, score };
        }
    });

    return {
        paramX,
        paramY,
        data: Object.values(data)
    };
}

/**
 * 計算帕累托前沿
 * @param {Array} results - 優化結果
 * @returns {Array} 帕累托最優解
 */
function calculateParetoFront(results) {
    // 簡化版本：假設我們要同時優化勝率和淨收益
    const paretoPoints = [];

    results.forEach(result => {
        const winRate = result.results.winRate;
        const netPnl = result.results.netPnl;

        // 檢查是否被其他點支配
        const isDominated = paretoPoints.some(point =>
            point.winRate >= winRate && point.netPnl >= netPnl &&
            (point.winRate > winRate || point.netPnl > netPnl)
        );

        if (!isDominated) {
            // 移除被當前點支配的點
            const newParetoPoints = paretoPoints.filter(point =>
                !(point.winRate <= winRate && point.netPnl <= netPnl &&
                  (point.winRate < winRate || point.netPnl < netPnl))
            );

            newParetoPoints.push({
                params: result.params,
                winRate,
                netPnl,
                score: result.score
            });

            paretoPoints.splice(0, paretoPoints.length, ...newParetoPoints);
        }
    });

    return paretoPoints.sort((a, b) => b.score - a.score);
}

/**
 * 生成優化建議
 * @param {Object} processedResults - 處理後的結果
 * @returns {Array} 建議列表
 */
export function generateOptimizationRecommendations(processedResults) {
    const { summary, statistics } = processedResults;
    const recommendations = [];

    // 基於相關性分析的建議 - 降低閾值並增加解釋
    if (statistics.paramCorrelations) {
        Object.entries(statistics.paramCorrelations)
            .sort(([, a], [, b]) => b.strength - a.strength)
            .slice(0, 5) // 增加建議數量
            .forEach(([param, data]) => {
                if (data.strength > 0.2) { // 降低閾值到弱相關
                    const direction = data.direction === 'positive' ? '增加' : '減少';
                    const displayName = getParamDisplayName(param);
                    let priority = 'low';
                    let message = '';

                    if (data.strength > 0.7) {
                        priority = 'high';
                        message = `${direction} ${displayName} 可能會顯著改善表現 (${data.interpretation})`;
                    } else if (data.strength > 0.5) {
                        priority = 'medium';
                        message = `${direction} ${displayName} 可能會改善表現 (${data.interpretation})`;
                    } else {
                        priority = 'low';
                        message = `考慮 ${direction} ${displayName} 進行測試 (${data.interpretation})`;
                    }

                    // 添加更詳細的解釋
                    if (Math.abs(data.correlation) > 0.3) {
                        message += '\n注意：相關性分析可能無法捕捉參數間的複雜交互作用，建議結合其他參數一起調整';
                    }

                    recommendations.push({
                        type: 'parameter',
                        priority,
                        message,
                        param,
                        correlation: data.correlation,
                        strength: data.strength
                    });
                }
            });
    }

    // 基於分數分布的建議
    if (summary.bestScore > summary.avgScore * 1.5) {
        recommendations.push({
            type: 'general',
            priority: 'high',
            message: '發現了顯著優於平均水平的參數組合，建議採用最佳參數'
        });
    }

    // 基於測試數量的建議
    if (summary.totalTests < 50) {
        recommendations.push({
            type: 'general',
            priority: 'medium',
            message: '測試樣本較少，建議增加測試次數以獲得更可靠的結果'
        });
    }

    // 添加一般性建議
    recommendations.push({
        type: 'general',
        priority: 'medium',
        message: '參數優化結果僅供參考，建議在不同市場條件下重新測試，並考慮參數間的交互作用'
    });

    return recommendations;
}

/**
 * 匯出優化結果為CSV
 * @param {Array} results - 優化結果陣列
 * @returns {string} CSV格式的數據
 */
export function exportResultsToCSV(results) {
    if (!results || results.length === 0) return '';

    const headers = ['組合編號', '分數', ...Object.keys(results[0].params), '勝率', '淨收益', '總交易數'];

    const rows = results.map((result, index) => [
        index + 1,
        result.score.toFixed(4),
        ...Object.values(result.params),
        `${result.results.winRate.toFixed(2)}%`,
        `$${result.results.netPnl.toFixed(2)}`,
        result.results.totalTrades
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

    return csvContent;
}