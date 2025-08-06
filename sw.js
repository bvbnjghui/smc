// 定義快取名稱和需要快取的檔案
const CACHE_NAME = 'smc-analyzer-cache-v2'; // 更新版本號以觸發更新
const URLS_TO_CACHE = [
  // ** 修正：更新為絕對路徑 **
  '/smc/',
  '/smc/index.html',
  '/smc/main.js',
  'https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@alpinejs/collapse@3.x.x/dist/cdn.min.js',
  'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  // 等待快取完成
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// 攔截網路請求
self.addEventListener('fetch', event => {
  // 對於 API 請求，永遠使用網路優先策略，不進行快取
  if (event.request.url.includes('/api/klines')) {
    return fetch(event.request);
  }

  event.respondWith(
    // 嘗試從快取中尋找請求
    caches.match(event.request)
      .then(response => {
        // 如果快取中存在，則直接回傳快取的資源
        if (response) {
          return response;
        }

        // 如果快取中不存在，則透過網路請求
        return fetch(event.request).then(
          response => {
            // 如果請求失敗，或不是我們要快取的類型，則直接回傳
            // 注意：CDN 回應的 type 是 'cors'，所以我們放寬 'basic' 的限制
            if (!response || response.status !== 200) {
              return response;
            }

            // 複製一份請求的回應，因為 request 和 response 都是 stream，只能被使用一次
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// 啟用新的 Service Worker，並刪除舊的快取
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
