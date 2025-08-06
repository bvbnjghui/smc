const express = require('express');
const Binance = require('node-binance-api');
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

// API 路由：獲取 K 線數據
app.get('/api/klines', async (req, res) => {
  console.log('Received request for /api/klines with query:', req.query);
  const { symbol, interval, limit = 500 } = req.query;

  if (!symbol || !interval) {
    console.error('Validation failed: symbol or interval missing.');
    return res.status(400).json({ error: '請提供 symbol 和 interval 參數' });
  }

  try {
    // 將 Binance 物件的初始化移至請求處理函式內部
    // 這樣可以避免在服務啟動時因初始化失敗而導致整個容器崩潰
    console.log('Initializing Binance API...');
    const binance = new Binance();
    console.log('Binance API initialized successfully.');

    console.log(`Fetching candlesticks for ${symbol}, interval ${interval}, limit ${limit}`);
    const klines = await binance.candlesticks(symbol.toUpperCase(), interval, { limit });
    
    if (!klines || klines.length === 0) {
      console.warn(`No kline data found for ${symbol}`);
      // 如果找不到數據，回傳 404 Not Found
      return res.status(404).json({ message: `未找到 ${symbol} 的 K 線數據` });
    }

    console.log(`Successfully fetched ${klines.length} klines for ${symbol}.`);
    res.status(200).json(klines);

  } catch (error) {
    // 提供更詳細的錯誤日誌
    console.error('Error fetching kline data from Binance:', error);
    // 向客戶端回傳一個更通用的錯誤訊息
    res.status(500).json({ 
        error: '從幣安獲取 K 線數據時發生內部伺服器錯誤',
        details: error.message // 在開發中可以提供詳細資訊
    });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
