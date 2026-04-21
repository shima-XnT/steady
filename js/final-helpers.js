(function() {
  'use strict';
  window.App = window.App || {};

  const ROUTE_LABELS = {
    home: 'ホーム',
    condition: '体調',
    workout: '記録',
    health: '健康',
    schedule: '勤務',
    history: '履歴',
    analytics: '分析',
    settings: '設定'
  };

  const ROUTE_ICONS = {
    home: '🏠',
    condition: '📋',
    workout: '💪',
    health: '❤️',
    schedule: '📅',
    history: '📊',
    analytics: '📈',
    settings: '⚙️'
  };

  const SHIFT_LABELS = {
    off: '休み',
    paid_leave: '有給',
    normal: '通常勤務',
    project: '案件あり勤務',
    business_trip: '出張勤務',
    remote: '在宅'
  };

  const SETTINGS_SCHEMA_VERSION = 2;

  const SETTINGS_SPEC = [
    {
      key: 'weeklyGoal',
      label: '週の目標回数',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: 3,
      description: '勤務連動の継続目標。Apps Script 保存成功後のみ確定します。'
    },
    {
      key: 'sessionDuration',
      label: '1回の目安時間',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: 40,
      description: '判定とワークアウト提案の基準になる共有設定です。'
    },
    {
      key: 'strictness',
      label: '判定の厳しさ',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: 50,
      description: 'どれだけ通常メニュー寄りに判定するかの共有設定です。'
    },
    {
      key: 'gymHoursStart',
      label: 'ジム開始目安',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: '22:00',
      description: '勤務後に動ける時間帯の共有設定です。'
    },
    {
      key: 'gymHoursEnd',
      label: 'ジム終了目安',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: '23:59',
      description: '利用可能時間の計算に使う共有設定です。'
    },
    {
      key: 'notifPrep',
      label: '準備リマインド',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: false,
      description: '共有したい通知方針なので sharedSettings として扱います。'
    },
    {
      key: 'notifJudge',
      label: '当日判定リマインド',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: false,
      description: '共有したい通知方針なので sharedSettings として扱います。'
    },
    {
      key: 'notifResume',
      label: '再開リマインド',
      scope: 'shared',
      storage: 'Google スプレッドシート',
      implemented: true,
      persisted: true,
      defaultValue: true,
      description: '継続支援の通知方針として sharedSettings に含めます。'
    },
    {
      key: 'gasSyncUrl',
      label: 'Apps Script Web App URL',
      scope: 'local',
      storage: '端末ローカル',
      implemented: true,
      persisted: true,
      defaultValue: '',
      description: '端末ごとに異なる接続先なので共有しません。'
    },
    {
      key: 'healthProvider',
      label: '健康データ取得元',
      scope: 'local',
      storage: '端末ローカル',
      implemented: true,
      persisted: true,
      defaultValue: () => window.SteadyBridge ? 'health_connect' : 'manual',
      description: 'PC は閲覧中心、Android は Health Connect 連携のため端末ごとに保持します。'
    },
    {
      key: 'theme',
      label: 'テーマ',
      scope: 'local',
      storage: '端末ローカル',
      implemented: false,
      persisted: true,
      defaultValue: 'system',
      description: '未実装ですが、導入しても端末ごとに保持する localDeviceSettings 扱いです。'
    },
    {
      key: 'deviceUiState',
      label: '端末 UI 状態',
      scope: 'local',
      storage: '端末ローカル',
      implemented: false,
      persisted: true,
      defaultValue: null,
      description: 'タブ開閉や表示密度など、この端末だけで意味を持つ状態です。'
    },
    {
      key: 'healthConnectConnectionState',
      label: 'Health Connect 接続状態',
      scope: 'local',
      storage: '端末ローカル / ランタイム',
      implemented: false,
      persisted: false,
      defaultValue: null,
      description: '権限や接続状況は端末依存なので、共有せずローカル扱いに固定します。'
    },
    {
      key: 'dataRetentionDays',
      label: 'データ保持期間',
      scope: 'shared',
      storage: 'Google スプレッドシート / GAS 保持ポリシー',
      implemented: false,
      persisted: false,
      defaultValue: 365,
      description: '現状は UI 未実装ですが、将来設定化する場合も sharedSettings として Apps Script 側で確定します。'
    }
  ];

  function getSettingSpecs(scope, options = {}) {
    return SETTINGS_SPEC.filter(item => {
      if (scope && item.scope !== scope) return false;
      if (options.implementedOnly && !item.implemented) return false;
      if (options.persistedOnly && item.persisted === false) return false;
      return true;
    });
  }

  const SHARED_SETTING_KEYS = getSettingSpecs('shared', { implementedOnly: true, persistedOnly: true }).map(item => item.key);
  const LOCAL_DEVICE_SETTING_KEYS = getSettingSpecs('local', { implementedOnly: true, persistedOnly: true }).map(item => item.key);

  function getRoute() {
    const route = (window.location.hash || '#/home').replace('#/', '') || 'home';
    return route === 'onboarding' ? 'home' : route;
  }

  function getDefaultSharedSettings() {
    const defaults = {};
    getSettingSpecs('shared', { implementedOnly: true, persistedOnly: true }).forEach(item => {
      defaults[item.key] = typeof item.defaultValue === 'function' ? item.defaultValue() : item.defaultValue;
    });
    return defaults;
  }

  function getDefaultLocalDeviceSettings() {
    const defaults = {};
    getSettingSpecs('local', { implementedOnly: true, persistedOnly: true }).forEach(item => {
      defaults[item.key] = typeof item.defaultValue === 'function' ? item.defaultValue() : item.defaultValue;
    });
    return defaults;
  }

  function sanitizeSettingsPayload(input, scope) {
    const sanitized = {};
    getSettingSpecs(scope, { implementedOnly: true, persistedOnly: true }).forEach(item => {
      if (Object.prototype.hasOwnProperty.call(input || {}, item.key)) {
        sanitized[item.key] = input[item.key];
      }
    });
    return sanitized;
  }

  function getSettingsBoundarySections() {
    return [
      {
        id: 'sharedSettings',
        title: 'sharedSettings',
        headline: 'Google スプレッドシート保存対象。Apps Script 保存成功後のみ確定。',
        items: getSettingSpecs('shared', { implementedOnly: true, persistedOnly: true })
      },
      {
        id: 'localDeviceSettings',
        title: 'localDeviceSettings',
        headline: '端末ローカルのみ。Google スプレッドシートへ送らない。',
        items: getSettingSpecs('local', { implementedOnly: true, persistedOnly: true })
      },
      {
        id: 'reservedLocal',
        title: 'localDeviceSettings 予約項目',
        headline: 'テーマ / 端末 UI 状態 / Health Connect 接続状態は今後も local 扱い。',
        items: SETTINGS_SPEC.filter(item => item.scope === 'local' && !item.implemented)
      },
      {
        id: 'reservedShared',
        title: 'sharedSettings 予約項目',
        headline: 'データ保持期間を設定化する場合も shared 扱いで Apps Script 成功後に確定。',
        items: SETTINGS_SPEC.filter(item => item.scope === 'shared' && !item.implemented)
      }
    ];
  }

  function applyNavigation() {
    const sidebar = document.getElementById('sidebar');
    const bottomNav = document.getElementById('bottom-nav');
    if (!sidebar || !bottomNav) return;

    const desktopRoutes = ['home', 'condition', 'workout', 'schedule', 'health', 'history', 'analytics', 'settings'];
    const mobileRoutes = ['home', 'condition', 'workout', 'history', 'settings'];

    sidebar.innerHTML = `
      <div class="sidebar-brand polished-brand">
        <h1>からだログ</h1>
        <div class="subtitle">勤務と体調から今日の継続を支える</div>
      </div>
      <ul class="sidebar-nav polished-nav">
        ${desktopRoutes.map(route => `
          <li>
            <a href="#/${route}" data-route="${route}">
              <span class="nav-icon">${ROUTE_ICONS[route]}</span>
              <span class="nav-label">${ROUTE_LABELS[route]}</span>
            </a>
          </li>`).join('')}
      </ul>`;

    bottomNav.innerHTML = mobileRoutes.map(route => `
      <a href="#/${route}" data-route="${route}">
        <span class="nav-icon">${ROUTE_ICONS[route]}</span>
        <span class="nav-label">${ROUTE_LABELS[route]}</span>
      </a>`).join('');

    document.querySelectorAll('.bottom-nav a, .sidebar-nav a').forEach(link => {
      link.classList.toggle('active', link.dataset.route === getRoute());
    });
  }

  async function buildSyncState() {
    const pendingCount = await App.DB.getPendingCount();
    const lastSyncAt = await App.DB.getSetting('_lastSyncAt', '');
    const lastSaveStatus = await App.DB.getSetting('_saveStatus', '');
    const lastSaveContext = await App.DB.getSetting('_saveStatusContext', '');
    const lastSaveDetail = await App.DB.getSetting('_saveStatusDetail', '');
    const hasUrl = !!(App.Sync && App.Sync.SheetSyncManager && App.Sync.SheetSyncManager.hasUrl());

    if (lastSaveStatus === 'busy') {
      return {
        level: 'busy',
        title: '保存中',
        description: `${lastSaveContext || '共有データ'} を Google スプレッドシートへ反映しています。`
      };
    }

    if (!hasUrl) {
      return {
        level: 'warning',
        title: '同期URL未設定',
        description: `共有設定はまだ確定していません。URL 設定後に再同期できます。${pendingCount > 0 ? ` 未送信 ${pendingCount}件あり。` : ''}`
      };
    }

    if (pendingCount > 0) {
      return {
        level: 'warning',
        title: `未送信 ${pendingCount}件`,
        description: 'Google スプレッドシートへの共有保存待ちがあります。再同期で再送できます。'
      };
    }

    if (lastSaveStatus === 'warning') {
      return {
        level: 'warning',
        title: lastSaveContext || '共有保存を確認してください',
        description: lastSaveDetail || '共有保存はまだ確定していません。設定や接続状態を確認してください。'
      };
    }

    if (lastSaveStatus === 'error') {
      return {
        level: 'error',
        title: '送信失敗',
        description: `${lastSaveContext || '共有データ'} の反映に失敗しました。${lastSaveDetail ? ` 詳細: ${lastSaveDetail}` : ''}`
      };
    }

    return {
      level: 'success',
      title: '共有保存は同期済み',
      description: lastSyncAt ? `最終同期 ${App.Utils.formatTimeShort(lastSyncAt)}` : 'Google スプレッドシートを正として運用中です。'
    };
  }

  function getAvailableMinutes(schedule) {
    if (!schedule) return null;
    if (schedule.shiftType === 'off' || schedule.shiftType === 'paid_leave') return 120;
    const endMin = App.Utils.timeToMinutes(schedule.endTime);
    if (endMin == null) return null;
    return Math.max(0, (24 * 60) - Math.max(endMin + 30, 22 * 60));
  }

  function getShiftLabel(type) {
    const normalized = normalizeShiftType(type);
    return SHIFT_LABELS[normalized] || normalized || '未設定';
  }

  function formatShiftRange(schedule) {
    if (!schedule) return '未設定';
    const shiftType = normalizeShiftType(schedule.shiftType);
    if (shiftType === 'off') return '終日休み';
    if (shiftType === 'paid_leave') return '終日有給';
    return `${App.Utils.normTime(schedule.startTime) || '--:--'} - ${App.Utils.normTime(schedule.endTime) || '--:--'}`;
  }

  function normalizeShiftType(type) {
    if (type === 'early' || type === 'late' || type === 'night') return 'normal';
    return type || '';
  }

  function isRestShiftType(type) {
    const normalized = normalizeShiftType(type);
    return normalized === 'off' || normalized === 'paid_leave';
  }

  function installUtilityHelpers() {
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
      if (weight > 0) return `${weight}kg × ${reps}回 × ${sets}セット`;
      return `${reps}回 × ${sets}セット`;
    };

    App.Utils.formatWorkoutSummary = function(item) {
      if (!item) return '';
      if (item.isCardio) return `${item.durationMin || 10}分`;
      const firstSet = item.sets && item.sets[0];
      if (!firstSet) return '';
      return App.Utils.formatKgRepsSets(firstSet.weight || 0, firstSet.reps || 0, item.sets.length || 1);
    };

    App.Utils.showSharedSaveResult = async function(result, options) {
      const subject = options?.subject || 'データ';
      const successMessage = options?.successMessage || `${subject}を共有保存しました`;
      const warningMessage = options?.warningMessage || `${subject}は未送信です。再送可能です`;
      const errorPrefix = options?.errorPrefix || `${subject}の共有保存に失敗しました`;
      const successType = options?.successType || 'success';
      const pendingCount = await App.DB.getPendingCount();
      const isConfigMissing = /Apps Script URL|Sync URL/.test(result?.error || '');

      if (result?.ok) {
        App.Utils.showToast(successMessage, successType);
        return 'success';
      }

      if (isConfigMissing) {
        App.Utils.showToast('同期URL未設定', 'warning');
        return 'warning';
      }

      if (pendingCount > 0 || result?.error === 'オフライン') {
        App.Utils.showToast(`${warningMessage}${pendingCount > 0 ? `（未送信 ${pendingCount}件）` : ''}`, 'warning');
        return 'warning';
      }

      App.Utils.showToast(`${errorPrefix}: ${result?.error || 'unknown'}`, 'error');
      return 'error';
    };

    App.Utils.showSyncResult = function(result, options) {
      const successMessage = options?.successMessage || '再同期しました';
      const warningMessage = options?.warningMessage || '再送できなかった未送信データがあります';
      const errorPrefix = options?.errorPrefix || '再同期に失敗しました';
      const isConfigMissing = /Apps Script URL|Sync URL/.test(result?.error || '');

      if (result?.success && (result.pendingAfter || 0) === 0) {
        App.Utils.showToast(successMessage, 'success');
        return 'success';
      }

      if (isConfigMissing) {
        App.Utils.showToast('同期URL未設定', 'warning');
        return 'warning';
      }

      if (result?.success) {
        App.Utils.showToast(`${warningMessage}（未送信 ${result.pendingAfter}件）`, 'warning');
        return 'warning';
      }

      App.Utils.showToast(`${errorPrefix}: ${result?.error || 'unknown'}`, 'error');
      return 'error';
    };

    App.Utils.describeHealthPushResult = async function(result) {
      const pendingCount = await App.DB.getPendingCount();
      const isConfigMissing = /Apps Script URL|Sync URL/.test(result?.error || '');
      if (result?.ok) {
        return {
          level: 'success',
          label: '送信済み',
          detail: 'スプレッドシートに反映済みです。',
          pushedAt: new Date().toISOString()
        };
      }
      if (result?.conflict) {
        return {
          level: 'warning',
          label: '競合あり',
          detail: '再同期して確認してください。',
          pushedAt: ''
        };
      }
      if (isConfigMissing) {
        return {
          level: 'warning',
          label: '同期URL未設定',
          detail: 'URL 設定後に再送できます。',
          pushedAt: ''
        };
      }
      if (pendingCount > 0 || result?.error === 'オフライン') {
        return {
          level: 'warning',
          label: '未送信',
          detail: pendingCount > 0 ? `再送待ち ${pendingCount}件` : '再送待ちです。',
          pushedAt: ''
        };
      }
      return {
        level: 'error',
        label: '送信失敗',
        detail: result?.error || '送信に失敗しました。',
        pushedAt: ''
      };
    };

    App.Utils.rememberHealthPushResult = async function(result, options = {}) {
      const dateStr = options.dateStr || '';
      const fetchedAt = options.fetchedAt || '';
      const source = options.source || '';
      if (dateStr) await App.DB.setSetting('_lastHealthSyncDate', dateStr);
      if (fetchedAt) await App.DB.setSetting('_lastHealthFetchAt', fetchedAt);
      if (source) await App.DB.setSetting('_lastHealthSource', source);
      const state = await App.Utils.describeHealthPushResult(result);
      await App.DB.setSetting('_lastHealthPushState', state.level);
      await App.DB.setSetting('_lastHealthPushLabel', state.label);
      await App.DB.setSetting('_lastHealthPushDetail', state.detail);
      if (state.pushedAt) {
        await App.DB.setSetting('_lastHealthPushAt', state.pushedAt);
      }
      return state;
    };

    App.Utils.rememberHealthFetchOnly = async function(options = {}) {
      const dateStr = options.dateStr || '';
      const fetchedAt = options.fetchedAt || '';
      const source = options.source || '';
      const label = options.label || '未取得';
      const detail = options.detail || '今日の健康データは取得できませんでした。';
      if (dateStr) await App.DB.setSetting('_lastHealthSyncDate', dateStr);
      if (fetchedAt) await App.DB.setSetting('_lastHealthFetchAt', fetchedAt);
      if (source) await App.DB.setSetting('_lastHealthSource', source);
      await App.DB.setSetting('_lastHealthPushState', 'warning');
      await App.DB.setSetting('_lastHealthPushLabel', label);
      await App.DB.setSetting('_lastHealthPushDetail', detail);
    };
  }

  function installDbHelpers() {
    App.DB.SETTINGS_SCHEMA_VERSION = SETTINGS_SCHEMA_VERSION;
    App.DB.SHARED_SETTING_KEYS = SHARED_SETTING_KEYS.slice();
    App.DB.LOCAL_DEVICE_SETTING_KEYS = LOCAL_DEVICE_SETTING_KEYS.slice();
    App.DB.getSettingsSpec = function() {
      return SETTINGS_SPEC.map(item => ({ ...item }));
    };
    App.DB.getSettingsBoundarySections = function() {
      return getSettingsBoundarySections().map(section => ({
        ...section,
        items: section.items.map(item => ({ ...item }))
      }));
    };

    App.DB.getSharedSettings = async function() {
      const defaults = getDefaultSharedSettings();
      const values = {};
      for (const key of SHARED_SETTING_KEYS) {
        values[key] = await this.getSetting(key, defaults[key]);
      }
      return values;
    };

    App.DB.getLocalDeviceSettings = async function() {
      const defaults = getDefaultLocalDeviceSettings();
      const values = {};
      for (const key of LOCAL_DEVICE_SETTING_KEYS) {
        values[key] = await this.getSetting(key, defaults[key]);
      }
      return values;
    };

    App.DB.getSettingsBundle = async function() {
      return {
        sharedSettings: await this.getSharedSettings(),
        localDeviceSettings: await this.getLocalDeviceSettings()
      };
    };

    App.DB.setSaveStatus = async function(level, context, detail) {
      await this.setSetting('_saveStatus', level || '');
      await this.setSetting('_saveStatusContext', context || '');
      await this.setSetting('_saveStatusDetail', detail || '');
      await this.setSetting('_saveStatusAt', new Date().toISOString());
    };

    App.DB.getSaveState = async function() {
      return buildSyncState();
    };

    App.DB.saveSharedSettings = async function(sharedSettings) {
      const payload = sanitizeSettingsPayload(sharedSettings, 'shared');
      if (!App.Sync?.SheetSyncManager?.hasUrl()) {
        await this.setSaveStatus('warning', '共有設定', 'Apps Script URL を設定するまで共有側へ確定できません');
        return { ok: false, error: 'Apps Script URL が未設定です' };
      }

      await this.setSaveStatus('busy', '共有設定', '');
      const updatedAt = new Date().toISOString();
      const result = await App.Sync.SheetSyncManager.pushData({
        action: 'saveSettings',
        settingsType: 'shared',
        settings: payload,
        updatedAt
      });

      if (!result.ok) {
        await this.setSaveStatus('error', '共有設定', result.error || '保存に失敗しました');
        return result;
      }

      for (const [key, value] of Object.entries(payload)) {
        await this.setSetting(key, value);
      }
      await this.setSetting('_settingsUpdatedAt', updatedAt);
      await this.setSetting('_lastSyncAt', updatedAt);
      await this.setSaveStatus('success', '共有設定', '');
      return { ok: true };
    };

    App.DB.saveLocalDeviceSettings = async function(localSettings) {
      const payload = sanitizeSettingsPayload(localSettings, 'local');
      for (const [key, value] of Object.entries(payload)) {
        await this.setSetting(key, value);
      }
      if (App.Sync?.SheetSyncManager && Object.prototype.hasOwnProperty.call(payload, 'gasSyncUrl')) {
        App.Sync.SheetSyncManager.init(payload.gasSyncUrl || '');
      }
      return { ok: true };
    };

    App.DB.syncNow = async function(context) {
      if (!App.Sync?.SheetSyncManager?.hasUrl()) {
        await this.setSaveStatus('warning', context || '再同期', 'Apps Script URL を設定するまで再同期できません');
        return {
          success: false,
          error: 'Apps Script URL が未設定です',
          pendingAfter: await this.getPendingCount()
        };
      }

      await this.setSaveStatus('busy', context || '再同期', '');
      const retrySummary = await this.retryPendingQueue();
      const result = await App.Sync.SheetSyncManager.syncAll();
      const pendingAfter = await this.getPendingCount();

      if (result?.success) {
        await this.setSetting('_lastSyncAt', new Date().toISOString());
        await this.setSaveStatus('success', context || '再同期', '');
      } else {
        await this.setSaveStatus('error', context || '再同期', result?.error || '再同期に失敗しました');
      }

      return {
        ...(result || { success: false }),
        retried: retrySummary?.attempted || 0,
        resent: retrySummary?.sent || 0,
        retryFailed: retrySummary?.failed || 0,
        pendingAfter
      };
    };

    const originalPushToCloud = App.DB.pushToCloud.bind(App.DB);
    App.DB.pushToCloud = async function(dateStr, options = {}) {
      await this.setSaveStatus('busy', `${dateStr} の共有保存`, '');
      const result = await originalPushToCloud(dateStr, options);
      if (result.ok) {
        await this.setSaveStatus('success', `${dateStr} の共有保存`, '');
      } else if (/Apps Script URL|Sync URL/.test(result.error || '')) {
        await this.setSaveStatus('warning', `${dateStr} の共有保存`, 'Apps Script URL を設定するまで共有側へ確定していません');
      } else if (result.error === 'オフライン') {
        await this.setSaveStatus('pending', `${dateStr} の共有保存`, 'オンライン復帰後に再送します');
      } else {
        await this.setSaveStatus('error', `${dateStr} の共有保存`, result.error || '送信に失敗しました');
      }
      return result;
    };
  }

  App.SettingsSpec = {
    version: SETTINGS_SCHEMA_VERSION,
    items: SETTINGS_SPEC.map(item => ({ ...item })),
    sharedKeys: SHARED_SETTING_KEYS.slice(),
    localDeviceKeys: LOCAL_DEVICE_SETTING_KEYS.slice(),
    getSections: () => getSettingsBoundarySections().map(section => ({
      ...section,
      items: section.items.map(item => ({ ...item }))
    }))
  };

  App.FinalPolish = {
    ROUTE_LABELS,
    ROUTE_ICONS,
    SHIFT_LABELS,
    SETTINGS_SCHEMA_VERSION,
    SETTINGS_SPEC,
    getDefaultSharedSettings,
    getDefaultLocalDeviceSettings,
    getSettingsBoundarySections,
    buildSyncState,
    getAvailableMinutes,
    getShiftLabel,
    formatShiftRange,
    normalizeShiftType,
    isRestShiftType,
    applyNavigation,
    installDbHelpers
  };

  let finalHelpersInstalled = false;

  function bootFinalHelpers() {
    if (!finalHelpersInstalled) {
      finalHelpersInstalled = true;
      installUtilityHelpers();
      installDbHelpers();
    }
    applyNavigation();
    if (document?.title !== 'からだログ') {
      document.title = 'からだログ';
    }
  }

  window.addEventListener('hashchange', () => setTimeout(applyNavigation, 0));
  window.addEventListener('resize', () => setTimeout(applyNavigation, 0));
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootFinalHelpers);
  }
  bootFinalHelpers();
})();
