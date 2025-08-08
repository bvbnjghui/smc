SMC 策略分析儀
這是一個基於 Smart Money Concept (SMC) 交易策略的網頁應用程式，旨在自動化分析加密貨幣市場的 K 線數據，並在圖表上標示出關鍵的市場結構，以輔助交易決策。

此應用程式具備 PWA (Progressive Web App) 功能，可以被「安裝」至桌面或手機主畫面，並支援離線存取。

詳細的開發歷程與版本更新，請參閱 CHANGELOG.md。

專案架構
本專案採用前後端分離的架構，並將前端的 JavaScript 邏輯與 HTML 介面都進行了模組化/元件化拆分，以達到高度的可維護性與可讀性。

前端 (Frontend)
技術棧: HTML, Tailwind CSS, Alpine.js, TradingView Lightweight Charts

檔案: index.html, main.js, sw.js, manifest.json, modules/, components/

部署: 部署為靜態網站，例如 GitHub Pages。

後端 (Backend)
技術棧: Node.js, Express.js

檔案: server.js, package.json, Dockerfile

部署: 使用 Docker 容器化，並部署在雲端服務上 (例如 Google Cloud Run)。

核心功能
元件化 UI: 將主要介面區塊（側邊欄、Modal 等）拆分為獨立的 HTML 檔案，存放於 components/ 資料夾中。

動態載入: 由 main.js 負責在應用程式啟動時，非同步載入所有 HTML 元件並注入主頁面。

模組化邏輯: 將核心商業邏輯拆分為獨立的 JavaScript 模組，存放於 modules/ 資料夾中。

進階 SMC 分析:

自動標示流動性掠奪 (BSL/SSL)、市場結構轉變 (MSS)。

趨勢轉變 (CHoCH): 標示出更早期的趨勢反轉訊號。

突破塊 (Breaker Block): 標示出被突破後，角色由支撐轉為壓力的訂單塊。

策略回測模擬器:

可自訂回測日期、初始資金、風險參數等。

整合 EMA 趨勢過濾器，可選擇只執行順勢交易以提高勝率。

使用者體驗優化:

自訂常用交易對: 讓使用者可以在側邊欄中，自行新增或刪除常用的交易對列表，並自動儲存。

初始載入優化: 使用 x-cloak 避免頁面載入初期的元件閃爍問題。

PWA 支援: 透過 Service Worker (sw.js) 實現 PWA 的離線快取功能。

數據與執行流程
瀏覽器載入 index.html，它只是一個基本的頁面骨架。

main.js 作為唯一的腳本入口被執行。

main.js 首先非同步載入 components/ 中的所有 HTML 元件，並將它們注入到 index.html 的指定位置。

所有元件載入完畢後，main.js 啟動 Alpine.js 框架。

Alpine.js 接管頁面，並根據 main.js 中定義的 app 元件初始化應用程式狀態及圖表。

使用者在前端介面互動，觸發數據請求。

api.js 模組向後端 server.js 發送請求。

後端從幣安獲取數據並回傳。

前端接收到數據後，由 smc-analyzer.js 進行分析，再由 chart-controller.js 將結果繪製到圖表上。

未來開發建議
優化回測引擎:

多重止盈點: 允許設定多個止盈目標 (TP1, TP2)。

移動止損: 實現更複雜的止損策略，例如在價格達到 TP1 後將止損移至成本價 (Breakeven)。

視覺化交易: 在圖表上直接繪製出每一筆模擬交易的進場、出場、止損、止盈線。

使用者體驗 (UX) 優化:

圖表快照: 新增一個按鈕，讓使用者可以將當前的圖表與分析結果匯出為圖片。

主題切換: 提供淺色/深色模式的切換功能。

數據分析擴展:

多時間週期分析 (Multi-Timeframe Analysis): 允許在高時間週期的圖表上疊加低時間週期的關鍵結構，提供更全面的市場視角。