SMC 策略分析儀
專案概述
這個專案是一個用於分析虛擬貨幣 SMC（Smart Money Concept）策略的網站。專案由一個 Node.js 後端服務和一個純前端靜態頁面組成。

後端：基於 Node.js 與 Express.js，部署在 Cloud Run 上，負責串接幣安的公開 API，獲取即時 K 線數據。

前端：使用原生 JavaScript、Alpine.js 和 Tailwind CSS，部署在 GitHub Pages 上，負責將後端提供的數據以圖表形式視覺化呈現給使用者。

專案架構
!(https://mermaid.live/svg/eyJjb2RlIjoiZ3JhcGggVERcbiAgICBBW0Zyb250ZW5kIChpbmRleC5odG1sKV1cbiAgICBCW0JhY2tlbmQgKGFwaSBTZXJ2ZXIpXVxuICAgIEMoW0JpbmFuY2UgUHVibGljIEFQSl0pXG4gICAgRCg8R0lUSFVCIENsb3VkIFJ1bj4pXG4gICAgRVs8R0lUSFVCIFBhZ2VzPl1cblxuICAgIEEtLT4gfGNhbGwgQVBJfCBCXG4gICAgQiAtLT4gfGZldGNoIGRhdGF8IEBcbiAgICBCIC0tPiB8cmVzcG9uc2V8IEFcbiAgICBBIC0tPiB8ZGVwbG95fCBFXG4gICAgQiAtLT4gfGRlcGxveXwgRFxuICAgIEUgLS0-fGxhdW5jaCBzaXRlfCBBXG4gICAgRCAtLT4gfHJ1biBzZXJ2ZXJ8IEIiLCJtZXJtYWlkIjp7InRoZW1lIjoiZGVmYXVsdCJ9fQ)

使用者：透過瀏覽器訪問託管在 GitHub Pages 上的靜態網頁。

前端 (index.html)：載入後，會向部署在 Cloud Run 上的後端服務發送 API 請求。

後端 (server.js)：接收到前端請求後，會向幣安公開 API 發送數據請求。

後端：將從幣安 API 獲取到的數據進行處理，然後以 JSON 格式回傳給前端。

前端：接收到數據後，會使用 TradingView Lightweight Charts 庫將 K 線和交易量圖表繪製出來。

檔案說明
server.js (後端 API 伺服器)
這個檔案是後端服務的核心。

功能：

使用 express 建立一個簡單的 RESTful API 服務。

透過 node-binance-api 函式庫，從幣安的公開 API 獲取 K 線數據。

提供 /api/klines 路由，接受 symbol、interval 和 limit 等參數。

包含 CORS 配置，允許來自任何來源的前端請求。

部署：此檔案會與 package.json 和 Dockerfile 一起打包成一個 Docker 容器，並部署到 Cloud Run。

package.json (專案依賴)
這個檔案定義了專案的元數據和所有必要的 npm 套件。

dependencies：列出了後端服務所需的套件，包括 express、cors 和 node-binance-api。

scripts：定義了啟動後端服務的命令 npm start。

Dockerfile (Docker 容器設定)
這個檔案包含了將後端服務打包成 Docker 容器的指令。

功能：

指定使用 node:20-slim 作為基礎映像。

設定工作目錄、複製依賴文件並安裝。

複製專案的程式碼。

暴露 8080 port，讓 Cloud Run 可以將流量導向此服務。

定義容器啟動時執行的命令 node server.js。

index.html (前端網頁)
這個檔案是整個專案的使用者介面。

功能：

使用 Tailwind CSS 進行頁面佈局和樣式設計。

使用 Alpine.js 處理使用者互動和數據狀態，例如處理輸入框、下拉選單和按鈕點擊事件。

透過 TradingView Lightweight Charts 庫，將後端 API 回傳的數據繪製成互動式 K 線圖。

透過 fetch 函式向後端服務發送數據請求。

包含一個錯誤處理機制，用於顯示 API 請求失敗時的訊息。

後續開發建議
後端：在 server.js 中，您可以在 klines 數據返回之前，加入 SMC 策略的分析邏輯。例如，您可以編寫函式來偵測訂單區塊、流動性掠奪和公平價值缺口，並將分析結果與 K 線數據一併回傳給前端。

前端：在 index.html 中，您可以修改 fetchData() 函式的邏輯，來接收後端分析後的數據，並在圖表上繪製相應的標記，例如用水平線或背景區域來標示 SMC 的關鍵位置。

回測功能：為了實現回測，您可以在後端加入一個新的 API 路由，用來處理歷史數據的獲取和策略模擬。
