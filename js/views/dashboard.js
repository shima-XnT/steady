// ============================================
// Steady — ダッシュボード v49
// 「今日どうするか」の意思決定画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  App.Views.Dashboard = {
    async render() {
      const today = App.Utils.today();
      const judgment = await App.DB.getJudgment(today);
      const health = await App.DB.getHealth(today);
      const condition = await App.DB.getCondition(today);
      const lastWorkout = await App.DB.getLastWorkout();
      const weekDates = App.Utils.getWeekDates(today);
      const daysSince = await App.DB.getDaysSinceLastWorkout(today);
      const provider = App.healthProvider;
      const todayWorkout = await App.DB.getWorkoutByDate(today);

      // 週間データ
      const weekWorkouts = await App.DB.getWorkoutsRange(weekDates[0], weekDates[6]);
      const weekJudgments = await App.DB.getJudgmentRange(weekDates[0], weekDates[6]);
      const workoutDates = new Set(weekWorkouts.map(w => w.date));
      const skipDates = new Set(weekJudgments.filter(j => j.result === 5 || j.userOverride === 5).map(j => j.date));

      // 今月のワークアウト数
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const monthWorkouts = await App.DB.getWorkoutCountInRange(monthStart, today);

      // 今日の勤務情報
      const schedule = await App.DB.getSchedule(today);
      const SHIFT_LABELS = { off: '休み', paid_leave: '有給', normal: '通常勤務', project: '案件あり勤務', business_trip: '出張勤務', remote: '在宅' };
      const shiftLabel = SHIFT_LABELS[schedule?.shiftType] || schedule?.shiftType || '未設定';
      const workEnd = App.Utils.normTime(schedule?.endTime) || '';

      // 同期状態
      const lastSyncAt = await App.DB.getSetting('_lastSyncAt', '');
      const pendingCount = await App.DB.getPendingCount();

      // 不足入力の検出
      const missing = [];
      if (!judgment) missing.push({ key: 'judgment', icon: '📝', title: '体調を入力して判定する', desc: '今日のおすすめメニューを確認', route: 'condition', urgent: true });
      if (judgment && !todayWorkout && judgment.result !== 5) missing.push({ key: 'workout', icon: '🏋️', title: 'トレーニングを始める', desc: judgment.resultLabel || '通常メニュー', route: 'workout', urgent: true });
      if (window.SteadyBridge && !health?.steps) missing.push({ key: 'health', icon: '💊', title: '健康データを確認', desc: '歩数・睡眠を同期', route: 'health', urgent: false });

      // 完了済みアクション
      const done = [];
      if (judgment) done.push({ key: 'judgment-done', icon: '✅', title: '判定済み: ' + (judgment.resultLabel || ''), desc: 'スコア ' + judgment.score, route: 'condition' });
      if (todayWorkout) done.push({ key: 'workout-done', icon: '✅', title: 'トレーニング完了', desc: todayWorkout.type || '', route: 'history' });

      return `
        <div class="container animate-in">
          <!-- 挨拶 + 日付 -->
          <div class="flex-between mb-12">
            <div>
              <div class="text-secondary text-sm">${App.Utils.getGreeting()}</div>
              <h2>${App.Utils.formatDate(today)}</h2>
            </div>
            <div class="data-status ${provider.getStatus()}">
              <span class="data-status-dot"></span>
              ${provider.getStatusLabel()}
            </div>
          </div>

          <!-- 同期バー -->
          <div class="sync-bar">
            <span class="sync-dot ${pendingCount > 0 ? 'pending' : 'ok'}"></span>
            <span class="sync-info">
              ${lastSyncAt ? App.Utils.formatTimeShort(lastSyncAt) : '未同期'}
              ${pendingCount > 0 ? ' · <span style="color:var(--warning);">未送信 ' + pendingCount + '件</span>' : ''}
            </span>
            <button class="sync-btn" onclick="App.Views.Dashboard.manualSync()">↻ 同期</button>
          </div>

          <!-- PC: 2カラム構成 -->
          <div class="dashboard-2col">
            <!-- 左カラム: 判定 + アクション -->
            <div class="dash-main">

              <!-- 今日の勤務 -->
              <div class="card mb-12" style="padding:10px 16px;">
                <div class="flex-between">
                  <span class="text-xs">📋 今日: <strong>${shiftLabel}</strong>${workEnd ? ' (〜' + workEnd + ')' : ''}</span>
                  <a class="text-xs" href="#/schedule" style="color:var(--primary-light);">編集</a>
                </div>
              </div>

              <!-- 判定カード -->
              ${judgment ? this._renderJudgmentCard(judgment) : this._renderNoJudgment()}

              <!-- 不足入力 / アクション -->
              ${missing.length > 0 ? `
              <div class="section mt-16">
                <div class="section-title">⚡ 次のアクション</div>
                ${missing.map(m => `
                  <div class="action-card ${m.urgent ? 'urgent' : ''}" onclick="App.navigate('${m.route}')">
                    <div class="action-icon">${m.icon}</div>
                    <div class="action-content">
                      <div class="action-title">${m.title}</div>
                      <div class="action-desc">${m.desc}</div>
                    </div>
                    <span class="action-arrow">›</span>
                  </div>
                `).join('')}
              </div>` : ''}

              <!-- 完了済み -->
              ${done.length > 0 ? `
              <div class="section mt-12">
                ${done.map(d => `
                  <div class="action-card done" onclick="App.navigate('${d.route}')">
                    <div class="action-icon">${d.icon}</div>
                    <div class="action-content">
                      <div class="action-title">${d.title}</div>
                      <div class="action-desc">${d.desc}</div>
                    </div>
                    <span class="action-arrow">›</span>
                  </div>
                `).join('')}
              </div>` : ''}

              <!-- 前回のワークアウト -->
              ${lastWorkout ? `
              <div class="section mt-16">
                <div class="section-title">前回のトレーニング</div>
                <div class="list-item" onclick="App.navigate('history')">
                  <div class="list-icon" style="background:var(--primary-glow);">🏋️</div>
                  <div class="list-content">
                    <div class="list-title">${App.Utils.formatDate(lastWorkout.date)}</div>
                    <div class="list-subtitle">${lastWorkout.type === 'full' ? '通常メニュー' : lastWorkout.type === 'short' ? '短縮' : lastWorkout.type} · ${App.Utils.normTime(lastWorkout.startTime) || ''}〜${App.Utils.normTime(lastWorkout.endTime) || ''}</div>
                  </div>
                  <span class="text-muted">›</span>
                </div>
              </div>` : ''}
            </div>

            <!-- 右カラム: 統計 + 健康 + 週間 (PCのみ横並び、スマホは下に連結) -->
            <div class="dash-side">
              <!-- 週間カレンダー -->
              <div class="section">
                <div class="section-title">今週の記録</div>
                <div class="week-row">
                  ${weekDates.map(d => {
                    const dow = App.Utils.getDayOfWeek(d);
                    const dateNum = new Date(d + 'T00:00:00').getDate();
                    const isToday = d === today;
                    const ddone = workoutDates.has(d);
                    const skip = skipDates.has(d);
                    let dotClass = '';
                    if (ddone) dotClass = 'done';
                    else if (skip) dotClass = 'skip';
                    return `
                      <div class="week-day ${isToday ? 'today' : ''}">
                        <span class="day-label">${dow}</span>
                        <span class="day-date">${dateNum}</span>
                        <span class="day-dot ${dotClass}"></span>
                      </div>`;
                  }).join('')}
                </div>
              </div>

              <!-- 概要 -->
              <div class="section">
                <div class="section-title">概要</div>
                <div class="grid-3">
                  <div class="stat-card text-center">
                    <span class="stat-value">${daysSince >= 999 ? '<span class="text-muted text-xs">記録なし</span>' : daysSince + '日'}</span>
                    <span class="stat-label">前回から</span>
                  </div>
                  <div class="stat-card text-center">
                    <span class="stat-value">${weekWorkouts.length}回</span>
                    <span class="stat-label">今週</span>
                  </div>
                  <div class="stat-card text-center">
                    <span class="stat-value">${monthWorkouts}回</span>
                    <span class="stat-label">今月</span>
                  </div>
                </div>
              </div>

              <!-- 健康データ -->
              <div class="section">
                <div class="section-title">今日のデータ</div>
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
                    <span class="stat-label">心拍数</span>
                  </div>
                  <div class="stat-card">
                    <span class="stat-icon">🔥</span>
                    <span class="stat-value">${health?.calories != null ? health.calories + ' kcal' : '<span class="text-muted text-xs">—</span>'}</span>
                    <span class="stat-label">消費Cal</span>
                  </div>
                </div>
              </div>

              <!-- クイックアクション (schedule/health/analytics へのショートカット) -->
              <div class="section">
                <div class="section-title">その他</div>
                <div class="quick-actions">
                  <div class="quick-action" onclick="App.navigate('schedule')">
                    <span class="qa-icon">📅</span>
                    カレンダー
                  </div>
                  <div class="quick-action" onclick="App.navigate('health')">
                    <span class="qa-icon">💊</span>
                    健康
                  </div>
                  <div class="quick-action" onclick="App.navigate('analytics')">
                    <span class="qa-icon">📈</span>
                    分析
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    },

    _renderJudgmentCard(j) {
      const circumference = 2 * Math.PI * 42;
      const offset = circumference - (j.score / 100) * circumference;
      const color = App.Judgment.getScoreColor(j.result);
      const overrideLabel = j.userOverride ? `<span class="badge badge-muted ml-8">→ ${App.Judgment.RESULT_LABELS[j.userOverride]}に変更</span>` : '';

      const reasons = Array.isArray(j.reasons) ? j.reasons : 
        (j.resultLabel ? j.resultLabel.split('; ').filter(r => r) : []);
      const message = j.message || App.Judgment?.RESULT_MESSAGES?.[j.result] || '';

      return `
        <div class="judgment-card" onclick="App.navigate('condition')">
          <div class="flex-between">
            <div style="flex:1;">
              <div class="text-xs text-muted mb-8">今日のおすすめ</div>
              <div class="result-label" style="color:${color}">
                ${App.Judgment.RESULT_ICONS[j.result]} ${j.resultLabel || App.Judgment.RESULT_LABELS[j.result] || ''}
              </div>
              ${overrideLabel}
              <div class="result-subtitle mt-8">${message}</div>
              ${reasons.length > 0 ? `
                <div class="mt-8">
                  ${reasons.slice(0, 3).map(r => `<div class="text-xs text-muted">· ${r}</div>`).join('')}
                </div>` : ''}
            </div>
            <div class="score-gauge">
              <svg viewBox="0 0 100 100">
                <circle class="score-gauge-bg" cx="50" cy="50" r="42"></circle>
                <circle class="score-gauge-fill" cx="50" cy="50" r="42"
                  stroke="${color}"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${offset}"></circle>
              </svg>
              <div class="score-gauge-text">
                <div class="score-value" style="color:${color}">${j.score}</div>
                <div class="score-label">スコア</div>
              </div>
            </div>
          </div>
        </div>`;
    },

    _renderNoJudgment() {
      return `
        <div class="judgment-card" style="text-align:center;">
          <div class="empty-icon" style="font-size:2.5rem;">🤔</div>
          <h3 class="mt-8">今日はまだチェックしていません</h3>
          <p class="text-secondary text-sm mt-8">体調を入力して、今日のおすすめを確認しましょう</p>
          <button class="btn btn-primary btn-lg mt-16" onclick="App.navigate('condition')">
            今日の状態をチェック
          </button>
        </div>`;
    },

    async manualSync() {
      App.Utils.showToast('同期中...', 'info');
      try {
        if (App.Sync && App.Sync.SheetSyncManager) {
          const res = await App.Sync.SheetSyncManager.syncAll();
          if (res && res.success) {
            await App.DB.setSetting('_lastSyncAt', new Date().toISOString());
            App.Utils.showToast('同期完了', 'success');
            App.refreshView();
          } else {
            App.Utils.showToast('同期に失敗: ' + (res?.error || '不明'), 'error');
          }
        }
      } catch (e) {
        App.Utils.showToast('同期エラー: ' + e.message, 'error');
      }
    },

    init() {},
    destroy() {}
  };
})();
