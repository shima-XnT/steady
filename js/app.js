// ============================================
// Steady — メインアプリ / ルーター / ナビゲーション
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};

  // ルート定義
  const ROUTES = {
    home:      { view: 'Dashboard',      nav: 'home',     label: 'ホーム',     icon: '🏠' },
    condition: { view: 'ConditionInput', nav: 'condition', label: '体調',       icon: '📝' },
    schedule:  { view: 'WorkSchedule',   nav: 'schedule',  label: 'カレンダー',   icon: '📅' },
    workout:   { view: 'Workout',        nav: 'workout',   label: 'トレーニング', icon: '🏋️' },
    health:    { view: 'Health',         nav: 'health',    label: '健康',       icon: '💊' },
    history:   { view: 'History',        nav: 'history',   label: '履歴',       icon: '📊' },
    analytics: { view: 'Analytics',      nav: 'analytics', label: '分析',       icon: '📈' },
    settings:  { view: 'Settings',       nav: 'settings',  label: '設定',       icon: '⚙️' },
    onboarding:{ view: 'Onboarding',     nav: null,        label: '',           icon: '' }
  };

  // モバイルナビ（5つ） — 今日 / 健康 / 記録を最短で往復
  const MOBILE_NAV = ['home', 'condition', 'workout', 'history', 'settings'];
  
  // サイドバーナビ（セクション区切り付き）
  const SIDEBAR_NAV = [
    'home',
    '---',          // separator
    'condition', 'workout',
    '---',
    'schedule', 'health',
    '---',
    'history', 'analytics',
    '---',
    'settings'
  ];

  let currentRoute = null;
  let currentView = null;

  function getHashRoute() {
    return window.location.hash.replace('#/', '') || 'home';
  }

  function normalizeRoute(route) {
    if (route === 'onboarding') return 'home';
    return ROUTES[route] ? route : 'home';
  }

  /**
   * ナビゲーション
   */
  App.navigate = function(route) {
    window.location.hash = '#/' + normalizeRoute(route);
  };

  /**
   * 現在の画面をリロードする（async版は下で再定義）
   */

  /**
   * ビューのレンダリング
   */
  async function renderView(route) {
    const routeConfig = ROUTES[route];
    if (!routeConfig) {
      App.navigate('home');
      return;
    }

    const viewName = routeConfig.view;
    const view = App.Views[viewName];
    if (!view) {
      console.error(`View not found: ${viewName}`);
      return;
    }

    // 前のビューを破棄
    if (currentView && currentView.destroy) {
      currentView.destroy();
    }

    currentRoute = route;
    currentView = view;

    // レンダリング
    const mainContent = document.getElementById('main-content');
    try {
      mainContent.innerHTML = await view.render();
      // スクロールトップ
      mainContent.scrollTop = 0;

      // イベント設定
      if (view.init) {
        await view.init();
      }
    } catch (err) {
      console.error('View render error:', err);
      mainContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">表示エラー</div>
          <div class="empty-text">${err.message}</div>
          <button class="btn btn-primary mt-16" onclick="App.navigate('home')">ホームに戻る</button>
        </div>`;
    }

    // ナビゲーション更新
    updateNav(route);
  }

  /**
   * ビューの再描画
   */
  App.refreshView = async function() {
    if (currentRoute) {
      await renderView(currentRoute);
    }
  };

  /**
   * ナビゲーションUI更新
   */
  function updateNav(route) {
    // Bottom nav
    document.querySelectorAll('.bottom-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.route === route);
    });

    // Sidebar nav
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.route === route);
    });
  }

  /**
   * ナビゲーションHTMLの生成
   */
  function buildNavigation() {
    // Bottom nav
    const bottomNav = document.getElementById('bottom-nav');
    bottomNav.innerHTML = MOBILE_NAV.map(key => {
      const r = ROUTES[key];
      return `
        <a href="#/${key}" data-route="${key}">
          <span class="nav-icon">${r.icon}</span>
          ${r.label}
        </a>`;
    }).join('');

    // Sidebar nav
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <h1>からだログ</h1>
        <div class="subtitle">勤務と体調から今日を整える</div>
      </div>
      <ul class="sidebar-nav">
        ${SIDEBAR_NAV.map(key => {
          if (key === '---') return '<li><div class="sidebar-separator"></div></li>';
          const r = ROUTES[key];
          return `
            <li>
              <a href="#/${key}" data-route="${key}">
                <span class="nav-icon">${r.icon}</span>
                ${r.label}
              </a>
            </li>`;
        }).join('')}
      </ul>`;
  }

  /**
   * ハッシュ変更によるルーティング
   */
  function handleRoute() {
    const hash = getHashRoute();
    const route = normalizeRoute(hash);
    if (hash !== route) {
      window.history.replaceState(null, '', '#/' + route);
    }
    renderView(route);
  }

  /**
   * アプリ初期化
   */
  async function initApp() {
    // ★ 起動時マイグレーション（旧キー→正規キー変換）
    await App.DB.runMigrations();

    // Health Provider の初期化
    // 健康データは端末に応じて自動で扱う。
    // Android 実機は Health Connect、PC / ブラウザは閲覧専用 provider を使う。
    if (window.SteadyBridge) {
      App.healthProvider = new App.Providers.HealthConnectProvider();
    } else {
      App.healthProvider = new App.Providers.ManualProvider();
    }
    
    await App.healthProvider.initialize();

    // GAS 同期サーバーの初期化
    const gasSyncUrl = await App.DB.getSetting('gasSyncUrl', '');
    if (App.Sync && App.Sync.SheetSyncManager) {
      App.Sync.SheetSyncManager.init(gasSyncUrl);
      
      const tryAutoSync = () => {
        // Android WebView(file:///)ではnavigator.onLineがfalseを返すため、SteadyBridgeがあればバイパス
        const isOnline = window.SteadyBridge || navigator.onLine;
        if (App.Sync.SheetSyncManager.hasUrl() && isOnline) {
           App.Sync.SheetSyncManager.syncAll().then(res => {
             if (res && res.success && res.hasNewData) {
                console.log('✅ バックグラウンド同期により新しいデータが反映されました');
                App.refreshView();
             }
           }).catch(e => console.error('Auto sync error:', e));
        }
      };

      // 起動時に自動同期
      tryAutoSync();

      // アプリがバックグラウンドから復帰した時（スマホの画面点灯、PCのタブ切り替え時）にも自動同期
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
           tryAutoSync();
        }
      });

      // アプリを開いたままでもある程度即座（30秒ごと）に最新の状態を引っ張ってくる
      setInterval(() => {
         if (document.visibilityState === 'visible') {
           tryAutoSync();
         }
      }, 30000);

      // オンライン復帰時に未送信キューを自動再送
      window.addEventListener('online', async () => {
        console.log('[Sync] Online復帰 → 未送信キューを再送');
        await App.DB.retryPendingQueue();
        tryAutoSync();
      });
    }

    // --- Health Connect 定期更新（Android実機のみ） ---
    if (window.SteadyBridge && App.healthProvider && App.healthProvider.name === 'health_connect') {
      const refreshHealthData = async () => {
        try {
          const today = App.Utils.today();
          App.healthProvider.triggerSync(today);
          console.log('[HealthConnect] 定期データ更新をトリガーしました');
        } catch(e) {
          console.error('[HealthConnect] 定期更新エラー:', e);
        }
      };

      // 起動時に1回取得
      setTimeout(refreshHealthData, 3000);

      // 5分ごとに自動更新
      setInterval(() => {
        if (document.visibilityState === 'visible') {
          refreshHealthData();
        }
      }, 5 * 60 * 1000);

      // 画面復帰時にも取得
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          refreshHealthData();
        }
      });
    }

    // ナビゲーション構築
    buildNavigation();

    // ハッシュルーター
    window.addEventListener('hashchange', handleRoute);

    // オンボーディングは初回も自動表示しない。古いURLが残っていてもホームへ寄せる。
    const onboardingDone = await App.DB.getSetting('onboardingDone', false);
    if (!onboardingDone) {
      await App.DB.setSetting('onboardingDone', true);
    }
    if (getHashRoute() === 'onboarding') {
      window.history.replaceState(null, '', '#/home');
    }

    // 初回ルーティング
    handleRoute();

    // Service Worker 登録
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        console.log('[SW] Service Worker registered');
      } catch (e) {
        console.log('[SW] Registration failed (running locally?):', e.message);
      }
    }

    console.log('🎉 からだログ initialized');
  }

  // DOM Ready で起動
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
