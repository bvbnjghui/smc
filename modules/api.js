// smc/modules/api.js

/**
 * @file 專門處理與後端 API 的所有通訊。
 */

// 後端 API 的基礎 URL
const API_URL = 'https://smc-338857749184.europe-west1.run.app';

/**
 * 根據參數從後端獲取 K 線和交易量數據。
 * @param {object} params - 請求參數。
 * @param {string} params.symbol - 交易對，例如 'BTCUSDT'。
 * @param {string} params.interval - K 線週期，例如 '15m'。
 * @param {boolean} params.isBacktestMode - 是否為回測模式。
 * @param {string} [params.backtestStartDate] - 回測開始日期 (YYYY-MM-DD)。
 * @param {string} [params.backtestEndDate] - 回測結束日期 (YYYY-MM-DD)。
 * @returns {Promise<{candles: object[], volumes: object[]}>} 包含 K 線和交易量數據的物件。
 */
export async function fetchKlines(params) {
    const { symbol, interval, isBacktestMode, backtestStartDate, backtestEndDate } = params;
    let url;

    if (isBacktestMode) {
        // 處理回測模式的 API 請求
        const startTime = new Date(backtestStartDate).getTime();
        const endTime = new Date(backtestEndDate).getTime();
        url = `${API_URL}/api/historical-klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${startTime}&endTime=${endTime}`;
    } else {
        // 處理即時模式的 API 請求
        url = `${API_URL}/api/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=500`;
    }

    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 請求失敗 (${response.status}): ${errorData.details || '無法連接伺服器'}`);
    }
    const rawData = await response.json();
    if (!Array.isArray(rawData)) {
        throw new Error('從 API 收到的數據格式不正確。');
    }

    // 將從幣安收到的原始陣列數據格式化為圖表庫所需的物件陣列
    const candles = rawData.map(d => ({
        time: d[0] / 1000,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
    }));

    const volumes = rawData.map(d => ({
        time: d[0] / 1000,
        value: parseFloat(d[5]),
        color: parseFloat(d[4]) >= parseFloat(d[1]) ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    }));

    return { candles, volumes };
}
