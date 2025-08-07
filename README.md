SMC 策略分析儀
這是一個基於 Smart Money Concept (SMC) 交易策略的網頁應用程式，旨在自動化分析加密貨幣市場的 K 線數據，並在圖表上標示出關鍵的市場結構，以輔助交易決策。
此應用程式具備 PWA (Progressive Web App) 功能，可以被「安裝」至桌面或手機主畫面，並支援離線存取。
專案架構
本專案採用前後端分離的架構：
前端 (Frontend)
技術棧: HTML, Tailwind CSS, Alpine.js, TradingView Lightweight Charts
檔案: index.html, main.js, sw.js, manifest.json
部署: 部署為靜態網站，例如 GitHub Pages。
核心功能:
提供使用者介面，讓使用者可以設定交易對、時間週期等參數。
使用 TradingView Lightweight Charts 繪製 K 線與交易量圖表。
透過 Alpine.js 處理所有使用者互動與狀態管理。
在客戶端 (Client-Side) 執行所有 SMC 策略的分析與計算。
向後端 API 請求 K 線數據。
透過 Service Worker (sw.js) 實現 PWA 的離線快取功能。
後端 (Backend)
技術棧: Node.js, Express.js
檔案: server.js, package.json, Dockerfile
部署: 使用 Docker 容器化，並部署在雲端服務上 (例如 Google Cloud Run)。
核心功能:
作為一個輕量級的 API 代理 (Proxy)。
提供兩個主要的 API 端點，負責從幣安 (Binance) 的公開 API 獲取 K 線數據。
處理 CORS (跨來源資源共用) 問題，允許前端網頁的請求。
數據流程
使用者在前端介面設定好參數。
前端 main.js 根據使用者選擇的模式（即時或回測），向後端對應的 API 端點發送請求。
後端 server.js 收到請求後，向幣安 API 請求對應的 K 線數據。
後端將從幣安獲取的原始數據以 JSON 格式回傳給前端。
前端接收到數據後，進行 SMC 策略分析，並將 K 線與分析結果繪製在圖表上。
檔案功能說明
index.html
功能: 應用程式的主體 HTML 結構。
職責:
定義頁面的整體版面，包括固定的標頭、可收合的側邊欄、主內容區、圖表容器以及彈出式 Modal 視窗。
引入所有必要的 CSS 與 JavaScript 檔案 (Tailwind, Lightweight Charts, Alpine.js, main.js 等)。
透過 Alpine.js 的 x-data, x-show, x-model 等指令，將 HTML 元素與 main.js 中的狀態進行綁定。
main.js
功能: 應用程式的核心前端邏輯。
職責:
使用 Alpine.data('app', ...) 註冊一個全域的 Alpine.js 元件，管理所有狀態與方法。
設定管理:
init(): 在頁面載入時，從 localStorage 讀取使用者上次的設定。
saveSettings(): 當使用者更改任何設定時，自動將其儲存至 localStorage。
圖表控制:
setupChart(): 初始化 TradingView 圖表，並設定外觀、座標軸、縮放等行為。
fetchData(): 根據當前是「即時模式」還是「回測模式」，向後端對應的 API 發送請求以獲取數據。
SMC 分析引擎:
analyzeAll(): 統一呼叫所有分析函式的入口。
analyzeAndGetSwingPoints(): 找出所有的波段高/低點。
analyzeLiquidityGrabs(): 根據波段點，找出流動性掠奪 (BSL/SSL) 事件。
analyzeAndGetMSS(): 根據流動性掠奪，找出市場結構轉變 (MSS) 事件，並包含失效規則。
analyzeAndGetOrderBlocks(): 找出所有訂單塊 (OB)，並包含緩解 (Mitigation) 過濾規則。
analyzeAndGetFVGs(): 找出所有公平價值缺口 (FVG)，並包含緩解過濾規則。
繪圖邏輯:
redrawAllAnalyses(): 根據使用者的顯示設定 (開關)，將分析結果繪製到圖表上。
回測模擬:
runBacktestSimulation(): 核心的回測引擎，採用「狀態機」模式，模擬一個完整的交易劇本（等待訊號 -> 等待確認 -> 等待進場），並計算最終績效。
server.js
功能: 後端 API 伺服器。
職責:
/api/klines: 提供即時數據，獲取最近的 500 根 K 線。
/api/historical-klines: 提供歷史數據，根據前端傳入的開始與結束時間，獲取特定區間的 K 線，用於回測。
未來開發建議
增加更多 SMC 概念:
Change of Character (CHoCH): 標示出更早期的趨勢反轉訊號。
Breaker Block: 標示出被突破後，角色由支撐轉為壓力的訂單塊。
優化回測引擎:
多重止盈點: 允許設定多個止盈目標 (TP1, TP2)。
移動止損: 實現更複雜的止損策略，例如在價格達到 TP1 後將止損移至成本價 (Breakeven)。
視覺化交易: 在圖表上直接繪製出每一筆模擬交易的進場、出場、止損、止盈線。
使用者體驗 (UX) 優化:
圖表快照: 新增一個按鈕，讓使用者可以將當前的圖表與分析結果匯出為圖片。
自訂常用交易對: 讓使用者可以在側邊欄中，自行新增或刪除常用的交易對列表。
