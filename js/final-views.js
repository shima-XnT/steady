(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  const LegacyViews = { ...App.Views };

  function h(value) {
    return App.Utils.escapeHtml(value == null ? '' : String(value));
  }

  function formatCount(value, unit = '') {
    if (value == null || value === '') return '未設定';
    return `${value}${unit}`;
  }

  function getProviderMetaLegacyUnused() {
    const provider = App.healthProvider;
    const status = provider?.getStatus?.() || 'manual';
    const statusMap = {
      manual: '手入力 / 閲覧',
      connected: '同期中',
      disconnected: '未接続',
      permission_denied: '権限確認が必要',
      error: '取得エラー'
    };
    return {
      name: provider?.name || 'manual',
      statusCode: status,
      status: statusMap[status] || '未接続',
      label: provider?.getStatusLabel?.() || '手入力',
      device: window.SteadyBridge ? 'Android 実機' : 'PC / ブラウザ'
    };
  }

  function getProviderMeta() {
    const provider = App.healthProvider;
    const status = provider?.getStatus?.() || 'manual';
    const statusMap = {
      manual: '表示のみ',
      connected: '同期中',
      disconnected: '未接続',
      permission_denied: '権限確認が必要',
      error: '取得エラー'
    };
    return {
      name: provider?.name || 'manual',
      statusCode: status,
      status: statusMap[status] || '未接続',
      label: provider?.name === 'health_connect' ? 'Health Connect' : '表示のみ',
      device: window.SteadyBridge ? 'Android 実機' : 'PC / ブラウザ'
    };
  }

  async function renderSyncPanel(actionHandler, actionLabel = '再同期') {
    const state = await App.DB.getSaveState();
    return App.Utils.renderSaveState(state, {
      actionLabel,
      actionHandler
    });
  }

  function describeDecision(judgment, workout) {
    if (!judgment) {
      return {
        tone: 'warning',
        badge: '最初の一歩',
        title: '今日はどうするかを先に決める',
        body: '体調と勤務を入力してから、無理のないメニューを決めます。',
        primaryLabel: '今日の判定をする',
        primaryRoute: 'condition',
        secondaryLabel: '勤務を確認する',
        secondaryRoute: 'schedule'
      };
    }

    if (workout?.type === 'skip') {
      return {
        tone: 'warning',
        badge: '今日は休み',
        title: '休む判断まで記録できています',
        body: workout.memo || '無理に続けず、次に再開しやすい状態を保ちましょう。',
        primaryLabel: '判定を見直す',
        primaryRoute: 'condition',
        secondaryLabel: '履歴を見る',
        secondaryRoute: 'history'
      };
    }

    if (workout && workout.type !== 'skip') {
      return {
        tone: 'success',
        badge: '記録済み',
        title: '今日はもう記録まで完了しています',
        body: workout.memo || '必要ならセット内容を見直して、次回の負荷調整につなげましょう。',
        primaryLabel: 'ワークアウトを見る',
        primaryRoute: 'workout',
        secondaryLabel: '履歴を見る',
        secondaryRoute: 'history'
      };
    }

    const result = judgment.userOverride || judgment.result;
    if (result === 1) {
      return {
        tone: 'success',
        badge: '通常メニュー',
        title: '今日はしっかり進めて大丈夫です',
        body: judgment.message || '必須種目を中心に、前回実績を見ながら進めましょう。',
        primaryLabel: 'ワークアウト開始',
        primaryRoute: 'workout',
        secondaryLabel: '判定を見直す',
        secondaryRoute: 'condition'
      };
    }
    if (result === 2) {
      return {
        tone: 'busy',
        badge: '短時間メニュー',
        title: '今日は短めで確実に終える日です',
        body: judgment.message || '必須種目だけでも十分です。3タップで記録まで終えられる流れに絞りましょう。',
        primaryLabel: '短時間で始める',
        primaryRoute: 'workout',
        secondaryLabel: '勤務を確認する',
        secondaryRoute: 'schedule'
      };
    }
    if (result === 3 || result === 4) {
      return {
        tone: 'warning',
        badge: result === 3 ? '軽め推奨' : 'ストレッチ推奨',
        title: result === 3 ? '今日は軽めで続ける日です' : '今日は回復優先で進めます',
        body: judgment.message || '頑張るより、明日に残さない終わり方を優先します。',
        primaryLabel: '内容を確認する',
        primaryRoute: 'workout',
        secondaryLabel: '判定を見直す',
        secondaryRoute: 'condition'
      };
    }

    return {
      tone: 'warning',
      badge: '休み推奨',
      title: '今日は休む判断が第一です',
      body: judgment.message || '休みも継続の一部です。理由を残して次に備えましょう。',
      primaryLabel: '休みとして記録する',
      primaryRoute: 'workout',
      secondaryLabel: '判定を見直す',
      secondaryRoute: 'condition'
    };
  }

  async function buildDashboardData() {
    const today = App.Utils.today();
    const todayDate = new Date(today + 'T00:00:00');
    const monthStart = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-01`;
    const judgment = await App.DB.getJudgment(today);
    const health = await App.DB.getHealth(today);
    const condition = await App.DB.getCondition(today);
    const schedule = await App.DB.getSchedule(today);
    const workout = await App.DB.getWorkoutByDate(today);
    const lastWorkout = await App.DB.getLastWorkout();
    const weekDates = App.Utils.getWeekDates(today);
    const weekWorkouts = await App.DB.getWorkoutsRange(weekDates[0], weekDates[6]);
    const weekJudgments = await App.DB.getJudgmentRange(weekDates[0], weekDates[6]);
    const monthWorkouts = await App.DB.getWorkoutCountInRange(monthStart, today);
    const daysSince = await App.DB.getDaysSinceLastWorkout(today);
    const availableMinutes = App.FinalPolish.getAvailableMinutes(schedule);
    const provider = getProviderMeta();
    const decision = describeDecision(judgment, workout);

    return {
      today,
      judgment,
      health,
      condition,
      schedule,
      workout,
      lastWorkout,
      weekDates,
      weekWorkouts,
      weekJudgments,
      monthWorkouts,
      daysSince,
      availableMinutes,
      provider,
      decision
    };
  }

  function renderWeekStrip(data) {
    const workoutMap = new Map(data.weekWorkouts.map(item => [item.date, item]));
    const judgmentMap = new Map(data.weekJudgments.map(item => [item.date, item]));

    return data.weekDates.map(date => {
      const workout = workoutMap.get(date);
      const judgment = judgmentMap.get(date);
      let state = 'idle';
      let label = '未記録';
      let detail = 'まだ記録がありません';

      if (workout?.type === 'skip') {
        state = 'skip';
        label = '休み';
        detail = workout.memo || '休む日として記録済みです';
      } else if (workout) {
        state = 'done';
        label = '完了';
        detail = workout.memo || 'ワークアウト完了';
      } else if (judgment) {
        state = 'planned';
        label = '判定済';
        detail = judgment.message || judgment.resultLabel || '今日の判断だけ先に記録しています';
      }

      return `
        <div class="week-pill ${state} ${date === data.today ? 'today' : ''}" title="${h(`${App.Utils.formatDate(date)}: ${detail}`)}">
          <span class="week-pill-day">${h(App.Utils.getDayOfWeek(date))}</span>
          <strong class="week-pill-date">${h(date.slice(-2))}</strong>
          <small class="week-pill-label">${h(label)}</small>
        </div>`;
    }).join('');
  }

  function renderLastWorkout(lastWorkout) {
    if (!lastWorkout) {
      return `
        <div class="mini-empty">
          <strong>まだ履歴がありません</strong>
          <span>最初の1回を記録すると、次回の推奨負荷に活かせます。</span>
        </div>`;
    }

    const typeLabel = lastWorkout.type === 'skip'
      ? '休み'
      : lastWorkout.type === 'short'
        ? '短時間メニュー'
        : lastWorkout.type === 'stretch'
          ? 'ストレッチ'
          : '通常メニュー';

    return `
      <div class="timeline-card">
        <div class="timeline-date">${h(App.Utils.formatDate(lastWorkout.date))}</div>
        <div class="timeline-title">${h(typeLabel)}</div>
        <div class="timeline-copy">${h(lastWorkout.memo || '前回の内容は履歴画面から確認できます。')}</div>
      </div>`;
  }

  function renderStrictnessPreview(value) {
    if (value <= 20) return 'かなりやさしめ';
    if (value <= 40) return 'やややさしめ';
    if (value <= 60) return '標準';
    if (value <= 80) return 'やや厳しめ';
    return 'かなり厳しめ';
  }

  function formatSettingsBoundaryItem(item) {
    if (item.persisted === false) return `${item.label}（ランタイム）`;
    if (!item.implemented) return `${item.label}（未実装）`;
    return item.label;
  }

  function renderSettingsBoundaryCards() {
    const sections = App.SettingsSpec?.getSections?.() || App.DB.getSettingsBoundarySections?.() || [];
    return sections.map(section => `
      <div class="meta-tile">
        <div class="meta-label">${h(section.title)}</div>
        <div class="meta-value meta-value-text">${h(section.headline)}</div>
        <div class="meta-note">${h(section.items.map(formatSettingsBoundaryItem).join(' / '))}</div>
      </div>`).join('');
  }

  App.Views.Dashboard = {
    async render() {
      const data = await buildDashboardData();
      const reasons = Array.isArray(data.judgment?.reasons) ? data.judgment.reasons.slice(0, 4) : [];
      const todayStatus = data.workout
        ? (data.workout.type === 'skip' ? '休みとして記録済み' : 'ワークアウト記録済み')
        : (data.judgment ? '判定済み / 記録待ち' : '未判定');

      return `
        <div class="container animate-in dashboard-shell polished-dashboard">
          <section class="hero-panel dashboard-hero">
            <div class="hero-topline">
              <span class="hero-eyebrow">${h(App.Utils.getGreeting())}</span>
              <span class="hero-date-block">${h(App.Utils.formatDate(data.today))}</span>
            </div>
            <div class="hero-grid">
              <div class="hero-copy">
                <h2>今日はどうするかを、ここで決める</h2>
                <p>勤務、体調、健康データから、今日の判断と記録までをここでつなげます。</p>
              </div>
              <div class="hero-sync-wrap">
                ${await renderSyncPanel('App.Views.Dashboard.manualSync()')}
              </div>
            </div>
          </section>

          <div class="dashboard-layout">
            <section class="dashboard-primary">
              <article class="decision-panel decision-panel-${h(data.decision.tone)}">
                <div class="decision-heading">
                  <div>
                    <div class="decision-badge">${h(data.decision.badge)}</div>
                    <h3>${h(data.decision.title)}</h3>
                  </div>
                  <div class="decision-score">${data.judgment ? h(data.judgment.score) : '--'}</div>
                </div>
                <p class="decision-message">${h(data.decision.body)}</p>
                <div class="reason-list">
                  ${(reasons.length ? reasons : ['勤務と体調を入力すると、今日の理由がここに並びます。']).map(reason => `<span class="reason-chip">${h(reason)}</span>`).join('')}
                </div>
                <div class="hero-actions action-row">
                  <button class="btn btn-primary" onclick="App.navigate('${data.decision.primaryRoute}')">${h(data.decision.primaryLabel)}</button>
                  <button class="btn btn-secondary" onclick="App.navigate('${data.decision.secondaryRoute}')">${h(data.decision.secondaryLabel)}</button>
                </div>
              </article>

              <div class="dashboard-overview-grid">
                <article class="focus-card overview-tile">
                  <div class="focus-label">今日の勤務</div>
                  <div class="focus-value">${h(App.FinalPolish.getShiftLabel(data.schedule?.shiftType))}</div>
                  <div class="focus-sub">${h(App.FinalPolish.formatShiftRange(data.schedule))}</div>
                </article>
                <article class="focus-card overview-tile">
                  <div class="focus-label">利用可能時間</div>
                  <div class="focus-value">${data.availableMinutes != null ? `${data.availableMinutes}分` : '未計算'}</div>
                  <div class="focus-sub">終業後30分以降で計算</div>
                </article>
                <article class="focus-card overview-tile">
                  <div class="focus-label">健康データ</div>
                  <div class="focus-value">${data.health?.sleepMinutes ? h(App.Utils.formatSleep(data.health.sleepMinutes)) : '未取得'}</div>
                  <div class="focus-sub">歩数 ${data.health?.steps != null ? h(data.health.steps.toLocaleString()) : '-'} / 心拍 ${data.health?.heartRateAvg ?? '-'}</div>
                </article>
                <article class="focus-card overview-tile">
                  <div class="focus-label">今日の記録状態</div>
                  <div class="focus-value">${h(todayStatus)}</div>
                  <div class="focus-sub">${h(data.workout?.memo || data.condition?.note || '判定から記録までをここでつなぎます。')}</div>
                </article>
              </div>

              <section class="section-block">
                <div class="section-heading">
                  <h3>今日の導線</h3>
                  <span>${App.Utils.isMobile() ? '3タップ以内' : '判断 / 記録 / 確認'}</span>
                </div>
                <div class="action-card-grid">
                  <button class="action-card-large" onclick="App.navigate('condition')">
                    <span class="action-card-icon">判定</span>
                    <strong>当日判定を更新する</strong>
                    <span class="action-card-meta">体調と勤務から今日の方針を決めます。</span>
                  </button>
                  <button class="action-card-large" onclick="App.navigate('workout')">
                    <span class="action-card-icon">記録</span>
                    <strong>ワークアウトを始める</strong>
                    <span class="action-card-meta">必須種目を軸に前回実績を見ながら進めます。</span>
                  </button>
                  <button class="action-card-large" onclick="App.Views.Dashboard.manualSync()">
                    <span class="action-card-icon">同期</span>
                    <strong>共有保存を確認する</strong>
                    <span class="action-card-meta">未送信件数を確認して再同期します。</span>
                  </button>
                </div>
              </section>

              <section class="section-block dashboard-detail-block">
                <div class="section-heading">
                  <h3>今日の判断材料</h3>
                  <span>${h(data.provider.device)}</span>
                </div>
                <div class="settings-meta-grid">
                  <div class="meta-tile">
                    <div class="meta-label">今週の完了回数</div>
                    <div class="meta-value">${data.weekWorkouts.filter(item => item.type !== 'skip').length}回</div>
                    <div class="meta-note">月累計 ${data.monthWorkouts}回</div>
                  </div>
                  <div class="meta-tile">
                    <div class="meta-label">前回からの日数</div>
                    <div class="meta-value">${data.daysSince >= 999 ? '初回' : `${data.daysSince}日`}</div>
                    <div class="meta-note">空きすぎも詰めすぎも避けます</div>
                  </div>
                  <div class="meta-tile">
                    <div class="meta-label">安静時心拍</div>
                    <div class="meta-value">${data.health?.restingHeartRate != null ? `${data.health.restingHeartRate} bpm` : '未取得'}</div>
                    <div class="meta-note">平均心拍 ${data.health?.heartRateAvg != null ? `${data.health.heartRateAvg} bpm` : '未取得'}</div>
                  </div>
                  <div class="meta-tile">
                    <div class="meta-label">コンディションメモ</div>
                    <div class="meta-value meta-value-text">${h(data.condition?.note || 'メモなし')}</div>
                    <div class="meta-note">${h(data.provider.label)} / Source of Truth は Google スプレッドシート</div>
                  </div>
                </div>
              </section>
            </section>

            <aside class="dashboard-side">
              <section class="side-card">
                <div class="section-heading compact">
                  <h3>今週の流れ</h3>
                  <span>${data.weekWorkouts.filter(item => item.type !== 'skip').length}回完了</span>
                </div>
                <div class="week-strip">${renderWeekStrip(data)}</div>
              </section>

              <section class="side-card">
                <div class="section-heading compact">
                  <h3>前回のワークアウト</h3>
                  <span>${data.lastWorkout ? '比較に使う' : '初回歓迎'}</span>
                </div>
                ${renderLastWorkout(data.lastWorkout)}
              </section>

              <section class="side-card">
                <div class="section-heading compact">
                  <h3>横断ビュー</h3>
                  <span>${App.Utils.isMobile() ? '毎日使う導線' : '一覧と比較'}</span>
                </div>
                <div class="mini-list">
                  <button class="mini-link" onclick="App.navigate('health')">健康データを見る</button>
                  <button class="mini-link" onclick="App.navigate('schedule')">勤務表を開く</button>
                  <button class="mini-link" onclick="App.navigate('analytics')">分析を開く</button>
                  <button class="mini-link" onclick="App.navigate('history')">履歴を見る</button>
                </div>
              </section>
            </aside>
          </div>
        </div>`;
    },

    async manualSync() {
      App.Utils.showToast('Google スプレッドシートと再同期しています...', 'info', 2200);
      const result = await App.DB.syncNow('ダッシュボードから再同期');
      App.Utils.showSyncResult(result, {
        successMessage: result?.resent > 0 ? `再同期しました（未送信 ${result.resent}件を再送）` : '再同期しました',
        warningMessage: '再同期は完了しましたが、未送信データが残っています',
        errorPrefix: '再同期に失敗しました'
      });
      await App.refreshView();
    },

    init() {},
    destroy() {}
  };

  App.Views.Settings = {
    async render() {
      const bundle = await App.DB.getSettingsBundle();
      const shared = bundle.sharedSettings;
      const local = bundle.localDeviceSettings;
      const provider = getProviderMeta();
      const strictness = Number(shared.strictness || 50);

      return `
        <div class="container animate-in settings-shell polished-settings">
          <div class="page-lead">
            <h2>設定</h2>
            <p>共有設定はスプレッドシート、同期URLはこの端末に保存します。</p>
          </div>

          ${await renderSyncPanel('App.Views.Settings.handleSyncNow()')}

          <div class="settings-layout">
            <div class="settings-stack">
              <form class="settings-card" id="shared-settings-form">
                <div class="section-heading">
                  <h3>共有設定</h3>
                  <span>スプレッドシートへ保存</span>
                </div>
                <p class="settings-note">勤務・判定・通知の設定です。同期URL未設定なら未保存です。</p>

                <div class="grid-2">
                  <label class="form-group">
                    <span class="form-label">週の目標回数</span>
                    <select class="form-select" name="weeklyGoal">
                      ${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${Number(shared.weeklyGoal || 3) === v ? 'selected' : ''}>${v}回</option>`).join('')}
                    </select>
                  </label>
                  <label class="form-group">
                    <span class="form-label">1回の目安時間</span>
                    <select class="form-select" name="sessionDuration">
                      ${[20, 30, 40, 50, 60].map(v => `<option value="${v}" ${Number(shared.sessionDuration || 40) === v ? 'selected' : ''}>${v}分</option>`).join('')}
                    </select>
                  </label>
                </div>

                <div class="grid-2">
                  <label class="form-group">
                    <span class="form-label">ジム開始目安</span>
                    <input class="form-input" type="time" name="gymHoursStart" value="${h(shared.gymHoursStart || '22:00')}">
                  </label>
                  <label class="form-group">
                    <span class="form-label">ジム終了目安</span>
                    <input class="form-input" type="time" name="gymHoursEnd" value="${h(shared.gymHoursEnd || '23:59')}">
                  </label>
                </div>

                <label class="form-group">
                  <span class="form-label">判定の厳しさ</span>
                  <div class="range-row">
                    <input type="range" name="strictness" id="shared-strictness" min="0" max="100" step="10" value="${strictness}">
                    <strong id="shared-strictness-value">${strictness}%</strong>
                  </div>
                  <div class="settings-note" id="shared-strictness-copy">${h(renderStrictnessPreview(strictness))}</div>
                </label>

                <div class="toggle-stack">
                  <label class="toggle-row">
                    <div>
                      <strong>準備リマインド</strong>
                      <div class="focus-sub">仕事終わり前に知らせる</div>
                    </div>
                    <input type="checkbox" name="notifPrep" ${shared.notifPrep ? 'checked' : ''}>
                  </label>
                  <label class="toggle-row">
                    <div>
                      <strong>当日判定リマインド</strong>
                      <div class="focus-sub">当日判定を忘れにくくする</div>
                    </div>
                    <input type="checkbox" name="notifJudge" ${shared.notifJudge ? 'checked' : ''}>
                  </label>
                  <label class="toggle-row">
                    <div>
                      <strong>再開リマインド</strong>
                      <div class="focus-sub">休みが続いたあとに戻す</div>
                    </div>
                    <input type="checkbox" name="notifResume" ${shared.notifResume !== false ? 'checked' : ''}>
                  </label>
                </div>

                <div class="hero-actions action-row">
                  <button class="btn btn-primary" type="submit">保存</button>
                </div>
              </form>

              <form class="settings-card" id="local-settings-form">
                <div class="section-heading">
                  <h3>端末設定</h3>
                  <span>この端末だけ</span>
                </div>
                <p class="settings-note">同期URLだけをこの端末に保存します。健康データは自動取得です。</p>

                <label class="form-group">
                  <span class="form-label">Apps Script Web App URL</span>
                  <input class="form-input" type="url" name="gasSyncUrl" value="${h(local.gasSyncUrl || '')}" placeholder="https://script.google.com/macros/s/...">
                </label>

                <div class="settings-meta-grid">
                  <div class="meta-tile">
                    <div class="meta-label">現在の接続状態</div>
                    <div class="meta-value meta-value-text">${h(provider.label)}</div>
                    <div class="meta-note">${h(provider.status)}</div>
                  </div>
                  <div class="meta-tile">
                    <div class="meta-label">現在の端末</div>
                    <div class="meta-value meta-value-text">${h(provider.device)}</div>
                    <div class="meta-note">${window.SteadyBridge ? '健康データ送信が可能' : '健康データは閲覧専用'}</div>
                  </div>
                </div>

                <div class="hero-actions action-row wrap-actions">
                  <button class="btn btn-secondary" type="submit">保存</button>
                  <button class="btn btn-ghost" type="button" id="settings-sync-now-btn">再同期</button>
                  ${window.SteadyBridge && provider.name === 'health_connect'
                    ? `<button class="btn btn-ghost" type="button" id="settings-hc-sync-btn">Health Connect 再取得</button>`
                    : ''}
                  ${window.SteadyBridge && provider.statusCode === 'permission_denied'
                    ? `<button class="btn btn-ghost" type="button" id="settings-hc-permission-btn">権限を確認</button>`
                    : ''}
                </div>
              </form>
            </div>

            <div class="settings-stack">
              <section class="settings-card settings-compact-card">
                <details class="settings-collapsible">
                  <summary>
                    <div class="settings-collapsible-copy">
                      <strong>保存ルールと分類</strong>
                      <span>shared / local / 未送信</span>
                    </div>
                    <span class="settings-collapsible-icon">詳細</span>
                  </summary>
                  <p class="settings-note">shared は Apps Script 成功後だけ確定、local はこの端末だけに保存します。</p>
                  <div class="settings-meta-grid">
                    ${renderSettingsBoundaryCards()}
                  </div>
                  <div class="settings-meta-grid">
                    <div class="meta-tile">
                      <div class="meta-label">共有データ</div>
                      <div class="meta-value meta-value-text">Apps Script 成功後に確定</div>
                      <div class="meta-note">同期URL未設定なら未保存</div>
                    </div>
                    <div class="meta-tile">
                      <div class="meta-label">端末設定</div>
                      <div class="meta-value meta-value-text">ローカルのみ</div>
                      <div class="meta-note">URL / theme / UI 状態</div>
                    </div>
                    <div class="meta-tile">
                      <div class="meta-label">未送信</div>
                      <div class="meta-value meta-value-text">再送専用</div>
                      <div class="meta-note">再同期で再送</div>
                    </div>
                    <div class="meta-tile">
                      <div class="meta-label">互換吸収</div>
                      <div class="meta-value meta-value-text">移行レイヤー限定</div>
                      <div class="meta-note">新規保存は正規キーのみ</div>
                    </div>
                  </div>
                </details>
              </section>

              <section class="settings-card danger-zone">
                <div class="section-heading">
                  <h3>データ管理</h3>
                  <span>ローカル補助データ</span>
                </div>
                <div class="mini-list">
                  <button class="mini-link" type="button" id="settings-export-btn">エクスポート</button>
                  <button class="mini-link" type="button" id="settings-import-btn">インポート</button>
                  <button class="mini-link" type="button" id="settings-sample-btn">サンプル</button>
                  <button class="mini-link danger-link" type="button" id="settings-reset-btn">ローカル初期化</button>
                </div>
                <input type="file" id="settings-import-file" accept=".json" hidden>
              </section>
            </div>
          </div>
        </div>`;
    },

    init() {
      const sharedForm = document.getElementById('shared-settings-form');
      const localForm = document.getElementById('local-settings-form');
      const strictness = document.getElementById('shared-strictness');
      const strictnessValue = document.getElementById('shared-strictness-value');
      const strictnessCopy = document.getElementById('shared-strictness-copy');

      strictness?.addEventListener('input', () => {
        const value = Number(strictness.value || 50);
        if (strictnessValue) strictnessValue.textContent = `${value}%`;
        if (strictnessCopy) strictnessCopy.textContent = renderStrictnessPreview(value);
      });

      sharedForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {
          weeklyGoal: Number(form.weeklyGoal.value),
          sessionDuration: Number(form.sessionDuration.value),
          gymHoursStart: form.gymHoursStart.value,
          gymHoursEnd: form.gymHoursEnd.value,
          strictness: Number(form.strictness.value),
          notifPrep: !!form.notifPrep.checked,
          notifJudge: !!form.notifJudge.checked,
          notifResume: !!form.notifResume.checked
        };

        const result = await App.DB.saveSharedSettings(payload);
        await App.Utils.showSharedSaveResult(result, {
          subject: '設定',
          successMessage: '設定を保存しました',
          warningMessage: '未送信',
          errorPrefix: '設定の保存に失敗しました'
        });
        await App.refreshView();
      });

      localForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {
          gasSyncUrl: form.gasSyncUrl.value.trim()
        };
        await App.DB.saveLocalDeviceSettings(payload);
        App.Utils.showToast('保存しました', 'success');
        await App.refreshView();
      });

      document.getElementById('settings-sync-now-btn')?.addEventListener('click', () => this.handleSyncNow());
      document.getElementById('settings-hc-sync-btn')?.addEventListener('click', () => {
        if (App.healthProvider?.triggerSync) {
          App.Utils.showToast('再取得しています...', 'info', 1800);
          App.healthProvider.triggerSync(App.Utils.today());
        }
      });
      document.getElementById('settings-hc-permission-btn')?.addEventListener('click', () => {
        if (App.healthProvider?.requestPermissions) {
          App.healthProvider.requestPermissions();
        }
      });

      document.getElementById('settings-export-btn')?.addEventListener('click', async () => {
        const data = await App.DB.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `steady-backup-${App.Utils.today()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        App.Utils.showToast('エクスポートしました', 'success');
      });

      document.getElementById('settings-import-btn')?.addEventListener('click', () => {
        document.getElementById('settings-import-file')?.click();
      });

      document.getElementById('settings-import-file')?.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data.version) throw new Error('バックアップ形式が正しくありません');
          await App.DB.importAll(data);
          App.Utils.showToast('インポートしました。画面を更新します...', 'success');
          setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          App.Utils.showToast(`インポートに失敗しました: ${error.message}`, 'error');
        } finally {
          event.target.value = '';
        }
      });

      document.getElementById('settings-sample-btn')?.addEventListener('click', async () => {
        if (!window.confirm('サンプルデータを読み込みます。現在のローカルデータは上書きされる場合があります。')) return;
        await App.SampleData.load();
        App.Utils.showToast('サンプルデータを読み込みました', 'success');
        setTimeout(() => App.navigate('home'), 300);
      });

      document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
        const html = `
          <p class="text-secondary mb-16">ローカル DB を初期化します。Google スプレッドシートが正ですが、この端末の補助データや未送信キューも消えます。</p>
          <button class="btn btn-danger btn-block mb-8" id="settings-confirm-reset-btn">ローカル DB を初期化する</button>
          <button class="btn btn-secondary btn-block" onclick="App.Utils.closeModal()">キャンセル</button>
        `;
        App.Utils.showModal('ローカルデータ初期化', html);
        document.getElementById('settings-confirm-reset-btn')?.addEventListener('click', async () => {
          await App.DB.clearAll();
          App.Utils.closeModal();
          App.Utils.showToast('ローカルデータを初期化しました', 'info');
          setTimeout(() => window.location.reload(), 350);
        });
      });
    },

    async handleSyncNow() {
      App.Utils.showToast('再同期しています...', 'info', 2200);
      const result = await App.DB.syncNow('設定画面から再同期');
      App.Utils.showSyncResult(result, {
        successMessage: result?.resent > 0 ? `再同期しました（未送信 ${result.resent}件を再送）` : '再同期しました',
        warningMessage: '未送信が残っています',
        errorPrefix: '再同期に失敗しました'
      });
      await App.refreshView();
    },

    destroy() {}
  };

  App.LegacyViews = LegacyViews;
})();
