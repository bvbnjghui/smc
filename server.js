const express = require('express');
// const Binance = require('node-binance-api'); // 不再需要此套件
const cors = require('cors');

const app = express();
// Cloud Run 會自動設定 PORT 環境變數
const port = process.env.PORT || 8080;

// 啟用 CORS 中介軟體，允許所有跨域請求
app.use(cors());
console.log('CORS middleware enabled for all origins.');

// 根路由，用於 Cloud Run 健康檢查
app.get('/', (req, res) => {
  console.log('Health check endpoint was hit.');
  res.status(200).send('SMC API Server is running and healthy!');
});

// API 路由：獲取 K 線數據 (使用 fetch 直接呼叫幣安 API)
app.get('/api/klines', async (req, res) => {
  console.log('Received request for /api/klines with query:', req.query);
  const { symbol, interval, limit = 500 } = req.query;

  if (!symbol || !interval) {
    console.error('Validation failed: symbol or interval missing.');
    return res.status(400).json({ error: '請提供 symbol 和 interval 參數' });
  }

  // 直接使用幣安官方的 API 端點
  const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  console.log(`Fetching data directly from Binance URL: ${binanceUrl}`);

  try {
    const response = await fetch(binanceUrl);
    const data = await response.json();

    // 檢查幣安 API 是否回傳了錯誤訊息 (例如：無效的交易對)
    if (data.code && data.msg) {
        console.error('Binance API returned an error:', data);
        return res.status(500).json({
            error: '幣安 API 回傳錯誤',
            details: data.msg
        });
    }

    // 檢查網路請求是否成功
    if (!response.ok) {
        console.error(`Binance API request failed with status ${response.status}:`, data);
        return res.status(response.status).json({
             error: '請求幣安 API 失敗',
             details: data
            });
    }

    // 檢查回傳的數據是否為空陣列
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`No kline data found for ${symbol}. Response was empty.`);
      return res.status(404).json({ message: `未找到 ${symbol} 的 K 線數據` });
    }

    console.log(`Successfully fetched ${data.length} klines for ${symbol}.`);
    // 幣安官方 API 的數據格式與前端所需的一致
    res.status(200).json(data);

  } catch (error) {
    // 處理 fetch 本身的網路或系統錯誤
    console.error('Failed to fetch from Binance API due to a network or system error:', error);
    res.status(500).json({ 
        error: '呼叫幣安 API 時發生系統錯誤',
        details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
