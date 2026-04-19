// ============================================
// Steady — Database Layer (Dexie.js)
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};

  const db = new Dexie('SteadyDB');

  db.version(1).stores({
    workSchedules: '++id, &date, shiftType',
    workouts:      '++id, date, type, createdAt',
    exercises:     '++id, workoutId, name, orderIndex',
    healthRecords: '++id, &date, source',
    conditionRecords: '++id, &date',
    judgmentHistory:  '++id, &date, result',
    settings:      '&key',
    exerciseTemplates: '++id, name, category'
  });

  // ==========================================================
  // 起動時マイグレーション
  // ==========================================================
  // 目的: ローカルDBに残存する旧キー/旧値を正規キーに変換し、
  //       各所の互換吸収コードへの依存を移行レイヤーへ限定する。
  // 対象: healthconnect → health_connect,
  //       heartRate / avgHeartRate → heartRateAvg,
  //       restingHR → restingHeartRate
  // 撤去条件: schemaVersion >= 2 / settingsVersion >= 2 が全端末へ行き渡り、
  //           旧バックアップや旧ネイティブブリッジ入力が来なくなったら削除可能。
  // ==========================================================
  const CURRENT_SCHEMA_VERSION = 2;
  const CURRENT_SETTINGS_VERSION = 2;

  function readVersion(row, fallback = 0) {
    return row ? parseInt(row.value, 10) || fallback : fallback;
  }

  function normalizeHealthPayloadForMigration(health) {
    if (!health) return health;
    const normalized = { ...health };

    if (normalized.heartRate != null && normalized.heartRateAvg == null) {
      normalized.heartRateAvg = normalized.heartRate;
    }
    if (normalized.avgHeartRate != null && normalized.heartRateAvg == null) {
      normalized.heartRateAvg = normalized.avgHeartRate;
    }
    if (normalized.restingHR != null && normalized.restingHeartRate == null) {
      normalized.restingHeartRate = normalized.restingHR;
    }
    if (normalized.source === 'healthconnect') {
      normalized.source = 'health_connect';
    }

    delete normalized.heartRate;
    delete normalized.avgHeartRate;
    delete normalized.restingHR;
    return normalized;
  }

  async function normalizeLegacyLocalSettings(settingsTable) {
    const hpRow = await settingsTable.where('key').equals('healthProvider').first();
    if (hpRow && hpRow.value === 'healthconnect') {
      await settingsTable.put({ key: hpRow.key, value: 'health_connect' });
      console.log('[Migration] healthProvider: healthconnect → health_connect');
    }
  }

  async function normalizeLegacyHealthRecords(healthTable) {
    const records = await healthTable.toArray();
    let normalizedCount = 0;
    for (const record of records) {
      const normalized = normalizeHealthPayloadForMigration(record);
      if (JSON.stringify(record) !== JSON.stringify(normalized)) {
        await healthTable.put(normalized);
        normalizedCount++;
      }
    }
    if (normalizedCount > 0) {
      console.log(`[Migration] healthRecords: ${normalizedCount} records normalized`);
    }
  }

  async function runMigrations() {
    const raw = db;
    const settingsTable = raw.settings;
    const schemaRow = await settingsTable.where('key').equals('_schemaVersion').first();
    const settingsVersionRow = await settingsTable.where('key').equals('_settingsVersion').first();
    const currentSchemaVersion = readVersion(schemaRow);
    const currentSettingsVersion = readVersion(settingsVersionRow);

    if (currentSchemaVersion >= CURRENT_SCHEMA_VERSION &&
        currentSettingsVersion >= CURRENT_SETTINGS_VERSION) {
      return;
    }

    console.log(`[Migration] Running schema v${currentSchemaVersion} → v${CURRENT_SCHEMA_VERSION}, settings v${currentSettingsVersion} → v${CURRENT_SETTINGS_VERSION}...`);

    // ---- v0 → v1: 旧キー名の正規化 ----
    if (currentSchemaVersion < 1) {
      await normalizeLegacyLocalSettings(settingsTable);
      await normalizeLegacyHealthRecords(raw.healthRecords);
    }

    // ---- v1 → v2: shared/local 境界の正式化と互換出口の確立 ----
    if (currentSchemaVersion < 2 || currentSettingsVersion < 2) {
      await normalizeLegacyLocalSettings(settingsTable);
      await normalizeLegacyHealthRecords(raw.healthRecords);
    }

    // ---- migration完了マーカー ----
    await settingsTable.put({ key: '_schemaVersion', value: CURRENT_SCHEMA_VERSION });
    await settingsTable.put({ key: '_settingsVersion', value: CURRENT_SETTINGS_VERSION });
    console.log(`[Migration] Complete. schemaVersion = ${CURRENT_SCHEMA_VERSION}, settingsVersion = ${CURRENT_SETTINGS_VERSION}`);
  }

  // ---------- CRUD Helpers ----------

  const DB = {
    raw: db,

    // --- 勤務表 ---
    async getSchedule(date) {
      return db.workSchedules.where('date').equals(date).first();
    },

    async getScheduleRange(startDate, endDate) {
      return db.workSchedules.where('date').between(startDate, endDate, true, true).toArray();
    },

    async upsertSchedule(data) {
      const existing = await this.getSchedule(data.date);
      data.updatedAt = data.updatedAt || new Date().toISOString();
      if (existing) {
        await db.workSchedules.update(existing.id, data);
      } else {
        await db.workSchedules.add(data);
      }
      // ★ DB層ではPushしない。View層がpushToCloudを明示的にawaitすること。
      // _fromSync: リモートから来たデータはPush不要
    },

    async bulkUpsertSchedules(items) {
      const dates = new Set();
      for (const item of items) {
        await this.upsertSchedule({ ...item, _fromSync: true });
        dates.add(item.date);
      }
      // ★ 一括Push: Health Connectコールバック等で使用。
      // 　 月間スケジュールはView層がpushMonthSchedulesを使う。
    },

    // スケジュール削除（GAS経由 → 成功後にローカル削除）
    async deleteScheduleRemote(dateStr) {
      if (window.App?.Sync?.SheetSyncManager?.hasUrl()) {
        try {
          const res = await window.App.Sync.SheetSyncManager.pushData({
            action: 'deleteSchedule',
            date: dateStr,
            sourceDevice: window.SteadyBridge ? 'android' : 'pc'
          });
          if (!res.ok) {
            return { success: false, error: res.error || 'スプレッドシートへの削除送信に失敗しました' };
          }
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      await db.workSchedules.where('date').equals(dateStr).delete();
      return { success: true };
    },

    // --- ワークアウト ---
    async getWorkout(id) {
      return db.workouts.get(id);
    },

    async getWorkoutByDate(date) {
      return db.workouts.where('date').equals(date).first();
    },

    async getWorkouts(limit = 50) {
      return db.workouts.orderBy('date').reverse().limit(limit).toArray();
    },

    async getWorkoutsRange(startDate, endDate) {
      return db.workouts.where('date').between(startDate, endDate, true, true).toArray();
    },

    async saveWorkout(data, exercisesList) {
      let workoutId;
      data.updatedAt = new Date().toISOString();
      if (data.id) {
        await db.workouts.update(data.id, data);
        workoutId = data.id;
      } else {
        data.createdAt = data.updatedAt;
        workoutId = await db.workouts.add(data);
      }
      // exercises が渡された場合、同時にアトミック保存
      if (exercisesList && exercisesList.length > 0) {
        await db.exercises.where('workoutId').equals(workoutId).delete();
        const items = exercisesList.map((ex, i) => ({
          ...ex,
          workoutId,
          orderIndex: i
        }));
        await db.exercises.bulkAdd(items);
      }
      // ★ DB層ではPushしない。View層がpushToCloudを明示的にawaitすること。
      return workoutId;
    },

    // ワークアウト削除（GAS経由 → 成功後にローカル削除）
    async deleteWorkout(id) {
      const workout = await db.workouts.get(id);
      if (!workout) return { success: false, error: 'ワークアウトが見つかりません' };
      const dateStr = workout.date;
      if (window.App?.Sync?.SheetSyncManager?.hasUrl()) {
        try {
          const res = await window.App.Sync.SheetSyncManager.pushData({
            action: 'deleteWorkout',
            date: dateStr,
            sourceDevice: window.SteadyBridge ? 'android' : 'pc'
          });
          if (!res.ok) {
            return { success: false, error: res.error || 'スプレッドシートへの削除送信に失敗しました' };
          }
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      await db.exercises.where('workoutId').equals(id).delete();
      await db.workouts.delete(id);
      return { success: true };
    },

    // --- エクササイズ（ワークアウト内の種目） ---
    async getExercises(workoutId) {
      return db.exercises.where('workoutId').equals(workoutId).sortBy('orderIndex');
    },

    async saveExercises(workoutId, exerciseList) {
      await db.exercises.where('workoutId').equals(workoutId).delete();
      const items = exerciseList.map((ex, i) => ({
        ...ex,
        workoutId,
        orderIndex: i
      }));
      await db.exercises.bulkAdd(items);
      // ★ DB層ではPushしない。
    },

    // --- 健康データ ---
    async getHealth(date) {
      return db.healthRecords.where('date').equals(date).first();
    },

    async getHealthRange(startDate, endDate) {
      return db.healthRecords.where('date').between(startDate, endDate, true, true).toArray();
    },

    async upsertHealth(data) {
      // ━━ 移行レイヤー（互換コード） ━━━━━━━━━━━━━━━━━━━━
      // 何のため: 旧ローカルDB / 旧バックアップ / 旧ネイティブブリッジ入力を、
      //            ローカル保存前に正規キーへ寄せるための最終入口。
      // 吸収する旧キー: heartRate, avgHeartRate, restingHR, healthconnect
      // なぜ今は残すか: importAll 後や migration 未実行端末では旧値が入り得るため。
      // 新規保存: 現行フロントコードは heartRateAvg / restingHeartRate / health_connect のみを使用。
      // 撤去条件: schemaVersion >= 2 / settingsVersion >= 2 の端末だけになり、
      //            旧バックアップ・旧ブリッジ入力の受付を終了できたら削除可能。
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      data = normalizeHealthPayloadForMigration(data);

      const existing = await this.getHealth(data.date);
      data.updatedAt = new Date().toISOString();
      if (existing) {
        // nullで既存の有効な値を上書きしないよう、フィールド単位でマージ
        const merged = { ...existing };
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            merged[key] = value;
          }
        }
        await db.healthRecords.update(existing.id, merged);
      } else {
        await db.healthRecords.add(data);
      }
      // ★ DB層ではPushしない。View層がpushToCloudをawaitすること。
    },

    // --- 体調 ---
    async getCondition(date) {
      return db.conditionRecords.where('date').equals(date).first();
    },

    async getConditionRange(startDate, endDate) {
      return db.conditionRecords.where('date').between(startDate, endDate, true, true).toArray();
    },

    async upsertCondition(data) {
      const existing = await this.getCondition(data.date);
      data.updatedAt = new Date().toISOString();
      if (existing) {
        await db.conditionRecords.update(existing.id, { ...existing, ...data });
      } else {
        await db.conditionRecords.add(data);
      }
      // ★ DB層ではPushしない。
    },

    // --- 判定履歴 ---
    async getJudgment(date) {
      return db.judgmentHistory.where('date').equals(date).first();
    },

    async getJudgmentRange(startDate, endDate) {
      return db.judgmentHistory.where('date').between(startDate, endDate, true, true).toArray();
    },

    async upsertJudgment(data) {
      const existing = await this.getJudgment(data.date);
      data.updatedAt = new Date().toISOString();
      if (existing) {
        await db.judgmentHistory.update(existing.id, { ...existing, ...data });
      } else {
        await db.judgmentHistory.add(data);
      }
      // ★ DB層ではPushしない。
    },

    // --- 設定 ---
    async getSetting(key, defaultVal = null) {
      const row = await db.settings.get(key);
      return row ? row.value : defaultVal;
    },

    async setSetting(key, value) {
      return db.settings.put({ key, value });
    },

    async getAllSettings() {
      const rows = await db.settings.toArray();
      const obj = {};
      rows.forEach(r => obj[r.key] = r.value);
      return obj;
    },

    // --- テンプレート ---
    async getTemplates() {
      return db.exerciseTemplates.toArray();
    },

    async saveTemplate(data) {
      if (data.id) {
        return db.exerciseTemplates.update(data.id, data);
      }
      return db.exerciseTemplates.add(data);
    },

    // --- 前回のワークアウト取得 ---
    async getLastWorkout() {
      return db.workouts.orderBy('date').reverse().first();
    },

    async getExerciseHistoryByName(name, beforeDate = null, limit = 8) {
      const query = beforeDate
        ? db.workouts.where('date').below(beforeDate).reverse()
        : db.workouts.orderBy('date').reverse();
      const workouts = await query.limit(Math.max(limit * 3, 20)).toArray();
      const history = [];

      for (const w of workouts) {
        if (w.type === 'skip') continue;
        const exs = await db.exercises.where('workoutId').equals(w.id).sortBy('orderIndex');
        const found = exs.find(e => e.name === name);
        if (!found) continue;

        const sortedSets = Array.isArray(found.sets)
          ? [...found.sets].sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0))
          : [];
        history.push({
          ...found,
          sets: sortedSets,
          workoutDate: w.date,
          workoutType: w.type || 'full',
          workoutFeeling: w.feeling ?? null
        });
        if (history.length >= limit) break;
      }

      return history;
    },

    async getLastExerciseByName(name, beforeDate = null) {
      const history = await this.getExerciseHistoryByName(name, beforeDate, 8);
      if (!history.length) return null;

      const lastFound = { ...history[0] };
      let successStreak = 0;
      for (const item of history) {
        const sets = Array.isArray(item.sets) ? item.sets : [];
        const allCompleted = sets.length > 0 && sets.every(s => s.completed);
        if (!allCompleted || item.workoutType !== 'full') break;
        successStreak++;
      }
      lastFound.successStreak = successStreak;
      return lastFound;
    },

    // --- 統計 ---
    async getWorkoutCountInRange(startDate, endDate) {
      return db.workouts.where('date').between(startDate, endDate, true, true).count();
    },

    async getConsecutiveTrainingDays(fromDate) {
      let count = 0;
      let d = new Date(fromDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      while (true) {
        const dateStr = App.Utils._localDateStr(d);
        const w = await db.workouts.where('date').equals(dateStr).first();
        if (!w) break;
        count++;
        d.setDate(d.getDate() - 1);
        if (count > 30) break;
      }
      return count;
    },

    async getDaysSinceLastWorkout(fromDate) {
      const last = await db.workouts.where('date').below(fromDate).reverse().first();
      if (!last) return 999;
      return App.Utils.daysBetween(last.date, fromDate);
    },

    // --- Sync Helper ---
    async getDateSyncData(dateStr) {
      const schedule = await this.getSchedule(dateStr);
      const workout = await db.workouts.where('date').equals(dateStr).first();
      const exercises = workout ? await db.exercises.where('workoutId').equals(workout.id).sortBy('orderIndex') : [];
      const health = await this.getHealth(dateStr);
      const condition = await this.getCondition(dateStr);
      const judgment = await this.getJudgment(dateStr);
      
      const dates = [
        schedule?.updatedAt, workout?.updatedAt, health?.updatedAt, condition?.updatedAt, judgment?.updatedAt
      ].filter(d => d).map(d => { const t = new Date(String(d)).getTime(); return isNaN(t) ? 0 : t; }).filter(t => t > 0);
      const maxUpdate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : '';

      // ローカルに保存している revision を取得（conflict検出用）
      const revision = await this.getSetting(`_rev_${dateStr}`, 0);

      return {
        date: dateStr,
        updatedAt: maxUpdate,
        _revision: parseInt(revision) || 0,
        schedule,
        workout,
        exercises,
        health,
        condition,
        judgment
      };
    },

    async putDateSync(data) {
      await db.transaction('rw', db.workSchedules, db.workouts, db.exercises, db.healthRecords, db.conditionRecords, db.judgmentHistory, async () => {
        if (data.schedule) {
          const s = { ...data.schedule, _fromSync: true };
          delete s.id;
          await this.upsertSchedule(s);
        }
        if (data.workout) {
          const existing = await db.workouts.where('date').equals(data.date).first();
          let workoutId = existing ? existing.id : null;
          const w = { ...data.workout };
          delete w.id;
          if (existing) {
            await db.workouts.update(existing.id, w);
          } else {
            workoutId = await db.workouts.add(w);
          }
          if (data.exercises && data.exercises.length > 0 && workoutId) {
            await db.exercises.where('workoutId').equals(workoutId).delete();
            const exs = data.exercises.map((e, index) => {
              const ex = { ...e, workoutId };
              delete ex.id;
              ex.orderIndex = index;
              return ex;
            });
            await db.exercises.bulkAdd(exs);
          }
        }
        if (data.health) {
          const h = { ...data.health, _fromSync: true };
          delete h.id;
          await this.upsertHealth(h);
        }
        if (data.condition) {
          const c = { ...data.condition, _fromSync: true };
          delete c.id;
          await this.upsertCondition(c);
        }
        if (data.judgment) {
          const j = { ...data.judgment, _fromSync: true };
          delete j.id;
          await this.upsertJudgment(j);
        }
      });
    },

    // ============ Cloud Push ============


    /**
     * 即時クラウドPush（UI操作の保存後に使用。結果を返す。）
     * @param {string} dateStr - 対象日
     * @returns {{ ok: boolean, conflict?: boolean, error?: string }}
     */
    async pushToCloud(dateStr) {
      if (!window.App?.Sync?.SheetSyncManager?.hasUrl()) {
        return { ok: false, error: 'Sync URL未設定' };
      }

      const isOnline = window.SteadyBridge || navigator.onLine;
      if (!isOnline) {
        await this.addPendingDate(dateStr);
        return { ok: false, error: 'オフライン' };
      }

      try {
        const data = await this.getDateSyncData(dateStr);
        data.sourceDevice = window.SteadyBridge ? 'android' : 'pc';
        const res = await window.App.Sync.SheetSyncManager.pushData(data);
        if (res.ok) {
          await this.removePendingDate(dateStr);
          await this.setSetting('_lastSyncAt', new Date().toISOString());
          console.log(`[Sync] Pushed (immediate): ${dateStr}`);
          return { ok: true };
        } else if (res.conflict) {
          // 競合: サーバーから最新リビジョンを取得して自動リトライ
          console.warn(`[Sync] Conflict for ${dateStr}, auto-resolving...`);
          try {
            await window.App.Sync.SheetSyncManager.syncAll();
            // リビジョンが更新されたので再送
            const data2 = await this.getDateSyncData(dateStr);
            data2.sourceDevice = window.SteadyBridge ? 'android' : 'pc';
            const res2 = await window.App.Sync.SheetSyncManager.pushData(data2);
            if (res2.ok) {
              await this.removePendingDate(dateStr);
              await this.setSetting('_lastSyncAt', new Date().toISOString());
              console.log(`[Sync] Conflict auto-resolved for ${dateStr}`);
              App.Utils?.showToast?.('同期しました', 'success');
              return { ok: true };
            }
          } catch (retryErr) {
            console.error('[Sync] Auto-resolve failed:', retryErr);
          }
          App.Utils?.showToast?.('⚠️ データ競合: 再同期してください', 'warning');
          return { ok: false, conflict: true, error: res.error };
        } else {
          await this.addPendingDate(dateStr);
          return { ok: false, error: res.error || '送信失敗' };
        }
      } catch (e) {
        await this.addPendingDate(dateStr);
        return { ok: false, error: e.message };
      }
    },


    // 未送信キューの再送
    async retryPendingQueue() {
      const dates = await this.getPendingDates();
      const summary = {
        attempted: dates.length,
        sent: 0,
        failed: 0,
        remaining: dates.length
      };
      if (dates.length === 0) return summary;

      console.log(`[Sync] Retrying ${dates.length} pending items...`);
      for (const dateStr of dates) {
        try {
          const data = await this.getDateSyncData(dateStr);
          data.sourceDevice = window.SteadyBridge ? 'android' : 'pc';
          const res = await window.App.Sync.SheetSyncManager.pushData(data);
          if (res.ok) {
            await this.removePendingDate(dateStr);
            await this.setSetting('_lastSyncAt', new Date().toISOString());
            summary.sent++;
          } else {
            summary.failed++;
            console.error(`[Sync] Retry rejected for ${dateStr}: ${res.error}`);
          }
        } catch (e) {
          summary.failed++;
          console.error(`[Sync] Retry failed for ${dateStr}:`, e);
        }
      }

      summary.remaining = await this.getPendingCount();
      return summary;
    },

    // 月間スケジュール一括Push
    async pushMonthSchedules(year, month) {
      if (!window.App?.Sync?.SheetSyncManager?.hasUrl()) {
        return { success: false, error: 'Sync URLが未設定です' };
      }
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const schedules = await this.getScheduleRange(startDate, endDate);

      if (schedules.length === 0) {
        return { success: false, error: 'スケジュールが未登録です' };
      }

      const payload = {
        action: 'bulkSchedule',
        year,
        month,
        sourceDevice: window.SteadyBridge ? 'android' : 'pc',
        schedules: schedules.map(s => ({
          date: s.date,
          shiftType: s.shiftType,
          startTime: s.startTime || '',
          endTime: s.endTime || '',
          note: s.note || ''
        }))
      };

      try {
        const res = await window.App.Sync.SheetSyncManager.pushData(payload);
        if (res.ok) {
          await this.setSetting('_lastSyncAt', new Date().toISOString());
          console.log(`[Sync] Bulk schedule pushed: ${year}/${month} (${schedules.length}件)`);
          return { success: true, count: schedules.length };
        }
        return { success: false, error: res.error || '送信に失敗しました' };
      } catch (e) {
        console.error('[Sync] Bulk schedule push error:', e);
        return { success: false, error: e.message };
      }
    },

    // --- Export / Import ---
    async exportAll() {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        workSchedules: await db.workSchedules.toArray(),
        workouts: await db.workouts.toArray(),
        exercises: await db.exercises.toArray(),
        healthRecords: await db.healthRecords.toArray(),
        conditionRecords: await db.conditionRecords.toArray(),
        judgmentHistory: await db.judgmentHistory.toArray(),
        settings: await db.settings.toArray(),
        exerciseTemplates: await db.exerciseTemplates.toArray()
      };
    },

    async importAll(data) {
      await db.transaction('rw',
        db.workSchedules, db.workouts, db.exercises,
        db.healthRecords, db.conditionRecords, db.judgmentHistory,
        db.settings, db.exerciseTemplates,
        async () => {
          if (data.workSchedules) {
            await db.workSchedules.clear();
            await db.workSchedules.bulkAdd(data.workSchedules.map(r => { delete r.id; return r; }));
          }
          if (data.workouts) {
            await db.workouts.clear();
            await db.workouts.bulkAdd(data.workouts.map(r => { delete r.id; return r; }));
          }
          if (data.exercises) {
            await db.exercises.clear();
            await db.exercises.bulkAdd(data.exercises.map(r => { delete r.id; return r; }));
          }
          if (data.healthRecords) {
            await db.healthRecords.clear();
            await db.healthRecords.bulkAdd(data.healthRecords.map(r => { delete r.id; return r; }));
          }
          if (data.conditionRecords) {
            await db.conditionRecords.clear();
            await db.conditionRecords.bulkAdd(data.conditionRecords.map(r => { delete r.id; return r; }));
          }
          if (data.judgmentHistory) {
            await db.judgmentHistory.clear();
            await db.judgmentHistory.bulkAdd(data.judgmentHistory.map(r => { delete r.id; return r; }));
          }
          if (data.settings) {
            await db.settings.clear();
            await db.settings.bulkAdd(data.settings);
          }
          if (data.exerciseTemplates) {
            await db.exerciseTemplates.clear();
            await db.exerciseTemplates.bulkAdd(data.exerciseTemplates.map(r => { delete r.id; return r; }));
          }
        });
      // 旧バックアップを読み込んだ直後に正規キーへ寄せ、毎回の fallback 依存を避ける。
      await runMigrations();
    },

    async clearAll() {
      await Promise.all([
        db.workSchedules.clear(),
        db.workouts.clear(),
        db.exercises.clear(),
        db.healthRecords.clear(),
        db.conditionRecords.clear(),
        db.judgmentHistory.clear(),
        db.settings.clear(),
        db.exerciseTemplates.clear()
      ]);
    },

    // --- 未送信キュー ---
    async getPendingCount() {
      try {
        const pending = await this.getSetting('_pendingDates', '');
        if (!pending) return 0;
        const dates = JSON.parse(pending);
        return Array.isArray(dates) ? dates.length : 0;
      } catch(e) {
        return 0;
      }
    },

    async addPendingDate(dateStr) {
      try {
        const pending = await this.getSetting('_pendingDates', '[]');
        const dates = JSON.parse(pending);
        if (!dates.includes(dateStr)) dates.push(dateStr);
        await this.setSetting('_pendingDates', JSON.stringify(dates));
      } catch(e) {}
    },

    async removePendingDate(dateStr) {
      try {
        const pending = await this.getSetting('_pendingDates', '[]');
        const dates = JSON.parse(pending).filter(d => d !== dateStr);
        await this.setSetting('_pendingDates', JSON.stringify(dates));
      } catch(e) {}
    },

    async getPendingDates() {
      try {
        const pending = await this.getSetting('_pendingDates', '[]');
        return JSON.parse(pending);
      } catch(e) {
        return [];
      }
    }
  };

  App.DB = DB;
  App.DB.runMigrations = runMigrations;
})();
