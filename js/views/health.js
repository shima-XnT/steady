// ============================================
// Steady — 健康データ入力画面（シンプル版）
// 歩数 + 睡眠時間 のみ。消費カロリーは自動計算。
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  let _healthSleepTouched = false;

  App.Views.Health = {
    async render() {
      const today = App.Utils.today();
      const health = await App.DB.getHealth(today);
      const hasSleep = !!(health && health.sleepMinutes != null);
      _healthSleepTouched = hasSleep;
      const provider = App.healthProvider;

      // 今日のワークアウトから自動計算カロリーを取得
      const autoCalories = await this._calcTodayCalories(today);

      // 最終同期時刻
      const lastSyncAt = await App.DB.getSetting('_lastSyncAt', '');
      const pendingCount = await App.DB.getPendingCount();

      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">💊</span> 健康データ</h2>

          <!-- PC閲覧専用バナー -->
          ${!window.SteadyBridge ? `
          <div class="readonly-banner pc-only">
            <span>🖥️</span>
            <span>PCでは閲覧専用です。入力・同期はスマホアプリから行ってください。</span>
          </div>` : ''}

          <!-- 同期状態カード -->
          <div class="card mb-16">
            <div class="flex-between">
              <div>
                <div class="text-sm fw-600">データソース</div>
                <div class="text-xs text-muted mt-4">${this._providerDesc(provider.getStatus())}</div>
              </div>
              <div class="data-status ${provider.getStatus()}">
                <span class="data-status-dot"></span>
                ${provider.getStatusLabel()}
              </div>
            </div>
            <div class="text-xs text-muted mt-8" style="display:flex;gap:16px;align-items:center;">
              <span>🔄 最終同期: ${lastSyncAt ? App.Utils.formatTimeShort(lastSyncAt) : '未同期'}</span>
              ${pendingCount > 0 ? `<span class="badge badge-danger" style="font-size:0.6rem;">⚠ 未送信 ${pendingCount}件</span>` : '<span style="color:var(--success);">✓</span>'}
            </div>
          </div>

          <!-- 今日の主要値 (PC/スマホ共通の閲覧エリア) -->
          <div class="card mb-16">
            <h3 class="mb-12">今日のデータ</h3>
            <div class="grid-2">
              <div class="stat-card">
                <span class="stat-icon">👟</span>
                <span class="stat-value">${health?.steps != null ? health.steps.toLocaleString() : '<span class="text-muted text-xs">未取得</span>'}</span>
                <span class="stat-label">歩数</span>
              </div>
              <div class="stat-card">
                <span class="stat-icon">💤</span>
                <span class="stat-value">${health?.sleepMinutes != null ? App.Utils.formatSleep(health.sleepMinutes) : '<span class="text-muted text-xs">未取得</span>'}</span>
                <span class="stat-label">睡眠</span>
              </div>
              <div class="stat-card">
                <span class="stat-icon">❤️</span>
                <span class="stat-value">${health?.heartRateAvg != null ? health.heartRateAvg + ' bpm' : '<span class="text-muted text-xs">—</span>'}</span>
                <span class="stat-label">平均心拍</span>
              </div>
              <div class="stat-card">
                <span class="stat-icon">💓</span>
                <span class="stat-value">${health?.restingHeartRate != null ? health.restingHeartRate + ' bpm' : '<span class="text-muted text-xs">—</span>'}</span>
                <span class="stat-label">安静時心拍</span>
              </div>
            </div>
          </div>

          <!-- 日付選択 -->
          <div class="form-group">
            <div class="form-label">対象日</div>
            <input type="date" class="form-input" id="health-date" value="${today}" 
              onchange="App.Views.Health.loadDate(this.value)">
          </div>

          <!-- 入力フォーム (スマホのみ) -->
          <div class="card health-input-mobile" id="health-form">
            <h3 class="mb-16">${window.SteadyBridge ? 'データ入力' : '📱 健康データ（スマホから自動同期）'}</h3>

            ${window.SteadyBridge ? `
            <!-- スマホ: 入力フィールド -->
            <div class="form-group">
              <div class="form-label">👟 歩数</div>
              <input type="number" class="form-input" id="h-steps" step="100" min="0"
                value="${health?.steps || ''}" placeholder="未入力">
            </div>

            <div class="form-group">
              <div class="form-label">💤 睡眠時間</div>
              <div class="range-group">
                <div class="range-header">
                  <span class="text-xs text-muted">0h</span>
                  <span class="range-value" id="h-sleep-display">${hasSleep ? App.Utils.formatSleep(health.sleepMinutes) : '未設定'}</span>
                  <span class="text-xs text-muted">12h</span>
                </div>
                <input type="range" id="h-sleep" min="0" max="720" step="15"
                  value="${hasSleep ? health.sleepMinutes : 360}"
                  class="${hasSleep ? '' : 'unset'}">
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <div class="form-label">❤️ 心拍数 (bpm)</div>
                <input type="number" class="form-input" id="h-heartrate" min="40" max="200"
                  value="${health?.heartRateAvg || ''}" placeholder="未入力">
              </div>
              <div class="form-group">
                <div class="form-label">🔥 消費カロリー（自動計算）</div>
                <div class="text-lg fw-600" id="h-calories-display" style="color:var(--accent);padding:8px 0;">
                  ${autoCalories > 0 ? autoCalories + ' kcal' : '— トレーニング未実施'}
                </div>
                <div class="text-xs text-muted">トレーニング完了時に自動計算</div>
              </div>
            </div>

            <button class="btn btn-primary btn-block mt-16" id="save-health-btn">
              💾 保存する
            </button>
            ` : `
            <!-- PC: 読み取り専用表示 -->
            <div class="grid-2">
              <div class="stat-card">
                <span class="stat-icon">👟</span>
                <span class="stat-value">${health?.steps != null ? health.steps.toLocaleString() : '<span class="text-muted text-xs">—</span>'}</span>
                <span class="stat-label">歩数</span>
              </div>
              <div class="stat-card">
                <span class="stat-icon">💤</span>
                <span class="stat-value">${hasSleep ? App.Utils.formatSleep(health.sleepMinutes) : '<span class="text-muted text-xs">—</span>'}</span>
                <span class="stat-label">睡眠</span>
              </div>
              <div class="stat-card">
                <span class="stat-icon">❤️</span>
                <span class="stat-value">${health?.heartRateAvg != null ? health.heartRateAvg + ' bpm' : '<span class="text-muted text-xs">—</span>'}</span>
                <span class="stat-label">心拍数</span>
              </div>
              <div class="stat-card">
                <span class="stat-icon">🔥</span>
                <span class="stat-value">${autoCalories > 0 ? autoCalories + ' kcal' : '<span class="text-muted text-xs">—</span>'}</span>
                <span class="stat-label">消費カロリー</span>
              </div>
            </div>
            <div class="text-xs text-muted mt-8" style="text-align:center;">
              📱 スマホのHealth Connectからデータを受信 ・ 最終同期: ${lastSyncAt ? App.Utils.formatTimeShort(lastSyncAt) : '未同期'}
            </div>
            `}
          </div>

          <!-- 直近の推移 -->
          <div class="section mt-20">
            <div class="section-title">直近7日間</div>
            <div id="health-recent">${await this._renderRecent()}</div>
          </div>
        </div>`;
    },

    _providerDesc(status) {
      const map = {
        manual: '手入力でデータを管理しています',
        connected: 'Health Connect から自動取得中',
        disconnected: 'Health Connect に未接続です',
        error: 'データ取得に失敗しました',
        permission_denied: '権限が不足しています'
      };
      return map[status] || '';
    },

    /**
     * 今日のワークアウトから消費カロリーを自動計算する
     * ウェイトトレーニング: 1セット × 3 kcal (概算)
     * 有酸素: 1分 × 8 kcal (概算)
     */
    async _calcTodayCalories(dateStr) {
      try {
        const workout = await App.DB.getWorkoutByDate(dateStr);
        if (!workout || workout.type === 'skip') return 0;
        
        const exercises = await App.DB.getExercises(workout.id);
        let totalCalories = 0;

        for (const ex of exercises) {
          if (ex.isCardio && ex.durationMin) {
            // 有酸素: 体重70kgベースで概算（約8 kcal/分）
            totalCalories += ex.durationMin * 8;
          } else if (ex.sets && Array.isArray(ex.sets)) {
            // ウェイト: 各セットの完了分のみカウント
            for (const set of ex.sets) {
              if (set.completed) {
                // 概算: (重量kg × 回数 × 0.05) + 基礎の3kcal/セット
                const weight = set.weight || 0;
                const reps = set.reps || 0;
                totalCalories += Math.round(weight * reps * 0.05) + 3;
              }
            }
          }
        }

        return Math.round(totalCalories);
      } catch (e) {
        console.error('Calorie calc error:', e);
        return 0;
      }
    },

    async _renderRecent() {
      const today = App.Utils.today();
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() - 7);
      const weekAgo = App.Utils._localDateStr(d);
      const records = await App.DB.getHealthRange(weekAgo, today);

      if (records.length === 0) {
        return '<div class="text-center text-muted text-sm p-16">まだデータがありません</div>';
      }

      return `<div style="overflow-x:auto;">
        <table style="width:100%;font-size:0.75rem;border-collapse:collapse;">
          <thead>
            <tr style="color:var(--text-muted);">
              <th style="padding:8px 4px;text-align:left;">日付</th>
              <th style="padding:8px 4px;">歩数</th>
              <th style="padding:8px 4px;">睡眠</th>
              <th style="padding:8px 4px;">心拍</th>
              <th style="padding:8px 4px;">消費cal</th>
            </tr>
          </thead>
          <tbody>
            ${records.sort((a,b) => b.date.localeCompare(a.date)).map(r => `
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:8px 4px;">${App.Utils.formatDateShort(r.date)}</td>
                <td style="padding:8px 4px;text-align:center;">${r.steps ? r.steps.toLocaleString() : '—'}</td>
                <td style="padding:8px 4px;text-align:center;">${r.sleepMinutes ? App.Utils.formatSleep(r.sleepMinutes) : '—'}</td>
                <td style="padding:8px 4px;text-align:center;">${r.heartRateAvg || '—'}</td>
                <td style="padding:8px 4px;text-align:center;">${r.calories ? r.calories + 'kcal' : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    },

    async loadDate(dateStr) {
      const health = await App.DB.getHealth(dateStr);
      const hasSleep = !!(health && health.sleepMinutes != null);

      // スマホ環境: 入力フィールドを更新
      const stepsInput = document.getElementById('h-steps');
      if (stepsInput) {
        _healthSleepTouched = hasSleep;
        stepsInput.value = health?.steps || '';
        const hrInput = document.getElementById('h-heartrate');
        if (hrInput) hrInput.value = health?.heartRateAvg || '';
        const sleepSlider = document.getElementById('h-sleep');
        if (sleepSlider) {
          sleepSlider.value = hasSleep ? health.sleepMinutes : 360;
          sleepSlider.className = hasSleep ? '' : 'unset';
        }
        const sleepDisplay = document.getElementById('h-sleep-display');
        if (sleepDisplay) sleepDisplay.textContent = hasSleep ? App.Utils.formatSleep(health.sleepMinutes) : '未設定';
      } else {
        // PC環境: 画面全体をリフレッシュ（読み取り専用カードの更新）
        App.refreshView();
        return;
      }

      // カロリー自動計算表示
      const cal = await this._calcTodayCalories(dateStr);
      const calDisplay = document.getElementById('h-calories-display');
      if (calDisplay) calDisplay.textContent = cal > 0 ? cal + ' kcal' : '— トレーニング未実施';
    },

    init() {
      // Sleep slider
      const sleepSlider = document.getElementById('h-sleep');
      if (sleepSlider) {
        sleepSlider.addEventListener('input', () => {
          _healthSleepTouched = true;
          sleepSlider.classList.remove('unset');
          document.getElementById('h-sleep-display').textContent = App.Utils.formatSleep(parseInt(sleepSlider.value));
        });
      }

      // Save
      document.getElementById('save-health-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('save-health-btn');
        btn.disabled = true;
        btn.textContent = '⬼ 保存中...';
        try {
          const date = document.getElementById('health-date').value;
          const calories = await this._calcTodayCalories(date);
          const data = {
            date,
            source: 'manual',
            steps: parseInt(document.getElementById('h-steps').value) || null,
            sleepMinutes: _healthSleepTouched ? (parseInt(document.getElementById('h-sleep').value) || null) : null,
            heartRateAvg: parseInt(document.getElementById('h-heartrate').value) || null,
            calories: calories || null
          };
          await App.DB.upsertHealth(data);

          // クラウドPush（結果を待つ）
          const pushRes = await App.DB.pushToCloud(date, { sections: ['health'] });
          btn.textContent = '💾 保存する';
          btn.disabled = false;
          if (pushRes.ok) {
            App.Utils.showToast('健康データを保存しました ✅', 'success');
          } else {
            App.Utils.showToast('⚠️ 未送信（' + (pushRes.error || 'オンライン復帰時に再送') + '）', 'warning');
          }

          // 直近表示を更新
          const recent = document.getElementById('health-recent');
          if (recent) recent.innerHTML = await this._renderRecent();
        } catch (e) {
          btn.textContent = '💾 保存する';
          btn.disabled = false;
          App.Utils.showToast('保存に失敗: ' + e.message, 'error');
        }
      });
    },

    destroy() {}
  };
})();
