變更日誌 (Changelog)
本文檔記錄了此專案所有重要的變更。

[2.1.0] - 2025-08-08
新增 (Added)
範圍分析模式: 在頁首新增「僅分析可見範圍」的開關。啟用後，所有圖表上的 SMC 指標將只根據當前螢幕可見的 K 棒進行即時計算與繪製，方便使用者專注分析特定市場區段。

[2.0.0] - 2025-08-08
新增 (Added)
回測參數可配置化:

在「策略回測設定」視窗中新增「等待 K 棒數量」(setupExpirationCandles) 的輸入欄位，讓使用者可以自訂交易設定的有效期限。

UI/UX 優化:

新增「顯示已緩解區域」的開關，讓使用者可以在保持圖表乾淨（預設）和查看完整歷史結構之間自由切換。

重構 (Refactored)
前端介面元件化:

建立 smc/components/ 資料夾。

將 index.html 中主要的 UI 區塊（側邊欄、頁首、所有 Modal 視窗）拆分為獨立的 .html 元件檔案。

更新 main.js 以非同步方式動態載入這些 HTML 元件，大幅簡化了 index.html 的結構，使其只作為一個應用程式的骨架。

修正 (Fixed)
回測邏輯修正:

為等待中的交易設定 (setup) 加入了「有效期限」機制，解決了模擬器在找到第一個交易機會後就「卡住」，不再尋找新機會的問題。

修正了 backtester.js 中交易方向的命名不一致問題（'BULLISH' -> 'LONG', 'BEARISH' -> 'SHORT'), 確保回測結果能被前端正確顯示顏色。

移除了 smc-analyzer.js 中導致「前視偏誤」(Look-ahead Bias) 的邏輯，確保回測引擎在做決策時不會「偷看」未來的價格資訊。

修正了 findNearestPOI 函式中的判斷條件，確保由 MSS K 線自身創造的 POI 能夠被正確識別。

[1.0.0] - 2025-08-07
重構 (Refactored)
JavaScript 模組化:

建立 smc/modules/ 資料夾。

將原先龐大的 main.js 檔案，根據職責拆分為多個獨立的模組：

api.js: 處理所有網路請求。

chart-controller.js: 封裝所有圖表相關的操作。

smc-analyzer.js: 核心的 SMC 策略計算引擎。

backtester.js: 獨立的回測模擬引擎。

main.js: 作為應用程式主入口與協調者。

前端啟動流程:

將 main.js 作為唯一的腳本入口，由其負責動態匯入並啟動 Alpine.js 框架，解決了複雜的腳本載入順序與競爭問題。