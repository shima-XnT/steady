// ============================================
// Steady — 勤務表管理画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  let currentYear, currentMonth;

  App.Views.WorkSchedule = {
    async render() {
      const now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth() + 1;
      return this._renderPage();
    },

    async _renderPage() {
      const dates = App.Utils.getMonthDates(currentYear, currentMonth);
      const startDate = dates[0].date;
      const endDate = dates[dates.length - 1].date;
      const schedules = await App.DB.getScheduleRange(startDate, endDate);
      const scheduleMap = {};
      schedules.forEach(s => scheduleMap[s.date] = s);

      const today = App.Utils.today();

      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">📅</span> カレンダー</h2>

          <!-- タブ -->
          <div class="tabs">
            <button class="tab-btn active" data-tab="calendar-tab">カレンダー</button>
            <button class="tab-btn" data-tab="paste-tab">一括入力</button>
            <button class="tab-btn" data-tab="list-tab">一覧</button>
          </div>

          <!-- カレンダータブ -->
          <div class="tab-content active" id="calendar-tab">
            <div class="calendar">
              <div class="calendar-header">
                <button class="btn btn-icon btn-ghost" id="prev-month">‹</button>
                <h3>${currentYear}年${currentMonth}月</h3>
                <button class="btn btn-icon btn-ghost" id="next-month">›</button>
              </div>
              <div class="calendar-weekdays">
                ${['日','月','火','水','木','金','土'].map(d => `<span>${d}</span>`).join('')}
              </div>
              <div class="calendar-grid">
                ${dates.map(({ date, otherMonth }) => {
                  const s = scheduleMap[date];
                  const isToday = date === today;
                  const dayNum = new Date(date + 'T00:00:00').getDate();
                  const shiftClass = s ? `shift-${s.shiftType}` : '';
                  const label = s ? this._shiftShort(s.shiftType) : '';
                  return `
                    <div class="calendar-day ${otherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${shiftClass}"
                         data-date="${date}" ${otherMonth ? '' : 'onclick="App.Views.WorkSchedule.editDay(\'' + date + '\')"'}>
                      <span>${dayNum}</span>
                      ${label ? `<span class="shift-label">${label}</span>` : ''}
                    </div>`;
                }).join('')}
              </div>
            </div>

            <!-- 凡例 -->
            <div class="flex-row mt-12" style="flex-wrap:wrap;gap:8px;justify-content:center;">
              ${[
                { cls: 'shift-off', label: '休み' },
                { cls: 'shift-paid-leave', label: '有給' },
                { cls: 'shift-normal', label: '通常勤務' },
                { cls: 'shift-project', label: '案件あり勤務' },
                { cls: 'shift-business-trip', label: '出張勤務' }
              ].map(l => `
                <div class="flex-row gap-4">
                  <div style="width:12px;height:12px;border-radius:3px;" class="calendar-day ${l.cls}"></div>
                  <span class="text-xs text-muted">${l.label}</span>
                </div>`).join('')}
            </div>

            <!-- 月間スケジュール一括同期 -->
            <div class="mt-16" style="text-align:center;">
              <button class="btn btn-sm btn-ghost" id="sync-month-schedule-btn" style="font-size:0.8rem;">
                📤 ${currentYear}年${currentMonth}月のスケジュールをスプシに同期
              </button>
            </div>
          </div>

          <!-- 一括入力タブ -->
          <div class="tab-content" id="paste-tab">
            <div class="card">
              <h3 class="mb-12">テキスト一括入力</h3>
              <p class="text-sm text-muted mb-12">
                以下の形式で入力してください：<br>
                <code style="color:var(--primary-light);">YYYY-MM-DD 休み</code> / <code style="color:var(--primary-light);">YYYY-MM-DD 有給</code> or
                <code style="color:var(--primary-light);">YYYY-MM-DD HH:MM-HH:MM</code>
              </p>
              <textarea class="paste-area" id="schedule-paste" placeholder="2026-04-01 09:00-18:00
2026-04-02 有給
2026-04-03 休み
2026-04-03 13:00-22:00
2026-04-04 07:00-16:00
2026-04-05 09:00-18:00"></textarea>
              <button class="btn btn-primary btn-block mt-12" id="parse-schedule-btn">
                📋 読み取って登録
              </button>
            </div>
          </div>

          <!-- 一覧タブ -->
          <div class="tab-content" id="list-tab">
            <div id="schedule-list">
              ${await this._renderList()}
            </div>
          </div>
        </div>`;
    },

    async _renderList() {
      const startDate = `${currentYear}-${String(currentMonth).padStart(2,'0')}-01`;
      const endDate = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${App.Utils.daysInMonth(currentYear, currentMonth)}`;
      const schedules = await App.DB.getScheduleRange(startDate, endDate);
      
      if (schedules.length === 0) {
        return `<div class="empty-state">
          <div class="empty-icon">📅</div>
          <div class="empty-title">シフトが未登録です</div>
          <div class="empty-text">カレンダーから日付をタップするか、一括入力から登録してください</div>
        </div>`;
      }

      return schedules.sort((a,b) => a.date.localeCompare(b.date)).map(s => `
        <div class="list-item" onclick="App.Views.WorkSchedule.editDay('${s.date}')">
          <div class="list-icon" style="background:var(--surface-3);">📅</div>
          <div class="list-content">
            <div class="list-title">${App.Utils.formatDate(s.date)}</div>
            <div class="list-subtitle">${this._shiftFull(s)}</div>
          </div>
          <span class="badge badge-${this._shiftBadge(s.shiftType)}">${this._shiftShort(s.shiftType)}</span>
        </div>`).join('');
    },

    _shiftShort(type) {
      const map = { off: '休', paid_leave: '有', normal: '通', project: '案', business_trip: '出', early: '早', late: '遅', night: '夜', remote: '在' };
      return map[type] || '?';
    },

    _shiftFull(s) {
      const labels = { off: '休み', paid_leave: '有給', normal: '通常勤務', project: '案件あり勤務', business_trip: '出張勤務', early: '早番', late: '遅番', night: '夜勤', remote: '在宅' };
      let text = labels[s.shiftType] || s.shiftType;
      if (s.startTime && s.endTime) {
        text += ` (${App.Utils.normTime(s.startTime)}〜${App.Utils.normTime(s.endTime)})`;
      }
      return text;
    },

    _shiftBadge(type) {
      const map = { off: 'success', paid_leave: 'success', normal: 'info', project: 'warning', business_trip: 'primary', early: 'info', late: 'warning', night: 'danger', remote: 'primary' };
      return map[type] || 'muted';
    },

    editDay(dateStr) {
      App.DB.getSchedule(dateStr).then(existing => {
        const s = existing || { date: dateStr, shiftType: 'normal', startTime: '09:00', endTime: '18:00' };
        
        const html = `
          <div class="form-group">
            <div class="form-label">日付</div>
            <div class="text-primary fw-600">${App.Utils.formatDate(dateStr)}</div>
          </div>
          <div class="form-group">
            <div class="form-label">勤務タイプ</div>
            <select class="form-select" id="modal-shift-type">
              ${['off', 'paid_leave', 'normal', 'project', 'business_trip'].map(t => `
                <option value="${t}" ${s.shiftType === t ? 'selected' : ''}>${this._shiftFull({ shiftType: t })}</option>`).join('')}
              ${!['off', 'paid_leave', 'normal', 'project', 'business_trip'].includes(s.shiftType) ? `<option value="${s.shiftType}" selected>${this._shiftFull(s)}（過去データ）</option>` : ''}
            </select>
          </div>
          <div id="modal-time-inputs" class="${s.shiftType === 'off' || s.shiftType === 'paid_leave' ? 'hidden' : ''}">
            <div class="grid-2">
              <div class="form-group">
                <div class="form-label">開始時刻</div>
                <input type="time" class="form-input" id="modal-start-time" value="${App.Utils.normTime(s.startTime) || '09:00'}">
              </div>
              <div class="form-group">
                <div class="form-label">終了時刻</div>
                <input type="time" class="form-input" id="modal-end-time" value="${App.Utils.normTime(s.endTime) || '18:00'}">
              </div>
            </div>
          </div>
          <div id="modal-trip-inputs" class="${s.shiftType === 'business_trip' ? '' : 'hidden'}">
            <div class="grid-2">
              <div class="form-group">
                <div class="form-label">行き先</div>
                <input type="text" class="form-input" id="modal-destination" value="${App.Utils.escapeHtml(s.destination || '')}" placeholder="例: 名古屋">
              </div>
              <div class="form-group">
                <div class="form-label">ホテル名</div>
                <input type="text" class="form-input" id="modal-hotel-name" value="${App.Utils.escapeHtml(s.hotelName || '')}" placeholder="例: 駅前ホテル">
              </div>
            </div>
          </div>
          <div class="form-group">
            <div class="form-label">メモ（任意）</div>
            <input type="text" class="form-input" id="modal-note" value="${App.Utils.escapeHtml(s.note || '')}" placeholder="残業予定など">
          </div>
          <button class="btn btn-primary btn-block mt-12" id="modal-save-btn">保存</button>
          ${existing ? `<button class="btn btn-danger btn-block mt-8" id="modal-delete-btn">削除</button>` : ''}
        `;

        const close = App.Utils.showModal(App.Utils.formatDate(dateStr), html);

        // シフトタイプ変更で時刻入力の表示切替
        document.getElementById('modal-shift-type').addEventListener('change', (e) => {
          const timeDiv = document.getElementById('modal-time-inputs');
          const tripDiv = document.getElementById('modal-trip-inputs');
          if (e.target.value === 'off' || e.target.value === 'paid_leave') {
            timeDiv.classList.add('hidden');
          } else {
            timeDiv.classList.remove('hidden');
            // デフォルト時間をセット
            const defaults = { normal: ['09:00','18:00'], project: ['09:00','18:00'], business_trip: ['09:00','18:00'] };
            const def = defaults[e.target.value] || ['09:00','18:00'];
            document.getElementById('modal-start-time').value = def[0];
            document.getElementById('modal-end-time').value = def[1];
          }
          if (tripDiv) tripDiv.classList.toggle('hidden', e.target.value !== 'business_trip');
        });

        document.getElementById('modal-save-btn').addEventListener('click', async () => {
          const saveBtn = document.getElementById('modal-save-btn');
          saveBtn.disabled = true;
          saveBtn.textContent = '⏳ 保存中...';
          const shiftType = document.getElementById('modal-shift-type').value;
          try {
            await App.DB.upsertSchedule({
              date: dateStr,
              shiftType,
              startTime: shiftType === 'off' || shiftType === 'paid_leave' ? '' : document.getElementById('modal-start-time').value,
              endTime: shiftType === 'off' || shiftType === 'paid_leave' ? '' : document.getElementById('modal-end-time').value,
              note: document.getElementById('modal-note').value,
              destination: shiftType === 'business_trip' ? document.getElementById('modal-destination').value.trim() : '',
              hotelName: shiftType === 'business_trip' ? document.getElementById('modal-hotel-name').value.trim() : ''
            });
            const pushRes = await App.DB.pushToCloud(dateStr, { sections: ['schedule'] });
            close();
            if (pushRes.ok) {
              App.Utils.showToast('保存しました ✅', 'success');
            } else {
              App.Utils.showToast('⚠️ 未送信（オンライン復帰時に再送）', 'warning');
            }
            App.refreshView();
          } catch (e) {
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
            App.Utils.showToast('保存に失敗しました: ' + e.message, 'error');
          }
        });

        const delBtn = document.getElementById('modal-delete-btn');
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            delBtn.disabled = true;
            delBtn.textContent = '⏳ 削除中...';
            const result = await App.DB.deleteScheduleRemote(dateStr);
            if (result.success) {
              close();
              App.Utils.showToast('削除しました', 'info');
              App.refreshView();
            } else {
              delBtn.disabled = false;
              delBtn.textContent = '削除';
              App.Utils.showToast('削除に失敗: ' + (result.error || '不明なエラー'), 'error');
            }
          });
        }
      });
    },

    init() {
      // Tab switching
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(btn.dataset.tab)?.classList.add('active');
        });
      });

      // Month navigation
      document.getElementById('prev-month')?.addEventListener('click', () => this._changeMonth(-1));
      document.getElementById('next-month')?.addEventListener('click', () => this._changeMonth(1));

      // Paste parse
      document.getElementById('parse-schedule-btn')?.addEventListener('click', () => this._parsePaste());

      // 月間スケジュール一括同期
      document.getElementById('sync-month-schedule-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('sync-month-schedule-btn');
        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ 送信中...';
        try {
          const result = await App.DB.pushMonthSchedules(currentYear, currentMonth);
          if (result.success) {
            App.Utils.showToast(`${currentYear}年${currentMonth}月のスケジュール ${result.count}件を送信しました`, 'success');
          } else {
            App.Utils.showToast(result.error || '送信に失敗しました', 'error');
          }
        } catch (e) {
          App.Utils.showToast('送信エラー: ' + e.message, 'error');
        }
        btn.disabled = false;
        btn.textContent = origText;
      });
    },

    async _changeMonth(delta) {
      currentMonth += delta;
      if (currentMonth > 12) { currentMonth = 1; currentYear++; }
      if (currentMonth < 1) { currentMonth = 12; currentYear--; }
      App.refreshView();
    },

    async _parsePaste() {
      const text = document.getElementById('schedule-paste')?.value || '';
      if (!text.trim()) {
        App.Utils.showToast('テキストを入力してください', 'warning');
        return;
      }

      const lines = text.trim().split('\n');
      let count = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // YYYY-MM-DD 休み
        const offMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(休み|休日|off)/i);
        if (offMatch) {
          await App.DB.upsertSchedule({ date: offMatch[1], shiftType: 'off', startTime: '', endTime: '', destination: '', hotelName: '' });
          count++;
          continue;
        }

        const paidLeaveMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(有給|有休|paid|paid_leave)/i);
        if (paidLeaveMatch) {
          await App.DB.upsertSchedule({ date: paidLeaveMatch[1], shiftType: 'paid_leave', startTime: '', endTime: '', destination: '', hotelName: '' });
          count++;
          continue;
        }

        const tripMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(出張|trip|business_trip)(?:\s+(.+?))?(?:\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2}))?$/i);
        if (tripMatch) {
          const [, date, , placeText = '', start = '09:00', end = '18:00'] = tripMatch;
          const [destination = '', hotelName = ''] = placeText.split(/\s*[/／]\s*/).map(value => value.trim());
          await App.DB.upsertSchedule({ date, shiftType: 'business_trip', startTime: start.padStart(5, '0'), endTime: end.padStart(5, '0'), destination, hotelName, note: '' });
          count++;
          continue;
        }

        const projectMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(案件あり|案件|project)(?:\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2}))?/i);
        if (projectMatch) {
          const [, date, , start = '09:00', end = '18:00'] = projectMatch;
          await App.DB.upsertSchedule({ date, shiftType: 'project', startTime: start.padStart(5, '0'), endTime: end.padStart(5, '0'), destination: '', hotelName: '', note: '' });
          count++;
          continue;
        }

        const normalMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(通常|通常勤務|normal)(?:\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2}))?/i);
        if (normalMatch) {
          const [, date, , start = '09:00', end = '18:00'] = normalMatch;
          await App.DB.upsertSchedule({ date, shiftType: 'normal', startTime: start.padStart(5, '0'), endTime: end.padStart(5, '0'), destination: '', hotelName: '', note: '' });
          count++;
          continue;
        }

        // YYYY-MM-DD HH:MM-HH:MM
        const timeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
          const [, date, start, end] = timeMatch;
          await App.DB.upsertSchedule({
            date,
            shiftType: 'normal',
            startTime: start.padStart(5, '0'),
            endTime: end.padStart(5, '0'),
            destination: '',
            hotelName: ''
          });
          count++;
          continue;
        }
      }

      if (count > 0) {
        App.Utils.showToast(`${count}件の勤務データを登録しました`, 'success');
        App.refreshView();
      } else {
        App.Utils.showToast('読み取れるデータがありませんでした', 'warning');
      }
    },

    destroy() {}
  };
})();
