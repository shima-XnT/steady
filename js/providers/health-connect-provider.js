// ============================================
// Steady — HealthConnectProvider（将来拡張用スタブ）
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Providers = App.Providers || {};

  /**
   * Health Connect プロバイダー
   * Android ネイティブ層 (SteadyBridge) 経由で歩数・睡眠データを取得する
   */
  class HealthConnectProvider extends App.Providers.BaseProvider {
    constructor() {
      super('health_connect');
      this._fallback = new App.Providers.ManualProvider();
      this._hasBridge = !!window.SteadyBridge;
      this._status = this._hasBridge ? 'disconnected' : 'manual';
    }

    async initialize() {
      if (!this._hasBridge) {
        console.log('[HealthConnect] Android Bridge not found. Falling back to Manual.');
        return this._fallback.initialize();
      }

      const status = window.SteadyBridge.getConnectionStatus();
      this._status = status;
      console.log(`[HealthConnect] Bridge found. Status: ${status}`);
      return status === 'connected';
    }

    /** ネイティブBridgeからデータを取得 */
    async _fetchFromBridge(dateStr) {
      if (!this._hasBridge || this._status !== 'connected') return null;
      try {
        const jsonStr = window.SteadyBridge.getHealthData(dateStr);
        return JSON.parse(jsonStr);
      } catch (e) {
        console.error('[HealthConnect] Error parsing bridge data:', e);
        return null;
      }
    }

    async getSnapshot(dateStr) {
      const data = await this._fetchFromBridge(dateStr);
      if (!data) return null;
      return {
        date: dateStr,
        source: 'health_connect',
        fetchedAt: data.fetchedAt || new Date().toISOString(),
        steps: data.steps ?? null,
        sleepMinutes: data.sleepMinutes ?? null,
        heartRateAvg: data.heartRateAvg ?? null,
        restingHeartRate: data.restingHeartRate ?? null
      };
    }

    async getSteps(d) {
      const data = await this._fetchFromBridge(d);
      return data?.steps ?? await this._fallback.getSteps(d);
    }

    async getSleep(d) {
      const data = await this._fetchFromBridge(d);
      return data?.sleepMinutes ?? await this._fallback.getSleep(d);
    }

    async getHeartRate(d) {
      const data = await this._fetchFromBridge(d);
      return data?.heartRateAvg ?? await this._fallback.getHeartRate(d);
    }

    async getRestingHR(d) {
      const data = await this._fetchFromBridge(d);
      return data?.restingHeartRate ?? await this._fallback.getRestingHR(d);
    }

    async getCalories(d) { return this._fallback.getCalories(d); }
    async getActiveMinutes(d) { return this._fallback.getActiveMinutes(d); }
    async getWeight(d) { return this._fallback.getWeight(d); }
    async getStressLevel(d) { return this._fallback.getStressLevel(d); }

    /** 手動同期（設定画面などから呼ばれる） */
    triggerSync(dateStr) {
      if (this._hasBridge) {
        window.SteadyBridge.syncHealthData(dateStr);
      }
    }

    /** 権限要求（設定画面から） */
    requestPermissions() {
        if (this._hasBridge) {
            window.SteadyBridge.requestPermissions();
        }
    }
  }

  // ネイティブからのコールバックリスナーをグローバルに登録
  window.App = window.App || {};
  window.App.onHealthDataUpdated = async (dateStr) => {
    console.log(`[HealthConnect] Native notify sync complete for ${dateStr}`);

    try {
      if (!(App.healthProvider && App.healthProvider.name === 'health_connect')) {
        return;
      }

      const snapshot = await App.healthProvider.getSnapshot(dateStr);
      const fetchedAt = snapshot?.fetchedAt || new Date().toISOString();
      const hasHealthData = snapshot && (
        snapshot.steps != null ||
        snapshot.sleepMinutes != null ||
        snapshot.heartRateAvg != null ||
        snapshot.restingHeartRate != null
      );

      if (!hasHealthData) {
        await App.Utils.rememberHealthFetchOnly({
          dateStr,
          fetchedAt,
          source: 'health_connect',
          label: '未取得',
          detail: '今日の値はまだ取得できていません。'
        });
        App.Utils.showToast('未取得', 'warning');
        return;
      }

      const healthData = {
        date: dateStr,
        source: 'health_connect',
        fetchedAt
      };
      if (snapshot.steps != null) healthData.steps = snapshot.steps;
      if (snapshot.sleepMinutes != null) healthData.sleepMinutes = snapshot.sleepMinutes;
      if (snapshot.heartRateAvg != null) healthData.heartRateAvg = snapshot.heartRateAvg;
      if (snapshot.restingHeartRate != null) healthData.restingHeartRate = snapshot.restingHeartRate;

      await App.DB.upsertHealth(healthData);

      const pushResult = await App.DB.pushToCloud(dateStr, { sections: ['health'] });
      await App.Utils.rememberHealthPushResult(pushResult, {
        dateStr,
        fetchedAt,
        source: 'health_connect'
      });
      await App.Utils.showSharedSaveResult(pushResult, {
        subject: '健康データ',
        successMessage: '同期しました',
        warningMessage: '未送信',
        errorPrefix: '同期に失敗しました'
      });
    } catch (error) {
      console.error('[HealthConnect] Sync callback failed:', error);
      await App.Utils.rememberHealthFetchOnly({
        dateStr,
        fetchedAt: new Date().toISOString(),
        source: 'health_connect',
        label: '同期失敗',
        detail: error.message || '同期エラー'
      });
      App.Utils.showToast(`同期に失敗しました: ${error.message}`, 'error');
    } finally {
      await App.refreshView();
    }
  };
  
  window.App.onHealthBridgeError = (errorType) => {
      console.error(`[HealthConnect] Bridge error: ${errorType}`);
      if (errorType === 'permission_denied') {
          App.Utils.showToast('健康データの読み取り権限がありません。設定から許可してください。', 'warning', 5000);
      } else {
          App.Utils.showToast('同期エラーが発生しました', 'error');
      }
  };

  App.Providers.HealthConnectProvider = HealthConnectProvider;
})();
