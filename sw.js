// smc/sw.js

// ** 修改：更新快取版本號以觸發 Service Worker 更新 **
const CACHE_NAME = 'smc-analyzer-cache-v7'; 
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
  'https://unpkg.com/@alpinejs/collapse@3.x.x/dist/module.esm.js',
  // ** 新增：快取 anchor 插件 **
  'https://unpkg.com/@alpinejs/anchor@3.x.x/dist/module.esm.js'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker 正在安裝...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('快取已開啟，正在快取核心檔案...');
        // ** 修改：使用 { cache: 'reload' } 確保每次都從網路獲取最新的 CDN 檔案 **
        const cachePromises = URLS_TO_CACHE.map(urlToCache => {
            const request = new Request(urlToCache, { cache: 'reload' });
            return fetch(request).then(response => {
                if (response.status === 200) {
                    return cache.put(urlToCache, response);
                }
            });
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('所有核心檔案快取完畢，強制啟用 Service Worker。');
        return self.skipWaiting();
      })
  );
});

// 啟用新的 Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker 正在啟用...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('正在刪除舊快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('舊快取已清除，Service Worker 已接管控制權。');
      return self.clients.claim();
    })
  );
});

// 攔截網路請求
self.addEventListener('fetch', event => {
  // 對於 API 請求，總是從網路獲取
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 對於其他請求，採用「快取優先，網路備用」策略
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          networkResponse => {
            // 如果網路請求失敗，或不是 200 OK，則直接返回
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            // 複製一份回應，一份給瀏覽器，一份放入快取
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
  );
});
