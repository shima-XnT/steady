// Steady Service Worker — オフラインキャッシュ
const CACHE_NAME = 'steady-v75';
const ASSET_PATHS = [
  'index.html',
  'css/index.css',
  'css/final-polish.css',
  'css/reboot-ui.css',
  'js/app.js',
  'js/db.js',
  'js/final-helpers.js',
  'js/final-views.js',
  'js/reboot-views.js',
  'js/utils.js',
  'js/judgment.js',
  'js/training.js',
  'js/providers/base-provider.js',
  'js/providers/manual-provider.js',
  'js/providers/health-connect-provider.js',
  'js/sync/sheet-sync.js',
  'js/views/dashboard.js',
  'js/views/condition-input.js',
  'js/views/work-schedule.js',
  'js/views/workout.js',
  'js/views/health.js',
  'js/views/history.js',
  'js/views/analytics.js',
  'js/views/settings.js',
  'js/views/onboarding.js',
  'data/sample-data.js',
  'manifest.json'
];
const ASSETS = ASSET_PATHS.map(path => new URL(path, self.registration.scope).toString());

// Install: キャッシュにアセットを保存
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: ネットワーク優先、失敗時にキャッシュにフォールバック
self.addEventListener('fetch', event => {
  // CDNリクエストはネットワークのみ
  if (event.request.url.includes('cdn') || event.request.url.includes('fonts')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        fetch(event.request)
          .then(response => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => cached)
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
