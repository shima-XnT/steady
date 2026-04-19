// ============================================
// Steady — オンボーディング画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  let currentStep = 0;
  const TOTAL_STEPS = 3;

  App.Views.Onboarding = {
    async render() {
      currentStep = 0;
      return `
        <div class="onboarding" id="onboarding-container">
          <div class="logo-text">からだログ</div>
          <div class="tagline">勤務と体調から今日を整える</div>

          <div class="step-indicator" id="step-indicator">
            ${Array.from({length: TOTAL_STEPS}, (_, i) => `
              <div class="step-dot ${i === 0 ? 'active' : ''}"></div>`).join('')}
          </div>

          <div class="onboarding-step" id="onboarding-step">
            ${this._renderStep(0)}
          </div>
        </div>`;
    },

    _renderStep(step) {
      switch(step) {
        case 0:
          return `
            <div class="text-center animate-fade">
              <div style="font-size:4rem;margin-bottom:24px;">🏋️</div>
              <h2 style="margin-bottom:12px;">ようこそ！</h2>
              <p class="text-secondary" style="line-height:1.7;margin-bottom:32px;">
                からだログは、仕事終わりの遅い時間でも<br>
                無理なく続けられるフィットネスコーチです。<br><br>
                「今日は行くべき？」を自動で判断し<br>
                チョコザップの機材に合わせた<br>
                メニューを提案します。
              </p>
              <button class="btn btn-primary btn-lg" onclick="App.Views.Onboarding.nextStep()">
                はじめる →
              </button>
            </div>`;

        case 1:
          return `
            <div class="text-center animate-fade">
              <div style="font-size:4rem;margin-bottom:24px;">📅</div>
              <h2 style="margin-bottom:12px;">使い方</h2>
              <div style="text-align:left;max-width:320px;margin:0 auto;line-height:1.8;">
                <p class="text-sm">
                  <strong>① シフトを入力</strong><br>
                  <span class="text-muted">月間スケジュールを登録</span>
                </p>
                <p class="text-sm mt-12">
                  <strong>② 毎日体調をチェック</strong><br>
                  <span class="text-muted">疲労感・睡眠・やる気を入力</span>
                </p>
                <p class="text-sm mt-12">
                  <strong>③ 今日のおすすめを確認</strong><br>
                  <span class="text-muted">行く・軽く・休むを自動判定</span>
                </p>
                <p class="text-sm mt-12">
                  <strong>④ トレーニングして記録</strong><br>
                  <span class="text-muted">簡単操作で記録が残ります</span>
                </p>
              </div>
              <div class="mt-24">
                <button class="btn btn-primary btn-lg" onclick="App.Views.Onboarding.nextStep()">
                  次へ →
                </button>
              </div>
            </div>`;

        case 2:
          return `
            <div class="text-center animate-fade">
              <div style="font-size:4rem;margin-bottom:24px;">🌙</div>
              <h2 style="margin-bottom:12px;">大切にしていること</h2>
              <div style="max-width:320px;margin:0 auto;text-align:left;line-height:1.8;">
                <div class="text-sm mb-12">
                  <span style="color:var(--success);">✓</span> 
                  <strong>無理しない</strong>
                  <span class="text-muted"> — 休む判断も継続の一部</span>
                </div>
                <div class="text-sm mb-12">
                  <span style="color:var(--success);">✓</span> 
                  <strong>少しずつ成長</strong>
                  <span class="text-muted"> — 急がず、着実に</span>
                </div>
                <div class="text-sm mb-12">
                  <span style="color:var(--success);">✓</span> 
                  <strong>続けることが最優先</strong>
                  <span class="text-muted"> — 完璧を求めない</span>
                </div>
                <div class="text-sm mb-12">
                  <span style="color:var(--success);">✓</span> 
                  <strong>あなたのペースで</strong>
                  <span class="text-muted"> — マイペースが一番</span>
                </div>
              </div>
              <div class="mt-24">
                <button class="btn btn-primary btn-lg" onclick="App.Views.Onboarding.finish()">
                  🚀 はじめましょう！
                </button>
              </div>
            </div>`;
      }
    },

    nextStep() {
      currentStep++;
      if (currentStep >= TOTAL_STEPS) {
        this.finish();
        return;
      }
      this._updateUI();
    },

    _updateUI() {
      document.getElementById('onboarding-step').innerHTML = this._renderStep(currentStep);
      const dots = document.querySelectorAll('.step-dot');
      dots.forEach((dot, i) => {
        dot.className = 'step-dot';
        if (i < currentStep) dot.classList.add('done');
        if (i === currentStep) dot.classList.add('active');
      });
    },

    async finish() {
      await App.DB.setSetting('onboardingDone', true);
      App.navigate('home');
    },

    init() {},
    destroy() {}
  };
})();
