// ============================================
// Steady — Health Data Provider 基底クラス
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Providers = App.Providers || {};

  /**
   * 健康データプロバイダーの基底インターフェース
   * すべてのプロバイダーはこのクラスを継承する
   */
  class BaseProvider {
    constructor(name) {
      this.name = name;
      this._status = 'disconnected'; // connected | disconnected | error | permission_denied
    }

    /** プロバイダー名 */
    getName() { return this.name; }

    /** 接続状態 */
    getStatus() { return this._status; }

    /** 状態ラベル（日本語） */
    getStatusLabel() {
      const labels = {
        connected: '連携済み',
        disconnected: '未連携',
        error: '取得失敗',
        permission_denied: '権限不足',
        manual: '手入力'
      };
      return labels[this._status] || this._status;
    }

    // --- 以下は各プロバイダーで実装 ---
    async initialize() { return false; }
    async getSteps(date) { return null; }
    async getSleep(date) { return null; } // 分単位
    async getHeartRate(date) { return null; }
    async getRestingHR(date) { return null; }
    async getCalories(date) { return null; }
    async getActiveMinutes(date) { return null; }
    async getWeight(date) { return null; }
    async getStressLevel(date) { return null; }

    /** まとめて取得（歩数・睡眠のみ） */
    async getAllData(date) {
      const [steps, sleep] = await Promise.all([
        this.getSteps(date),
        this.getSleep(date)
      ]);

      return {
        source: this.name,
        date,
        steps,
        sleepMinutes: sleep
      };
    }
  }

  App.Providers.BaseProvider = BaseProvider;
})();
