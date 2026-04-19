// ============================================
// Steady — ユーティリティ関数
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};

  const Utils = {
    // 睡眠時間フォーマット（分 → "7:30" 形式）
    formatSleep(minutes) {
      if (minutes == null || minutes === 0) return null;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${h}:00`;
    },

    // ISO時刻文字列 → 「15:30」形式
    formatTimeShort(isoStr) {
      if (!isoStr) return '';
      try {
        const d = new Date(isoStr);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      } catch(e) { return ''; }
    },

    // ISO時刻文字列 → 「23:40」形式。睡眠セッション表示の共通入口。
    formatClockFromIso(value) {
      if (!value) return '';
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    },

    // 睡眠セッション → 「23:40-06:20」形式。旧キャッシュ対策として window にも公開する。
    formatSleepWindow(health) {
      const start = this.formatClockFromIso(health?.sleepStartAt);
      const end = this.formatClockFromIso(health?.sleepEndAt);
      return start && end ? `${start}-${end}` : '';
    },

    // 日付フォーマット
    today() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    },
    
    formatDate(dateStr) {
      if (!dateStr) return '—';
      // Date型やDate.toString()形式が渡された場合の正規化
      let normalized = dateStr;
      if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        try {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            normalized = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
          } else {
            return String(dateStr);
          }
        } catch(e) { return String(dateStr); }
      }
      const d = new Date(normalized + 'T00:00:00');
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const dow = ['日','月','火','水','木','金','土'][d.getDay()];
      return `${month}月${day}日（${dow}）`;
    },

    formatDateShort(dateStr) {
      if (!dateStr) return '—';
      let normalized = dateStr;
      if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        try {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            normalized = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
          } else { return String(dateStr); }
        } catch(e) { return String(dateStr); }
      }
      const d = new Date(normalized + 'T00:00:00');
      return `${d.getMonth()+1}/${d.getDate()}`;
    },

    formatMonth(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return `${d.getFullYear()}年${d.getMonth()+1}月`;
    },

    getDayOfWeek(dateStr) {
      return ['日','月','火','水','木','金','土'][new Date(dateStr + 'T00:00:00').getDay()];
    },

    // 日付の差（日数）
    daysBetween(dateStr1, dateStr2) {
      const d1 = new Date(dateStr1 + 'T00:00:00');
      const d2 = new Date(dateStr2 + 'T00:00:00');
      return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    },

    // 月の日数
    daysInMonth(year, month) {
      return new Date(year, month, 0).getDate();
    },

    // 月の最初の曜日 (0=日)
    firstDayOfMonth(year, month) {
      return new Date(year, month - 1, 1).getDay();
    },

    // ローカル日付を YYYY-MM-DD 文字列に変換（toISOStringはUTC基準でズレるため）
    _localDateStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },

    // 指定月の日付配列
    getMonthDates(year, month) {
      const dates = [];
      const first = new Date(year, month - 1, 1);
      const last = new Date(year, month, 0);
      const startPad = first.getDay();
      
      // 前月の padding
      for (let i = startPad - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, -i);
        dates.push({ date: this._localDateStr(d), otherMonth: true });
      }
      
      // 当月
      for (let day = 1; day <= last.getDate(); day++) {
        const d = new Date(year, month - 1, day);
        dates.push({ date: this._localDateStr(d), otherMonth: false });
      }
      
      // 後月の padding (6行 = 42日に)
      while (dates.length < 42) {
        const d = new Date(year, month, dates.length - startPad - last.getDate() + 1);
        dates.push({ date: this._localDateStr(d), otherMonth: true });
      }
      
      return dates;
    },

    // 今週の日曜から土曜
    getWeekDates(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const day = d.getDay(); // 0=日曜
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const wd = new Date(d);
        wd.setDate(d.getDate() - day + i);
        dates.push(this._localDateStr(wd));
      }
      return dates;
    },

    // 時刻値をHH:MM形式に正規化（スプシのDate型対策）
    normTime(v) {
      if (!v) return '';
      const s = String(v).trim();
      // 既に HH:MM 形式
      if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0');
      // ISO / Date.toString() → パースして時刻抽出
      try {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
          return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        }
      } catch(e) {}
      return s;
    },

    // 時刻を分に変換 "HH:MM" → 分
    timeToMinutes(timeStr) {
      if (!timeStr) return null;
      const normalized = this.normTime(timeStr);
      const [h, m] = normalized.split(':').map(Number);
      return h * 60 + (m || 0);
    },

    // 分を時刻文字列に
    minutesToTime(min) {
      if (min == null) return '--:--';
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    // UUID生成
    uuid() {
      return crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },

    // Toast表示
    showToast(message, type = 'info', duration = 3000) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    // Modal表示
    showModal(title, contentHtml, onClose) {
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
          <div class="modal">
            <div class="modal-header">
              <h3>${title}</h3>
              <button class="modal-close" id="modal-close-btn">✕</button>
            </div>
            <div class="modal-body">${contentHtml}</div>
          </div>
        </div>`;
      
      const close = () => {
        container.innerHTML = '';
        if (onClose) onClose();
      };
      
      document.getElementById('modal-close-btn').addEventListener('click', close);
      document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target.id === 'modal-overlay') close();
      });
      
      return close;
    },

    closeModal() {
      const container = document.getElementById('modal-container');
      if (container) container.innerHTML = '';
    },

    // 数値のクランプ
    clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    },

    // デバウンス
    debounce(fn, delay = 300) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    },

    // デバイス判定
    isMobile() {
      return window.innerWidth < 768;
    },

    // 挨拶文
    getGreeting() {
      const h = new Date().getHours();
      if (h < 6) return '今日は軽め設定です';
      if (h < 12) return 'おはようございます ☀️';
      if (h < 18) return 'こんにちは 🌤';
      return '今日の記録';
    },

    // エスケープ
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };

  App.Utils = Utils;
  window.formatSleepWindow = window.formatSleepWindow || ((health) => App.Utils.formatSleepWindow(health));
  window.formatClockFromIso = window.formatClockFromIso || ((value) => App.Utils.formatClockFromIso(value));
})();
