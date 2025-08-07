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

核心功能:

元件化 UI: 將主要介面區塊（側邊欄、Modal 等）拆分為獨立的 HTML 檔案，存放於 components/ 資料夾中。

動態載入: 由 main.js 負責在應用程式啟動時，非同步載入所有 HTML 元件並注入主頁面。

模組化邏輯: 將核心商業邏輯拆分為獨立的 JavaScript 模組，存放於 modules/ 資料夾中。

固定式頁首: 採用固定式頁首設計，方便使用者在滾動頁面時隨時操作。

動態範圍分析: 提供「僅分析可見範圍」模式，啟用後所有指標會根據使用者平移或縮放的圖表視野即時更新。

使用 TradingView Lightweight Charts 繪製 K 線圖表。

透過 Alpine.js 處理所有使用者互動與狀態管理。

透過 Service Worker (sw.js) 實現 PWA 的離線快取功能。

後端 (Backend)
技術棧: Node.js, Express.js

檔案: server.js, package.json, Dockerfile

部署: 使用 Docker 容器化，並部署在雲端服務上 (例如 Google Cloud Run)。

核心功能:

作為一個輕量級的 API 代理 (Proxy)，負責從幣安 (Binance) 的公開 API 獲取 K 線數據。

處理 CORS (跨來源資源共用) 問題。

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

檔案功能說明
index.html
功能: 應用程式的骨架 (Skeleton)。

職責:

提供最基本的 HTML 結構 (<head>, <body>)。

包含各個 UI 元件的「佔位符」容器 (<div id="sidebar-container"> 等)。

引入核心 CSS、圖表庫，並將 main.js 作為唯一的腳本入口。

main.js
功能: 應用程式的總指揮 (Orchestrator)。

職責:

元件載入器: 在程式啟動初期，負責載入所有 components/*.html 檔案。

啟動器: 載入元件後，手動初始化並啟動 Alpine.js 框架。

狀態管理器: 定義全域的 Alpine.js app 元件，管理所有 UI 狀態與互動邏輯。

協調者: 匯入所有 modules/ 中的模組，並在適當時機呼叫它們，將各功能串接起來。

components/ (HTML 元件)
功能: 存放可重複使用的獨立 UI 區塊。

檔案:

sidebar.html: 側邊欄設定介面。

header.html: 頁面頂部標頭。

help-modal.html: 「如何解讀圖表」的彈出視窗。

simulation-settings-modal.html: 策略回測的參數設定視窗。

simulation-results-modal.html: 顯示回測結果的彈出視窗。

modules/ (JavaScript 核心模組)
api.js: 專門處理所有與後端 API 的通訊。

smc-analyzer.js: 核心 SMC 分析引擎，為純函式，不依賴外部狀態。

chart-controller.js: 圖表控制器，封裝所有與 Lightweight Charts 相關的操作，並監聽圖表視野變化事件。

backtester.js: 獨立的回測模擬引擎。

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