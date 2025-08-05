const express = require('express');
const Binance = require('node-binance-api');
const cors = require('cors');

const app = express();
// Cloud Run 會自動設定 PORT 環境變數
const port = process.env.PORT || 8080;

// 使用幣安公開 API，因此不需要 API 金鑰
// 若未來需要更高的頻率限制或交易功能，則需在此處設定金鑰
const binance = new Binance();

app.use(cors()); // 啟用 CORS，允許前端呼叫

// 根路由，用於健康檢查
app.get('/', (req, res) => {
  res.send('SMC API 伺服器已啟動!');
});

// API 路由：獲取 K 線數據
// 範例: /api/klines?symbol=BTCUSDT&interval=15m&limit=500
app.get('/api/klines', async (req, res) => {
  const { symbol, interval, limit = 500 } = req.query;

  if (!symbol || !interval) {
    return res.status(400).json({ error: '請提供 symbol 和 interval 參數' });
  }

  try {
    // 從幣安獲取 K 線數據
    const klines = await binance.candlesticks(symbol.toUpperCase(), interval, { limit });
    
    // 目前我們先回傳原始數據，後續會在此處加入 SMC 策略分析邏輯
    res.json(klines);
  } catch (error) {
    console.error('獲取 K 線數據失敗:', error);
    res.status(500).json({ error: '獲取 K 線數據失敗' });
  }
});

app.listen(port, () => {
  console.log(`伺服器已啟動，正在監聽 ${port} port`);
});
