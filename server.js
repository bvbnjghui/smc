const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
console.log('CORS middleware enabled for all origins.');

app.get('/', (req, res) => {
  console.log('Health check endpoint was hit.');
  res.status(200).send('SMC API Server is running and healthy!');
});

// API 路由：獲取即時 K 線數據 (最近 500 根)
app.get('/api/klines', async (req, res) => {
  console.log('Received request for /api/klines with query:', req.query);
  const { symbol, interval, limit = 500 } = req.query;

  if (!symbol || !interval) {
    return res.status(400).json({ error: '請提供 symbol 和 interval 參數' });
  }

  const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  
  try {
    const response = await fetch(binanceUrl);
    const data = await response.json();
    if (data.code && data.msg) throw new Error(data.msg);
    if (!response.ok) throw new Error(`Binance API request failed with status ${response.status}`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching live kline data:', error);
    res.status(500).json({ error: '獲取即時 K 線數據失敗', details: error.message });
  }
});

// ** 修改: API 路由，用於獲取歷史 K 線數據 (回測用)，加入分頁邏輯 **
app.get('/api/historical-klines', async (req, res) => {
  console.log('Received request for /api/historical-klines with query:', req.query);
  const { symbol, interval, startTime, endTime } = req.query;

  if (!symbol || !interval || !startTime || !endTime) {
    return res.status(400).json({ error: '請提供 symbol, interval, startTime 和 endTime 參數' });
  }

  try {
    let allKlines = [];
    let lastCandleTime = Number(startTime);
    const limit = 1000; // 每次請求最多 1000 根

    // ** 核心修改: 使用 while 迴圈來分頁獲取數據 **
    while (lastCandleTime < Number(endTime)) {
      const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${lastCandleTime}&endTime=${endTime}&limit=${limit}`;
      
      console.log(`Fetching from Binance: ${binanceUrl}`);
      const response = await fetch(binanceUrl);
      const data = await response.json();

      if (data.code && data.msg) throw new Error(data.msg);
      if (!response.ok) throw new Error(`Binance API request failed with status ${response.status}`);
      
      // 如果沒有返回數據，或返回的數據為空，則跳出迴圈
      if (!data || data.length === 0) {
        break;
      }

      allKlines = allKlines.concat(data);
      
      // 更新下一次請求的 startTime
      // 幣安返回的 K 線關閉時間是 kline[6]
      const lastKlineInBatch = data[data.length - 1];
      lastCandleTime = lastKlineInBatch[0] + 1; // 使用開盤時間 kline[0] + 1ms 作為下一次的起點
    }

    console.log(`Fetched a total of ${allKlines.length} historical klines.`);
    res.status(200).json(allKlines);

  } catch (error) {
    console.error('Error fetching historical kline data:', error);
    res.status(500).json({ error: '獲取歷史 K 線數據失敗', details: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
