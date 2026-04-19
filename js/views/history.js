// ============================================
// Steady — 履歴画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  let histCurrentYear, histCurrentMonth;

  App.Views.History = {
    async render() {
      const now = new Date();
      histCurrentYear = now.getFullYear();
      histCurrentMonth = now.getMonth() + 1;

      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">📊</span> 履歴</h2>

          <div class="tabs">
            <button class="tab-btn active" data-tab="hist-workout-tab">トレーニング</button>
            <button class="tab-btn" data-tab="hist-judgment-tab">判定履歴</button>
          </div>

          <!-- ワークアウト履歴 -->
          <div class="tab-content active" id="hist-workout-tab">
            ${await this._renderWorkoutList()}
          </div>

          <!-- 判定履歴 -->
          <div class="tab-content" id="hist-judgment-tab">
            ${await this._renderJudgmentList()}
          </div>
        </div>`;
    },

    async _renderWorkoutList() {
      const workouts = await App.DB.getWorkouts(30);
      
      if (workouts.length === 0) {
        return `<div class="empty-state">
          <div class="empty-icon">🏋️</div>
          <div class="empty-title">まだトレーニング記録がありません</div>
          <div class="empty-text">ワークアウトを完了すると、ここに表示されます</div>
        </div>`;
      }

      return workouts.map(w => {
        const typeLabel = { full: '通常', short: '短縮', cardio: '有酸素', stretch: 'ストレッチ', skip: 'スキップ', custom: 'カスタム' };
        const typeIcon = { full: '🏋️', short: '⚡', cardio: '🏃', stretch: '🧘', skip: '😴', custom: '🔧' };
        const feelingEmoji = ['', '😣', '😐', '🙂', '😊', '🤩'];
        
        return `
          <div class="list-item" onclick="App.Views.History.showWorkoutDetail(${w.id})">
            <div class="list-icon" style="background:var(--surface-3);font-size:1.3rem;">
              ${typeIcon[w.type] || '🏋️'}
            </div>
            <div class="list-content">
              <div class="list-title">${App.Utils.formatDate(w.date)}</div>
              <div class="list-subtitle">
                ${typeLabel[w.type] || w.type}
                ${w.startTime ? ` · ${App.Utils.normTime(w.startTime)}〜${App.Utils.normTime(w.endTime) || ''}` : ''}
                ${w.feeling ? ` · ${feelingEmoji[w.feeling]}` : ''}
              </div>
            </div>
            <span class="text-muted">›</span>
          </div>`;
      }).join('');
    },

    async _renderJudgmentList() {
      const today = App.Utils.today();
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() - 30);
      const monthAgo = App.Utils._localDateStr(d);
      const judgments = await App.DB.getJudgmentRange(monthAgo, today);

      if (judgments.length === 0) {
        return `<div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">判定履歴がありません</div>
          <div class="empty-text">体調チェックを行うと記録されます</div>
        </div>`;
      }

      return judgments.sort((a,b) => b.date.localeCompare(a.date)).map(j => `
        <div class="list-item">
          <div class="list-icon" style="background:var(--surface-3);font-size:1.3rem;">
            ${App.Judgment.RESULT_ICONS[j.result]}
          </div>
          <div class="list-content">
            <div class="list-title">${App.Utils.formatDate(j.date)}</div>
            <div class="list-subtitle">
              ${j.resultLabel} · スコア ${j.score}
              ${j.userOverride ? ` → ${App.Judgment.RESULT_LABELS[j.userOverride]}に変更` : ''}
            </div>
          </div>
          <span class="judge-tag judge-tag-${j.result}" style="font-size:0.7rem;">${j.score}</span>
        </div>`).join('');
    },

    async _renderCalendar() {
      const dates = App.Utils.getMonthDates(histCurrentYear, histCurrentMonth);
      const startDate = dates[0].date;
      const endDate = dates[dates.length - 1].date;
      const workouts = await App.DB.getWorkoutsRange(startDate, endDate);
      const judgments = await App.DB.getJudgmentRange(startDate, endDate);
      const workoutDates = new Set(workouts.filter(w => w.type !== 'skip').map(w => w.date));
      const skipDates = new Set(workouts.filter(w => w.type === 'skip').map(w => w.date));

      return `
        <div class="calendar">
          <div class="calendar-header">
            <button class="btn btn-icon btn-ghost" onclick="App.Views.History.changeMonth(-1)">‹</button>
            <h3>${histCurrentYear}年${histCurrentMonth}月</h3>
            <button class="btn btn-icon btn-ghost" onclick="App.Views.History.changeMonth(1)">›</button>
          </div>
          <div class="calendar-weekdays">
            ${['日','月','火','水','木','金','土'].map(d => `<span>${d}</span>`).join('')}
          </div>
          <div class="calendar-grid">
            ${dates.map(({ date, otherMonth }) => {
              const day = new Date(date + 'T00:00:00').getDate();
              const isToday = date === App.Utils.today();
              let dotClass = '';
              if (workoutDates.has(date)) dotClass = 'workout-done';
              else if (skipDates.has(date)) dotClass = 'workout-skip';
              return `
                <div class="calendar-day ${otherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${dotClass}">
                  <span>${day}</span>
                </div>`;
            }).join('')}
          </div>
        </div>

        <div class="flex-row mt-12" style="justify-content:center;gap:16px;">
          <div class="flex-row gap-4">
            <span class="day-dot done" style="width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block;"></span>
            <span class="text-xs text-muted">実施</span>
          </div>
          <div class="flex-row gap-4">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block;"></span>
            <span class="text-xs text-muted">スキップ</span>
          </div>
        </div>

        <!-- 月間サマリ -->
        <div class="card mt-16">
          <div class="grid-3">
            <div class="stat-card text-center">
              <span class="stat-value">${workoutDates.size}</span>
              <span class="stat-label">実施日</span>
            </div>
            <div class="stat-card text-center">
              <span class="stat-value">${skipDates.size}</span>
              <span class="stat-label">スキップ</span>
            </div>
            <div class="stat-card text-center">
              <span class="stat-value">${workoutDates.size + skipDates.size > 0 ? Math.round(workoutDates.size / (workoutDates.size + skipDates.size) * 100) : 0}%</span>
              <span class="stat-label">実施率</span>
            </div>
          </div>
        </div>`;
    },

    async showWorkoutDetail(workoutId) {
      const w = await App.DB.getWorkout(workoutId);
      if (!w) return;
      const exercises = await App.DB.getExercises(workoutId);
      const feelingEmoji = ['', '😣', '😐', '🙂', '😊', '🤩'];

      const html = `
        <div class="mb-12">
          <span class="badge badge-primary">${w.type}</span>
          ${w.startTime ? `<span class="text-sm text-muted ml-8">${App.Utils.normTime(w.startTime)}〜${App.Utils.normTime(w.endTime) || ''}</span>` : ''}
        </div>
        ${w.feeling ? `<div class="text-sm mb-8">気分: ${feelingEmoji[w.feeling]} (${w.feeling}/5)</div>` : ''}
        ${w.memo ? `<div class="text-sm text-muted mb-12">📝 ${App.Utils.escapeHtml(w.memo)}</div>` : ''}
        
        ${exercises.length > 0 ? `
        <div class="divider"></div>
        <h4 class="mb-8">種目</h4>
        ${exercises.map(ex => {
          if (ex.durationMin) {
            return `
            <div style="padding:8px 0;border-bottom:1px solid var(--border);">
              <div class="fw-500 text-sm">${ex.name}</div>
              <div class="text-xs text-muted mt-4">${ex.durationMin}分</div>
            </div>`;
          }
          const sets = ex.sets || [];
          const completedSets = sets.filter(s => s.completed);
          const firstSet = sets[0] || {};
          const allSameWeight = sets.every(s => s.weight === firstSet.weight);
          const allSameReps = sets.every(s => s.reps === firstSet.reps);
          // サマリー行
          let summary = '';
          if (allSameWeight && allSameReps && sets.length > 0) {
            summary = firstSet.weight > 0
              ? `${firstSet.weight}kg × ${firstSet.reps}回 × ${sets.length}セット`
              : `${firstSet.reps}回 × ${sets.length}セット`;
          }
          // セット別詳細（重量/回数がセットごとに異なる場合）
          const setDetails = (!allSameWeight || !allSameReps) ? sets.map(s =>
            `${s.setNumber || ''}セット目: ${s.weight > 0 ? s.weight + 'kg × ' : ''}${s.reps}回${s.completed ? ' ✓' : ''}`
          ).join(' / ') : '';
          return `
            <div style="padding:8px 0;border-bottom:1px solid var(--border);">
              <div class="fw-500 text-sm">${ex.name}${ex.optional ? ' <span class="text-xs text-muted">(任意)</span>' : ''}</div>
              ${summary ? `<div class="text-xs text-muted mt-4">${summary}（完了 ${completedSets.length}/${sets.length}）</div>` : ''}
              ${setDetails ? `<div class="text-xs text-muted mt-4">${setDetails}</div>` : ''}
            </div>`;
        }).join('')}` : ''}`;

      App.Utils.showModal(App.Utils.formatDate(w.date), html);
    },

    changeMonth(delta) {
      histCurrentMonth += delta;
      if (histCurrentMonth > 12) { histCurrentMonth = 1; histCurrentYear++; }
      if (histCurrentMonth < 1) { histCurrentMonth = 12; histCurrentYear--; }
      App.refreshView();
    },

    init() {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(btn.dataset.tab)?.classList.add('active');
        });
      });
    },

    destroy() {}
  };
})();
