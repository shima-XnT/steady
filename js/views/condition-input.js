// ============================================
// Steady — 体調入力 & 判定画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  App.Views.ConditionInput = {
    _result: null,
    _sleepTouched: false,

    async render() {
      const today = App.Utils.today();
      const condition = await App.DB.getCondition(today);
      const health = await App.DB.getHealth(today);
      const schedule = await App.DB.getSchedule(today);
      const judgment = await App.DB.getJudgment(today);

      const hasCondition = !!condition;
      const hasSleep = !!(health && health.sleepMinutes != null);

      // 判定済みなら結果表示
      if (judgment) {
        this._result = judgment;
      }

      // 既存データがあれば sleepTouched = true
      this._sleepTouched = hasSleep;

      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">📝</span> 体調チェック</h2>

          <!-- 体調入力フォーム -->
          <div class="card mb-16" id="condition-form">
            <h3 class="mb-16">今日の体調</h3>

            <!-- 疲労感 -->
            <div class="form-group">
              <div class="form-label">疲労感</div>
              <div class="emoji-selector" data-field="fatigue">
                ${this._emojiOptions('fatigue', ['😊 元気', '🙂 普通', '😐 少し疲れ', '😓 疲れ', '😵 ヘトヘト'], hasCondition ? condition.fatigue : null)}
              </div>
            </div>

            <!-- 筋肉痛 -->
            <div class="form-group">
              <div class="form-label">筋肉痛</div>
              <div class="emoji-selector" data-field="muscleSoreness">
                ${this._emojiOptions('muscleSoreness', ['✨ なし', '🤏 少し', '😣 そこそこ', '😖 結構', '🫠 強い'], hasCondition ? condition.muscleSoreness : null, 0)}
              </div>
            </div>

            <!-- やる気 -->
            <div class="form-group">
              <div class="form-label">やる気</div>
              <div class="emoji-selector" data-field="motivation">
                ${this._emojiOptions('motivation', ['😴 なし', '🫤 低い', '😐 普通', '💪 ある', '🔥 最高'], hasCondition ? condition.motivation : null)}
              </div>
            </div>

            <!-- 気分 -->
            <div class="form-group">
              <div class="form-label">気分</div>
              <div class="emoji-selector" data-field="mood">
                ${this._emojiOptions('mood', ['😢 悪い', '😕 イマイチ', '😐 普通', '😊 良い', '😄 最高'], hasCondition ? condition.mood : null)}
              </div>
            </div>

            <!-- 睡眠時間（スマホのみ表示） -->
            ${window.SteadyBridge ? `
            <div class="form-group">
              <div class="form-label">昨夜の睡眠時間</div>
              <div class="range-group">
                <div class="range-header">
                  <span class="text-xs text-muted">0h</span>
                  <span class="range-value" id="sleep-value">${hasSleep ? App.Utils.formatSleep(health.sleepMinutes) : '未設定'}</span>
                  <span class="text-xs text-muted">12h</span>
                </div>
                <input type="range" id="sleep-input" min="0" max="720" step="15"
                  value="${hasSleep ? health.sleepMinutes : 360}"
                  class="${hasSleep ? '' : 'unset'}"
                  >
              </div>
            </div>
            ` : `
            <div class="form-group">
              <div class="form-label">昨夜の睡眠</div>
              <div class="text-lg fw-600" style="color:var(--accent);padding:8px 0;">
                ${hasSleep ? App.Utils.formatSleep(health.sleepMinutes) : '📱 スマホから自動同期'}
              </div>
            </div>
            `}

            <!-- 備考 -->
            <div class="form-group">
              <div class="form-label">メモ（任意）</div>
              <input type="text" class="form-input" id="condition-note" 
                placeholder="体調の補足があれば"
                value="${App.Utils.escapeHtml(condition?.note || '')}">
            </div>
          </div>

          <!-- 仕事情報（参考表示） -->
          <div class="card mb-16">
            <h3 class="mb-12">今日の勤務</h3>
            ${schedule ? `
              <div class="flex-between">
                <span class="badge badge-${this._shiftBadge(schedule.shiftType)}">${this._shiftLabel(schedule.shiftType)}</span>
                <span class="text-secondary text-sm">
                  ${App.Utils.normTime(schedule.startTime) || '未設定'} 〜 ${App.Utils.normTime(schedule.endTime) || '未設定'}
                </span>
              </div>
            ` : `
              <div class="text-muted text-sm">
                シフトが未入力です。
                <a href="#" onclick="App.navigate('schedule');return false;">入力する</a>
              </div>
            `}
          </div>

          <!-- 判定ボタン -->
          <button class="btn btn-primary btn-block btn-lg" id="judge-btn">
            🔍 今日の判定を見る
          </button>

          <!-- 判定結果エリア -->
          <div id="judgment-result" class="mt-20">
            ${this._result ? this._renderResult(this._result) : ''}
          </div>
        </div>`;
    },

    _emojiOptions(field, labels, selectedVal, startFrom = 1) {
      return labels.map((label, i) => {
        const val = startFrom + i;
        const [emoji, text] = label.split(' ');
        const isSelected = selectedVal != null && val === selectedVal;
        return `
          <div class="emoji-option ${isSelected ? 'selected' : ''}"
               data-field="${field}" data-value="${val}">
            <span class="emoji">${emoji}</span>
            <span class="emoji-label">${text}</span>
          </div>`;
      }).join('');
    },

    _shiftLabel(type) {
      const map = { off: '休み', normal: '通常', early: '早番', late: '遅番', night: '夜勤', remote: 'リモート' };
      return map[type] || type || '不明';
    },

    _shiftBadge(type) {
      const map = { off: 'success', normal: 'info', early: 'info', late: 'warning', night: 'danger', remote: 'primary' };
      return map[type] || 'muted';
    },

    _renderResult(j) {
      const circumference = 2 * Math.PI * 42;
      const offset = circumference - (j.score / 100) * circumference;
      const color = App.Judgment.getScoreColor(j.result);

      let actionButton = '';
      if (j.result <= 3) {
        const menuType = App.Training.getMenuType(j.result);
        const config = App.Training.MENU_CONFIGS[menuType];
        actionButton = `
          <button class="btn btn-success btn-block btn-lg mt-16" onclick="App.navigate('workout')">
            🏋️ ${config.label}を始める（約${config.estimatedMin}分）
          </button>`;
      } else if (j.result === 4) {
        actionButton = `
          <button class="btn btn-secondary btn-block mt-16" onclick="App.navigate('workout')">
            🧘 ストレッチメニューを見る
          </button>`;
      }

      return `
        <div class="judgment-card animate-in">
          <div class="flex-between mb-16">
            <div style="flex:1">
              <div class="text-xs text-muted">判定結果</div>
              <div class="result-label" style="color:${color};font-size:1.6rem;">
                ${App.Judgment.RESULT_ICONS[j.result]} ${j.resultLabel}
              </div>
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

          <p class="text-secondary" style="line-height:1.6">${j.message}</p>

          ${j.reasons && j.reasons.length > 0 ? `
            <div class="mt-12">
              <div class="text-xs text-muted mb-8">判定理由</div>
              ${j.reasons.map(r => `<div class="text-sm" style="padding:2px 0;">· ${r}</div>`).join('')}
            </div>` : ''}

          ${actionButton}

          <!-- 手動変更 -->
          <div class="mt-16">
            <div class="text-xs text-muted mb-8">判定を変更する（任意）</div>
            <div class="flex-row" style="flex-wrap:wrap;gap:6px;">
              ${[1,2,3,4,5].map(i => `
                <span class="judge-tag judge-tag-${i}" style="cursor:pointer;${j.userOverride === i ? 'outline:2px solid currentColor;' : ''}" 
                  onclick="App.Views.ConditionInput.overrideJudgment(${i})">
                  ${App.Judgment.RESULT_ICONS[i]} ${App.Judgment.RESULT_LABELS[i]}
                </span>`).join('')}
            </div>
          </div>
        </div>`;
    },

    init() {
      // Emoji selector click — 選択と同時に自動保存
      document.querySelectorAll('.emoji-option').forEach(el => {
        el.addEventListener('click', () => {
          const field = el.dataset.field;
          const selector = el.closest('.emoji-selector');
          selector.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
          el.classList.add('selected');
          // 選択したら即座に保存
          this._autoSaveCondition();
        });
      });

      // Sleep range — 操作したら「未設定」を解除
      const sleepInput = document.getElementById('sleep-input');
      const sleepValue = document.getElementById('sleep-value');
      if (sleepInput) {
        sleepInput.addEventListener('input', () => {
          this._sleepTouched = true;
          sleepInput.classList.remove('unset');
          sleepValue.textContent = App.Utils.formatSleep(parseInt(sleepInput.value));
        });
        // スライダーを離した時に保存
        sleepInput.addEventListener('change', () => {
          this._autoSaveSleep();
        });
      }

      // メモ — フォーカスが外れたら自動保存
      const noteInput = document.getElementById('condition-note');
      if (noteInput) {
        noteInput.addEventListener('blur', () => this._autoSaveCondition());
      }

      // Judge button
      const judgeBtn = document.getElementById('judge-btn');
      if (judgeBtn) {
        judgeBtn.addEventListener('click', () => this._doJudge());
      }
    },

    // 体調データを即座に保存（選択変更で自動保存）
    async _autoSaveCondition() {
      const today = App.Utils.today();
      const getSelected = (field) => {
        const el = document.querySelector(`.emoji-option.selected[data-field="${field}"]`);
        return el ? parseInt(el.dataset.value) : null;
      };

      const fatigue = getSelected('fatigue');
      if (fatigue == null) return;

      const conditionData = {
        date: today,
        fatigue,
        muscleSoreness: getSelected('muscleSoreness') ?? 0,
        motivation: getSelected('motivation') ?? 3,
        mood: getSelected('mood') ?? 3,
        note: document.getElementById('condition-note')?.value || ''
      };
      await App.DB.upsertCondition(conditionData);
      // ★ ここではPushしない。判定ボタン押下時に pushToCloud でまとめて送信する。
    },

    // 睡眠データを即座に保存
    async _autoSaveSleep() {
      const sleepMin = parseInt(document.getElementById('sleep-input')?.value || '0');
      await App.DB.upsertHealth({
        date: App.Utils.today(),
        source: 'manual',
        sleepMinutes: sleepMin
      });
      // ★ ここではPushしない。判定ボタン押下時にまとめて送信する。
    },

    async _doJudge() {
      const judgeBtn = document.getElementById('judge-btn');
      if (judgeBtn) {
        judgeBtn.disabled = true;
        judgeBtn.textContent = '⏳ 判定中...';
      }
      try {
        const today = App.Utils.today();

        // 未選択チェック
        const getSelected = (field) => {
          const el = document.querySelector(`.emoji-option.selected[data-field="${field}"]`);
          return el ? parseInt(el.dataset.value) : null;
        };

        const fatigue = getSelected('fatigue');
        const muscleSoreness = getSelected('muscleSoreness');
        const motivation = getSelected('motivation');
        const mood = getSelected('mood');

        // 少なくとも疲労感は必須
        if (fatigue == null) {
          App.Utils.showToast('疲労感を選択してください', 'warning');
          if (judgeBtn) { judgeBtn.disabled = false; judgeBtn.textContent = '🔍 今日の判定をする'; }
          return;
        }

        const conditionData = {
          date: today,
          fatigue,
          muscleSoreness: muscleSoreness ?? 0,
          motivation: motivation ?? 3,
          mood: mood ?? 3,
          note: document.getElementById('condition-note')?.value || ''
        };
        await App.DB.upsertCondition(conditionData);

        // 睡眠データ — ユーザーが操作済みの場合のみ保存
        const overrides = {
          fatigue: conditionData.fatigue,
          muscleSoreness: conditionData.muscleSoreness,
          motivation: conditionData.motivation,
          mood: conditionData.mood
        };

        if (this._sleepTouched) {
          const sleepMin = parseInt(document.getElementById('sleep-input')?.value || '0');
          await App.DB.upsertHealth({
            date: today,
            source: 'manual',
            sleepMinutes: sleepMin
          });
          overrides.sleepMinutes = sleepMin;
        }

        // 判定実行
        const result = await App.Judgment.judgeAndSave(today, overrides);

        this._result = result;
        
        // 結果を表示
        const resultArea = document.getElementById('judgment-result');
        if (resultArea) {
          resultArea.innerHTML = this._renderResult(result);
          resultArea.scrollIntoView({ behavior: 'smooth' });
        }

        // クラウドPush（結果を待つ）
        const pushRes = await App.DB.pushToCloud(today, { sections: ['condition', 'judgment'] });
        if (judgeBtn) { judgeBtn.disabled = false; judgeBtn.textContent = '🔍 今日の判定をする'; }
        if (pushRes.ok) {
          App.Utils.showToast('判定完了 ✅', 'success');
        } else {
          App.Utils.showToast('⚠️ 判定済み（未送信: ' + (pushRes.error || 'オンライン復帰時に再送') + '）', 'warning');
        }
      } catch (e) {
        console.error('Judge error:', e);
        if (judgeBtn) { judgeBtn.disabled = false; judgeBtn.textContent = '🔍 今日の判定をする'; }
        App.Utils.showToast('判定処理に失敗: ' + e.message, 'error');
      }
    },

    async overrideJudgment(newResult) {
      const today = App.Utils.today();
      const existing = await App.DB.getJudgment(today);
      if (existing) {
        await App.DB.upsertJudgment({ ...existing, userOverride: newResult });
        // re-render result
        const updated = await App.DB.getJudgment(today);
        this._result = updated;
        const resultArea = document.getElementById('judgment-result');
        if (resultArea) {
          resultArea.innerHTML = this._renderResult(updated);
        }
        // Push結果を待つ
        const pushRes = await App.DB.pushToCloud(today, { sections: ['judgment'] });
        if (pushRes.ok) {
          App.Utils.showToast(`${App.Judgment.RESULT_LABELS[newResult]}に変更 ✅`, 'success');
        } else {
          App.Utils.showToast(`${App.Judgment.RESULT_LABELS[newResult]}に変更（未送信）`, 'warning');
        }
      }
    },

    destroy() {
      this._result = null;
      this._sleepTouched = false;
    }
  };
})();
