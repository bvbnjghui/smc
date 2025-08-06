const express = require('express');
const Binance = require('node-binance-api');
const cors = require('cors');

const app = express();
// Cloud Run 會自動設定 PORT 環境變數
const port = process.env.PORT || 8080;

// 使用幣安公開 API，因此不需要 API 金鑰
const binance = new Binance();

// 啟用 CORS 中介軟體，允許所有跨域請求
// 這是最簡單且最常見的設定，可以解決您遇到的問題
app.use(cors());

// 根路由，用於健康檢查
app.get('/', (req, res) => {
  res.send('SMC API 伺服器已啟動!');
});

// API 路由：獲取 K 線數據
app.get('/api/klines', async (req, res) => {
  const { symbol, interval, limit = 500 } = req.query;

  if (!symbol || !interval) {
    return res.status(400).json({ error: '請提供 symbol 和 interval 參數' });
  }

  try {
    const klines = await binance.candlesticks(symbol.toUpperCase(), interval, { limit });
    
    if (!klines || klines.length === 0) {
      console.log(`未找到 ${symbol} 的 K 線數據`);
      return res.json([]);
    }

    res.json(klines);
  } catch (error) {
    console.error('獲取 K 線數據失敗:', error);
    res.status(500).json({ error: '獲取 K 線數據失敗' });
  }
});

app.listen(port, () => {
  console.log(`伺服器已啟動，正在監聽 ${port} port`);
});
