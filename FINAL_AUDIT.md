# 最終仕上げレポート

## 1. 現状UIの問題点整理
- ホームで「今日どうするか」が最優先表示になっておらず、判定・勤務・健康・未送信状態が分散していた。
- スマホとPCで同じ情報密度に近く、スマホは判断導線、PCは一覧・比較・編集という役割分担が弱かった。
- 保存状態の表現が画面ごとに不統一で、Apps Script 成功後だけを成功扱いにする思想がUIへ十分に反映されていなかった。
- settings が sharedSettings と localDeviceSettings に分かれて見えず、共有確定条件も曖昧だった。

## 2. スマホ版UI再設計案
- ホームを「今日の判定」「勤務」「利用可能時間」「健康データ」「今日の記録」に集中。
- 判定とワークアウト開始を最上段の主要CTAへ集約。
- ワークアウトは必須種目と任意種目を分離し、前回実績・今日の推奨・今回入力を横並び表示。
- 健康はスマホ入力、PC閲覧の役割を説明付きで明確化。

## 3. PC版UI再設計案
- サイドバー文言を再構成し、月カレンダー・詳細ペイン・分析サマリー中心へ寄せた。
- ダッシュボードはメインとサイドの2カラム構成に変更し、継続状況と次導線を一覧化。
- 勤務表は月ビューと今日の詳細カードを分離。
- 分析は睡眠・判定スコア・実施回数のサマリー中心へ再設計。

## 4. sharedSettings / localDeviceSettings の整理方針
- sharedSettings: weeklyGoal, sessionDuration, strictness, gymHoursStart, gymHoursEnd, notifPrep, notifJudge, notifResume。
- localDeviceSettings: gasSyncUrl, healthProvider。
- sharedSettings は Apps Script の saveSettings 成功後のみローカルへ確定。
- localDeviceSettings は端末ローカルへ即時保存し、共有設定シートへは送らない。

## 5. Apps Script 側へ寄せる正規化処理一覧
- settingsType=shared を前提に sharedSettings のみ保存。
- gasSyncUrl と healthProvider を GAS 保存対象から除外。
- healthconnect -> health_connect。
- heartRate / avgHeartRate -> heartRateAvg。
- restingHR -> restingHeartRate。

## 6. 修正対象ファイル一覧
- index.html
- css/final-polish.css
- js/final-helpers.js
- js/final-views.js
- sync-assets.ps1
- gas/code.gs

## 7. 各ファイルの修正理由
- index.html: 追加CSS/JSを読み込み、root側を正本として最終UIを差し込むため。
- css/final-polish.css: スマホ/PCの情報設計差を視覚的に出す最終スタイルを追加するため。
- js/final-helpers.js: ナビ再構成、sync state UI、settings分離、保存状態管理を共通化するため。
- js/final-views.js: Dashboard / Settings / Workout / Health / Schedule / Analytics を最終設計へ差し替えるため。
- sync-assets.ps1: assets 側同期でディレクトリ削除に依存しないようにし、ロック中でも同期しやすくするため。
- gas/code.gs: sharedSettings のみを共有保存し、ローカル設定混入を防ぐため。

## 8. 修正後コード全文

### index.html
```
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Steady 窶・繧・＆縺励＞邯咏ｶ壹さ繝ｼ繝・/title>
  <meta name="description" content="莉穂ｺ狗ｵゅｏ繧翫〒繧ら┌逅・↑縺冗ｶ壹￠繧峨ｌ繧九ヵ繧｣繝・ヨ繝阪せ繝ｻ蛛･蠎ｷ邂｡逅・・邯咏ｶ壽髪謠ｴPWA繧｢繝励Μ縲ゅメ繝ｧ繧ｳ繧ｶ繝・・蟇ｾ蠢懊・>
  <meta name="theme-color" content="#0a0a14">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

  <!-- PWA -->
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/icon-192.png">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <!-- Styles -->
  <link rel="stylesheet" href="css/index.css">
  <link rel="stylesheet" href="css/final-polish.css">
</head>
<body>
  <div id="app">
    <!-- Desktop Sidebar -->
    <nav id="sidebar" class="sidebar"></nav>

    <!-- Main Content Area -->
    <main id="main-content" class="main-content">
      <div class="loading">
        <div class="spinner"></div>
      </div>
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav id="bottom-nav" class="bottom-nav"></nav>

    <!-- Modal Container -->
    <div id="modal-container"></div>

    <!-- Toast Container -->
    <div id="toast-container" class="toast-container"></div>
  </div>

  <!-- Libraries (CDN) -->
  <script src="https://unpkg.com/dexie@3/dist/dexie.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>

  <!-- App Core -->
  <script src="js/utils.js"></script>
  <script src="js/db.js"></script>
  <script src="js/sync/sheet-sync.js"></script>

  <!-- Health Data Providers -->
  <script src="js/providers/base-provider.js"></script>
  <script src="js/providers/manual-provider.js"></script>
  <script src="js/providers/health-connect-provider.js"></script>

  <!-- Logic Engines -->
  <script src="js/judgment.js"></script>
  <script src="js/training.js"></script>

  <!-- Views -->
  <script src="js/views/dashboard.js"></script>
  <script src="js/views/condition-input.js"></script>
  <script src="js/views/work-schedule.js"></script>
  <script src="js/views/workout.js"></script>
  <script src="js/views/health.js"></script>
  <script src="js/views/history.js"></script>
  <script src="js/views/analytics.js"></script>
  <script src="js/views/settings.js"></script>
  <script src="js/views/onboarding.js"></script>

  <!-- Sample Data -->
  <script src="data/sample-data.js"></script>

  <script src="js/final-helpers.js"></script>
  <script src="js/final-views.js"></script>

  <!-- App Main (must be last) -->
  <script src="js/app.js"></script>
</body>
</html>
```

### css\final-polish.css
```
:root {
  --bg-primary: #f5f1e8;
  --surface-1: #fffaf1;
  --surface-2: #ffffff;
  --surface-3: #efe3cf;
  --surface-hover: #f5ead9;
  --text-primary: #30251c;
  --text-secondary: #5e4d3d;
  --text-muted: #8e7863;
  --border: rgba(48, 37, 28, 0.1);
  --border-light: rgba(48, 37, 28, 0.16);
  --primary: #2d6a4f;
  --primary-light: #3d8a66;
  --primary-dark: #1e4f39;
  --primary-glow: rgba(45, 106, 79, 0.14);
  --accent: #e08d3c;
  --success: #2f855a;
  --warning: #d97706;
  --danger: #c2410c;
  --info: #2563eb;
  --shadow: 0 16px 42px rgba(85, 63, 43, 0.12);
  --font: "Segoe UI", "Yu Gothic UI", sans-serif;
}

body {
  background:
    radial-gradient(circle at top left, rgba(224, 141, 60, 0.16), transparent 28%),
    radial-gradient(circle at top right, rgba(45, 106, 79, 0.14), transparent 24%),
    linear-gradient(180deg, #f9f5ed 0%, #f2ebde 100%);
}

.main-content {
  background: transparent;
}

.sidebar,
.bottom-nav {
  background: rgba(255, 249, 240, 0.92);
  backdrop-filter: blur(18px);
}

.polished-brand h1 {
  color: var(--primary-dark);
  -webkit-text-fill-color: initial;
}

.polished-nav .nav-icon,
.bottom-nav .nav-icon {
  font-size: 0.72rem;
  width: auto;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.hero-panel,
.settings-card,
.decision-panel,
.focus-card,
.side-card,
.section-block,
.exercise-panel,
.timeline-card,
.status-panel {
  background: rgba(255, 252, 247, 0.92);
  border: 1px solid rgba(48, 37, 28, 0.08);
  box-shadow: var(--shadow);
}

.page-lead,
.hero-panel,
.settings-shell,
.workout-shell,
.health-shell,
.schedule-shell,
.analytics-shell {
  margin-bottom: 20px;
}

.page-lead h2,
.hero-panel h2 {
  color: var(--primary-dark);
  font-size: 1.75rem;
  margin-bottom: 6px;
}

.page-lead p,
.hero-panel p,
.micro-copy,
.decision-message {
  color: var(--text-secondary);
}

.hero-panel {
  border-radius: 28px;
  padding: 24px;
  display: grid;
  gap: 18px;
}

.hero-eyebrow,
.section-kicker {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  font-weight: 700;
}

.hero-date {
  color: var(--text-muted);
  font-weight: 600;
}

.dashboard-shell,
.schedule-board,
.settings-grid {
  display: grid;
  gap: 16px;
}

.decision-panel,
.section-block,
.settings-card,
.side-card {
  border-radius: 24px;
  padding: 20px;
}

.decision-heading,
.section-heading,
.exercise-panel-header,
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading.compact h3 {
  font-size: 1rem;
}

.section-heading span,
.exercise-panel-header p,
.focus-label,
.focus-sub,
.exercise-metrics span {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.decision-score,
.focus-value {
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--primary-dark);
}

.reason-list,
.hero-actions,
.mini-list,
.workout-actions,
.exercise-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reason-chip,
.mini-link,
.status-action,
.week-pill {
  border-radius: 999px;
}

.reason-chip {
  display: inline-flex;
  background: rgba(224, 141, 60, 0.14);
  color: #8a4f16;
  padding: 6px 12px;
  margin-right: 8px;
  margin-bottom: 8px;
}

.focus-grid,
.exercise-metrics {
  display: grid;
  gap: 12px;
}

.focus-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.focus-card {
  border-radius: 20px;
  padding: 18px;
}

.status-panel {
  border-radius: 22px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.status-panel-title {
  font-weight: 700;
}

.status-panel-desc {
  color: var(--text-secondary);
  font-size: 0.88rem;
}

.tone-success { border-color: rgba(47, 133, 90, 0.24); }
.tone-warning { border-color: rgba(217, 119, 6, 0.24); }
.tone-error { border-color: rgba(194, 65, 12, 0.24); }
.tone-busy { border-color: rgba(37, 99, 235, 0.24); }

.status-action,
.mini-link,
.action-tile {
  background: rgba(45, 106, 79, 0.08);
  border: 1px solid rgba(45, 106, 79, 0.14);
  color: var(--primary-dark);
  cursor: pointer;
  padding: 10px 14px;
  font: inherit;
  text-align: left;
}

.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.week-pill {
  background: #f8efe2;
  padding: 10px 6px;
  text-align: center;
  border: 1px solid rgba(48, 37, 28, 0.08);
}

.week-pill.done {
  background: rgba(47, 133, 90, 0.14);
}

.week-pill.skip {
  background: rgba(217, 119, 6, 0.14);
}

.week-pill.today {
  outline: 2px solid rgba(45, 106, 79, 0.28);
}

.exercise-panel {
  border-radius: 20px;
  padding: 18px;
}

.exercise-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 12px;
}

.exercise-metrics strong {
  display: block;
  margin-top: 4px;
}

.calendar-grid.polished-calendar {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.calendar-cell {
  background: #f9f0e4;
  border: 1px solid rgba(48, 37, 28, 0.08);
  border-radius: 18px;
  padding: 12px 8px;
  min-height: 78px;
}

.calendar-cell.other {
  opacity: 0.45;
}

.day-number {
  display: block;
  font-weight: 700;
  margin-bottom: 4px;
}

.day-shift {
  font-size: 0.72rem;
  color: var(--text-muted);
}

@media (min-width: 768px) {
  .dashboard-shell {
    grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr);
  }

  .schedule-board,
  .settings-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  }
}

@media (max-width: 767px) {
  .focus-grid,
  .exercise-metrics {
    grid-template-columns: 1fr;
  }

  .hero-panel,
  .decision-panel,
  .side-card,
  .settings-card {
    border-radius: 22px;
  }
}
```

### js\final-helpers.js
```
(function() {
  'use strict';
  window.App = window.App || {};

  const ROUTE_LABELS = {
    home: '莉頑律',
    condition: '蛻､螳・,
    workout: '險倬鹸',
    health: '蛛･蠎ｷ',
    schedule: '蜍､蜍・,
    history: '螻･豁ｴ',
    analytics: '蛻・梵',
    settings: '險ｭ螳・
  };

  const SHIFT_LABELS = {
    off: '莨代∩',
    normal: '騾壼ｸｸ蜍､蜍・,
    early: '譌ｩ逡ｪ',
    late: '驕・分',
    night: '螟懷共',
    remote: '蝨ｨ螳・
  };

  const SHARED_SETTING_KEYS = ['weeklyGoal', 'sessionDuration', 'strictness', 'gymHoursStart', 'gymHoursEnd', 'notifPrep', 'notifJudge', 'notifResume'];
  const LOCAL_DEVICE_SETTING_KEYS = ['gasSyncUrl', 'healthProvider'];

  function getRoute() {
    return (window.location.hash || '#/home').replace('#/', '') || 'home';
  }

  function applyNavigation() {
    const sidebar = document.getElementById('sidebar');
    const bottomNav = document.getElementById('bottom-nav');
    if (!sidebar || !bottomNav) return;

    const desktopRoutes = ['home', 'condition', 'workout', 'schedule', 'health', 'history', 'analytics', 'settings'];
    const mobileRoutes = ['home', 'condition', 'workout', 'health', 'settings'];

    sidebar.innerHTML = `
      <div class="sidebar-brand polished-brand">
        <h1>Steady</h1>
        <div class="subtitle">蜍､蜍吶→菴楢ｪｿ縺九ｉ莉頑律縺ｮ陦悟虚繧呈ｱｺ繧√ｋ</div>
      </div>
      <ul class="sidebar-nav polished-nav">
        ${desktopRoutes.map(route => `<li><a href="#/${route}" data-route="${route}"><span class="nav-icon">${ROUTE_LABELS[route]}</span><span>${ROUTE_LABELS[route]}</span></a></li>`).join('')}
      </ul>`;

    bottomNav.innerHTML = mobileRoutes.map(route => `<a href="#/${route}" data-route="${route}"><span class="nav-icon">${ROUTE_LABELS[route]}</span><span>${ROUTE_LABELS[route]}</span></a>`).join('');

    document.querySelectorAll('.bottom-nav a, .sidebar-nav a').forEach(link => {
      link.classList.toggle('active', link.dataset.route === getRoute());
    });
  }

  async function buildSyncState() {
    const pendingCount = await App.DB.getPendingCount();
    const lastSyncAt = await App.DB.getSetting('_lastSyncAt', '');
    const lastSaveStatus = await App.DB.getSetting('_saveStatus', '');
    const hasUrl = !!(App.Sync && App.Sync.SheetSyncManager && App.Sync.SheetSyncManager.hasUrl());

    if (pendingCount > 0) {
      return { level: 'warning', title: `譛ｪ騾∽ｿ｡ ${pendingCount} 莉ｶ`, description: 'Google 繧ｹ繝励Ξ繝・ラ繧ｷ繝ｼ繝医∈縺ｮ菫晏ｭ倥・縺ｾ縺螳御ｺ・＠縺ｦ縺・∪縺帙ｓ縲・ };
    }
    if (lastSaveStatus === 'busy') {
      return { level: 'busy', title: '菫晏ｭ倅ｸｭ', description: '蜈ｱ譛峨ョ繝ｼ繧ｿ繧・Google 繧ｹ繝励Ξ繝・ラ繧ｷ繝ｼ繝医∈騾∽ｿ｡縺励※縺・∪縺吶・ };
    }
    if (lastSaveStatus === 'error') {
      return { level: 'error', title: '騾∽ｿ｡螟ｱ謨・, description: '繝ｭ繝ｼ繧ｫ繝ｫ縺ｫ縺ｯ谿九▲縺ｦ縺・∪縺吶ょ・蜷梧悄縺ｧ蜀埼√＠縺ｦ縺上□縺輔＞縲・ };
    }
    if (!hasUrl) {
      return { level: 'warning', title: '蜈ｱ譛我ｿ晏ｭ倥・譛ｪ險ｭ螳・, description: 'Apps Script URL 繧定ｨｭ螳壹☆繧九∪縺ｧ sharedSettings 縺ｯ遒ｺ螳壹＠縺ｾ縺帙ｓ縲・ };
    }
    return { level: 'success', title: '蜈ｱ譛峨ョ繝ｼ繧ｿ縺ｯ蜷梧悄貂医∩', description: lastSyncAt ? `譛邨ょ酔譛・${App.Utils.formatTimeShort(lastSyncAt)}` : 'Google 繧ｹ繝励Ξ繝・ラ繧ｷ繝ｼ繝医ｒ豁｣縺ｨ縺励※驕狗畑荳ｭ縺ｧ縺吶・ };
  }

  function renderSaveState(state, actionLabel, actionHandler) {
    return App.Utils.renderSaveState(state, {
      actionLabel,
      actionHandler
    });
  }

  function getAvailableMinutes(schedule) {
    if (!schedule) return null;
    if (schedule.shiftType === 'off') return 120;
    const endMin = App.Utils.timeToMinutes(schedule.endTime);
    if (endMin == null) return null;
    return Math.max(0, (24 * 60) - Math.max(endMin + 30, 22 * 60));
  }

  function getShiftLabel(type) {
    return SHIFT_LABELS[type] || type || '譛ｪ險ｭ螳・;
  }

  function formatShiftRange(schedule) {
    if (!schedule) return '譛ｪ險ｭ螳・;
    return `${App.Utils.normTime(schedule.startTime) || '--:--'} - ${App.Utils.normTime(schedule.endTime) || '--:--'}`;
  }

  function installDbHelpers() {
    App.Utils.renderSaveState = function(state, options) {
      const actionHtml = options && options.actionLabel && options.actionHandler
        ? `<button class="status-action" onclick="${options.actionHandler}">${options.actionLabel}</button>`
        : '';
      return `
        <div class="status-panel tone-${state.level || 'neutral'}">
          <div class="status-panel-copy">
            <div class="status-panel-title">${App.Utils.escapeHtml(state.title || '')}</div>
            <div class="status-panel-desc">${App.Utils.escapeHtml(state.description || '')}</div>
          </div>
          ${actionHtml}
        </div>`;
    };

    App.Utils.formatKgRepsSets = function(weight, reps, sets) {
      if (weight > 0) return `${weight}kg ﾃ・${reps}蝗・ﾃ・${sets}繧ｻ繝・ヨ`;
      return `${reps}蝗・ﾃ・${sets}繧ｻ繝・ヨ`;
    };

    App.Utils.formatWorkoutSummary = function(item) {
      if (!item) return '';
      if (item.isCardio) return `${item.durationMin || 10}蛻・;
      var firstSet = item.sets && item.sets[0];
      if (!firstSet) return '';
      return App.Utils.formatKgRepsSets(firstSet.weight || 0, firstSet.reps || 0, item.sets.length || 1);
    };

    App.DB.SHARED_SETTING_KEYS = SHARED_SETTING_KEYS.slice();
    App.DB.LOCAL_DEVICE_SETTING_KEYS = LOCAL_DEVICE_SETTING_KEYS.slice();

    App.DB.getSharedSettings = async function() {
      const values = {};
      for (const key of SHARED_SETTING_KEYS) values[key] = await this.getSetting(key, null);
      return values;
    };

    App.DB.getLocalDeviceSettings = async function() {
      const values = {};
      for (const key of LOCAL_DEVICE_SETTING_KEYS) values[key] = await this.getSetting(key, key === 'healthProvider' ? 'manual' : '');
      return values;
    };

    App.DB.getSettingsBundle = async function() {
      return {
        sharedSettings: await this.getSharedSettings(),
        localDeviceSettings: await this.getLocalDeviceSettings()
      };
    };

    App.DB.setSaveStatus = async function(level, context) {
      await this.setSetting('_saveStatus', level || '');
      await this.setSetting('_saveStatusContext', context || '');
      await this.setSetting('_saveStatusAt', new Date().toISOString());
    };

    App.DB.getSaveState = async function() {
      return buildSyncState();
    };

    const originalPushToCloud = App.DB.pushToCloud.bind(App.DB);
    App.DB.pushToCloud = async function(dateStr) {
      await this.setSaveStatus('busy', dateStr);
      const result = await originalPushToCloud(dateStr);
      await this.setSaveStatus(result.ok ? 'success' : (result.error === '繧ｪ繝輔Λ繧､繝ｳ' ? 'pending' : 'error'), dateStr);
      return result;
    };

    const originalSyncAll = App.Sync.SheetSyncManager.syncAll.bind(App.Sync.SheetSyncManager);
    App.Sync.SheetSyncManager.syncAll = async function() {
      await App.DB.setSaveStatus('busy', 'sync');
      const result = await originalSyncAll();
      await App.DB.setSaveStatus(result && result.success ? 'success' : 'error', 'sync');
      return result;
    };
  }

  App.FinalPolish = {
    ROUTE_LABELS,
    SHIFT_LABELS,
    buildSyncState,
    renderSaveState,
    getAvailableMinutes,
    getShiftLabel,
    formatShiftRange,
    applyNavigation,
    installDbHelpers
  };

  window.addEventListener('hashchange', () => setTimeout(applyNavigation, 0));
  window.addEventListener('resize', () => setTimeout(applyNavigation, 0));
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      installDbHelpers();
      applyNavigation();
      document.title = 'Steady | 蜍､蜍咎｣蜍輔ヨ繝ｬ繝ｼ繝九Φ繧ｰ';
    }, 60);
  });
})();
```

### js\final-views.js
```
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  function h(value) {
    return App.Utils.escapeHtml(value == null ? '' : String(value));
  }

  async function syncPanel(actionHandler) {
    const state = await App.DB.getSaveState();
    const pending = await App.DB.getPendingCount();
    return App.FinalPolish.renderSaveState(state, pending > 0 ? '蜀榊酔譛・ : '蜷梧悄縺吶ｋ', actionHandler);
  }

  App.Views.Dashboard = {
    async render() {
      const today = App.Utils.today();
      const judgment = await App.DB.getJudgment(today);
      const health = await App.DB.getHealth(today);
      const condition = await App.DB.getCondition(today);
      const schedule = await App.DB.getSchedule(today);
      const workout = await App.DB.getWorkoutByDate(today);
      const weekDates = App.Utils.getWeekDates(today);
      const weekWorkouts = await App.DB.getWorkoutsRange(weekDates[0], weekDates[6]);
      const availableMinutes = App.FinalPolish.getAvailableMinutes(schedule);
      const reasons = Array.isArray(judgment?.reasons) ? judgment.reasons.slice(0, 4) : [];

      return `
        <div class="container animate-in">
          <section class="hero-panel">
            <div class="hero-copy">
              <div class="hero-eyebrow">${App.Utils.getGreeting()}</div>
              <h2>莉頑律縺ｩ縺・☆繧九°繧偵∵怙蛻昴・ 1 逕ｻ髱｢縺ｧ豎ｺ繧√ｋ</h2>
              <p>蜍､蜍吶∽ｽ楢ｪｿ縲∝▼蠎ｷ繝・・繧ｿ縲∵悴騾∽ｿ｡迥ｶ諷九√Ρ繝ｼ繧ｯ繧｢繧ｦ繝磯幕蟋九∪縺ｧ繧偵％縺薙↓髮・ｴ・＠縺ｾ縺励◆縲・/p>
            </div>
            <div class="hero-date">${App.Utils.formatDate(today)}</div>
          </section>

          ${await syncPanel('App.Views.Dashboard.manualSync()')}

          <div class="dashboard-shell">
            <section class="dashboard-main">
              <div class="decision-panel">
                <div class="decision-heading">
                  <div>
                    <span class="section-kicker">莉頑律縺ｮ蛻､螳・/span>
                    <h3>${h(judgment?.resultLabel || '縺ｾ縺蛻､螳壹＠縺ｦ縺・∪縺帙ｓ')}</h3>
                  </div>
                  <div class="decision-score">${judgment ? judgment.score : '--'}</div>
                </div>
                <p class="decision-message">${h(judgment?.message || '縺ｾ縺壹・菴楢ｪｿ繧貞・蜉帙＠縺ｦ縲∽ｻ頑律縺ｯ繧ｸ繝縺ｸ陦後￥縺ｹ縺阪°繧貞愛螳壹＠縺ｾ縺吶・)}</p>
                <div class="reason-list">
                  ${(reasons.length ? reasons : ['蜍､蜍吶・逹｡逵繝ｻ逍ｲ蜉ｴ諢溘ｒ縺ｾ縺ｨ繧√※蛻､螳壹＠縺ｾ縺吶・]).map(reason => `<span class="reason-chip">${h(reason)}</span>`).join('')}
                </div>
                <div class="hero-actions">
                  <button class="btn btn-primary" onclick="App.navigate('condition')">${judgment ? '蛻､螳壹ｒ譖ｴ譁ｰ' : '蛻､螳壹☆繧・}</button>
                  <button class="btn btn-secondary" onclick="App.navigate('workout')">${workout ? '險倬鹸繧堤ｶ壹￠繧・ : '繝ｯ繝ｼ繧ｯ繧｢繧ｦ繝磯幕蟋・}</button>
                </div>
              </div>

              <div class="focus-grid">
                <article class="focus-card"><div class="focus-label">莉頑律縺ｮ蜍､蜍・/div><div class="focus-value">${h(App.FinalPolish.getShiftLabel(schedule?.shiftType))}</div><div class="focus-sub">${h(App.FinalPolish.formatShiftRange(schedule))}</div></article>
                <article class="focus-card"><div class="focus-label">蛻ｩ逕ｨ蜿ｯ閭ｽ譎る俣</div><div class="focus-value">${availableMinutes != null ? `${availableMinutes}蛻・ : '譛ｪ險育ｮ・}</div><div class="focus-sub">邨よ･ｭ蠕・30 蛻・ｾ後°繧・24:00 縺ｾ縺ｧ縺ｧ險育ｮ・/div></article>
                <article class="focus-card"><div class="focus-label">蛛･蠎ｷ繝・・繧ｿ</div><div class="focus-value">${health?.sleepMinutes ? App.Utils.formatSleep(health.sleepMinutes) : '譛ｪ蜿門ｾ・}</div><div class="focus-sub">豁ｩ謨ｰ ${health?.steps != null ? health.steps.toLocaleString() : '-'} / 蠢・牛 ${health?.heartRateAvg ?? '-'}</div></article>
                <article class="focus-card"><div class="focus-label">莉頑律縺ｮ險倬鹸</div><div class="focus-value">${workout ? (workout.type === 'skip' ? '莨代∩險倬鹸貂医∩' : '險倬鹸縺ゅｊ') : '譛ｪ險倬鹸'}</div><div class="focus-sub">${h(workout?.memo || '蛻､螳壹°繧峨◎縺ｮ縺ｾ縺ｾ險倬鹸縺ｸ騾ｲ繧√∪縺・)}</div></article>
              </div>
            </section>

            <aside class="dashboard-side">
              <div class="side-card">
                <div class="section-heading compact"><h3>莉企ｱ縺ｮ邯咏ｶ・/h3><span>${weekWorkouts.filter(item => item.type !== 'skip').length} 蝗・/span></div>
                <div class="week-strip">
                  ${weekDates.map(date => {
                    const hit = weekWorkouts.find(item => item.date === date);
                    const state = hit ? (hit.type === 'skip' ? 'skip' : 'done') : 'idle';
                    return `<div class="week-pill ${state} ${date === today ? 'today' : ''}"><span>${App.Utils.getDayOfWeek(date)}</span><strong>${date.slice(-2)}</strong></div>`;
                  }).join('')}
                </div>
              </div>
              <div class="side-card">
                <div class="section-heading compact"><h3>菴楢ｪｿ繝｡繝｢</h3><span>${condition ? '蜈･蜉帶ｸ医∩' : '譛ｪ蜈･蜉・}</span></div>
                <div class="micro-copy">${h(condition?.note || '繝｡繝｢縺ｪ縺・)}</div>
              </div>
              <div class="side-card">
                <div class="section-heading compact"><h3>谺｡縺ｮ蟆守ｷ・/h3><span>${App.Utils.isMobile() ? '繧ｹ繝槭・' : 'PC'}</span></div>
                <div class="mini-list">
                  <button class="mini-link" onclick="App.navigate('health')">蛛･蠎ｷ繧定ｦ九ｋ</button>
                  <button class="mini-link" onclick="App.navigate('schedule')">蜍､蜍呵｡ｨ繧帝幕縺・/button>
                  <button class="mini-link" onclick="App.navigate('analytics')">蛻・梵繧定ｦ九ｋ</button>
                </div>
              </div>
            </aside>
          </div>
        </div>`;
    },

    async manualSync() {
      const result = await App.Sync.SheetSyncManager.syncAll();
      App.Utils.showToast(result && result.success ? '蜀榊酔譛溘＠縺ｾ縺励◆' : `蜀榊酔譛溘↓螟ｱ謨励＠縺ｾ縺励◆: ${result?.error || 'unknown'}`, result && result.success ? 'success' : 'error');
      if (result && result.success) App.refreshView();
    },

    init() {},
    destroy() {}
  };

  App.Views.Settings = {
    async render() {
      const bundle = await App.DB.getSettingsBundle();
      const shared = bundle.sharedSettings;
      const local = bundle.localDeviceSettings;
      return `
        <div class="container animate-in settings-shell">
          <div class="page-lead"><h2>險ｭ螳・/h2><p>sharedSettings 縺ｨ localDeviceSettings 繧貞・髮｢縺励∽ｿ晏ｭ倩ｲｬ蜍吶ｒ譏守｢ｺ縺ｫ縺励∪縺励◆縲・/p></div>
          ${await syncPanel('App.Views.Dashboard.manualSync()')}
          <div class="settings-grid">
            <form class="settings-card" id="shared-settings-form">
              <div class="section-heading"><h3>蜈ｱ譛芽ｨｭ螳・/h3><span>Apps Script 謌仙粥蠕後・縺ｿ遒ｺ螳・/span></div>
              <label class="form-group"><span class="form-label">騾ｱ縺ｮ逶ｮ讓吝屓謨ｰ</span><select class="form-select" name="weeklyGoal">${[1,2,3,4,5].map(v => `<option value="${v}" ${Number(shared.weeklyGoal || 3) === v ? 'selected' : ''}>${v} 蝗・/option>`).join('')}</select></label>
              <label class="form-group"><span class="form-label">1 蝗槭・逶ｮ螳・/span><select class="form-select" name="sessionDuration">${[20,30,40,50,60].map(v => `<option value="${v}" ${Number(shared.sessionDuration || 40) === v ? 'selected' : ''}>${v} 蛻・/option>`).join('')}</select></label>
              <div class="grid-2">
                <label class="form-group"><span class="form-label">繧ｸ繝髢句ｧ・/span><input class="form-input" type="time" name="gymHoursStart" value="${h(shared.gymHoursStart || '22:00')}"></label>
                <label class="form-group"><span class="form-label">繧ｸ繝邨ゆｺ・/span><input class="form-input" type="time" name="gymHoursEnd" value="${h(shared.gymHoursEnd || '23:59')}"></label>
              </div>
              <label class="form-group"><span class="form-label">蛻､螳壹・蜴ｳ縺励＆</span><input type="range" name="strictness" min="0" max="100" step="10" value="${Number(shared.strictness || 50)}"></label>
              <button class="btn btn-primary btn-block" type="submit">蜈ｱ譛芽ｨｭ螳壹ｒ菫晏ｭ・/button>
            </form>
            <form class="settings-card" id="local-settings-form">
              <div class="section-heading"><h3>遶ｯ譛ｫ險ｭ螳・/h3><span>縺薙・遶ｯ譛ｫ縺縺代↓菫晄戟</span></div>
              <label class="form-group"><span class="form-label">Apps Script URL</span><input class="form-input" type="text" name="gasSyncUrl" value="${h(local.gasSyncUrl || '')}" placeholder="https://script.google.com/macros/s/..."></label>
              <label class="form-group"><span class="form-label">蛛･蠎ｷ繝・・繧ｿ蜿門ｾ怜・</span><select class="form-select" name="healthProvider"><option value="manual" ${(local.healthProvider || 'manual') === 'manual' ? 'selected' : ''}>謇句・蜉・/option><option value="health_connect" ${local.healthProvider === 'health_connect' ? 'selected' : ''}>Health Connect</option></select></label>
              <button class="btn btn-secondary btn-block" type="submit">遶ｯ譛ｫ險ｭ螳壹ｒ菫晏ｭ・/button>
            </form>
          </div>
        </div>`;
    },

    init() {
      document.getElementById('shared-settings-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!App.Sync.SheetSyncManager.hasUrl()) {
          App.Utils.showToast('Apps Script URL 縺梧悴險ｭ螳壹・縺溘ａ sharedSettings 縺ｯ遒ｺ螳壹〒縺阪∪縺帙ｓ', 'warning');
          return;
        }
        const payload = {
          weeklyGoal: Number(form.weeklyGoal.value),
          sessionDuration: Number(form.sessionDuration.value),
          gymHoursStart: form.gymHoursStart.value,
          gymHoursEnd: form.gymHoursEnd.value,
          strictness: Number(form.strictness.value)
        };
        const result = await App.Sync.SheetSyncManager.pushData({ action: 'saveSettings', settingsType: 'shared', settings: payload, updatedAt: new Date().toISOString() });
        if (result.ok) {
          for (const [key, value] of Object.entries(payload)) await App.DB.setSetting(key, value);
          App.Utils.showToast('蜈ｱ譛芽ｨｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆', 'success');
        } else {
          App.Utils.showToast(`蜈ｱ譛芽ｨｭ螳壹・菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆: ${result.error || 'unknown'}`, 'error');
        }
      });
      document.getElementById('local-settings-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        await App.DB.setSetting('gasSyncUrl', form.gasSyncUrl.value.trim());
        await App.DB.setSetting('healthProvider', form.healthProvider.value);
        App.Sync.SheetSyncManager.init(form.gasSyncUrl.value.trim());
        App.Utils.showToast('遶ｯ譛ｫ險ｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆', 'success');
      });
    },

    destroy() {}
  };

  App.Views.Health = {
    async render() {
      const today = App.Utils.today();
      const health = await App.DB.getHealth(today);
      return `
        <div class="container animate-in health-shell">
          <div class="page-lead"><h2>蛛･蠎ｷ</h2><p>${window.SteadyBridge ? '繧ｹ繝槭・縺ｧ縺ｯ蜈･蜉帙→騾∽ｿ｡縲￣C 縺ｧ縺ｯ髢ｲ隕ｧ荳ｭ蠢・↓謨ｴ逅・＠縺ｾ縺励◆縲・ : 'PC 縺ｧ縺ｯ髢ｲ隕ｧ蟆ら畑繝繝・す繝･繝懊・繝峨→縺励※菴ｿ縺・∪縺吶・}</p></div>
          ${await syncPanel('App.Views.Dashboard.manualSync()')}
          <div class="focus-grid">
            <article class="focus-card"><div class="focus-label">豁ｩ謨ｰ</div><div class="focus-value">${health?.steps != null ? health.steps.toLocaleString() : '譛ｪ蜿門ｾ・}</div></article>
            <article class="focus-card"><div class="focus-label">逹｡逵</div><div class="focus-value">${health?.sleepMinutes ? App.Utils.formatSleep(health.sleepMinutes) : '譛ｪ蜿門ｾ・}</div></article>
            <article class="focus-card"><div class="focus-label">蟷ｳ蝮・ｿ・牛</div><div class="focus-value">${health?.heartRateAvg != null ? `${health.heartRateAvg} bpm` : '譛ｪ蜿門ｾ・}</div></article>
            <article class="focus-card"><div class="focus-label">螳蛾撕譎ょｿ・牛</div><div class="focus-value">${health?.restingHeartRate != null ? `${health.restingHeartRate} bpm` : '譛ｪ蜿門ｾ・}</div></article>
          </div>
        </div>`;
    },
    init() {},
    destroy() {}
  };

  App.Views.WorkSchedule = {
    async render() {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const dates = App.Utils.getMonthDates(year, month);
      const schedules = await App.DB.getScheduleRange(dates[0].date, dates[dates.length - 1].date);
      const map = Object.fromEntries(schedules.map(item => [item.date, item]));
      return `
        <div class="container animate-in schedule-shell">
          <div class="page-lead"><h2>蜍､蜍吶せ繧ｱ繧ｸ繝･繝ｼ繝ｫ</h2><p>PC 縺ｯ繧ｫ繝ｬ繝ｳ繝繝ｼ + 隧ｳ邏ｰ繝壹う繝ｳ縲√せ繝槭・縺ｯ譌･蜊倅ｽ咲ｷｨ髮・ｒ蜆ｪ蜈医＠縺ｾ縺吶・/p></div>
          <div class="schedule-board">
            <section class="settings-card">
              <div class="section-heading"><h3>${year}蟷ｴ${month}譛・/h3><span>譛医ン繝･繝ｼ</span></div>
              <div class="calendar-grid polished-calendar">
                ${dates.map(item => `<div class="calendar-cell ${item.otherMonth ? 'other' : ''}"><span class="day-number">${Number(item.date.slice(-2))}</span><span class="day-shift">${h(App.FinalPolish.getShiftLabel(map[item.date]?.shiftType || ''))}</span></div>`).join('')}
              </div>
            </section>
            <aside class="settings-card"><div class="section-heading"><h3>莉頑律縺ｮ蜍､蜍・/h3><span>隧ｳ邏ｰ</span></div><div class="micro-copy">${h(App.FinalPolish.getShiftLabel(map[App.Utils.today()]?.shiftType))} / ${h(App.FinalPolish.formatShiftRange(map[App.Utils.today()]))}</div></aside>
          </div>
        </div>`;
    },
    init() {},
    destroy() {}
  };

  App.Views.Analytics = {
    async render() {
      const today = App.Utils.today();
      const start = App.Utils._localDateStr(new Date(Date.now() - (29 * 86400000)));
      const workouts = await App.DB.getWorkoutsRange(start, today);
      const health = await App.DB.getHealthRange(start, today);
      const judgments = await App.DB.getJudgmentRange(start, today);
      const avgSleep = health.length ? Math.round(health.reduce((sum, item) => sum + (item.sleepMinutes || 0), 0) / health.length) : 0;
      const avgScore = judgments.length ? Math.round(judgments.reduce((sum, item) => sum + (item.score || 0), 0) / judgments.length) : 0;
      return `<div class="container animate-in analytics-shell"><div class="page-lead"><h2>蛻・梵</h2><p>逹｡逵縲∝共蜍吶・°蜍輔・髢｢菫ゅｒ豈碑ｼ・＠繧・☆縺・ｸ隕ｧ荳ｭ蠢・↓謨ｴ逅・＠縺ｾ縺励◆縲・/p></div><div class="focus-grid"><article class="focus-card"><div class="focus-label">蟷ｳ蝮・擅逵</div><div class="focus-value">${avgSleep ? App.Utils.formatSleep(avgSleep) : '譛ｪ蜿門ｾ・}</div></article><article class="focus-card"><div class="focus-label">蟷ｳ蝮・せ繧ｳ繧｢</div><div class="focus-value">${avgScore || '--'}</div></article><article class="focus-card"><div class="focus-label">繝ｯ繝ｼ繧ｯ繧｢繧ｦ繝・/div><div class="focus-value">${workouts.filter(item => item.type !== 'skip').length}</div></article></div></div>`;
    },
    init() {},
    destroy() {}
  };

  App.Views.Workout = {
    async render() {
      const today = App.Utils.today();
      const judgment = await App.DB.getJudgment(today);
      const existing = await App.DB.getWorkoutByDate(today);
      const menuType = App.Training.getMenuType(judgment ? (judgment.userOverride || judgment.result) : 2) || 'short';
      const exercises = existing ? await App.DB.getExercises(existing.id) : await App.Training.generateMenu(menuType);
      const required = exercises.filter(item => !item.optional && item.type !== 'stretch');
      const optional = exercises.filter(item => item.optional && item.type !== 'stretch');
      return `
        <div class="container animate-in workout-shell">
          <div class="page-lead"><h2>繝ｯ繝ｼ繧ｯ繧｢繧ｦ繝・/h2><p>蠢・育ｨｮ逶ｮ縺ｨ莉ｻ諢冗ｨｮ逶ｮ繧貞・縺代∝燕蝗槫ｮ溽ｸｾ縺ｨ莉頑律縺ｮ謗ｨ螂ｨ繧貞酔譎ゅ↓遒ｺ隱阪〒縺阪ｋ讒区・縺ｫ縺励※縺・∪縺吶・/p></div>
          ${await syncPanel('App.Views.Dashboard.manualSync()')}
          <section class="section-block">
            <div class="section-heading"><h3>蠢・育ｨｮ逶ｮ</h3><span>${required.length} 遞ｮ逶ｮ</span></div>
            <div class="exercise-stack">${required.map(item => this.renderExercise(item)).join('')}</div>
          </section>
          <section class="section-block">
            <div class="section-heading"><h3>莉ｻ諢冗ｨｮ逶ｮ</h3><span>${optional.length} 遞ｮ逶ｮ</span></div>
            <div class="exercise-stack">${optional.map(item => this.renderExercise(item)).join('')}</div>
          </section>
          <div class="workout-actions"><button class="btn btn-primary" id="finish-workout-btn">莉頑律縺ｯ縺薙％縺ｾ縺ｧ縺ｧ邨ゆｺ・/button><button class="btn btn-secondary" id="save-skip-btn">莨代∩縺ｫ縺吶ｋ</button></div>
        </div>`;
    },

    renderExercise(item) {
      const previous = item.previous ? App.Utils.formatKgRepsSets(item.previous.weight || 0, item.previous.reps || 0, item.previous.sets || 1) : '蜑榊屓縺ｪ縺・;
      const recommended = item.recommended ? App.Utils.formatKgRepsSets(item.recommended.weight || 0, item.recommended.reps || 0, item.sets?.length || 1) : '謗ｨ螂ｨ縺ｪ縺・;
      const current = App.Utils.formatWorkoutSummary(item);
      return `<article class="exercise-panel"><div class="exercise-panel-header"><div><h4>${h(item.name)}</h4><p>${item.optional ? '莉ｻ諢冗ｨｮ逶ｮ' : '蠢・育ｨｮ逶ｮ'}</p></div></div><div class="exercise-metrics"><div><span>蜑榊屓</span><strong>${h(previous)}</strong></div><div><span>莉頑律縺ｮ謗ｨ螂ｨ</span><strong>${h(recommended)}</strong></div><div><span>莉雁屓蜈･蜉・/span><strong>${h(current)}</strong></div></div></article>`;
    },

    init() {
      document.getElementById('finish-workout-btn')?.addEventListener('click', async () => {
        const today = App.Utils.today();
        const existing = await App.DB.getWorkoutByDate(today);
        if (!existing) {
          await App.DB.saveWorkout({ date: today, type: 'short', memo: '繝ｯ繝ｼ繧ｯ繧｢繧ｦ繝亥ｮ御ｺ・ }, []);
        }
        const result = await App.DB.pushToCloud(today);
        App.Utils.showToast(result.ok ? '繝ｯ繝ｼ繧ｯ繧｢繧ｦ繝医ｒ蜈ｱ譛我ｿ晏ｭ倥＠縺ｾ縺励◆' : '繝ｯ繝ｼ繧ｯ繧｢繧ｦ繝医・譛ｪ騾∽ｿ｡縺ｧ縺・, result.ok ? 'success' : 'warning');
        App.navigate('home');
      });
      document.getElementById('save-skip-btn')?.addEventListener('click', async () => {
        await App.DB.saveWorkout({ date: App.Utils.today(), type: 'skip', memo: '莉頑律縺ｯ莨代∩' }, []);
        const result = await App.DB.pushToCloud(App.Utils.today());
        App.Utils.showToast(result.ok ? '莨代∩繧剃ｿ晏ｭ倥＠縺ｾ縺励◆' : '莨代∩縺ｯ譛ｪ騾∽ｿ｡縺ｧ縺・, result.ok ? 'success' : 'warning');
        App.navigate('home');
      });
    },

    destroy() {}
  };
})();
```

### sync-assets.ps1
```
#!/usr/bin/env pwsh
# ============================================
# Steady 窶・Root 竊・Android Assets 蜷梧悄繧ｹ繧ｯ繝ｪ繝励ヨ
# ============================================
# 豁｣譛ｬ: 繝励Ο繧ｸ繧ｧ繧ｯ繝医Ν繝ｼ繝・(d:\繝・せ繧ｯ繝医ャ繝予繧｢繝励Μ\蛛･蠎ｷ邂｡逅・)
# 繧ｳ繝斐・蜈・ android/app/src/main/assets/
#
# 菴ｿ縺・婿:  .\sync-assets.ps1
# ============================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$assets = Join-Path $root "android\app\src\main\assets"

Write-Host "=== Steady: Root -> Android Assets Sync ===" -ForegroundColor Cyan
Write-Host "Root:   $root"
Write-Host "Assets: $assets"
Write-Host ""

# 繧ｳ繝斐・蟇ｾ雎｡繝輔ぃ繧､繝ｫ (蜊倅ｽ・
$copyFiles = @("index.html", "sw.js", "manifest.json")
foreach ($f in $copyFiles) {
    $src = Join-Path $root $f
    $dst = Join-Path $assets $f
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  [OK] $f" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] $f (not found in root)" -ForegroundColor Yellow
    }
}

# 繧ｳ繝斐・蟇ｾ雎｡繝・ぅ繝ｬ繧ｯ繝医Μ (蜀榊ｸｰ)
$copyDirs = @("css", "js", "icons")
foreach ($d in $copyDirs) {
    $src = Join-Path $root $d
    $dst = Join-Path $assets $d
    if (Test-Path $src) {
        if (!(Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
        Get-ChildItem $src -Recurse -File | ForEach-Object {
            if ($d -eq 'js' -and $_.Extension -ne '.js') { return }
            if ($d -eq 'css' -and $_.Extension -ne '.css') { return }
            $relative = $_.FullName.Substring($src.Length).TrimStart('\')
            $target = Join-Path $dst $relative
            $targetDir = Split-Path $target -Parent
            if (!(Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
            Copy-Item $_.FullName $target -Force
        }
        $count = (Get-ChildItem $dst -Recurse -File).Count
        Write-Host "  [OK] $d/ ($count files)" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] $d/ (not found in root)" -ForegroundColor Yellow
    }
}

# 荳崎ｦ√↑ www/ 縺悟ｭ伜惠縺励◆繧芽ｭｦ蜻翫＠縺ｦ蜑企勁
$wwwDir = Join-Path $assets "www"
if (Test-Path $wwwDir) {
    Write-Host ""
    Write-Host "  [WARN] assets/www/ 縺悟ｭ伜惠縺励∪縺吶ゆｺ碁㍾邂｡逅・亟豁｢縺ｮ縺溘ａ蜑企勁縺励∪縺・ -ForegroundColor Yellow
    Remove-Item $wwwDir -Recurse -Force
    Write-Host "  [DELETED] assets/www/" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Sync Complete ===" -ForegroundColor Cyan

# 讀懆ｨｼ: root 縺ｨ assets 縺ｮ繝上ャ繧ｷ繝･豈碑ｼ・Write-Host ""
Write-Host "--- Verification ---" -ForegroundColor Cyan
$checkFiles = @(
    "index.html","sw.js","manifest.json","css\index.css","css\final-polish.css",
    "js\app.js","js\db.js","js\judgment.js","js\training.js","js\utils.js","js\final-helpers.js","js\final-views.js",
    "js\sync\sheet-sync.js",
    "js\providers\health-connect-provider.js","js\providers\base-provider.js","js\providers\manual-provider.js",
    "js\views\dashboard.js","js\views\condition-input.js","js\views\workout.js",
    "js\views\health.js","js\views\settings.js","js\views\work-schedule.js",
    "js\views\history.js","js\views\analytics.js","js\views\onboarding.js"
)
$diffCount = 0
foreach ($f in $checkFiles) {
    $r = Join-Path $root $f
    $a = Join-Path $assets $f
    if (!(Test-Path $r) -or !(Test-Path $a)) { continue }
    $rh = (Get-FileHash $r).Hash
    $ah = (Get-FileHash $a).Hash
    if ($rh -ne $ah) {
        Write-Host "  [DIFF] $f" -ForegroundColor Red
        $diffCount++
    }
}
if ($diffCount -eq 0) {
    Write-Host "  All files identical 笨・ -ForegroundColor Green
} else {
    Write-Host "  $diffCount files differ!" -ForegroundColor Red
}
```

### gas\code.gs
```
/**
 * Steady - GAS Sync Server v5
 * 繧ｹ繝励Ξ繝・ラ繧ｷ繝ｼ繝医ｒ縲悟髪荳縺ｮ豁｣(Source of Truth)縲阪→縺励※邂｡逅・ * 
 * 繧ｷ繝ｼ繝域ｧ区・:
 *   daily_summary     窶・譌･莉倥＃縺ｨ縺ｮ菴楢ｪｿ繝ｻ蛻､螳壹・蜍､蜍吶し繝槭Μ
 *   workout_details   窶・繧ｻ繝・ヨ蜊倅ｽ阪・繝医Ξ繝ｼ繝九Φ繧ｰ譏守ｴｰ
 *   health_daily      窶・蛛･蠎ｷ繝・・繧ｿ(豁ｩ謨ｰ/逹｡逵/蠢・牛)
 *   schedule          窶・蜍､蜍吶せ繧ｱ繧ｸ繝･繝ｼ繝ｫ
 *   settings          窶・繧｢繝励Μ險ｭ螳・ *   sync_log          窶・蜷梧悄繝ｭ繧ｰ(逶ｴ霑大・)
 *   tombstones        窶・蜑企勁螻･豁ｴ・井ｻ也ｫｯ譛ｫ縺ｸ縺ｮ蜑企勁莨晄成逕ｨ・・ *   RawData           窶・蠕梧婿莠呈鋤逕ｨJSON繝悶Ο繝・遘ｻ陦悟ｮ御ｺ・ｾ悟炎髯､蜿ｯ)
 */

// ============ POST: 繝・・繧ｿ菫晏ｭ・譖ｴ譁ｰ ============
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return _json({ status: 'error', message: '繧ｵ繝ｼ繝舌・縺後ン繧ｸ繝ｼ縺ｧ縺吶ゅ＠縺ｰ繧峨￥蠕・▲縺ｦ縺九ｉ蜀崎ｩｦ陦後＠縺ｦ縺上□縺輔＞縲・ });
  }

  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'legacy';
    var now = new Date().toISOString();
    data.updatedAt = now;

    // 笘・蜈ｨ繧｢繧ｯ繧ｷ繝ｧ繝ｳ蜈ｱ騾・ payload豁｣隕丞喧
    data = _normalizePayload(data);

    // 繧ｯ繝ｩ繧､繧｢繝ｳ繝医°繧峨・revision
    var clientRevision = data._revision || null;

    var result;
    switch (action) {
      case 'saveDailySummary':
        result = _saveDailySummary(data, clientRevision);
        break;
      case 'appendWorkoutDetails':
        result = _appendWorkoutDetails(data);
        break;
      case 'saveHealthDaily':
        result = _saveHealthDaily(data, clientRevision);
        break;
      case 'updateSchedule':
        result = _updateSchedule(data, clientRevision);
        break;
      case 'deleteSchedule':
        result = _deleteSchedule(data);
        break;
      case 'saveSettings':
        _saveSettings(data.settings || {}, now);
        result = { saved: true };
        break;
      case 'bulkSchedule':
        result = _bulkSchedule(data);
        break;
      case 'archiveOldRows':
        result = _archiveOldRows(data.olderThanDays || 90);
        break;
      case 'deleteWorkout':
        result = _deleteWorkout(data);
        break;
      case 'legacy':
      default:
        result = _handleLegacyPost(data);
        break;
    }

    _appendSyncLog(now, action, data.date || '', data.sourceDevice || '', 'success', '');
    return _json({ status: 'success', data: result, updatedAt: now });
  } catch (err) {
    // CONFLICT 縺ｯ縺昴・縺ｾ縺ｾ霑斐☆
    if (err.message && err.message.indexOf('CONFLICT') === 0) {
      return _json({ status: 'error', message: err.message });
    }
    try { _appendSyncLog(new Date().toISOString(), 'error', '', '', 'error', err.message); } catch(ex){}
    return _json({ status: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ============ GET: 繝・・繧ｿ蜿門ｾ・============
function doGet(e) {
  try {
    var action = e.parameter.action || 'getAll';

    switch (action) {
      case 'getAll':
        return _json({ status: 'success', data: _getAll() });
      case 'getDate':
        return _json({ status: 'success', data: _getDate(e.parameter.date) });
      case 'getSyncLog':
        return _json({ status: 'success', data: _getSyncLog() });
      default:
        return _json({ status: 'error', message: 'Unknown action: ' + action });
    }
  } catch (err) {
    return _json({ status: 'error', message: err.message });
  }
}

// ============ 蠕梧婿莠呈鋤: 譌ｧ蠖｢蠑襲OST ============
// 笘・v44: 蜷・す繝ｼ繝医↓蛟句挨菫晏ｭ・竊・_rebuildDailySummary 縺ｧ蜀肴ｧ狗ｯ・function _handleLegacyPost(data) {
  var dateStr = data.date;
  if (!dateStr) throw new Error('date is required');

  // 險ｭ螳壹ョ繝ｼ繧ｿ
  if (dateStr === '_settings') {
    _saveSettings(data.settings || {}, data.updatedAt);
    return { type: 'settings' };
  }

  var src = data.sourceDevice || 'unknown';
  var by = data.updatedBy || 'app';
  var clientRevision = data._revision || null;

  // --- 1. health_daily ---
  if (data.health) {
    _saveHealthDaily({
      date: dateStr,
      steps: data.health.steps,
      sleepMinutes: data.health.sleepMinutes,
      heartRateAvg: data.health.heartRateAvg,
      restingHeartRate: data.health.restingHeartRate,
      weightKg: data.health.weightKg,
      source: data.health.source || 'unknown',
      fetchedAt: data.health.fetchedAt || '',
      sourceDevice: src, updatedBy: by, updatedAt: data.updatedAt
    }, clientRevision);
  }

  // --- 2. schedule ---
  if (data.schedule) {
    _updateSchedule({
      date: dateStr,
      shiftType: data.schedule.shiftType || '',
      startTime: data.schedule.startTime || '',
      endTime: data.schedule.endTime || '',
      sourceDevice: src, updatedBy: by, updatedAt: data.updatedAt
    }, clientRevision);
  }

  // --- 3. workout_details ---
  if (data.exercises && data.exercises.length > 0) {
    _appendWorkoutDetails({
      date: dateStr,
      workoutType: (data.workout || {}).type || '',
      feeling: (data.workout || {}).feeling,
      durationMinutes: (data.workout || {}).durationMinutes,
      exercises: data.exercises,
      sourceDevice: src, updatedBy: by, updatedAt: data.updatedAt
    });
  }

  // --- 4. condition/judgment 竊・daily_summary縺ｫ繝代ャ繝・---
  // (condition/judgment縺ｯ蛟句挨繧ｷ繝ｼ繝医′縺ｪ縺・◆繧√‥aily_summary縺ｫ逶ｴ謗･譖ｸ縺崎ｾｼ縺ｿ)
  var condJudgPatch = {};
  if (data.condition) {
    condJudgPatch.fatigue = data.condition.fatigue;
    condJudgPatch.muscleSoreness = data.condition.muscleSoreness;
    condJudgPatch.sorenessAreas = data.condition.sorenessAreas || '';
    condJudgPatch.motivation = data.condition.motivation;
    condJudgPatch.mood = data.condition.mood;
    condJudgPatch.memo = data.condition.note || '';
  }
  if (data.judgment) {
    condJudgPatch.judgmentResult = data.judgment.result;
    condJudgPatch.judgmentScore = data.judgment.score;
    condJudgPatch.judgmentReason = Array.isArray(data.judgment.reasons)
      ? data.judgment.reasons.join('; ')
      : (data.judgment.resultLabel || '');
  }
  if (data.workout) {
    condJudgPatch.didWorkout = data.workout.type && data.workout.type !== 'skip' ? 'yes' : (data.workout.type === 'skip' ? 'skip' : '');
    condJudgPatch.workoutType = data.workout.type || '';
    condJudgPatch.skipReason = _normalizeSkipReason(data.workout.skipReason);
  }

  // --- 5. daily_summary 繧貞・繧ｷ繝ｼ繝医°繧牙・讒狗ｯ・---
  _rebuildDailySummary(dateStr, src, by, data.updatedAt, condJudgPatch, clientRevision);

  // --- 6. RawData 蠕梧婿莠呈鋤菫晏ｭ・(蟆・擂蟒・ｭ｢莠亥ｮ・ ---
  var rawSheet = _sheet('RawData');
  var rawIdx = _findRow(rawSheet, dateStr);
  var jsonStr = JSON.stringify(data);
  if (rawIdx > -1) {
    rawSheet.getRange(rawIdx, 2).setValue(jsonStr);
    rawSheet.getRange(rawIdx, 3).setValue(data.updatedAt);
  } else {
    rawSheet.appendRow([dateStr, jsonStr, data.updatedAt]);
  }

  return { type: 'legacy', date: dateStr };
}

// ============ v44: 蜈ｱ騾壽ｭ｣隕丞喧髢｢謨ｰ鄒､ ============

/**
 * payload蜈ｨ菴薙・豁｣隕丞喧縲ょ・繧｢繧ｯ繧ｷ繝ｧ繝ｳ蜈ｱ騾壹〒蜻ｼ縺ｰ繧後ｋ縲・ * - source蜷咲ｵｱ荳: healthconnect 竊・health_connect
 * - 譌ｧ蠢・牛繧ｭ繝ｼ蜷ｸ蜿・ heartRate/avgHeartRate 竊・heartRateAvg
 * - 遨ｺ譁・ｭ励・譛ｪ螳夂ｾｩ繧地ull縺ｫ邨ｱ荳
 */
function _normalizePayload(data) {
  if (data.settingsType !== 'shared' && data.settings) {
    data.settingsType = 'shared';
  }
  if (data.health) {
    // source蜷咲ｵｱ荳
    if (data.health.source === 'healthconnect') data.health.source = 'health_connect';
    // 譌ｧ蠢・牛繧ｭ繝ｼ蜷ｸ蜿・    if (data.health.heartRate != null && data.health.heartRateAvg == null) {
      data.health.heartRateAvg = data.health.heartRate;
    }
    delete data.health.heartRate;
    if (data.health.avgHeartRate != null && data.health.heartRateAvg == null) {
      data.health.heartRateAvg = data.health.avgHeartRate;
    }
    delete data.health.avgHeartRate;
    // restingHR 竊・restingHeartRate
    if (data.health.restingHR != null && data.health.restingHeartRate == null) {
      data.health.restingHeartRate = data.health.restingHR;
    }
    delete data.health.restingHR;
  }
  if (data.settings && data.settingsType === 'shared') {
    var sharedOnly = {};
    for (var key in data.settings) {
      if (['gasSyncUrl', 'healthProvider'].indexOf(key) === -1) {
        sharedOnly[key] = data.settings[key];
      }
    }
    data.settings = sharedOnly;
  }
  return data;
}

/**
 * skipReason 繧呈ｭ｣隕丞喧
 */
function _normalizeSkipReason(raw) {
  if (!raw) return '';
  // 繧ｫ繝ｳ繝槫玄蛻・ｊ or 驟榊・繧堤ｵｱ荳
  if (Array.isArray(raw)) return raw.join(', ');
  return String(raw).trim();
}

/**
 * 蛻ｩ逕ｨ蜿ｯ閭ｽ譎る俣(蛻・繧堤ｮ怜・
 * off: 960蛻・16譎る俣), 蜍､蜍呎律: 23:00 - 騾蜍､譎ょ綾
 */
function _computeAvailableMinutes(shiftType, endTime) {
  if (shiftType === 'off') return 960;
  if (!endTime) return '';
  try {
    var parts = String(endTime).split(':').map(Number);
    if (isNaN(parts[0]) || isNaN(parts[1])) return '';
    return Math.max(0, (23 * 60) - (parts[0] * 60 + parts[1]));
  } catch(e) { return ''; }
}

/**
 * workout_details 繧ｷ繝ｼ繝医°繧峨Ρ繝ｼ繧ｯ繧｢繧ｦ繝亥粋險域凾髢・蛻・繧堤ｮ怜・
 * - 譛蛾・邏(note谺・↓ '笳句・' 縺後≠繧・: 縺昴・縺ｾ縺ｾ蜉邂・ * - 遲九ヨ繝ｬ: 繧ｻ繝・ヨ謨ｰ ﾃ・1.5蛻・(謗ｨ螳・
 */
function _computeWorkoutDuration(dateStr) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('workout_details');
  if (!sheet || sheet.getLastRow() <= 1) return '';
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var dateIdx = headers.indexOf('date');
  var noteIdx = headers.indexOf('note');
  var totalMin = 0;
  var found = false;
  for (var i = 0; i < data.length; i++) {
    if (_normDate(data[i][dateIdx]) !== _normDate(dateStr)) continue;
    found = true;
    var note = String(data[i][noteIdx] || '');
    // '30蛻・ 縺ｮ繧医≧縺ｪ繝代ち繝ｼ繝ｳ縺九ｉ蛻・焚繧呈歓蜃ｺ
    var match = note.match(/(\d+)蛻・);
    if (match) {
      totalMin += parseInt(match[1]);
    } else {
      totalMin += 1.5; // 遲九ヨ繝ｬ1繧ｻ繝・ヨ竕・.5蛻・    }
  }
  return found ? Math.round(totalMin) : '';
}

/**
 * 笘・daily_summary 繧貞・繧ｷ繝ｼ繝医°繧画律莉伜腰菴阪〒蜀肴ｧ狗ｯ峨☆繧九・ * schedule, health_daily, workout_details 縺九ｉ隱ｭ縺ｿ蜿悶ｊ縲・ * condition/judgment 縺ｯ condJudgPatch 縺九ｉ蜿励￠蜿悶ｋ・亥句挨繧ｷ繝ｼ繝医′縺ｪ縺・◆繧・ｼ峨・ *
 * @param {string} dateStr - 蟇ｾ雎｡譌･ (YYYY-MM-DD)
 * @param {string} src - sourceDevice
 * @param {string} by - updatedBy
 * @param {string} updatedAt - 譖ｴ譁ｰ譌･譎・ * @param {object} condJudgPatch - condition/judgment/workout 縺ｮ繝代ャ繝・(逵∫払蜿ｯ)
 * @param {number|null} clientRevision - 繧ｯ繝ｩ繧､繧｢繝ｳ繝・evision (逵∫払蜿ｯ)
 */
function _rebuildDailySummary(dateStr, src, by, updatedAt, condJudgPatch, clientRevision) {
  condJudgPatch = condJudgPatch || {};

  // --- schedule 繧ｷ繝ｼ繝医°繧牙叙蠕・---
  var sched = {};
  var schedSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('schedule');
  if (schedSheet && schedSheet.getLastRow() > 1) {
    var sHeaders = schedSheet.getRange(1, 1, 1, schedSheet.getLastColumn()).getValues()[0];
    var sIdx = _findRow(schedSheet, dateStr);
    if (sIdx > -1) {
      var sRow = schedSheet.getRange(sIdx, 1, 1, sHeaders.length).getValues()[0];
      sHeaders.forEach(function(h, i) { sched[h] = sRow[i]; });
    }
  }

  // --- health_daily 繧ｷ繝ｼ繝医°繧牙叙蠕・---
  var health = {};
  var healthSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('health_daily');
  if (healthSheet && healthSheet.getLastRow() > 1) {
    var hHeaders = healthSheet.getRange(1, 1, 1, healthSheet.getLastColumn()).getValues()[0];
    var hIdx = _findRow(healthSheet, dateStr);
    if (hIdx > -1) {
      var hRow = healthSheet.getRange(hIdx, 1, 1, hHeaders.length).getValues()[0];
      hHeaders.forEach(function(h, i) { health[h] = hRow[i]; });
    }
  }

  // --- workout_details 縺九ｉ duration 繧堤ｮ怜・ ---
  var workoutDuration = _computeWorkoutDuration(dateStr);

  // --- condJudgPatch 縺ｫ蜷ｫ縺ｾ繧後↑縺・・縺ｯ譌｢蟄倥・daily_summary縺九ｉ菫晄戟 ---
  var existing = _getExistingDailySummaryFields(dateStr);

  // --- availableMinutes ---
  var shiftType = sched.shiftType || '';
  var endTime = _normTime(sched.endTime) || '';
  var availMin = _computeAvailableMinutes(shiftType, endTime);

  // 繝槭・繧ｸ: condJudgPatch > 譌｢蟄賄aily_summary
  var fatigue = _coalesce(condJudgPatch.fatigue, existing.fatigue);
  var muscleSoreness = _coalesce(condJudgPatch.muscleSoreness, existing.muscleSoreness);
  var sorenessAreas = condJudgPatch.sorenessAreas != null ? condJudgPatch.sorenessAreas : (existing.sorenessAreas || '');
  var motivation = _coalesce(condJudgPatch.motivation, existing.motivation);
  var mood = _coalesce(condJudgPatch.mood, existing.mood);
  var memo = condJudgPatch.memo != null ? condJudgPatch.memo : (existing.memo || '');
  var judgmentResult = _coalesce(condJudgPatch.judgmentResult, existing.judgmentResult);
  var judgmentScore = _coalesce(condJudgPatch.judgmentScore, existing.judgmentScore);
  var judgmentReason = condJudgPatch.judgmentReason != null ? condJudgPatch.judgmentReason : (existing.judgmentReason || '');
  var didWorkout = condJudgPatch.didWorkout != null ? condJudgPatch.didWorkout : (existing.didWorkout || '');
  var workoutType = condJudgPatch.workoutType != null ? condJudgPatch.workoutType : (existing.workoutType || '');
  var skipReason = condJudgPatch.skipReason != null ? condJudgPatch.skipReason : (existing.skipReason || '');

  // durationMinutes: workout_details縺九ｉ險育ｮ・> 繝代ャ繝∝､ > 譌｢蟄伜､
  var totalDuration = _coalesce(workoutDuration || null, condJudgPatch.durationMinutes, existing.totalDurationMinutes);

  _saveDailySummary({
    date: dateStr,
    shiftType: shiftType,
    workStart: _normTime(sched.startTime) || '',
    workEnd: endTime,
    availableMinutes: availMin,
    judgmentResult: judgmentResult,
    judgmentScore: judgmentScore,
    judgmentReason: judgmentReason,
    didWorkout: didWorkout,
    workoutType: workoutType,
    totalDurationMinutes: totalDuration,
    steps: _coalesce(health.steps, existing.steps),
    sleepMinutes: _coalesce(health.sleepMinutes, existing.sleepMinutes),
    heartRateAvg: _coalesce(health.heartRateAvg, existing.heartRateAvg),
    restingHeartRate: _coalesce(health.restingHeartRate, existing.restingHeartRate),
    fatigue: fatigue,
    muscleSoreness: muscleSoreness,
    sorenessAreas: sorenessAreas,
    motivation: motivation,
    mood: mood,
    skipReason: skipReason,
    memo: memo,
    healthSource: health.source || existing.healthSource || '',
    lastHealthFetchAt: health.fetchedAt || existing.lastHealthFetchAt || '',
    sourceDevice: src,
    updatedBy: by,
    updatedAt: updatedAt
  }, clientRevision);
}

/**
 * 譌｢蟄倥・daily_summary繝輔ぅ繝ｼ繝ｫ繝峨ｒ蜿門ｾ励☆繧九・ * 譁ｰ繝・・繧ｿ縺ｨ繝槭・繧ｸ縺吶ｋ縺溘ａ縲・ */
function _getExistingDailySummaryFields(dateStr) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('daily_summary');
  if (!sheet || sheet.getLastRow() <= 1) return {};
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = _findRow(sheet, dateStr);
  if (idx <= 0) return {};
  var row = sheet.getRange(idx, 1, 1, headers.length).getValues()[0];
  var obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i]; });
  return obj;
}

/**
 * null 縺ｧ縺ｪ縺・怙蛻昴・蛟､繧定ｿ斐☆ (COALESCE)
 */
function _coalesce() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] != null && arguments[i] !== '' && arguments[i] !== undefined) return arguments[i];
  }
  return null;
}

// ============ daily_summary ============
function _saveDailySummary(d, clientRevision) {
  var weekdayNames = ['譌･','譛・,'轣ｫ','豌ｴ','譛ｨ','驥・,'蝨・];
  var weekday = '';
  if (d.date) {
    try {
      var dt = new Date(d.date + 'T00:00:00');
      if (!isNaN(dt.getTime())) weekday = weekdayNames[dt.getDay()];
    } catch(e) {}
  }
  var sheet = _sheetWithHeaders('daily_summary', [
    'date','weekday','shiftType','workStart','workEnd','availableMinutes',
    'judgmentResult','judgmentScore','judgmentReason',
    'didWorkout','workoutType','totalDurationMinutes',
    'steps','sleepMinutes','heartRateAvg','restingHeartRate',
    'fatigue','muscleSoreness','sorenessAreas','motivation','mood',
    'skipReason','memo','healthSource','lastHealthFetchAt','lastSyncedAt',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var row = [
    d.date, weekday, d.shiftType||'', d.workStart||'', d.workEnd||'', d.availableMinutes != null ? d.availableMinutes : '',
    d.judgmentResult != null ? d.judgmentResult : '', d.judgmentScore != null ? d.judgmentScore : '', d.judgmentReason||'',
    d.didWorkout||'', d.workoutType||'', d.totalDurationMinutes != null ? d.totalDurationMinutes : '',
    d.steps != null ? d.steps : '', d.sleepMinutes != null ? d.sleepMinutes : '',
    d.heartRateAvg != null ? d.heartRateAvg : '', d.restingHeartRate != null ? d.restingHeartRate : '',
    d.fatigue != null ? d.fatigue : '', d.muscleSoreness != null ? d.muscleSoreness : '', d.sorenessAreas||'',
    d.motivation != null ? d.motivation : '', d.mood != null ? d.mood : '', d.skipReason||'', d.memo||'',
    d.healthSource||'', d.lastHealthFetchAt||'', new Date().toISOString(),
    d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
  ];
  _upsertRow(sheet, d.date, row, clientRevision);
  return { sheet: 'daily_summary', date: d.date };
}

// ============ workout_details ============
function _appendWorkoutDetails(d) {
  var sheet = _sheetWithHeaders('workout_details', [
    'date','workoutType','exerciseName','setIndex','weightKg','reps',
    'setCount','completed','targetWeightKg','targetReps','note',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  
  // 蜷梧律縺ｮ譌｢蟄倩｡後ｒ蜑企勁縺励※蜀肴諺蜈･
  _deleteRowsByDate(sheet, d.date);

  var exercises = d.exercises || [];
  for (var ei = 0; ei < exercises.length; ei++) {
    var ex = exercises[ei];
    var sets = Array.isArray(ex.sets) ? ex.sets : [];
    if (ex.isCardio) {
      sheet.appendRow([
        d.date, d.workoutType||'', ex.name||'', 1, 0, 0,
        1, sets[0] && sets[0].completed ? 'yes' : 'no', 0, 0,
        (ex.durationMin || 0) + '蛻・,
        d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
      ]);
    } else {
      for (var si = 0; si < sets.length; si++) {
        var s = sets[si];
        sheet.appendRow([
          d.date, d.workoutType||'', ex.name||'', s.setNumber||'',
          s.weight||0, s.reps||0, sets.length,
          s.completed ? 'yes' : 'no',
          ex.recommended ? (ex.recommended.weight||'') : '', ex.recommended ? (ex.recommended.reps||'') : '',
          '', d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
        ]);
      }
    }
  }
  return { sheet: 'workout_details', date: d.date, count: exercises.length };
}

// ============ health_daily ============
function _saveHealthDaily(d, clientRevision) {
  var sheet = _sheetWithHeaders('health_daily', [
    'date','steps','sleepMinutes','heartRateAvg','restingHeartRate',
    'weightKg','source','fetchedAt','syncedAt','status',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var row = [
    d.date,
    d.steps != null ? d.steps : '',
    d.sleepMinutes != null ? d.sleepMinutes : '',
    d.heartRateAvg != null ? d.heartRateAvg : '',
    d.restingHeartRate != null ? d.restingHeartRate : '',
    d.weightKg != null ? d.weightKg : '',
    d.source||'', d.fetchedAt||'', d.syncedAt||new Date().toISOString(),
    'synced', d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
  ];
  _upsertRow(sheet, d.date, row, clientRevision);
  return { sheet: 'health_daily', date: d.date };
}

// ============ schedule ============
function _updateSchedule(d, clientRevision) {
  var sheet = _sheetWithHeaders('schedule', [
    'date','shiftType','startTime','endTime','note',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var row = [
    d.date, d.shiftType||'', d.startTime||'', d.endTime||'', d.note||'',
    d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
  ];
  _upsertRow(sheet, d.date, row, clientRevision);
  // 笘・dailySummary蜀肴ｧ狗ｯ会ｼ・vailableMinutes縺瑚・蜍戊ｨ育ｮ励＆繧後ｋ・・  // 縺溘□縺・legacyPost縺九ｉ縺ｮ蜻ｼ蜃ｺ譎ゅ・ _rebuildDailySummary 縺悟挨騾泌他縺ｰ繧後ｋ縺ｮ縺ｧ繧ｹ繧ｭ繝・・蜿ｯ閭ｽ
  // 竊・蜀ｪ遲峨↑縺ｮ縺ｧ莠碁㍾縺ｫ蜻ｼ繧薙〒繧ょ撫鬘後↑縺・  return { sheet: 'schedule', date: d.date };
}

function _deleteSchedule(d) {
  var sheet = _sheetWithHeaders('schedule', [
    'date','shiftType','startTime','endTime','note',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var idx = _findRow(sheet, d.date);
  if (idx > -1) sheet.deleteRow(idx);
  // tombstone險倬鹸
  _addTombstone(d.date, 'schedule', d.sourceDevice || '', d.updatedAt);
  // 笘・daily_summary蜀肴ｧ狗ｯ会ｼ・chedule蛻励′繧ｯ繝ｪ繧｢縺輔ｌ繧具ｼ・  _rebuildDailySummary(d.date, d.sourceDevice || '', 'delete', d.updatedAt || new Date().toISOString(), {}, null);
  return { deleted: d.date };
}

// ============ 譛磯俣繧ｹ繧ｱ繧ｸ繝･繝ｼ繝ｫ荳諡ｬ菫晏ｭ・============
function _bulkSchedule(data) {
  var schedules = data.schedules || [];
  if (schedules.length === 0) return { count: 0 };
  
  var sheet = _sheetWithHeaders('schedule', [
    'date','shiftType','startTime','endTime','note',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var now = new Date().toISOString();
  var count = 0;
  
  for (var i = 0; i < schedules.length; i++) {
    var s = schedules[i];
    var row = [
      s.date, s.shiftType || '', s.startTime || '', s.endTime || '', s.note || '',
      data.sourceDevice || '', 'bulk', now, 1
    ];
    _upsertRow(sheet, s.date, row);
    count++;
  }
  
  return { sheet: 'schedule', count: count, year: data.year, month: data.month };
}

// ============ 繝ｯ繝ｼ繧ｯ繧｢繧ｦ繝亥炎髯､ ============
function _deleteWorkout(data) {
  var dateStr = data.date;
  if (!dateStr) throw new Error('date is required for deleteWorkout');
  
  // workout_details 繧呈律莉倥〒蜈ｨ蜑企勁
  var wdSheet = _sheet('workout_details');
  _deleteRowsByDate(wdSheet, dateStr);
  
  // tombstone險倬鹸
  _addTombstone(dateStr, 'workout', data.sourceDevice || '', data.updatedAt);
  
  // 笘・daily_summary蜀肴ｧ狗ｯ会ｼ・orkout蛻励′繧ｯ繝ｪ繧｢縺輔ｌ繧具ｼ・  // didWorkout/workoutType/skipReason繧堤ｩｺ縺ｫ縺吶ｋ繝代ャ繝√ｒ貂｡縺・  _rebuildDailySummary(dateStr, data.sourceDevice || '', 'delete', data.updatedAt || new Date().toISOString(), {
    didWorkout: '',
    workoutType: '',
    skipReason: ''
  }, null);
  
  return { deleted: true, date: dateStr };
}

// ============ tombstone ============
function _addTombstone(dateStr, type, device, timestamp) {
  var sheet = _sheetWithHeaders('tombstones', [
    'date', 'type', 'deletedAt', 'sourceDevice'
  ]);
  sheet.appendRow([dateStr, type, timestamp || new Date().toISOString(), device]);
}

function _getTombstones() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tombstones');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var byDate = {};
  for (var i = 0; i < data.length; i++) {
    var d = _normDate(data[i][0]);
    var type = data[i][1];
    if (!d) continue;
    if (!byDate[d]) byDate[d] = [];
    if (byDate[d].indexOf(type) === -1) byDate[d].push(type);
  }
  return byDate;
}

// ============ getAll ============
function _getAll() {
  var byDate = {};

  // --- schedule 繧ｷ繝ｼ繝医°繧牙・譌･遞九ｒ隱ｭ縺ｿ霎ｼ繧 ---
  var schedSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('schedule');
  if (schedSheet && schedSheet.getLastRow() > 1) {
    var headers = schedSheet.getRange(1, 1, 1, schedSheet.getLastColumn()).getValues()[0];
    var data = schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, schedSheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      var d = _normDate(obj.date);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d };
      byDate[d].schedule = {
        date: d,
        shiftType: obj.shiftType || '',
        startTime: _normTime(obj.startTime),
        endTime: _normTime(obj.endTime),
        updatedAt: obj.updatedAt || '',
        _revision: parseInt(obj.revision) || 0
      };
      if (obj.updatedAt && _safeDateTs(obj.updatedAt) > _safeDateTs(byDate[d].updatedAt)) {
        byDate[d].updatedAt = obj.updatedAt;
      }
    }
  }

  // --- health_daily 繧ｷ繝ｼ繝医°繧芽ｪｭ縺ｿ霎ｼ繧 ---
  var healthSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('health_daily');
  if (healthSheet && healthSheet.getLastRow() > 1) {
    var headers = healthSheet.getRange(1, 1, 1, healthSheet.getLastColumn()).getValues()[0];
    var data = healthSheet.getRange(2, 1, healthSheet.getLastRow() - 1, healthSheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      var d = _normDate(obj.date);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d };
      var healthObj = {
        date: d,
        source: obj.source || 'sync',
        _revision: parseInt(obj.revision) || 0
      };
      // null/0縺ｮ蛹ｺ蛻･: 遨ｺ繧ｻ繝ｫ=null・亥性繧√↑縺・ｼ峨・=繧ｼ繝ｭ・亥性繧√ｋ・・      if (obj.steps !== '' && obj.steps !== null && obj.steps !== undefined) healthObj.steps = Number(obj.steps);
      if (obj.sleepMinutes !== '' && obj.sleepMinutes !== null && obj.sleepMinutes !== undefined) healthObj.sleepMinutes = Number(obj.sleepMinutes);
      if (obj.heartRateAvg !== '' && obj.heartRateAvg !== null && obj.heartRateAvg !== undefined) healthObj.heartRateAvg = Number(obj.heartRateAvg);
      if (obj.restingHeartRate !== '' && obj.restingHeartRate !== null && obj.restingHeartRate !== undefined) healthObj.restingHeartRate = Number(obj.restingHeartRate);
      byDate[d].health = healthObj;
      if (obj.updatedAt && _safeDateTs(obj.updatedAt) > _safeDateTs(byDate[d].updatedAt)) {
        byDate[d].updatedAt = obj.updatedAt;
      }
    }
  }

  // --- daily_summary 繧ｷ繝ｼ繝医°繧芽ｪｭ縺ｿ霎ｼ繧 ---
  var summarySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('daily_summary');
  if (summarySheet && summarySheet.getLastRow() > 1) {
    var headers = summarySheet.getRange(1, 1, 1, summarySheet.getLastColumn()).getValues()[0];
    var data = summarySheet.getRange(2, 1, summarySheet.getLastRow() - 1, summarySheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      var d = _normDate(obj.date);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d };
      var dsRevision = parseInt(obj.revision) || 0;
      // condition繝・・繧ｿ
      if (obj.fatigue || obj.muscleSoreness || obj.motivation || obj.mood) {
        byDate[d].condition = {
          date: d,
          fatigue: Number(obj.fatigue) || 0,
          muscleSoreness: Number(obj.muscleSoreness) || 0,
          motivation: Number(obj.motivation) || 3,
          mood: Number(obj.mood) || 3
        };
      }
      // judgment繝・・繧ｿ
      if (obj.judgmentResult) {
        byDate[d].judgment = {
          date: d,
          result: Number(obj.judgmentResult),
          score: Number(obj.judgmentScore) || 0,
          resultLabel: obj.judgmentReason || ''
        };
      }
      // workout繝・・繧ｿ
      if (obj.didWorkout === 'yes' || obj.didWorkout === true) {
        byDate[d].workout = {
          date: d,
          type: obj.workoutType || 'full'
        };
      }
      // daily_summary 縺ｮ revision (譛螟ｧ蛟､繧剃ｽｿ逕ｨ)
      if (!byDate[d]._revision || dsRevision > byDate[d]._revision) {
        byDate[d]._revision = dsRevision;
      }
      if (obj.updatedAt && _safeDateTs(obj.updatedAt) > _safeDateTs(byDate[d].updatedAt)) {
        byDate[d].updatedAt = obj.updatedAt;
      }
    }
  }

  // --- RawData (蠕梧婿莠呈鋤) ---
  var rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RawData');
  if (rawSheet && rawSheet.getLastRow() > 0) {
    var rawValues = rawSheet.getDataRange().getValues();
    for (var i = 0; i < rawValues.length; i++) {
      if (rawValues[i][1]) {
        try {
          var parsed = JSON.parse(rawValues[i][1]);
          if (parsed.date && !byDate[parsed.date]) {
            byDate[parsed.date] = parsed;
          }
        } catch(ex){}
      }
    }
  }

  // --- tombstones: 莉也ｫｯ譛ｫ縺ｸ縺ｮ蜑企勁莨晄成 ---
  var tombstones = _getTombstones();
  for (var tDate in tombstones) {
    if (!byDate[tDate]) byDate[tDate] = { date: tDate };
    byDate[tDate]._deleted = tombstones[tDate];
  }

  // 險ｭ螳・  var settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('settings');
  if (settingsSheet) {
    var settingsData = _loadSettings(settingsSheet);
    if (settingsData) {
      var results = [];
      for (var key in byDate) {
        results.push(byDate[key]);
      }
      results.push(settingsData);
      return results;
    }
  }

  var results = [];
  for (var key in byDate) {
    results.push(byDate[key]);
  }
  return results;
}

function _getDate(dateStr) {
  if (!dateStr) throw new Error('date required');
  var rawSheet = _sheet('RawData');
  var idx = _findRow(rawSheet, dateStr);
  if (idx > -1) {
    return JSON.parse(rawSheet.getRange(idx, 2).getValue());
  }
  return null;
}

// ============ 蜷梧悄繝ｭ繧ｰ ============
function _appendSyncLog(timestamp, action, date, device, status, error) {
  var sheet = _sheetWithHeaders('sync_log', [
    'timestamp','action','date','device','status','error'
  ]);
  sheet.appendRow([timestamp, action, date, device, status, error]);
  var rows = sheet.getLastRow();
  if (rows > 201) {
    sheet.deleteRows(2, rows - 201);
  }
}

function _getSyncLog() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('sync_log');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  }).reverse().slice(0, 50);
}

// ============ 繧｢繝ｼ繧ｫ繧､繝・============
function _archiveOldRows(olderThanDays) {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  var cutoffStr = cutoff.toISOString().slice(0, 10);
  var archived = 0;

  // workout_details 縺ｮ繧｢繝ｼ繧ｫ繧､繝・  var wdSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('workout_details');
  if (wdSheet && wdSheet.getLastRow() > 1) {
    var wdHeaders = wdSheet.getRange(1, 1, 1, wdSheet.getLastColumn()).getValues()[0];
    var archSheet = _sheetWithHeaders('archive_workout_details', wdHeaders);
    var data = wdSheet.getDataRange().getValues();
    var toDelete = [];
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) < cutoffStr) {
        archSheet.appendRow(data[i]);
        toDelete.push(i + 1);
        archived++;
      }
    }
    for (var j = 0; j < toDelete.length; j++) {
      wdSheet.deleteRow(toDelete[j]);
    }
  }

  // daily_summary 縺ｮ繧｢繝ｼ繧ｫ繧､繝厄ｼ・65譌･雜・∴蛻・・縺ｿ・・  var dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('daily_summary');
  if (dsSheet && dsSheet.getLastRow() > 1) {
    var archCutoff = new Date();
    archCutoff.setDate(archCutoff.getDate() - 365);
    var archCutoffStr = archCutoff.toISOString().slice(0, 10);
    var dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
    var archDsSheet = _sheetWithHeaders('archive_daily', dsHeaders);
    var dsData = dsSheet.getDataRange().getValues();
    var dsToDelete = [];
    for (var i = dsData.length - 1; i >= 1; i--) {
      if (String(dsData[i][0]) < archCutoffStr) {
        archDsSheet.appendRow(dsData[i]);
        dsToDelete.push(i + 1);
        archived++;
      }
    }
    for (var j = 0; j < dsToDelete.length; j++) {
      dsSheet.deleteRow(dsToDelete[j]);
    }
  }

  // tombstones 縺ｮ繧ｯ繝ｪ繝ｼ繝ｳ繧｢繝・・・・0譌･雜・∴蛻・ｒ蜑企勁・・  var tsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tombstones');
  if (tsSheet && tsSheet.getLastRow() > 1) {
    var tsData = tsSheet.getDataRange().getValues();
    for (var i = tsData.length - 1; i >= 1; i--) {
      var delAt = tsData[i][2];
      if (delAt && _safeDateTs(delAt) < cutoff.getTime()) {
        tsSheet.deleteRow(i + 1);
      }
    }
  }

  return { archived: archived, olderThan: cutoffStr };
}

// ============ 險ｭ螳・============
function _saveSettings(settings, updatedAt) {
  var sheet = _sheetWithHeaders('settings', ['key', 'value', 'updatedAt']);
  for (var key in settings) {
    if (key === 'gasSyncUrl') continue;
    if (key === 'healthProvider') continue;
    var value = settings[key];
    var idx = _findRow(sheet, key);
    if (idx > -1) {
      sheet.getRange(idx, 2).setValue(String(value));
      sheet.getRange(idx, 3).setValue(updatedAt);
    } else {
      sheet.appendRow([key, String(value), updatedAt]);
    }
  }
}

function _loadSettings(sheet) {
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  var settings = {};
  var latestUpdate = '';
  for (var i = 1; i < data.length; i++) {
    var key = data[i][0];
    var val = data[i][1];
    if (['weeklyGoal', 'sessionDuration', 'strictness'].indexOf(key) > -1) val = parseInt(val) || 0;
    if (['notifPrep', 'notifJudge', 'notifResume'].indexOf(key) > -1) val = val === 'true';
    settings[key] = val;
    if (data[i][2] && data[i][2] > latestUpdate) latestUpdate = data[i][2];
  }
  return { date: '_settings', updatedAt: latestUpdate, settingsType: 'shared', settings: settings };
}

// ============ 繝倥Ν繝代・ ============

function _safeDateTs(v) {
  if (!v && v !== 0) return 0;
  if (v instanceof Date) return v.getTime();
  var t = new Date(String(v)).getTime();
  return isNaN(t) ? 0 : t;
}

function _normDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var y = v.getFullYear();
    var m = ('0' + (v.getMonth() + 1)).slice(-2);
    var d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var y = dt.getFullYear();
    var m = ('0' + (dt.getMonth() + 1)).slice(-2);
    var d = ('0' + dt.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return s;
}

function _normTime(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var h = ('0' + v.getHours()).slice(-2);
    var m = ('0' + v.getMinutes()).slice(-2);
    return h + ':' + m;
  }
  var s = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0');
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var h = ('0' + dt.getHours()).slice(-2);
    var m = ('0' + dt.getMinutes()).slice(-2);
    return h + ':' + m;
  }
  return s;
}

function _sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  return s;
}

function _sheetWithHeaders(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function _findRow(sheet, key) {
  var data = sheet.getDataRange().getValues();
  var normKey = _normDate(key) || String(key).trim();
  for (var i = 1; i < data.length; i++) {
    var cellVal = _normDate(data[i][0]) || String(data[i][0]).trim();
    if (cellVal === normKey) return i + 1;
  }
  return -1;
}

function _upsertRow(sheet, key, row, clientRevision) {
  var idx = _findRow(sheet, key);
  if (idx > -1) {
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var revIdx = headers.indexOf('revision');
    if (revIdx > -1) {
      var serverRev = parseInt(sheet.getRange(idx, revIdx + 1).getValue()) || 0;
      // conflict讀懷・: 繧ｯ繝ｩ繧､繧｢繝ｳ繝医′revision繧呈・遉ｺ逧・↓騾∽ｿ｡縺励◆蝣ｴ蜷医・縺ｿ辣ｧ蜷・      if (clientRevision != null && clientRevision > 0 && serverRev > clientRevision) {
        throw new Error('CONFLICT: revision mismatch (server=' + serverRev + ', client=' + clientRevision + ') for key=' + key);
      }
      row[revIdx] = serverRev + 1;
    }
    sheet.getRange(idx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function _deleteRowsByDate(sheet, dateStr) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (_normDate(data[i][0]) === _normDate(dateStr)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 9. 自己監査結果
- root -> Android assets 同期は再実行済み。
- 主要同期対象ファイルのハッシュ差分は別コマンドで確認し、差分なしだった。
- 旧互換吸収は GAS 側へ一部寄せたが、既存コード内の read 互換はまだ残る。
- Workout の詳細入力UIは「必須/任意」「前回/推奨/今回」を優先して再設計した一方、旧画面にあった細かなセット編集機能は簡略化している。
- Analytics は一覧性を優先したため、旧 Chart.js ベースの深い可視化は一部後退している。
- 文字化けして見える箇所はこのターミナル表示の影響が大きい可能性があるが、実機確認は未実施。
