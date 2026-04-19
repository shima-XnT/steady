// ============================================
// Steady — 分析画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  let charts = [];

  App.Views.Analytics = {
    async render() {
      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">📈</span> 分析</h2>

          <div class="tabs">
            <button class="tab-btn active" data-tab="analytics-overview">概要</button>
            <button class="tab-btn" data-tab="analytics-training">トレーニング</button>
            <button class="tab-btn" data-tab="analytics-health">健康</button>
          </div>

          <!-- 概要 -->
          <div class="tab-content active" id="analytics-overview">
            ${await this._renderOverview()}
          </div>



          <!-- トレーニング分析 -->
          <div class="tab-content" id="analytics-training">
            <div class="card mb-16">
              <h3 class="mb-12">週別トレーニング回数</h3>
              <div class="chart-container">
                <canvas id="chart-frequency"></canvas>
              </div>
            </div>
            <div class="card">
              <h3 class="mb-12">判定結果の分布</h3>
              <div class="chart-container">
                <canvas id="chart-judgment"></canvas>
              </div>
            </div>
          </div>

          <!-- 健康指標 -->
          <div class="tab-content" id="analytics-health">
            <div class="card mb-16">
              <h3 class="mb-12">睡眠時間（30日間）</h3>
              <div class="chart-container">
                <canvas id="chart-sleep"></canvas>
              </div>
            </div>
            <div class="card">
              <h3 class="mb-12">歩数（30日間）</h3>
              <div class="chart-container">
                <canvas id="chart-steps"></canvas>
              </div>
            </div>
          </div>
        </div>`;
    },

    async _renderOverview() {
      const today = App.Utils.today();
      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
      const month30 = d30.toISOString().slice(0, 10);
      
      const workouts = await App.DB.getWorkoutsRange(month30, today);
      const actual = workouts.filter(w => w.type !== 'skip');
      const skips = workouts.filter(w => w.type === 'skip');
      const judgments = await App.DB.getJudgmentRange(month30, today);
      const health = await App.DB.getHealthRange(month30, today);

      const sleepCount = health.filter(h => h.sleepMinutes).length;
      const avgSleep = sleepCount > 0
        ? (health.reduce((s, h) => s + (h.sleepMinutes || 0), 0) / sleepCount / 60).toFixed(1)
        : '—';
      const stepsCount = health.filter(h => h.steps).length;
      const avgSteps = stepsCount > 0
        ? Math.round(health.reduce((s, h) => s + (h.steps || 0), 0) / stepsCount)
        : '—';
      const avgScore = judgments.length > 0
        ? Math.round(judgments.reduce((s, j) => s + j.score, 0) / judgments.length)
        : '—';

      const rate = (actual.length + skips.length) > 0
        ? Math.round(actual.length / (actual.length + skips.length) * 100)
        : '—';

      return `
        <div class="section-title">過去30日間のサマリー</div>
        <div class="grid-2">
          <div class="stat-card">
            <span class="stat-icon">🏋️</span>
            <span class="stat-value">${actual.length}回</span>
            <span class="stat-label">トレーニング実施</span>
          </div>
          <div class="stat-card">
            <span class="stat-icon">😴</span>
            <span class="stat-value">${skips.length}回</span>
            <span class="stat-label">スキップ</span>
          </div>
          <div class="stat-card">
            <span class="stat-icon">📊</span>
            <span class="stat-value">${rate}%</span>
            <span class="stat-label">実施率</span>
          </div>
          <div class="stat-card">
            <span class="stat-icon">🎯</span>
            <span class="stat-value">${avgScore}</span>
            <span class="stat-label">平均スコア</span>
          </div>
          <div class="stat-card">
            <span class="stat-icon">💤</span>
            <span class="stat-value">${avgSleep}h</span>
            <span class="stat-label">平均睡眠</span>
          </div>
          <div class="stat-card">
            <span class="stat-icon">👟</span>
            <span class="stat-value">${avgSteps !== '—' ? avgSteps.toLocaleString() : '—'}</span>
            <span class="stat-label">平均歩数</span>
          </div>
        </div>

        ${skips.length > 0 ? `
        <div class="section mt-20">
          <div class="section-title">スキップ理由</div>
          <div class="card">
            ${skips.slice(0, 5).map(s => `
              <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem;">
                <span class="text-muted">${App.Utils.formatDateShort(s.date)}</span>
                <span class="ml-8">${s.memo || '理由なし'}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      `;
    },

    async init() {
      // Tab switching
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(btn.dataset.tab)?.classList.add('active');
          this._initCharts(btn.dataset.tab);
        });
      });
    },

    async _initCharts(tabId) {
      // Chart.jsが利用可能か確認
      if (typeof Chart === 'undefined') return;

      // 既存チャートを破棄
      charts.forEach(c => c.destroy());
      charts = [];

      const today = App.Utils.today();
      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
      const start = d30.toISOString().slice(0, 10);

      const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#5e5e78', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            ticks: { color: '#5e5e78', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      };



      if (tabId === 'analytics-training') {
        // 週別トレーニング回数（4週間）
        const allWorkouts = await App.DB.getWorkoutsRange(start, today);
        const weekData = [0, 0, 0, 0];
        allWorkouts.filter(w => w.type !== 'skip').forEach(w => {
          const diff = App.Utils.daysBetween(w.date, today);
          const weekIdx = Math.min(3, Math.floor(diff / 7));
          weekData[3 - weekIdx]++;
        });

        const ctxFreq = document.getElementById('chart-frequency');
        if (ctxFreq) {
          charts.push(new Chart(ctxFreq, {
            type: 'bar',
            data: {
              labels: ['3週前', '2週前', '先週', '今週'],
              datasets: [{
                data: weekData,
                backgroundColor: ['rgba(124,106,255,0.3)', 'rgba(124,106,255,0.4)', 'rgba(124,106,255,0.6)', 'rgba(124,106,255,0.9)'],
                borderRadius: 6
              }]
            },
            options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, beginAtZero: true, ticks: { ...chartDefaults.scales.y.ticks, stepSize: 1 } } } }
          }));
        }

        // 判定分布
        const judgments = await App.DB.getJudgmentRange(start, today);
        const dist = [0, 0, 0, 0, 0];
        judgments.forEach(j => {
          const idx = (j.userOverride || j.result) - 1;
          if (idx >= 0 && idx < 5) dist[idx]++;
        });

        const ctxJudge = document.getElementById('chart-judgment');
        if (ctxJudge && judgments.length > 0) {
          charts.push(new Chart(ctxJudge, {
            type: 'doughnut',
            data: {
              labels: App.Judgment.RESULT_LABELS.slice(1),
              datasets: [{
                data: dist,
                backgroundColor: ['#34d399', '#60a5fa', '#fbbf24', '#fb923c', '#9898b0']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { color: '#9898b0', font: { size: 11 }, padding: 12 } }
              }
            }
          }));
        }
      }

      if (tabId === 'analytics-health') {
        const health = await App.DB.getHealthRange(start, today);
        const sorted = health.sort((a,b) => a.date.localeCompare(b.date));

        // 睡眠
        const sleepData = sorted.filter(h => h.sleepMinutes);
        const ctxSleep = document.getElementById('chart-sleep');
        if (ctxSleep && sleepData.length > 0) {
          charts.push(new Chart(ctxSleep, {
            type: 'bar',
            data: {
              labels: sleepData.map(h => App.Utils.formatDateShort(h.date)),
              datasets: [{
                data: sleepData.map(h => +(h.sleepMinutes / 60).toFixed(1)),
                backgroundColor: sleepData.map(h => h.sleepMinutes < 360 ? 'rgba(248,113,113,0.6)' : 'rgba(96,165,250,0.6)'),
                borderRadius: 4
              }]
            },
            options: chartDefaults
          }));
        }

        // 歩数
        const stepsData = sorted.filter(h => h.steps);
        const ctxSteps = document.getElementById('chart-steps');
        if (ctxSteps && stepsData.length > 0) {
          charts.push(new Chart(ctxSteps, {
            type: 'bar',
            data: {
              labels: stepsData.map(h => App.Utils.formatDateShort(h.date)),
              datasets: [{
                data: stepsData.map(h => h.steps),
                backgroundColor: 'rgba(0,212,170,0.5)',
                borderRadius: 4
              }]
            },
            options: chartDefaults
          }));
        }
      }
    },

    destroy() {
      charts.forEach(c => c.destroy());
      charts = [];
    }
  };
})();
