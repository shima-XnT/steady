(function() {
  'use strict';
  window.App = window.App || {};
  window.App.Sync = window.App.Sync || {};

  const SheetSyncManager = {
    _url: null,

    // 安全なタイムスタンプ変換（Invalid time value 防止）
    _safeTs(v) {
      if (!v) return 0;
      const t = new Date(String(v)).getTime();
      return isNaN(t) ? 0 : t;
    },

    _num(v, fallback = 0) {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    },

    _exerciseSignature(exercises) {
      const list = Array.isArray(exercises) ? exercises : [];
      return JSON.stringify(list.map(ex => {
        const isCardio = !!(ex?.isCardio || ex?.durationMin);
        const sets = Array.isArray(ex?.sets) ? ex.sets : [];
        return {
          name: ex?.name || '',
          isCardio,
          durationMin: isCardio ? this._num(ex?.durationMin, 0) : 0,
          speed: isCardio ? this._num(ex?.speed, 5) : 0,
          setCount: sets.length,
          recommendedSets: this._num(ex?.recommended?.sets, 0),
          sets: sets.map(set => ({
            setNumber: this._num(set?.setNumber, 0),
            weight: this._num(set?.weight, 0),
            reps: this._num(set?.reps, 0),
            completed: !!set?.completed
          }))
        };
      }));
    },

    _hasRemoteExerciseChange(remoteExercises, localExercises) {
      if (!Array.isArray(remoteExercises) || remoteExercises.length === 0) return false;
      return this._exerciseSignature(remoteExercises) !== this._exerciseSignature(localExercises);
    },

    init(url) {
      this._url = url;
    },

    hasUrl() {
      return !!this._url && this._url.trim() !== '';
    },

    // 内部: 通信ラッパー（AndroidのCORS制約を回避するためNative Bridgeを使用する）
    async _fetchCORSFree(url, method, body = null) {
      if (window.SteadyBridge && window.SteadyBridge.fetchUrl) {
        const bodyStr = body ? JSON.stringify(body) : "";
        const responseJsonStr = window.SteadyBridge.fetchUrl(url, method, bodyStr);
        try {
          return JSON.parse(responseJsonStr);
        } catch (e) {
          throw new Error('Native fetch JSON parse error: ' + responseJsonStr);
        }
      } else {
        const options = {
          method: method,
          headers: method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : {}
        };
        if (body) {
          options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
      }
    },

    /**
     * GASにデータを送信する
     * @returns {{ ok: boolean, conflict?: boolean, error?: string }}
     */
    async pushData(data) {
      if (!this.hasUrl()) return { ok: false, error: 'Sync URL未設定' };
      try {
        const result = await this._fetchCORSFree(this._url, 'POST', data);
        console.log('[Sync] Push response:', JSON.stringify(result).substring(0, 200));
        if (result.status === 'success') {
          return { ok: true };
        } else if (result.message && result.message.includes('CONFLICT')) {
          console.warn('[Sync] Conflict detected:', result.message);
          return { ok: false, conflict: true, error: result.message };
        } else {
          console.error('[Sync] Push rejected by server:', result.message || result);
          return { ok: false, error: result.message || '送信がサーバーに拒否されました' };
        }
      } catch (e) {
        console.error('[Sync] Push error:', e.message);
        return { ok: false, error: e.message };
      }
    },

    // GASからすべてのデータを取得してローカルにマージする
    async syncAll() {
      if (!this.hasUrl()) {
        return { success: false, error: 'URL is not set' };
      }
      try {
        console.log('Downloading data from GAS...');
        let result = await this._fetchCORSFree(this._url, 'POST', { action: 'getAll' });
        if (!(result && result.status === 'success' && result.data)) {
          result = await this._fetchCORSFree(`${this._url}?action=getAll`, 'GET');
        }
        
        if (result && result.status === 'success' && result.data) {
          const hasNewData = await this._mergeToLocal(result.data);
          return { success: true, hasNewData };
        }
        return { success: false, error: result?.message || 'サーバーからエラーが返されました。' };
      } catch (e) {
        console.error('GAS Sync Pull Error:', e);
        return { success: false, error: e.message };
      }
    },

    // ダウンロードしたデータをIndexedDBとマージする。更新があった場合trueを返す
    async _mergeToLocal(remoteItems) {
      let updatedSomething = false;
      for (const remoteData of remoteItems) {
        // 設定データの復元
        if (remoteData.date === '_settings' && remoteData.settings) {
          const localSettingsUpdatedAt = await window.App.DB.getSetting('_settingsUpdatedAt', '');
          const localTs = this._safeTs(localSettingsUpdatedAt);
          const remoteTs = this._safeTs(remoteData.updatedAt);
          const isRemoteSignificantlyNewer = !localSettingsUpdatedAt || 
            (remoteData.updatedAt && (remoteTs - localTs) > 5000);
          if (isRemoteSignificantlyNewer) {
            console.log('[Settings Sync] Updating local settings from remote. diff=' + (remoteTs - localTs) + 'ms');
            for (const [key, value] of Object.entries(remoteData.settings)) {
              if (key === 'gasSyncUrl') continue; // 端末ローカル設定はスキップ
              await window.App.DB.setSetting(key, value);
            }
            await window.App.DB.setSetting('_settingsUpdatedAt', remoteData.updatedAt);
            updatedSomething = true;
          }
          continue;
        }

        // tombstone: 他端末での削除を反映
        if (remoteData._deleted && Array.isArray(remoteData._deleted)) {
          for (const delType of remoteData._deleted) {
            console.log(`[Sync] Tombstone: deleting ${delType} for ${remoteData.date}`);
            if (delType === 'workout') {
              const w = await window.App.DB.raw.workouts.where('date').equals(remoteData.date).first();
              if (w) {
                await window.App.DB.raw.exercises.where('workoutId').equals(w.id).delete();
                await window.App.DB.raw.workouts.delete(w.id);
                updatedSomething = true;
              }
            } else if (delType === 'schedule') {
              await window.App.DB.raw.workSchedules.where('date').equals(remoteData.date).delete();
              updatedSomething = true;
            }
          }
          // tombstoneのみのデータはスキップ
          if (!remoteData.schedule && !remoteData.health && !remoteData.condition && !remoteData.workout) {
            continue;
          }
        }

        // Apps Script 側が正規化済みの正規キーだけを返す前提でマージする。

        // ★ revision をローカルに保存（conflict検出用）
        if (remoteData._revision != null) {
          await window.App.DB.setSetting(`_rev_${remoteData.date}`, remoteData._revision);
        }
        // schedule/health 個別 revision
        if (remoteData.schedule?._revision != null) {
          await window.App.DB.setSetting(`_rev_sched_${remoteData.date}`, remoteData.schedule._revision);
        }
        if (remoteData.health?._revision != null) {
          await window.App.DB.setSetting(`_rev_health_${remoteData.date}`, remoteData.health._revision);
        }

        const localData = await window.App.DB.getDateSyncData(remoteData.date);
        
        // リモートのほうが新しい → 全上書き
        const remoteNewer = !localData || !localData.updatedAt || 
          (remoteData.updatedAt && this._safeTs(remoteData.updatedAt) > this._safeTs(localData.updatedAt));
        
        // ローカルにデータが欠落している場合も補完する
        const hasLocalGap = localData && (
          (remoteData.schedule && !localData.schedule) ||
          (remoteData.condition && !localData.condition) ||
          (remoteData.health && !localData.health) ||
          (remoteData.workout && !localData.workout)
        );

        // ヘルスデータのフィールドレベルギャップ検出
        const hasHealthFieldGap = localData && localData.health && remoteData.health && (
          (remoteData.health.sleepMinutes != null && localData.health.sleepMinutes == null) ||
          (remoteData.health.sleepStartAt != null && localData.health.sleepStartAt == null) ||
          (remoteData.health.sleepEndAt != null && localData.health.sleepEndAt == null) ||
          (remoteData.health.steps != null && localData.health.steps == null) ||
          (remoteData.health.heartRateAvg != null && localData.health.heartRateAvg == null) ||
          (remoteData.health.restingHeartRate != null && localData.health.restingHeartRate == null)
        );
        const hasExerciseChange = localData && Array.isArray(remoteData.exercises) && remoteData.exercises.length > 0 && (
          !Array.isArray(localData.exercises) ||
          localData.exercises.length < remoteData.exercises.length ||
          localData.exercises.some((ex, index) => {
            const remoteExercise = remoteData.exercises[index] || {};
            return !Array.isArray(ex.sets) ||
              ex.sets.length === 0 ||
              (remoteExercise.recommended?.sets != null && ex.recommended?.sets == null);
          }) ||
          this._hasRemoteExerciseChange(remoteData.exercises, localData.exercises)
        );

        if (remoteNewer || hasLocalGap || hasHealthFieldGap || hasExerciseChange) {
          console.log(`Updating local data for ${remoteData.date} from remote. (newer=${remoteNewer}, gap=${hasLocalGap}, healthGap=${hasHealthFieldGap}, exerciseChange=${hasExerciseChange})`);
          remoteData._fromSync = true; 
          await window.App.DB.putDateSync(remoteData);
          updatedSomething = true;
        }
      }
      return updatedSomething;
    }
  };

  window.App.Sync.SheetSyncManager = SheetSyncManager;
})();
