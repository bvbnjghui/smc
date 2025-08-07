// smc/sw.js

// ** 修改：更新快取版本號以觸發 Service Worker 更新 **
const CACHE_NAME = 'smc-analyzer-cache-v4'; 
// ** 修改：將新的元件檔案加入快取列表 **
const URLS_TO_CACHE = [
  // 核心 Shell
  '/smc/',
  '/smc/index.html',
  '/smc/main.js',
  '/smc/manifest.json',

  // JavaScript 模組
  '/smc/modules/api.js',
  '/smc/modules/smc-analyzer.js',
  '/smc/modules/chart-controller.js',
  '/smc/modules/backtester.js',

  // HTML 元件
  '/smc/components/sidebar.html',
  '/smc/components/header.html',
  '/smc/components/help-modal.html',
  '/smc/components/simulation-settings-modal.html',
  '/smc/components/simulation-results-modal.html',
  
  // 第三方函式庫 (CDN)
  'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/alpinejs@3.x.x/dist/module.esm.js',
  'https://unpkg.com/@alpinejs/collapse@3.x.x/dist/module.esm.js'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  // 確保 Service Worker 不會在快取完成前被啟用
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('快取已開啟，正在快取核心檔案...');
        // 使用 addAll 一次性快取所有核心檔案
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// 攔截網路請求
self.addEventListener('fetch', event => {
  // 對於後端 API 請求，永遠使用網路優先策略 (Network First)，不從快取讀取
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 對於其他靜態資源，使用快取優先策略 (Cache First)
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取中存在對應的回應，則直接回傳
        if (response) {
          return response;
        }

        // 如果快取中不存在，則透過網路請求
        return fetch(event.request).then(
          networkResponse => {
            // 如果請求失敗，或不是我們要快取的類型，則直接回傳
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // 複製一份請求的回應，因為 request 和 response 都是 stream，只能被使用一次
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // 將新的回應存入快取
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        );
      })
  );
});

// 啟用新的 Service Worker，並刪除舊版本的快取
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 如果快取名稱不在白名單中，則刪除它
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('正在刪除舊快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
