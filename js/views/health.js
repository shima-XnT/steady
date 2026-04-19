// ============================================
// からだログ - 健康データ表示
// 健康データは Health Connect / GAS から取得した値を表示するだけにする。
// この旧ビューは reboot-views.js が有効な通常運用では上書きされるが、
// フォールバック時にも手入力保存を出さないため、表示専用で維持する。
// ============================================
(function() {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  const h = value => App.Utils.escapeHtml(value == null ? '' : String(value));

  App.Views.Health = {
    _selectedDate: null,
    _historyExpanded: false,

    async render() {
      const today = App.Utils.today();
      const date = this._selectedDate || today;
      const [health, recent, lastSyncAt, pendingCount] = await Promise.all([
        App.DB.getHealth(date),
        this._recentHealth(today),
        App.DB.getSetting('_lastSyncAt', ''),
        App.DB.getPendingCount()
      ]);
      const provider = App.healthProvider;
      const source = health?.source === 'health_connect' ? 'health_connect' : (health?.source || '未取得');
      const visibleRecent = this._historyExpanded ? recent : recent.slice(0, 5);
      const sleepDetail = App.Utils.formatSleepDetail?.(health) || App.Utils.formatSleepWindow?.(health) || '';

      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">❤️</span> 健康</h2>

          <div class="card mb-16">
            <div class="flex-between">
              <div>
                <div class="text-sm fw-600">同期状態</div>
                <div class="text-xs text-muted mt-4">表示専用です。健康データはスマホから取得します。</div>
              </div>
              <div class="data-status ${h(provider?.getStatus?.() || 'manual')}">
                <span class="data-status-dot"></span>
                ${h(provider?.getStatusLabel?.() || source)}
              </div>
            </div>
            <div class="text-xs text-muted mt-8" style="display:flex;gap:12px;flex-wrap:wrap;">
              <span>ソース: ${h(source)}</span>
              <span>最終同期: ${lastSyncAt ? h(App.Utils.formatTimeShort(lastSyncAt)) : '未同期'}</span>
              <span>${pendingCount > 0 ? `未送信 ${h(pendingCount)}件` : '送信済み'}</span>
            </div>
          </div>

          <div class="form-group">
            <div class="form-label">対象日</div>
            <input type="date" class="form-input" id="health-date" value="${h(date)}">
          </div>

          <div class="card mb-16">
            <h3 class="mb-12">今日の値</h3>
            <div class="grid-2">
              ${this._statCard('歩数', health?.steps != null ? `${Number(health.steps).toLocaleString()} 歩` : '未取得')}
              ${this._statCard('睡眠', App.Utils.formatSleep(health?.sleepMinutes) || '未取得', sleepDetail)}
              ${this._statCard('平均心拍', health?.heartRateAvg != null ? `${health.heartRateAvg} bpm` : '未取得')}
              ${this._statCard('安静時心拍', health?.restingHeartRate != null ? `${health.restingHeartRate} bpm` : '未取得')}
            </div>
          </div>

          <div class="card mb-16">
            <h3 class="mb-12">取得データ</h3>
            <div class="text-sm text-muted">手入力はできません。必要なときはスマホで再取得してください。</div>
            ${provider?.triggerSync ? `
              <button class="btn btn-secondary btn-block mt-16" id="health-trigger-sync-btn">再取得</button>
            ` : ''}
          </div>

          <div class="section mt-20">
            <div class="section-title">履歴</div>
            <div id="health-recent">
              ${this._renderRecentList(visibleRecent)}
            </div>
            ${recent.length > 5 ? `
              <button class="btn btn-ghost btn-block mt-12" id="health-history-toggle">${this._historyExpanded ? '閉じる' : 'もっと見る'}</button>
            ` : ''}
          </div>
        </div>`;
    },

    _statCard(label, value, sub = '') {
      return `
        <div class="stat-card">
          <span class="stat-value">${h(value)}</span>
          <span class="stat-label">${h(label)}</span>
          ${sub ? `<span class="text-xs text-muted">${h(sub)}</span>` : ''}
        </div>`;
    },

    async _recentHealth(today) {
      const start = new Date(today + 'T00:00:00');
      start.setDate(start.getDate() - 14);
      const startDate = App.Utils._localDateStr(start);
      return App.DB.getHealthRange(startDate, today);
    },

    _renderRecentList(records) {
      if (!records || records.length === 0) {
        return '<div class="text-center text-muted text-sm p-16">データがありません</div>';
      }
      return `
        <div class="reboot-link-list">
          ${records.sort((a, b) => b.date.localeCompare(a.date)).map(record => `
            <div class="reboot-link-card">
              <strong>${h(App.Utils.formatDateShort(record.date))}</strong>
              <span>${record.steps != null ? `${Number(record.steps).toLocaleString()}歩` : '歩数なし'} / ${App.Utils.formatSleep(record.sleepMinutes) || '睡眠なし'}${App.Utils.formatSleepDetail?.(record) ? ` (${h(App.Utils.formatSleepDetail(record))})` : ''}</span>
              <small>平均心拍 ${record.heartRateAvg != null ? `${h(record.heartRateAvg)} bpm` : '—'} / 安静時 ${record.restingHeartRate != null ? `${h(record.restingHeartRate)} bpm` : '—'}</small>
            </div>
          `).join('')}
        </div>`;
    },

    async loadDate(dateStr) {
      this._selectedDate = dateStr || App.Utils.today();
      await App.refreshView();
    },

    init() {
      document.getElementById('health-date')?.addEventListener('change', event => this.loadDate(event.target.value));
      document.getElementById('health-trigger-sync-btn')?.addEventListener('click', () => {
        if (App.healthProvider?.triggerSync) {
          App.Utils.showToast('再取得しています', 'info', 1800);
          App.healthProvider.triggerSync(document.getElementById('health-date')?.value || App.Utils.today());
        }
      });
      document.getElementById('health-history-toggle')?.addEventListener('click', async () => {
        this._historyExpanded = !this._historyExpanded;
        await App.refreshView();
      });
    },

    destroy() {}
  };
})();
