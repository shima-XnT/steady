// ============================================
// Steady — ワークアウト記録画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  let workoutTimer = null;
  let workoutStartTime = null;
  let currentExercises = [];
  let currentWorkoutId = null;
  let menuType = null;

  App.Views.Workout = {
    async render() {
      const today = App.Utils.today();
      const judgment = await App.DB.getJudgment(today);
      const existingWorkout = await App.DB.getWorkoutByDate(today);

      // ★ ページ遷移時にリセット（古いメニューが残るのを防ぐ）
      currentExercises = [];
      currentWorkoutId = null;

      // 判定結果からメニュータイプを決定
      const judgeResult = judgment?.userOverride || judgment?.result || 2;
      menuType = App.Training.getMenuType(judgeResult);

      // 既存ワークアウトがあればロード（ただし判定が変わった場合はメニュー再生成）
      if (existingWorkout) {
        currentWorkoutId = existingWorkout.id;
        const savedMenuType = existingWorkout.type || 'full';
        // 判定のmenuTypeと保存済みのmenuTypeが一致する場合のみ既存データを使う
        if (savedMenuType === menuType) {
          const savedExercises = await App.DB.getExercises(existingWorkout.id);
          if (savedExercises.length > 0) {
            currentExercises = savedExercises;
          }
        }
        // 判定が変わった場合は既存ワークアウトを使わず、新しいメニューを生成
      }

      // 完全スキップの場合
      if (judgeResult === 5) {
        return this._renderSkipView();
      }

      // メニュー生成（既存データがなければ）
      if (currentExercises.length === 0 && menuType) {
        currentExercises = await App.Training.generateMenu(menuType, { beforeDate: today });
      }

      // ストレッチメニューの場合
      if (menuType === 'stretch') {
        return this._renderStretchView(currentExercises);
      }

      // 必須と任意を分離
      const requiredExercises = currentExercises.filter(ex => !ex.optional && ex.type !== 'stretch');
      const optionalExercises = currentExercises.filter(ex => ex.optional && ex.type !== 'stretch');

      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">🏋️</span> トレーニング</h2>

          <!-- タイマー -->
          <div class="card mb-16">
            <div class="workout-timer">
              <div class="timer-display" id="workout-timer-display">00:00</div>
              <div class="timer-label">トレーニング時間</div>
            </div>
            <div class="flex-row" style="justify-content:center;">
              <button class="btn btn-sm ${workoutTimer ? 'btn-danger' : 'btn-primary'}" id="timer-toggle-btn">
                ${workoutTimer ? '⏸ 一時停止' : '▶ 開始'}
              </button>
            </div>
          </div>

          <!-- メニュー種類 -->
          <div class="flex-between mb-12">
            <span class="badge badge-primary">${App.Training.MENU_CONFIGS[menuType]?.label || 'カスタム'}</span>
            <span class="text-xs text-muted">推定 ${App.Training.getEstimatedDuration(menuType)}分</span>
          </div>

          <!-- 必須種目 -->
          ${requiredExercises.length > 0 ? `
          <div class="section-title" style="display:flex;align-items:center;gap:6px;">
            <span class="badge badge-required">必須</span> メイン種目
          </div>
          <div id="exercise-list-required">
            ${requiredExercises.map((ex, idx) => {
              const realIdx = currentExercises.indexOf(ex);
              return this._renderExercise(ex, realIdx);
            }).join('')}
          </div>` : ''}

          <!-- 余裕があれば -->
          ${optionalExercises.length > 0 ? `
          <div class="section-title mt-16" style="display:flex;align-items:center;gap:6px;">
            <span class="badge badge-optional">任意</span> 余裕があれば
          </div>
          <div id="exercise-list-optional">
            ${optionalExercises.map((ex, idx) => {
              const realIdx = currentExercises.indexOf(ex);
              return this._renderExercise(ex, realIdx);
            }).join('')}
          </div>` : ''}

          <!-- 休憩タイマーバー -->
          <div id="rest-timer-bar" style="display:none;align-items:center;gap:12px;padding:12px 16px;background:var(--surface-2);border-radius:12px;margin-bottom:12px;position:sticky;bottom:80px;z-index:10;border:1px solid var(--border);">
            <div style="flex:1;background:var(--surface-1);border-radius:8px;height:8px;overflow:hidden;">
              <div class="rest-timer-progress" style="height:100%;background:var(--accent);transition:width 1s linear;width:100%;border-radius:8px;"></div>
            </div>
            <span class="rest-timer-display" style="font-weight:600;font-size:0.85rem;min-width:70px;text-align:center;">休憩 60s</span>
            <button class="btn btn-sm btn-ghost" onclick="App.Views.Workout.dismissRestTimer()" style="padding:4px 8px;">✕</button>
          </div>

          <!-- ワークアウト完了 (sticky) -->
          <div class="workout-sticky-footer">
            <button class="btn btn-success btn-block btn-lg" id="finish-workout-btn">
              ✅ 今日はここまで！
            </button>
            <button class="btn btn-ghost btn-block mt-8" id="skip-workout-btn">
              今日はスキップする
            </button>
          </div>
        </div>`;
    },

    _renderExercise(ex, idx) {
      if (ex.type === 'stretch') return '';
      
      const allDone = ex.sets?.every(s => s.completed);
      const doneCount = ex.sets?.filter(s => s.completed).length || 0;

      // サマリー文字列: 「10kg × 10回 × 2セット」
      let summary = '';
      if (ex.isCardio) {
        summary = `${ex.durationMin || 10}分`;
      } else if (ex.sets && ex.sets.length > 0) {
        const s = ex.sets[0];
        summary = s.weight > 0 
          ? `${s.weight}kg × ${s.reps}回 × ${ex.sets.length}セット`
          : `${s.reps}回 × ${ex.sets.length}セット`;
      }

      return `
        <div class="exercise-item" data-idx="${idx}">
          <div class="exercise-header" onclick="App.Views.Workout.toggleExercise(${idx})">
            <div>
              <span class="exercise-name">${ex.icon || '🏋️'} ${ex.name}</span>
              ${ex.optional ? '<span class="badge badge-muted" style="margin-left:8px;">任意</span>' : ''}
              ${ex.isWarmup ? '<span class="badge badge-info" style="margin-left:8px;">W-UP</span>' : ''}
              ${ex.isCooldown ? '<span class="badge badge-info" style="margin-left:8px;">C-DOWN</span>' : ''}
              <div class="text-xs text-muted" style="margin-top:4px;">${summary}</div>
            </div>
            <div class="exercise-meta">
              ${allDone ? '✅' : `${doneCount}/${ex.sets?.length || 0}`}
            </div>
          </div>
          <div class="exercise-body ${idx === 0 ? 'open' : ''}" id="exercise-body-${idx}">
            ${ex.isCardio ? this._renderCardioBody(ex, idx) : this._renderWeightBody(ex, idx)}
            ${ex.previous ? `
              <div class="text-xs text-muted mt-8">
                前回: ${App.Utils.formatDateShort(ex.previous.date)} — ${ex.previous.weight > 0 ? ex.previous.weight + 'kg × ' : ''}${ex.previous.reps}回 × ${ex.previous.sets}セット
              </div>` : ''}
            ${ex.recommended && !ex.isCardio ? `
              <div class="text-xs mt-4" style="color:var(--accent);">
                💡 今回推奨: ${ex.recommended.weight > 0 ? ex.recommended.weight + 'kg × ' : ''}${ex.recommended.reps}回 × ${ex.recommended.sets || ex.sets?.length || 0}セット
                ${ex.recommended.note ? `<span class="text-muted"> — ${ex.recommended.note}</span>` : ''}
              </div>` : ''}
          </div>
        </div>`;
    },

    _renderWeightBody(ex, idx) {
      return ex.sets.map((set, si) => `
        <div class="set-row">
          <span class="set-number">${set.setNumber}</span>
          <input type="number" class="set-input" value="${set.weight}" min="0" step="2.5" 
            placeholder="kg" data-idx="${idx}" data-set="${si}" data-field="weight"
            onchange="App.Views.Workout.updateSet(${idx},${si},'weight',this.value)">
          <span class="text-xs text-muted">kg</span>
          <input type="number" class="set-input" value="${set.reps}" min="0" step="1"
            placeholder="回" data-idx="${idx}" data-set="${si}" data-field="reps"
            onchange="App.Views.Workout.updateSet(${idx},${si},'reps',this.value)">
          <span class="text-xs text-muted">回</span>
          <button class="set-check ${set.completed ? 'done' : ''}"
            onclick="App.Views.Workout.toggleSet(${idx},${si})">
            ✓
          </button>
        </div>`).join('');
    },

    _renderCardioBody(ex, idx) {
      return `
        <div class="flex-row p-16">
          <div class="form-group" style="flex:1;margin:0;">
            <div class="form-label">時間（分）</div>
            <input type="number" class="form-input" value="${ex.durationMin || 10}" min="1" step="1"
              onchange="App.Views.Workout.updateCardio(${idx},'durationMin',this.value)">
          </div>
          <button class="set-check ${ex.sets[0]?.completed ? 'done' : ''}" style="align-self:flex-end;"
            onclick="App.Views.Workout.toggleSet(${idx},0)">
            ✓
          </button>
        </div>`;
    },

    _renderSkipView() {
      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">🏋️</span> トレーニング</h2>
          <div class="card text-center" style="padding:40px;">
            <div style="font-size:3rem;">😴</div>
            <h3 class="mt-12">今日は休養日です</h3>
            <p class="text-secondary mt-8">休むことも、続けるための大切なステップです。</p>
            <p class="text-muted text-sm mt-12">
              「休む判断ができること」が継続の秘訣です。<br>
              明日に向けてゆっくり回復しましょう。
            </p>
            <button class="btn btn-secondary mt-20" onclick="App.Views.Workout.saveSkip()">
              📝 スキップを記録する
            </button>
            <button class="btn btn-ghost mt-8" onclick="App.Views.Workout.forceStart()">
              でも少しだけやる
            </button>
          </div>
        </div>`;
    },

    _renderStretchView(exercises) {
      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">🧘</span> ストレッチメニュー</h2>
          <p class="text-secondary mb-16">自宅でできる軽いストレッチです。5〜10分で完了します。</p>
          
          ${exercises.map((ex, i) => `
            <div class="list-item" onclick="this.querySelector('.set-check').classList.toggle('done')">
              <div class="list-icon" style="background:var(--surface-3);font-size:1.3rem;">${ex.icon}</div>
              <div class="list-content">
                <div class="list-title">${ex.name}</div>
                <div class="list-subtitle">${ex.duration}</div>
              </div>
              <button class="set-check ${ex.completed ? 'done' : ''}">✓</button>
            </div>`).join('')}

          <button class="btn btn-success btn-block btn-lg mt-20" id="finish-stretch-btn">
            ✅ ストレッチ完了！
          </button>
        </div>`;
    },

    toggleExercise(idx) {
      const body = document.getElementById(`exercise-body-${idx}`);
      if (body) body.classList.toggle('open');
    },

    updateSet(exIdx, setIdx, field, value) {
      if (currentExercises[exIdx]?.sets[setIdx]) {
        currentExercises[exIdx].sets[setIdx][field] = parseFloat(value) || 0;
        this._autoSave();
      }
    },

    updateCardio(exIdx, field, value) {
      if (currentExercises[exIdx]) {
        currentExercises[exIdx][field] = parseInt(value) || 0;
        this._autoSave();
      }
    },

    toggleSet(exIdx, setIdx) {
      if (currentExercises[exIdx]?.sets[setIdx]) {
        const wasCompleted = currentExercises[exIdx].sets[setIdx].completed;
        currentExercises[exIdx].sets[setIdx].completed = !wasCompleted;
        // UI更新
        const btn = document.querySelector(`.exercise-item[data-idx="${exIdx}"] .set-row:nth-child(${setIdx + 1}) .set-check, .exercise-item[data-idx="${exIdx}"] .set-check`);
        if (btn) btn.classList.toggle('done');
        // ヘッダーの進捗更新
        const header = document.querySelector(`.exercise-item[data-idx="${exIdx}"] .exercise-meta`);
        if (header) {
          const done = currentExercises[exIdx].sets.filter(s => s.completed).length;
          const total = currentExercises[exIdx].sets.length;
          header.textContent = done === total ? '✅' : `${done}/${total}`;
        }
        this._autoSave();

        // セット完了時に休憩タイマーを自動起動（未完了→完了の場合のみ）
        if (!wasCompleted && !currentExercises[exIdx].isCardio) {
          this.startRestTimer(60);
        }
      }
    },

    // 休憩タイマー
    _restTimerInterval: null,
    startRestTimer(seconds) {
      // 既存タイマーをクリア
      if (this._restTimerInterval) clearInterval(this._restTimerInterval);
      
      let remaining = seconds;
      const timerEl = document.getElementById('rest-timer-bar');
      if (!timerEl) return;
      
      timerEl.style.display = 'flex';
      const display = timerEl.querySelector('.rest-timer-display');
      const progress = timerEl.querySelector('.rest-timer-progress');
      
      const update = () => {
        if (display) display.textContent = `休憩 ${remaining}s`;
        if (progress) progress.style.width = `${(remaining / seconds) * 100}%`;
      };
      update();
      
      this._restTimerInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(this._restTimerInterval);
          this._restTimerInterval = null;
          if (timerEl) timerEl.style.display = 'none';
          // バイブレーション（対応端末のみ）
          if (navigator.vibrate) navigator.vibrate(200);
        } else {
          update();
        }
      }, 1000);
    },

    dismissRestTimer() {
      if (this._restTimerInterval) {
        clearInterval(this._restTimerInterval);
        this._restTimerInterval = null;
      }
      const timerEl = document.getElementById('rest-timer-bar');
      if (timerEl) timerEl.style.display = 'none';
    },

    async _autoSave() {
      const today = App.Utils.today();
      if (!currentWorkoutId) {
        currentWorkoutId = await App.DB.saveWorkout({
          date: today,
          type: menuType || 'custom',
          startTime: workoutStartTime ? new Date(workoutStartTime).toTimeString().slice(0, 5) : '',
          endTime: ''
        });
      }
      await App.DB.saveExercises(currentWorkoutId, currentExercises);
    },

    async saveSkip() {
      const html = `
        <div class="form-group">
          <div class="form-label">スキップ理由（任意）</div>
          <div class="flex-col gap-4">
            ${['疲労', '体調不良', '仕事が忙しかった', '時間がなかった', '気分が乗らなかった', 'その他'].map(r => `
              <div class="chip" onclick="this.classList.toggle('active')" data-reason="${r}">${r}</div>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <div class="form-label">メモ（任意）</div>
          <input type="text" class="form-input" id="skip-note" placeholder="何かあれば">
        </div>
        <button class="btn btn-primary btn-block mt-12" id="save-skip-btn">記録する</button>`;

      const close = App.Utils.showModal('スキップを記録', html);
      document.getElementById('save-skip-btn').addEventListener('click', async () => {
        const btn = document.getElementById('save-skip-btn');
        btn.disabled = true;
        btn.textContent = '⏳ 記録中...';
        try {
          const reasons = [...document.querySelectorAll('.chip.active')].map(c => c.dataset.reason);
          const note = document.getElementById('skip-note').value;
          await App.DB.saveWorkout({
            date: App.Utils.today(),
            type: 'skip',
            skipReason: reasons.join(', '),
            memo: note || '',
            feeling: 0,
            durationMinutes: 0
          });
          const pushRes = await App.DB.pushToCloud(App.Utils.today(), { sections: ['workout'] });
          close();
          if (pushRes.ok) {
            App.Utils.showToast('記録しました。ゆっくり休んでください 🌙', 'info');
          } else {
            App.Utils.showToast('⚠️ 未送信（オンライン復帰時に再送）', 'warning');
          }
          App.navigate('home');
        } catch (e) {
          btn.disabled = false;
          btn.textContent = '記録する';
          App.Utils.showToast('記録に失敗: ' + e.message, 'error');
        }
      });
    },

    async forceStart() {
      menuType = 'short';
      currentExercises = await App.Training.generateMenu('short', { beforeDate: App.Utils.today() });
      App.refreshView();
    },

    init() {
      // Timer toggle
      const timerBtn = document.getElementById('timer-toggle-btn');
      if (timerBtn) {
        timerBtn.addEventListener('click', () => this._toggleTimer());
      }

      // Finish button
      const finishBtn = document.getElementById('finish-workout-btn');
      if (finishBtn) {
        finishBtn.addEventListener('click', () => this._finishWorkout());
      }

      // Skip button
      const skipBtn = document.getElementById('skip-workout-btn');
      if (skipBtn) {
        skipBtn.addEventListener('click', () => this.saveSkip());
      }

      // Stretch finish
      const stretchBtn = document.getElementById('finish-stretch-btn');
      if (stretchBtn) {
        stretchBtn.addEventListener('click', async () => {
          stretchBtn.disabled = true;
          stretchBtn.textContent = '⏳ 保存中...';
          try {
            await App.DB.saveWorkout({
              date: App.Utils.today(), type: 'stretch',
              feeling: 4, memo: 'ストレッチ完了',
              durationMinutes: 10
            });
            const pushRes = await App.DB.pushToCloud(App.Utils.today(), { sections: ['workout'] });
            if (pushRes.ok) {
              App.Utils.showToast('お疲れさまでした！ゆっくり休みましょう 🧘', 'success');
            } else {
              App.Utils.showToast('⚠️ 未送信（オンライン復帰時に再送）', 'warning');
            }
            App.navigate('home');
          } catch (e) {
            stretchBtn.disabled = false;
            stretchBtn.textContent = '✅ ストレッチ完了！';
            App.Utils.showToast('記録に失敗: ' + e.message, 'error');
          }
        });
      }

      // タイマー表示の更新
      if (workoutTimer) this._updateTimerDisplay();
    },

    _toggleTimer() {
      if (workoutTimer) {
        clearInterval(workoutTimer);
        workoutTimer = null;
        document.getElementById('timer-toggle-btn').innerHTML = '▶ 再開';
        document.getElementById('timer-toggle-btn').classList.remove('btn-danger');
        document.getElementById('timer-toggle-btn').classList.add('btn-primary');
      } else {
        if (!workoutStartTime) workoutStartTime = Date.now();
        workoutTimer = setInterval(() => this._updateTimerDisplay(), 1000);
        document.getElementById('timer-toggle-btn').innerHTML = '⏸ 一時停止';
        document.getElementById('timer-toggle-btn').classList.remove('btn-primary');
        document.getElementById('timer-toggle-btn').classList.add('btn-danger');
      }
    },

    _updateTimerDisplay() {
      if (!workoutStartTime) return;
      const elapsed = Math.floor((Date.now() - workoutStartTime) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      const display = document.getElementById('workout-timer-display');
      if (display) {
        display.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      }
    },

    async _finishWorkout() {
      if (workoutTimer) {
        clearInterval(workoutTimer);
        workoutTimer = null;
      }

      const html = `
        <div class="form-group">
          <div class="form-label">今日のトレーニングはどうでしたか？</div>
          <div class="emoji-selector" id="finish-feeling">
            ${[
              ['😣', 'きつかった'],
              ['😐', 'まあまあ'],
              ['🙂', '普通'],
              ['😊', '良い感じ'],
              ['🤩', '最高！']
            ].map((e, i) => `
              <div class="emoji-option ${i === 2 ? 'selected' : ''}" data-value="${i+1}">
                <span class="emoji">${e[0]}</span>
                <span class="emoji-label">${e[1]}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <div class="form-label">メモ（任意）</div>
          <input type="text" class="form-input" id="finish-memo" placeholder="今日の感想">
        </div>
        <button class="btn btn-success btn-block mt-12" id="confirm-finish-btn">記録して終了</button>`;

      const close = App.Utils.showModal('トレーニング完了 🎉', html);

      document.querySelectorAll('#finish-feeling .emoji-option').forEach(el => {
        el.addEventListener('click', () => {
          document.querySelectorAll('#finish-feeling .emoji-option').forEach(o => o.classList.remove('selected'));
          el.classList.add('selected');
        });
      });

      document.getElementById('confirm-finish-btn').addEventListener('click', async () => {
        const btn = document.getElementById('confirm-finish-btn');
        btn.disabled = true;
        btn.textContent = '⏳ 保存中...';
        try {
          const feeling = parseInt(document.querySelector('#finish-feeling .emoji-option.selected')?.dataset.value || '3');
          const memo = document.getElementById('finish-memo').value;
          const now = new Date().toTimeString().slice(0, 5);

          let durationMinutes = 0;
          if (workoutStartTime) {
            durationMinutes = Math.round((Date.now() - workoutStartTime) / 60000);
          }

          const wkId = await App.DB.saveWorkout({
            id: currentWorkoutId,
            date: App.Utils.today(),
            type: menuType || 'custom',
            startTime: workoutStartTime ? new Date(workoutStartTime).toTimeString().slice(0, 5) : '',
            endTime: now,
            durationMinutes,
            feeling,
            memo
          }, currentExercises);

          // 消費カロリー自動計算
          if (App.Views.Health && App.Views.Health._calcTodayCalories) {
            const calories = await App.Views.Health._calcTodayCalories(App.Utils.today());
            if (calories > 0) {
              const existingHealth = await App.DB.getHealth(App.Utils.today());
              await App.DB.upsertHealth({
                ...(existingHealth || {}),
                date: App.Utils.today(),
                source: existingHealth?.source || 'manual',
                calories: calories
              });
            }
          }

          // クラウドPush（結果を待つ）
          const pushRes = await App.DB.pushToCloud(App.Utils.today(), { sections: ['workout', 'exercises'] });

          currentWorkoutId = null;
          currentExercises = [];
          workoutStartTime = null;

          close();
          if (pushRes.ok) {
            App.Utils.showToast('お疲れさまでした！素晴らしい 💪', 'success');
          } else {
            App.Utils.showToast('⚠️ 未送信（オンライン復帰時に再送）', 'warning');
          }
          App.navigate('home');
        } catch (e) {
          btn.disabled = false;
          btn.textContent = '記録して終了';
          App.Utils.showToast('記録に失敗: ' + e.message, 'error');
        }
      });
    },

    destroy() {}
  };
})();

