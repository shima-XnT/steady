// ============================================
// Steady — ManualProvider（手入力プロバイダー）
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Providers = App.Providers || {};

  class ManualProvider extends App.Providers.BaseProvider {
    constructor() {
      super('manual');
      this._status = 'manual';
    }

    async initialize() {
      this._status = 'manual';
      return true;
    }

    // 手入力データはDBから取得
    async getSteps(date) {
      const r = await App.DB.getHealth(date);
      return r ? r.steps : null;
    }

    async getSleep(date) {
      const r = await App.DB.getHealth(date);
      return r ? r.sleepMinutes : null;
    }

    async getHeartRate(date) {
      const r = await App.DB.getHealth(date);
      return r ? (r.heartRateAvg ?? null) : null;
    }

    async getRestingHR(date) {
      const r = await App.DB.getHealth(date);
      return r ? r.restingHeartRate : null;
    }

    async getCalories(date) {
      const r = await App.DB.getHealth(date);
      return r ? r.calories : null;
    }

    async getActiveMinutes(date) {
      const r = await App.DB.getHealth(date);
      return r ? r.activeMinutes : null;
    }

    async getWeight(date) {
      const r = await App.DB.getHealth(date);
      return r ? r.weight : null;
    }

    async getStressLevel(date) {
      const r = await App.DB.getHealth(date);
      return r ? r.stressLevel : null;
    }
  }

  App.Providers.ManualProvider = ManualProvider;
})();
