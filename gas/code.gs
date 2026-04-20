/**
 * Steady - GAS Sync Server v5
 * スプレッドシートを「唯一の正(Source of Truth)」として管理
 * 
 * シート構成:
 *   daily_summary     — 日付ごとの体調・判定・勤務サマリ
 *   workout_sessions  — 日別ワークアウト開始/終了メタデータ
 *   workout_details   — セット単位のトレーニング明細
 *   health_daily      — 健康データ(歩数/睡眠/心拍)
 *   schedule          — 勤務スケジュール
 *   settings          — アプリ設定
 *   sync_log          — 同期ログ(直近分)
 *   tombstones        — 削除履歴（他端末への削除伝搬用）
 *   RawData           — 後方互換用JSONブロブ(移行完了後削除可)
 */

var SHARED_SETTING_DEFINITIONS = {
  weeklyGoal: { type: 'number' },
  sessionDuration: { type: 'number' },
  strictness: { type: 'number' },
  gymHoursStart: { type: 'string' },
  gymHoursEnd: { type: 'string' },
  notifPrep: { type: 'boolean' },
  notifJudge: { type: 'boolean' },
  notifResume: { type: 'boolean' }
};
var SHARED_SETTING_KEYS = Object.keys(SHARED_SETTING_DEFINITIONS);

// theme / deviceUiState / Health Connect 接続状態は localDeviceSettings 扱いで共有しない。
// dataRetentionDays は現状 UI 未実装だが、将来設定化する場合も sharedSettings として扱う。

// ============ POST: データ保存/更新 ============
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return _json({ status: 'error', message: 'サーバーがビジーです。しばらく待ってから再試行してください。' });
  }

  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'legacy';
    var now = new Date().toISOString();
    data.updatedAt = now;

    // ★ 全アクション共通: payload正規化
    data = _normalizePayload(data);

    // クライアントからのrevision
    var clientRevision = data._revision || null;
    var healthRevision = data._healthRevision || (data.health && data.health._revision) || clientRevision;
    var scheduleRevision = data._scheduleRevision || (data.schedule && data.schedule._revision) || clientRevision;

    var result;
    switch (action) {
      case 'getAll':
        result = _getAll();
        break;
      case 'getDate':
        result = _getDate(data.date || data.targetDate || '');
        break;
      case 'saveDailySummary':
        result = _saveDailySummary(data, clientRevision);
        break;
      case 'appendWorkoutDetails':
        var directSession = null;
        if (data.workout || data.startAt || data.endAt || data.startTime || data.endTime || data.durationMinutes != null) {
          directSession = _saveWorkoutSession({
            date: data.date,
            workoutType: data.workoutType || (data.workout && data.workout.type) || '',
            status: data.status || (data.workout && data.workout.status) || '',
            startAt: data.startAt || (data.workout && data.workout.startAt) || '',
            startTime: data.startTime || (data.workout && data.workout.startTime) || '',
            endAt: data.endAt || (data.workout && data.workout.endAt) || '',
            endTime: data.endTime || (data.workout && data.workout.endTime) || '',
            durationMinutes: data.durationMinutes != null ? data.durationMinutes : (data.workout && data.workout.durationMinutes),
            timerState: data.timerState || (data.workout && data.workout.timerState) || '',
            timerStartedAt: data.timerStartedAt || (data.workout && data.workout.timerStartedAt) || '',
            timerElapsedSeconds: data.timerElapsedSeconds != null ? data.timerElapsedSeconds : (data.workout && data.workout.timerElapsedSeconds),
            timerUpdatedAt: data.timerUpdatedAt || (data.workout && data.workout.timerUpdatedAt) || '',
            feeling: data.feeling != null ? data.feeling : (data.workout && data.workout.feeling),
            memo: data.memo || (data.workout && data.workout.memo) || '',
            skipReason: data.skipReason || (data.workout && data.workout.skipReason) || '',
            sourceDevice: data.sourceDevice || '',
            updatedBy: data.updatedBy || 'app',
            updatedAt: data.updatedAt || now
          }, null);
        }
        result = _appendWorkoutDetails(data);
        var directWorkoutPatch = _workoutSummaryPatch(directSession || {
          date: data.date,
          workoutType: data.workoutType || (data.workout && data.workout.type) || '',
          status: data.status || (data.workout && data.workout.status) || '',
          durationMinutes: data.durationMinutes
        });
        if (directWorkoutPatch.didWorkout == null) directWorkoutPatch.didWorkout = 'yes';
        if (directWorkoutPatch.workoutType == null) directWorkoutPatch.workoutType = data.workoutType || (data.workout && data.workout.type) || '';
        _rebuildDailySummary(data.date, data.sourceDevice || '', data.updatedBy || 'app', data.updatedAt || now, {
          didWorkout: 'yes',
          workoutType: directWorkoutPatch.workoutType,
          durationMinutes: directWorkoutPatch.durationMinutes
        }, clientRevision);
        break;
      case 'saveHealthDaily':
        result = _saveHealthDaily(data, healthRevision);
        _rebuildDailySummary(data.date, data.sourceDevice || '', data.updatedBy || 'app', data.updatedAt || now, {}, null);
        break;
      case 'updateSchedule':
        result = _updateSchedule(data, scheduleRevision);
        _rebuildDailySummary(data.date, data.sourceDevice || '', data.updatedBy || 'app', data.updatedAt || now, {}, null);
        break;
      case 'deleteSchedule':
        result = _deleteSchedule(data);
        break;
      case 'saveSettings':
        _saveSettings(data.settings || {}, now);
        result = { saved: true };
        break;
      case 'bulkSchedule':
        result = _bulkSchedule(data);
        break;
      case 'archiveOldRows':
        result = _archiveOldRows(data.olderThanDays || 90);
        break;
      case 'deleteWorkout':
        result = _deleteWorkout(data);
        break;
      case 'legacy':
      default:
        result = _handleLegacyPost(data);
        break;
    }

    _appendSyncLog(now, action, data.date || '', data.sourceDevice || '', 'success', '');
    return _json({ status: 'success', data: result, updatedAt: now });
  } catch (err) {
    // CONFLICT はそのまま返す
    if (err.message && err.message.indexOf('CONFLICT') === 0) {
      return _json({ status: 'error', message: err.message });
    }
    try { _appendSyncLog(new Date().toISOString(), 'error', '', '', 'error', err.message); } catch(ex){}
    return _json({ status: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ============ GET: データ取得 ============
function doGet(e) {
  try {
    var action = e.parameter.action || 'getAll';

    switch (action) {
      case 'getAll':
        return _json({ status: 'success', data: _getAll() });
      case 'getDate':
        return _json({ status: 'success', data: _getDate(e.parameter.date) });
      case 'getSyncLog':
        return _json({ status: 'success', data: _getSyncLog() });
      default:
        return _json({ status: 'error', message: 'Unknown action: ' + action });
    }
  } catch (err) {
    return _json({ status: 'error', message: err.message });
  }
}

// ============ 後方互換: 旧形式POST ============
// ★ v44: 各シートに個別保存 → _rebuildDailySummary で再構築
function _handleLegacyPost(data) {
  var dateStr = data.date;
  if (!dateStr) throw new Error('date is required');

  // 設定データ
  if (dateStr === '_settings') {
    _saveSettings(data.settings || {}, data.updatedAt);
    return { type: 'settings' };
  }

  var src = data.sourceDevice || 'unknown';
  var by = data.updatedBy || 'app';
  var clientRevision = data._revision || null;
  var healthRevision = data._healthRevision || (data.health && data.health._revision) || null;
  var scheduleRevision = data._scheduleRevision || (data.schedule && data.schedule._revision) || null;

  // --- 1. health_daily ---
  if (data.health) {
    _saveHealthDaily({
      date: dateStr,
      steps: data.health.steps,
      sleepMinutes: data.health.sleepMinutes,
      sleepStartAt: data.health.sleepStartAt,
      sleepEndAt: data.health.sleepEndAt,
      sleepSessions: data.health.sleepSessions,
      sleepSessionCount: data.health.sleepSessionCount,
      napMinutes: data.health.napMinutes,
      napStartAt: data.health.napStartAt,
      napEndAt: data.health.napEndAt,
      napSessions: data.health.napSessions,
      napCount: data.health.napCount,
      sleepAnchor: data.health.sleepAnchor,
      sleepSummary: data.health.sleepSummary,
      heartRateAvg: data.health.heartRateAvg,
      restingHeartRate: data.health.restingHeartRate,
      weightKg: data.health.weightKg,
      source: data.health.source || 'unknown',
      fetchedAt: data.health.fetchedAt || '',
      sourceDevice: src, updatedBy: by, updatedAt: data.updatedAt
    }, healthRevision);
  }

  // --- 2. schedule ---
  if (data.schedule) {
    _updateSchedule({
      date: dateStr,
      shiftType: data.schedule.shiftType || '',
      startTime: data.schedule.startTime || '',
      endTime: data.schedule.endTime || '',
      note: data.schedule.note || '',
      destination: data.schedule.destination || '',
      hotelName: data.schedule.hotelName || '',
      sourceDevice: src, updatedBy: by, updatedAt: data.updatedAt
    }, scheduleRevision);
  }

  // --- 3. workout_details ---
  var workoutSession = null;
  if (data.workout) {
    workoutSession = _saveWorkoutSession({
      date: dateStr,
      workoutType: data.workout.type || '',
      status: data.workout.status || '',
      startAt: data.workout.startAt || '',
      startTime: data.workout.startTime || '',
      endAt: data.workout.endAt || '',
      endTime: data.workout.endTime || '',
      durationMinutes: data.workout.durationMinutes,
      timerState: data.workout.timerState || '',
      timerStartedAt: data.workout.timerStartedAt || '',
      timerElapsedSeconds: data.workout.timerElapsedSeconds,
      timerUpdatedAt: data.workout.timerUpdatedAt || '',
      feeling: data.workout.feeling,
      memo: data.workout.memo || '',
      skipReason: data.workout.skipReason || '',
      sourceDevice: src, updatedBy: by, updatedAt: data.updatedAt
    }, null);
  }

  if (data.exercises && data.exercises.length > 0) {
    _appendWorkoutDetails({
      date: dateStr,
      workoutType: (data.workout || {}).type || '',
      feeling: (data.workout || {}).feeling,
      durationMinutes: (data.workout || {}).durationMinutes,
      exercises: data.exercises,
      sourceDevice: src, updatedBy: by, updatedAt: data.updatedAt
    });
  }

  // --- 4. condition/judgment → daily_summaryにパッチ ---
  // (condition/judgmentは個別シートがないため、daily_summaryに直接書き込み)
  var condJudgPatch = {};
  if (data.condition) {
    condJudgPatch.fatigue = data.condition.fatigue;
    condJudgPatch.muscleSoreness = data.condition.muscleSoreness;
    if (data.condition.sorenessAreas != null) {
      condJudgPatch.sorenessAreas = data.condition.sorenessAreas || '';
    }
    condJudgPatch.motivation = data.condition.motivation;
    condJudgPatch.mood = data.condition.mood;
    condJudgPatch.memo = data.condition.note || '';
  }
  if (data.judgment) {
    condJudgPatch.judgmentResult = data.judgment.result;
    condJudgPatch.judgmentScore = data.judgment.score;
    condJudgPatch.judgmentReason = Array.isArray(data.judgment.reasons)
      ? data.judgment.reasons.join('; ')
      : (data.judgment.resultLabel || '');
  }
  if (data.workout) {
    var sessionPatch = _workoutSummaryPatch(workoutSession || data.workout);
    for (var spKey in sessionPatch) condJudgPatch[spKey] = sessionPatch[spKey];
  }

  // --- 5. daily_summary を全シートから再構築 ---
  _rebuildDailySummary(dateStr, src, by, data.updatedAt, condJudgPatch, clientRevision);

  // --- 6. RawData 後方互換保存 (将来廃止予定) ---
  // 何のため: 旧クライアントが参照する JSON ブロブ互換を保つため。
  // 旧キー: heartRate / avgHeartRate / restingHR / healthconnect を正規化済み payload で保存。
  // なぜ残すか: 既存端末が RawData ベースで pull する移行期間を吸収するため。
  // 撤去条件: RawData を参照する端末がなくなり、schemaVersion/settingsVersion 2 系へ揃ったら削除可能。
  var rawSheet = _sheet('RawData');
  var rawIdx = _findRow(rawSheet, dateStr);
  var jsonStr = JSON.stringify(data);
  if (rawIdx > -1) {
    rawSheet.getRange(rawIdx, 2).setValue(jsonStr);
    rawSheet.getRange(rawIdx, 3).setValue(data.updatedAt);
  } else {
    rawSheet.appendRow([dateStr, jsonStr, data.updatedAt]);
  }

  return { type: 'legacy', date: dateStr };
}

// ============ v44: 共通正規化関数群 ============

/**
 * ━━ 移行レイヤー（Apps Script 側の主責任点） ━━━━━━━━━━━━━━━
 * 何のため: 旧クライアント / 旧RawData / 旧ローカルバックアップ由来の入力を、
 *            保存前に正規キーへ寄せ、保存後は正規キーだけ返すため。
 * 吸収する旧キー: heartRate, avgHeartRate, restingHR, healthconnect
 * なぜ今は残すか: 既存端末や RawData シートの移行を壊さないため。
 * 新規保存: フロント側は正規キーのみを使い、旧命名はここでだけ吸収する。
 * 撤去条件: RawData 廃止 + 旧 payload を送るクライアントがなくなったら縮小可能。
 *            ただし外部入力防御として最低限の正規化 helper は残してよい。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
function _normalizeHealthObject(health) {
  if (!health) return health;
  var normalized = {};
  for (var key in health) normalized[key] = health[key];

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

function _hasInlineHealthFields(data) {
  return ['heartRate', 'avgHeartRate', 'restingHR', 'heartRateAvg', 'restingHeartRate', 'source'].some(function(key) {
    return data[key] !== undefined;
  });
}

function _normalizeInlineHealthFields(data) {
  if (!_hasInlineHealthFields(data)) return data;
  var normalized = _normalizeHealthObject(data);
  data.heartRateAvg = normalized.heartRateAvg;
  data.restingHeartRate = normalized.restingHeartRate;
  data.source = normalized.source;
  delete data.heartRate;
  delete data.avgHeartRate;
  delete data.restingHR;
  return data;
}

function _coerceSharedSettingValue(key, value) {
  var definition = SHARED_SETTING_DEFINITIONS[key];
  if (!definition) return value;
  if (definition.type === 'number') return parseInt(value, 10) || 0;
  if (definition.type === 'boolean') return value === true || value === 'true';
  return value == null ? '' : String(value);
}

function _normalizeSharedSettings(settings) {
  var normalized = {};
  if (!settings) return normalized;
  SHARED_SETTING_KEYS.forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      normalized[key] = _coerceSharedSettingValue(key, settings[key]);
    }
  });
  return normalized;
}

function _normalizePayload(data) {
  if (data.settings) {
    data.settingsType = 'shared';
    data.settings = _normalizeSharedSettings(data.settings);
  }
  if (data.health) {
    data.health = _normalizeHealthObject(data.health);
  }
  _normalizeInlineHealthFields(data);
  return data;
}

/**
 * skipReason を正規化
 */
function _normalizeSkipReason(raw) {
  if (!raw) return '';
  // カンマ区切り or 配列を統一
  if (Array.isArray(raw)) return raw.join(', ');
  return String(raw).trim();
}

/**
 * 利用可能時間(分)を算出
 * off: 960分(16時間), 勤務日: 23:00 - 退勤時刻
 */
function _computeAvailableMinutes(shiftType, endTime) {
  if (shiftType === 'off' || shiftType === 'paid_leave') return 960;
  if (!endTime) return '';
  try {
    var endMinutes = _timeToMinutes(endTime);
    if (endMinutes == null) return '';
    return Math.max(0, (23 * 60) - endMinutes);
  } catch(e) { return ''; }
}

function _timeToMinutes(value) {
  var time = _normTime(value);
  if (!time) return null;
  var parts = String(time).split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  if (parts[0] < 0 || parts[0] > 23 || parts[1] < 0 || parts[1] > 59) return null;
  return parts[0] * 60 + parts[1];
}

function _computeWorkMinutes(startTime, endTime) {
  var start = _timeToMinutes(startTime);
  var end = _timeToMinutes(endTime);
  if (start == null || end == null) return '';
  var minutes = end - start;
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes);
}

function _roundTo(value, digits) {
  var n = Number(value);
  if (isNaN(n)) return '';
  var scale = Math.pow(10, digits || 0);
  return Math.round(n * scale) / scale;
}

function _clampNumber(value, min, max) {
  var n = Number(value);
  if (isNaN(n)) return '';
  return Math.max(min, Math.min(max, n));
}

function _minutesToHours(minutes) {
  var n = _numberOrNull(minutes);
  if (n == null) return '';
  return _roundTo(n / 60, 1);
}

function _estimateWorkloadScore(shiftType, workMinutes, steps) {
  if (!shiftType) return '';
  if (shiftType === 'off' || shiftType === 'paid_leave') return 10;
  var score = 50;
  if (shiftType === 'project') score = 70;
  if (shiftType === 'business_trip') score = 80;
  var work = _numberOrNull(workMinutes);
  if (work != null) {
    if (work > 480) score += Math.min(18, Math.floor((work - 480) / 30) * 3);
    if (work < 360) score -= 5;
  }
  var stepCount = _numberOrNull(steps);
  if (stepCount != null) {
    if (stepCount >= 12000) score += 10;
    else if (stepCount >= 8000) score += 5;
    else if (stepCount < 3000) score -= 5;
  }
  return _clampNumber(Math.round(score), 0, 100);
}

function _conditionLevel(value) {
  var n = _numberOrNull(value);
  if (n == null) return null;
  return _clampNumber(n, 1, 5);
}

function _estimateRecoveryScore(sleepMinutes, napMinutes, fatigue, muscleSoreness, restingHeartRate) {
  var hasSignal = false;
  var score = 70;
  var sleep = _numberOrNull(sleepMinutes);
  if (sleep != null) {
    hasSignal = true;
    if (sleep >= 420) score += 20;
    else if (sleep >= 360) score += 10;
    else if (sleep >= 300) score += 0;
    else score -= 20;
  }
  var nap = _numberOrNull(napMinutes);
  if (nap != null && nap > 0) {
    hasSignal = true;
    score += Math.min(8, Math.floor(nap / 15));
  }
  var fatigueLevel = _conditionLevel(fatigue);
  if (fatigueLevel != null) {
    hasSignal = true;
    score += fatigueLevel <= 2 ? 5 : 0;
    score -= Math.max(0, fatigueLevel - 3) * 10;
  }
  var sorenessLevel = _conditionLevel(muscleSoreness);
  if (sorenessLevel != null) {
    hasSignal = true;
    score -= Math.max(0, sorenessLevel - 3) * 8;
  }
  var rhr = _numberOrNull(restingHeartRate);
  if (rhr != null && rhr > 0) {
    hasSignal = true;
    if (rhr >= 85) score -= 12;
    else if (rhr >= 75) score -= 6;
    else if (rhr <= 60) score += 4;
  }
  return hasSignal ? _clampNumber(Math.round(score), 0, 100) : '';
}

/**
 * workout_details シートから日別の運動派生値を算出する。
 * フロントは実績だけを送り、合計時間・完了率などはGAS側で再計算する。
 */
function _computeWorkoutMetrics(dateStr) {
  var empty = {
    totalDurationMinutes: '',
    cardioMinutes: '',
    strengthSetCount: '',
    completedSetCount: '',
    totalSetCount: '',
    completedExerciseCount: '',
    totalExerciseCount: '',
    completionRate: ''
  };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('workout_details');
  if (!sheet || sheet.getLastRow() <= 1) return empty;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var dateIdx = headers.indexOf('date');
  var exerciseIdx = headers.indexOf('exerciseName');
  var noteIdx = headers.indexOf('note');
  var durationIdx = headers.indexOf('durationMin');
  var speedIdx = headers.indexOf('speedKmh');
  var completedIdx = headers.indexOf('completed');
  var totalMin = 0;
  var cardioMin = 0;
  var strengthSetCount = 0;
  var totalSetCount = 0;
  var completedSetCount = 0;
  var exerciseMap = {};
  var found = false;
  for (var i = 0; i < data.length; i++) {
    if (_normDate(data[i][dateIdx]) !== _normDate(dateStr)) continue;
    found = true;
    var exerciseName = String(exerciseIdx > -1 ? (data[i][exerciseIdx] || '') : '').trim() || ('row-' + i);
    var durationCell = durationIdx > -1 ? _numberOrNull(data[i][durationIdx]) : null;
    var speedCell = speedIdx > -1 ? _numberOrNull(data[i][speedIdx]) : null;
    var note = String(noteIdx > -1 ? (data[i][noteIdx] || '') : '');
    var isCardio = (durationCell != null && durationCell > 0) || (speedCell != null && speedCell > 0) || _looksLikeDurationNote(note);
    var isCompleted = completedIdx > -1 ? _isYes(data[i][completedIdx]) : false;
    if (!exerciseMap[exerciseName]) exerciseMap[exerciseName] = { total: 0, completed: 0 };
    exerciseMap[exerciseName].total++;
    totalSetCount++;
    if (isCompleted) {
      exerciseMap[exerciseName].completed++;
      completedSetCount++;
    }
    if (isCardio) {
      var rowCardioMin = durationCell != null && durationCell > 0 ? durationCell : _extractMinutes(note);
      cardioMin += rowCardioMin;
      totalMin += rowCardioMin;
    } else {
      strengthSetCount++;
      totalMin += 1.5;
    }
  }
  if (!found) return empty;
  var totalExerciseCount = 0;
  var completedExerciseCount = 0;
  Object.keys(exerciseMap).forEach(function(name) {
    totalExerciseCount++;
    if (exerciseMap[name].total > 0 && exerciseMap[name].completed >= exerciseMap[name].total) {
      completedExerciseCount++;
    }
  });
  return {
    totalDurationMinutes: Math.round(totalMin),
    cardioMinutes: Math.round(cardioMin),
    strengthSetCount: strengthSetCount,
    completedSetCount: completedSetCount,
    totalSetCount: totalSetCount,
    completedExerciseCount: completedExerciseCount,
    totalExerciseCount: totalExerciseCount,
    completionRate: totalSetCount > 0 ? Math.round((completedSetCount / totalSetCount) * 100) : ''
  };
}

function _computeWorkoutDuration(dateStr) {
  return _computeWorkoutMetrics(dateStr).totalDurationMinutes;
}

function _workoutSessionHeaders() {
  return [
    'date','workoutType','status','startAt','startTime','endAt','endTime',
    'durationMinutes','timerState','timerStartedAt','timerElapsedSeconds','timerUpdatedAt',
    'feeling','memo','skipReason',
    'sourceDevice','updatedBy','updatedAt','revision'
  ];
}

function _normalizeWorkoutStatus(d) {
  var raw = String(d.status || '').trim();
  if (raw === 'completed' || raw === 'in_progress' || raw === 'skipped' || raw === 'draft') return raw;
  var type = d.workoutType || d.type || '';
  if (type === 'skip') return 'skipped';
  if (d.endAt || d.endTime) return 'completed';
  if (Number(d.durationMinutes) > 0 && type) return 'completed';
  if (d.startAt || d.startTime) return 'in_progress';
  return type ? 'draft' : '';
}

function _normalizeWorkoutSession(d) {
  d = d || {};
  var workoutType = d.workoutType || d.type || '';
  var startAt = d.startAt instanceof Date ? d.startAt.toISOString() : (d.startAt || '');
  var endAt = d.endAt instanceof Date ? d.endAt.toISOString() : (d.endAt || '');
  var status = _normalizeWorkoutStatus({
    status: d.status,
    workoutType: workoutType,
    type: d.type,
    startAt: startAt,
    startTime: d.startTime,
    endAt: endAt,
    endTime: d.endTime,
    durationMinutes: d.durationMinutes
  });
  return {
    date: _normDate(d.date),
    workoutType: workoutType,
    status: status,
    startAt: startAt,
    startTime: _normTime(d.startTime) || '',
    endAt: endAt,
    endTime: _normTime(d.endTime) || '',
    durationMinutes: d.durationMinutes != null && d.durationMinutes !== '' ? Number(d.durationMinutes) : '',
    timerState: d.timerState || '',
    timerStartedAt: d.timerStartedAt instanceof Date ? d.timerStartedAt.toISOString() : (d.timerStartedAt || ''),
    timerElapsedSeconds: d.timerElapsedSeconds != null && d.timerElapsedSeconds !== '' ? Number(d.timerElapsedSeconds) : '',
    timerUpdatedAt: d.timerUpdatedAt instanceof Date ? d.timerUpdatedAt.toISOString() : (d.timerUpdatedAt || ''),
    feeling: d.feeling != null && d.feeling !== '' ? Number(d.feeling) : '',
    memo: d.memo || '',
    skipReason: _normalizeSkipReason(d.skipReason),
    sourceDevice: d.sourceDevice || '',
    updatedBy: d.updatedBy || 'app',
    updatedAt: d.updatedAt || new Date().toISOString(),
    _revision: parseInt(d.revision || d._revision, 10) || 0
  };
}

function _saveWorkoutSession(d, clientRevision) {
  var session = _normalizeWorkoutSession(d);
  if (!session.date) throw new Error('date is required for workout session');
  var sheet = _sheetWithHeaders('workout_sessions', _workoutSessionHeaders());
  var row = [
    session.date, session.workoutType, session.status, session.startAt, session.startTime,
    session.endAt, session.endTime,
    session.durationMinutes !== '' ? session.durationMinutes : '',
    session.timerState || '',
    session.timerStartedAt || '',
    session.timerElapsedSeconds !== '' ? session.timerElapsedSeconds : '',
    session.timerUpdatedAt || '',
    session.feeling !== '' ? session.feeling : '',
    session.memo, session.skipReason,
    session.sourceDevice, session.updatedBy, session.updatedAt, 1
  ];
  _upsertRow(sheet, session.date, row, clientRevision);
  return session;
}

function _readWorkoutSession(dateStr) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('workout_sessions');
  if (!sheet || sheet.getLastRow() <= 1) return null;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = _findRow(sheet, dateStr);
  if (idx <= 0) return null;
  var row = sheet.getRange(idx, 1, 1, headers.length).getValues()[0];
  var obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i]; });
  return _normalizeWorkoutSession(obj);
}

function _workoutSummaryPatch(sessionInput) {
  var session = _normalizeWorkoutSession(sessionInput || {});
  var patch = {};
  if (session.status === 'skipped' || session.workoutType === 'skip') {
    patch.didWorkout = 'skip';
  } else if (session.status === 'in_progress') {
    patch.didWorkout = 'in_progress';
  } else if (session.status === 'completed') {
    patch.didWorkout = 'yes';
  } else if (session.workoutType) {
    patch.didWorkout = 'yes';
  }
  if (session.workoutType) patch.workoutType = session.workoutType;
  if (session.durationMinutes !== '') patch.durationMinutes = session.durationMinutes;
  if (session.skipReason !== '') patch.skipReason = session.skipReason;
  return patch;
}

/**
 * ★ daily_summary を全シートから日付単位で再構築する。
 * schedule, health_daily, workout_sessions, workout_details から読み取り、
 * condition/judgment は condJudgPatch から受け取る（個別シートがないため）。
 *
 * @param {string} dateStr - 対象日 (YYYY-MM-DD)
 * @param {string} src - sourceDevice
 * @param {string} by - updatedBy
 * @param {string} updatedAt - 更新日時
 * @param {object} condJudgPatch - condition/judgment/workout のパッチ (省略可)
 * @param {number|null} clientRevision - クライアントrevision (省略可)
 */
function _rebuildDailySummary(dateStr, src, by, updatedAt, condJudgPatch, clientRevision) {
  condJudgPatch = condJudgPatch || {};

  // --- schedule シートから取得 ---
  var sched = {};
  var schedSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('schedule');
  if (schedSheet && schedSheet.getLastRow() > 1) {
    var sHeaders = schedSheet.getRange(1, 1, 1, schedSheet.getLastColumn()).getValues()[0];
    var sIdx = _findRow(schedSheet, dateStr);
    if (sIdx > -1) {
      var sRow = schedSheet.getRange(sIdx, 1, 1, sHeaders.length).getValues()[0];
      sHeaders.forEach(function(h, i) { sched[h] = sRow[i]; });
    }
  }

  // --- health_daily シートから取得 ---
  var health = {};
  var healthSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('health_daily');
  if (healthSheet && healthSheet.getLastRow() > 1) {
    var hHeaders = healthSheet.getRange(1, 1, 1, healthSheet.getLastColumn()).getValues()[0];
    var hIdx = _findRow(healthSheet, dateStr);
    if (hIdx > -1) {
      var hRow = healthSheet.getRange(hIdx, 1, 1, hHeaders.length).getValues()[0];
      hHeaders.forEach(function(h, i) { health[h] = hRow[i]; });
    }
  }

  // --- workout_sessions / workout_details からワークアウト状態を取得 ---
  var session = _readWorkoutSession(dateStr);
  var sessionPatch = _workoutSummaryPatch(session);
  var workoutMetrics = _computeWorkoutMetrics(dateStr);
  var workoutDuration = workoutMetrics.totalDurationMinutes;

  // --- condJudgPatch に含まれない列は既存のdaily_summaryから保持 ---
  var existing = _getExistingDailySummaryFields(dateStr);

  // --- availableMinutes ---
  var shiftType = sched.shiftType || '';
  var startTime = _normTime(sched.startTime) || '';
  var endTime = _normTime(sched.endTime) || '';
  var availMin = _computeAvailableMinutes(shiftType, endTime);
  var workMinutes = _computeWorkMinutes(startTime, endTime);

  // マージ: condJudgPatch > 既存daily_summary
  var fatigue = _coalesce(condJudgPatch.fatigue, existing.fatigue);
  var muscleSoreness = _coalesce(condJudgPatch.muscleSoreness, existing.muscleSoreness);
  var sorenessAreas = condJudgPatch.sorenessAreas != null ? condJudgPatch.sorenessAreas : (existing.sorenessAreas || '');
  var motivation = _coalesce(condJudgPatch.motivation, existing.motivation);
  var mood = _coalesce(condJudgPatch.mood, existing.mood);
  var memo = condJudgPatch.memo != null ? condJudgPatch.memo : (existing.memo || '');
  var judgmentResult = _coalesce(condJudgPatch.judgmentResult, existing.judgmentResult);
  var judgmentScore = _coalesce(condJudgPatch.judgmentScore, existing.judgmentScore);
  var judgmentReason = condJudgPatch.judgmentReason != null ? condJudgPatch.judgmentReason : (existing.judgmentReason || '');
  var didWorkout = condJudgPatch.didWorkout != null ? condJudgPatch.didWorkout : (_coalesce(sessionPatch.didWorkout, existing.didWorkout) || '');
  var workoutType = condJudgPatch.workoutType != null ? condJudgPatch.workoutType : (_coalesce(sessionPatch.workoutType, existing.workoutType) || '');
  var skipReason = condJudgPatch.skipReason != null ? condJudgPatch.skipReason : (_coalesce(sessionPatch.skipReason, existing.skipReason) || '');

  // durationMinutes: 実測セッション > workout_details推定 > 既存値
  var totalDuration = _coalesce(condJudgPatch.durationMinutes, sessionPatch.durationMinutes, workoutDuration || null, existing.totalDurationMinutes);
  var steps = _coalesce(health.steps, existing.steps);
  var sleepMinutes = _coalesce(health.sleepMinutes, existing.sleepMinutes);
  var sleepStartAt = _coalesce(health.sleepStartAt, existing.sleepStartAt);
  var sleepEndAt = _coalesce(health.sleepEndAt, existing.sleepEndAt);
  var sleepSessions = _coalesce(health.sleepSessions, existing.sleepSessions);
  var sleepSessionCount = _coalesce(health.sleepSessionCount, existing.sleepSessionCount);
  var napMinutes = _coalesce(health.napMinutes, existing.napMinutes);
  var napStartAt = _coalesce(health.napStartAt, existing.napStartAt);
  var napEndAt = _coalesce(health.napEndAt, existing.napEndAt);
  var napSessions = _coalesce(health.napSessions, existing.napSessions);
  var napCount = _coalesce(health.napCount, existing.napCount);
  var sleepAnchor = _coalesce(health.sleepAnchor, existing.sleepAnchor);
  var sleepSummary = _coalesce(health.sleepSummary, existing.sleepSummary);
  var heartRateAvg = _coalesce(health.heartRateAvg, existing.heartRateAvg);
  var restingHeartRate = _coalesce(health.restingHeartRate, existing.restingHeartRate);
  sleepSessions = sleepSessions || _buildSingleSession(sleepMinutes, sleepStartAt, sleepEndAt);
  napSessions = napSessions || _buildSingleSession(napMinutes, napStartAt, napEndAt);
  sleepSessionCount = _coalesce(sleepSessionCount, _sessionCount(sleepSessions, sleepMinutes));
  napCount = _coalesce(napCount, _sessionCount(napSessions, napMinutes));
  sleepAnchor = sleepAnchor || (sleepMinutes != null && sleepMinutes !== '' ? 'wake_date' : (napMinutes != null && napMinutes !== '' ? 'nap_only' : ''));
  sleepSummary = sleepSummary || _buildSleepSummaryText({
    sleepMinutes: sleepMinutes,
    sleepStartAt: sleepStartAt,
    sleepEndAt: sleepEndAt,
    sleepSessions: sleepSessions,
    napMinutes: napMinutes,
    napStartAt: napStartAt,
    napEndAt: napEndAt,
    napSessions: napSessions
  });
  var workloadScore = _estimateWorkloadScore(shiftType, workMinutes, steps);
  var recoveryScore = _estimateRecoveryScore(sleepMinutes, napMinutes, fatigue, muscleSoreness, restingHeartRate);

  _saveDailySummary({
    date: dateStr,
    shiftType: shiftType,
    workStart: startTime,
    workEnd: endTime,
    destination: sched.destination || '',
    hotelName: sched.hotelName || '',
    availableMinutes: availMin,
    workMinutes: workMinutes,
    workloadScore: workloadScore,
    judgmentResult: judgmentResult,
    judgmentScore: judgmentScore,
    judgmentReason: judgmentReason,
    didWorkout: didWorkout,
    workoutType: workoutType,
    totalDurationMinutes: totalDuration,
    cardioMinutes: workoutMetrics.cardioMinutes,
    strengthSetCount: workoutMetrics.strengthSetCount,
    completedSetCount: workoutMetrics.completedSetCount,
    totalSetCount: workoutMetrics.totalSetCount,
    completedExerciseCount: workoutMetrics.completedExerciseCount,
    totalExerciseCount: workoutMetrics.totalExerciseCount,
    completionRate: workoutMetrics.completionRate,
    steps: steps,
    sleepMinutes: sleepMinutes,
    sleepHours: _minutesToHours(sleepMinutes),
    sleepStartAt: sleepStartAt,
    sleepEndAt: sleepEndAt,
    sleepSessions: sleepSessions,
    sleepSessionCount: sleepSessionCount,
    napMinutes: napMinutes,
    napHours: _minutesToHours(napMinutes),
    napStartAt: napStartAt,
    napEndAt: napEndAt,
    napSessions: napSessions,
    napCount: napCount,
    sleepAnchor: sleepAnchor,
    sleepSummary: sleepSummary,
    heartRateAvg: heartRateAvg,
    restingHeartRate: restingHeartRate,
    fatigue: fatigue,
    muscleSoreness: muscleSoreness,
    sorenessAreas: sorenessAreas,
    motivation: motivation,
    mood: mood,
    recoveryScore: recoveryScore,
    skipReason: skipReason,
    memo: memo,
    healthSource: health.source || existing.healthSource || '',
    lastHealthFetchAt: health.fetchedAt || existing.lastHealthFetchAt || '',
    sourceDevice: src,
    updatedBy: by,
    updatedAt: updatedAt
  }, clientRevision);
}

/**
 * 既存のdaily_summaryフィールドを取得する。
 * 新データとマージするため。
 */
function _getExistingDailySummaryFields(dateStr) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('daily_summary');
  if (!sheet || sheet.getLastRow() <= 1) return {};
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = _findRow(sheet, dateStr);
  if (idx <= 0) return {};
  var row = sheet.getRange(idx, 1, 1, headers.length).getValues()[0];
  var obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i]; });
  return obj;
}

/**
 * null でない最初の値を返す (COALESCE)
 */
function _coalesce() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] != null && arguments[i] !== '' && arguments[i] !== undefined) return arguments[i];
  }
  return null;
}

function _jsonCell(value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function _parseJsonCell(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (e) {
    return value;
  }
}

function _sessionList(value) {
  var parsed = _parseJsonCell(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(function(item) { return item && typeof item === 'object'; });
}

function _sessionCount(value, fallbackMinutes) {
  var sessions = _sessionList(value);
  if (sessions.length > 0) return sessions.length;
  return fallbackMinutes != null && fallbackMinutes !== '' ? 1 : '';
}

function _buildSingleSession(minutes, startAt, endAt) {
  if ((minutes == null || minutes === '') && !startAt && !endAt) return [];
  return [{
    minutes: minutes != null && minutes !== '' ? Number(minutes) : '',
    startAt: startAt || '',
    endAt: endAt || ''
  }];
}

function _formatDurationText(minutes) {
  var n = _numberOrNull(minutes);
  if (n == null) return '';
  var h = Math.floor(n / 60);
  var m = n % 60;
  return h + ':' + ('0' + m).slice(-2);
}

function _formatClockText(value) {
  if (!value) return '';
  try {
    var d = new Date(String(value));
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Tokyo', 'HH:mm');
    }
  } catch (e) {}
  var t = _normTime(value);
  return /^\d{2}:\d{2}$/.test(t) ? t : '';
}

function _formatSessionText(session) {
  var duration = _formatDurationText(session.minutes || session.durationMinutes || session.napMinutes);
  var start = _formatClockText(session.startAt || session.napStartAt);
  var end = _formatClockText(session.endAt || session.napEndAt);
  var window = start && end ? start + '-' + end : '';
  return [duration, window].filter(function(part) { return part; }).join(' ');
}

function _buildSleepSummaryText(d) {
  var parts = [];
  var sleepSessions = _sessionList(d.sleepSessions);
  if (sleepSessions.length === 0) {
    sleepSessions = _buildSingleSession(d.sleepMinutes, d.sleepStartAt, d.sleepEndAt);
  }
  if (d.sleepMinutes != null && d.sleepMinutes !== '') {
    var mainWindow = _formatClockText(d.sleepStartAt) && _formatClockText(d.sleepEndAt)
      ? _formatClockText(d.sleepStartAt) + '-' + _formatClockText(d.sleepEndAt)
      : '';
    parts.push(['主睡眠', _formatDurationText(d.sleepMinutes), mainWindow].filter(function(part) { return part; }).join(' '));
  }
  var napSessions = _sessionList(d.napSessions);
  if (napSessions.length === 0) {
    napSessions = _buildSingleSession(d.napMinutes, d.napStartAt, d.napEndAt);
  }
  if (napSessions.length > 0 && d.napMinutes != null && d.napMinutes !== '') {
    var napText = napSessions.map(_formatSessionText).filter(function(part) { return part; }).join(' / ');
    parts.push('仮眠' + napSessions.length + '回 ' + napText);
  }
  return parts.join(' / ');
}

// ============ daily_summary ============
function _dailySummaryHeaders() {
  return [
    'date','weekday','shiftType','workStart','workEnd','destination','hotelName','availableMinutes','workMinutes','workloadScore',
    'judgmentResult','judgmentScore','judgmentReason',
    'didWorkout','workoutType','totalDurationMinutes','cardioMinutes','strengthSetCount','completedSetCount','totalSetCount','completedExerciseCount','totalExerciseCount','completionRate',
    'steps','sleepMinutes','sleepHours','sleepStartAt','sleepEndAt','sleepSessions','sleepSessionCount','napMinutes','napHours','napStartAt','napEndAt','napSessions','napCount','sleepAnchor','sleepSummary','heartRateAvg','restingHeartRate',
    'fatigue','muscleSoreness','sorenessAreas','motivation','mood','recoveryScore',
    'skipReason','memo','healthSource','lastHealthFetchAt','lastSyncedAt',
    'sourceDevice','updatedBy','updatedAt','revision'
  ];
}

function _saveDailySummary(d, clientRevision) {
  var weekdayNames = ['日','月','火','水','木','金','土'];
  var weekday = '';
  if (d.date) {
    try {
      var dt = new Date(d.date + 'T00:00:00');
      if (!isNaN(dt.getTime())) weekday = weekdayNames[dt.getDay()];
    } catch(e) {}
  }
  var sheet = _sheetWithHeaders('daily_summary', _dailySummaryHeaders());
  var row = [
    d.date, weekday, d.shiftType||'', d.workStart||'', d.workEnd||'', d.destination||'', d.hotelName||'', d.availableMinutes != null ? d.availableMinutes : '',
    d.workMinutes != null ? d.workMinutes : '', d.workloadScore != null ? d.workloadScore : '',
    d.judgmentResult != null ? d.judgmentResult : '', d.judgmentScore != null ? d.judgmentScore : '', d.judgmentReason||'',
    d.didWorkout||'', d.workoutType||'', d.totalDurationMinutes != null ? d.totalDurationMinutes : '',
    d.cardioMinutes != null ? d.cardioMinutes : '', d.strengthSetCount != null ? d.strengthSetCount : '',
    d.completedSetCount != null ? d.completedSetCount : '', d.totalSetCount != null ? d.totalSetCount : '',
    d.completedExerciseCount != null ? d.completedExerciseCount : '', d.totalExerciseCount != null ? d.totalExerciseCount : '',
    d.completionRate != null ? d.completionRate : '',
    d.steps != null ? d.steps : '', d.sleepMinutes != null ? d.sleepMinutes : '', d.sleepHours != null ? d.sleepHours : '',
    d.sleepStartAt || '', d.sleepEndAt || '', _jsonCell(d.sleepSessions), d.sleepSessionCount != null ? d.sleepSessionCount : '',
    d.napMinutes != null ? d.napMinutes : '', d.napHours != null ? d.napHours : '', d.napStartAt || '', d.napEndAt || '', _jsonCell(d.napSessions),
    d.napCount != null ? d.napCount : '', d.sleepAnchor || '', d.sleepSummary || '',
    d.heartRateAvg != null ? d.heartRateAvg : '', d.restingHeartRate != null ? d.restingHeartRate : '',
    d.fatigue != null ? d.fatigue : '', d.muscleSoreness != null ? d.muscleSoreness : '', d.sorenessAreas||'',
    d.motivation != null ? d.motivation : '', d.mood != null ? d.mood : '', d.recoveryScore != null ? d.recoveryScore : '',
    d.skipReason||'', d.memo||'',
    d.healthSource||'', d.lastHealthFetchAt||'', new Date().toISOString(),
    d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
  ];
  _upsertRow(sheet, d.date, row, clientRevision);
  return { sheet: 'daily_summary', date: d.date };
}

// ============ workout_details ============
function _appendWorkoutDetails(d) {
  var sheet = _sheetWithHeaders('workout_details', [
    'date','workoutType','exerciseName','setIndex','weightKg','reps',
    'setCount','completed','targetWeightKg','targetReps','speedKmh','durationMin','note',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  
  // 同日の既存行を削除して再挿入
  _deleteRowsByDate(sheet, d.date);

  var exercises = d.exercises || [];
  for (var ei = 0; ei < exercises.length; ei++) {
    var ex = exercises[ei];
    var sets = Array.isArray(ex.sets) ? ex.sets : [];
    if (ex.isCardio) {
      var cardioSpeed = Number(ex.speed) || 5;
      var cardioMinutes = Number(ex.durationMin) || 0;
      sheet.appendRow([
        d.date, d.workoutType||'', ex.name||'', 1, 0, 0,
        1, sets[0] && sets[0].completed ? 'yes' : 'no', 0, 0,
        cardioSpeed, cardioMinutes,
        cardioSpeed + 'km/h × ' + cardioMinutes + '分',
        d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
      ]);
    } else {
      for (var si = 0; si < sets.length; si++) {
        var s = sets[si];
        sheet.appendRow([
          d.date, d.workoutType||'', ex.name||'', s.setNumber||'',
          s.weight||0, s.reps||0, sets.length,
          s.completed ? 'yes' : 'no',
          ex.recommended ? (ex.recommended.weight||'') : '', ex.recommended ? (ex.recommended.reps||'') : '',
          '', '',
          ex.recommended ? (ex.recommended.note||'') : '', d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
        ]);
      }
    }
  }
  return { sheet: 'workout_details', date: d.date, count: exercises.length };
}

// ============ health_daily ============
function _saveHealthDaily(d, clientRevision) {
  var sleepSessions = d.sleepSessions || _buildSingleSession(d.sleepMinutes, d.sleepStartAt, d.sleepEndAt);
  var napSessions = d.napSessions || _buildSingleSession(d.napMinutes, d.napStartAt, d.napEndAt);
  var sleepSessionCount = _coalesce(d.sleepSessionCount, _sessionCount(sleepSessions, d.sleepMinutes));
  var napCount = _coalesce(d.napCount, _sessionCount(napSessions, d.napMinutes));
  var sleepAnchor = d.sleepAnchor || (d.sleepMinutes != null && d.sleepMinutes !== '' ? 'wake_date' : (d.napMinutes != null && d.napMinutes !== '' ? 'nap_only' : ''));
  var sleepSummary = d.sleepSummary || _buildSleepSummaryText({
    sleepMinutes: d.sleepMinutes,
    sleepStartAt: d.sleepStartAt,
    sleepEndAt: d.sleepEndAt,
    sleepSessions: sleepSessions,
    napMinutes: d.napMinutes,
    napStartAt: d.napStartAt,
    napEndAt: d.napEndAt,
    napSessions: napSessions
  });
  var sheet = _sheetWithHeaders('health_daily', [
    'date','steps','sleepMinutes','sleepStartAt','sleepEndAt','sleepSessions','sleepSessionCount','napMinutes','napStartAt','napEndAt','napSessions','napCount','sleepAnchor','sleepSummary','heartRateAvg','restingHeartRate',
    'weightKg','source','fetchedAt','syncedAt','status',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var row = [
    d.date,
    d.steps != null ? d.steps : '',
    d.sleepMinutes != null ? d.sleepMinutes : '',
    d.sleepStartAt || '',
    d.sleepEndAt || '',
    _jsonCell(sleepSessions),
    sleepSessionCount != null ? sleepSessionCount : '',
    d.napMinutes != null ? d.napMinutes : '',
    d.napStartAt || '',
    d.napEndAt || '',
    _jsonCell(napSessions),
    napCount != null ? napCount : '',
    sleepAnchor,
    sleepSummary,
    d.heartRateAvg != null ? d.heartRateAvg : '',
    d.restingHeartRate != null ? d.restingHeartRate : '',
    d.weightKg != null ? d.weightKg : '',
    d.source||'', d.fetchedAt||'', d.syncedAt||new Date().toISOString(),
    'synced', d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
  ];
  _upsertRow(sheet, d.date, row, clientRevision);
  return { sheet: 'health_daily', date: d.date };
}

// ============ schedule ============
function _updateSchedule(d, clientRevision) {
  var sheet = _sheetWithHeaders('schedule', [
    'date','shiftType','startTime','endTime','note','destination','hotelName',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var row = [
    d.date, d.shiftType||'', d.startTime||'', d.endTime||'', d.note||'', d.destination||'', d.hotelName||'',
    d.sourceDevice||'', d.updatedBy||'', d.updatedAt||'', 1
  ];
  _upsertRow(sheet, d.date, row, clientRevision);
  // ★ dailySummary再構築（availableMinutesが自動計算される）
  // ただし legacyPostからの呼出時は _rebuildDailySummary が別途呼ばれるのでスキップ可能
  // → 冪等なので二重に呼んでも問題ない
  return { sheet: 'schedule', date: d.date };
}

function _deleteSchedule(d) {
  var sheet = _sheetWithHeaders('schedule', [
    'date','shiftType','startTime','endTime','note','destination','hotelName',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var idx = _findRow(sheet, d.date);
  if (idx > -1) sheet.deleteRow(idx);
  // tombstone記録
  _addTombstone(d.date, 'schedule', d.sourceDevice || '', d.updatedAt);
  // ★ daily_summary再構築（schedule列がクリアされる）
  _rebuildDailySummary(d.date, d.sourceDevice || '', 'delete', d.updatedAt || new Date().toISOString(), {}, null);
  return { deleted: d.date };
}

// ============ 月間スケジュール一括保存 ============
function _bulkSchedule(data) {
  var schedules = data.schedules || [];
  if (schedules.length === 0) return { count: 0 };
  
  var sheet = _sheetWithHeaders('schedule', [
    'date','shiftType','startTime','endTime','note','destination','hotelName',
    'sourceDevice','updatedBy','updatedAt','revision'
  ]);
  var now = new Date().toISOString();
  var count = 0;
  
  for (var i = 0; i < schedules.length; i++) {
    var s = schedules[i];
    var row = [
      s.date, s.shiftType || '', s.startTime || '', s.endTime || '', s.note || '', s.destination || '', s.hotelName || '',
      data.sourceDevice || '', 'bulk', now, 1
    ];
    _upsertRow(sheet, s.date, row);
    _rebuildDailySummary(s.date, data.sourceDevice || '', 'bulk', now, {}, null);
    count++;
  }
  
  return { sheet: 'schedule', count: count, year: data.year, month: data.month };
}

// ============ ワークアウト削除 ============
function _deleteWorkout(data) {
  var dateStr = data.date;
  if (!dateStr) throw new Error('date is required for deleteWorkout');
  
  // workout_details を日付で全削除
  var wdSheet = _sheet('workout_details');
  _deleteRowsByDate(wdSheet, dateStr);

  // workout_sessions も日付で削除し、別端末のタイマー復元を止める
  var wsSheet = _sheetWithHeaders('workout_sessions', _workoutSessionHeaders());
  _deleteRowsByDate(wsSheet, dateStr);
  
  // tombstone記録
  _addTombstone(dateStr, 'workout', data.sourceDevice || '', data.updatedAt);
  
  // ★ daily_summary再構築（workout列がクリアされる）
  // didWorkout/workoutType/skipReasonを空にするパッチを渡す
  _rebuildDailySummary(dateStr, data.sourceDevice || '', 'delete', data.updatedAt || new Date().toISOString(), {
    didWorkout: '',
    workoutType: '',
    skipReason: ''
  }, null);
  
  return { deleted: true, date: dateStr };
}

// ============ tombstone ============
function _addTombstone(dateStr, type, device, timestamp) {
  var sheet = _sheetWithHeaders('tombstones', [
    'date', 'type', 'deletedAt', 'sourceDevice'
  ]);
  sheet.appendRow([dateStr, type, timestamp || new Date().toISOString(), device]);
}

function _getTombstones() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tombstones');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var byDate = {};
  for (var i = 0; i < data.length; i++) {
    var d = _normDate(data[i][0]);
    var type = data[i][1];
    if (!d) continue;
    if (!byDate[d]) byDate[d] = [];
    if (byDate[d].indexOf(type) === -1) byDate[d].push(type);
  }
  return byDate;
}

// ============ getAll ============
function _getAll() {
  var byDate = {};

  // --- schedule シートから全日程を読み込む ---
  var schedSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('schedule');
  if (schedSheet && schedSheet.getLastRow() > 1) {
    var headers = schedSheet.getRange(1, 1, 1, schedSheet.getLastColumn()).getValues()[0];
    var data = schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, schedSheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      var d = _normDate(obj.date);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d };
      byDate[d].schedule = {
        date: d,
        shiftType: obj.shiftType || '',
        startTime: _normTime(obj.startTime),
        endTime: _normTime(obj.endTime),
        note: obj.note || '',
        destination: obj.destination || '',
        hotelName: obj.hotelName || '',
        updatedAt: obj.updatedAt || '',
        _revision: parseInt(obj.revision) || 0
      };
      if (obj.updatedAt && _safeDateTs(obj.updatedAt) > _safeDateTs(byDate[d].updatedAt)) {
        byDate[d].updatedAt = obj.updatedAt;
      }
    }
  }

  // --- health_daily シートから読み込む ---
  var healthSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('health_daily');
  if (healthSheet && healthSheet.getLastRow() > 1) {
    var headers = healthSheet.getRange(1, 1, 1, healthSheet.getLastColumn()).getValues()[0];
    var data = healthSheet.getRange(2, 1, healthSheet.getLastRow() - 1, healthSheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      var d = _normDate(obj.date);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d };
      var healthObj = {
        date: d,
        source: obj.source || 'sync',
        _revision: parseInt(obj.revision) || 0
      };
      // null/0の区別: 空セル=null（含めない）、0=ゼロ（含める）
      if (obj.steps !== '' && obj.steps !== null && obj.steps !== undefined) healthObj.steps = Number(obj.steps);
      if (obj.sleepMinutes !== '' && obj.sleepMinutes !== null && obj.sleepMinutes !== undefined) healthObj.sleepMinutes = Number(obj.sleepMinutes);
      if (obj.sleepStartAt !== '' && obj.sleepStartAt !== null && obj.sleepStartAt !== undefined) healthObj.sleepStartAt = obj.sleepStartAt;
      if (obj.sleepEndAt !== '' && obj.sleepEndAt !== null && obj.sleepEndAt !== undefined) healthObj.sleepEndAt = obj.sleepEndAt;
      if (obj.sleepSessions !== '' && obj.sleepSessions !== null && obj.sleepSessions !== undefined) healthObj.sleepSessions = _parseJsonCell(obj.sleepSessions);
      if (obj.sleepSessionCount !== '' && obj.sleepSessionCount !== null && obj.sleepSessionCount !== undefined) healthObj.sleepSessionCount = Number(obj.sleepSessionCount);
      if (obj.napMinutes !== '' && obj.napMinutes !== null && obj.napMinutes !== undefined) healthObj.napMinutes = Number(obj.napMinutes);
      if (obj.napStartAt !== '' && obj.napStartAt !== null && obj.napStartAt !== undefined) healthObj.napStartAt = obj.napStartAt;
      if (obj.napEndAt !== '' && obj.napEndAt !== null && obj.napEndAt !== undefined) healthObj.napEndAt = obj.napEndAt;
      if (obj.napSessions !== '' && obj.napSessions !== null && obj.napSessions !== undefined) healthObj.napSessions = _parseJsonCell(obj.napSessions);
      if (obj.napCount !== '' && obj.napCount !== null && obj.napCount !== undefined) healthObj.napCount = Number(obj.napCount);
      if (obj.sleepAnchor !== '' && obj.sleepAnchor !== null && obj.sleepAnchor !== undefined) healthObj.sleepAnchor = obj.sleepAnchor;
      if (obj.sleepSummary !== '' && obj.sleepSummary !== null && obj.sleepSummary !== undefined) healthObj.sleepSummary = obj.sleepSummary;
      if (obj.heartRateAvg !== '' && obj.heartRateAvg !== null && obj.heartRateAvg !== undefined) healthObj.heartRateAvg = Number(obj.heartRateAvg);
      if (obj.restingHeartRate !== '' && obj.restingHeartRate !== null && obj.restingHeartRate !== undefined) healthObj.restingHeartRate = Number(obj.restingHeartRate);
      byDate[d].health = healthObj;
      if (obj.updatedAt && _safeDateTs(obj.updatedAt) > _safeDateTs(byDate[d].updatedAt)) {
        byDate[d].updatedAt = obj.updatedAt;
      }
    }
  }

  // --- daily_summary シートから読み込む ---
  var summarySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('daily_summary');
  if (summarySheet) {
    summarySheet = _sheetWithHeaders('daily_summary', _dailySummaryHeaders());
  }
  if (summarySheet && summarySheet.getLastRow() > 1) {
    var headers = summarySheet.getRange(1, 1, 1, summarySheet.getLastColumn()).getValues()[0];
    var data = summarySheet.getRange(2, 1, summarySheet.getLastRow() - 1, summarySheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      var d = _normDate(obj.date);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d };
      var dsRevision = parseInt(obj.revision) || 0;
      // conditionデータ
      if (!_isBlankCell(obj.fatigue) || !_isBlankCell(obj.muscleSoreness) || !_isBlankCell(obj.sorenessAreas) || !_isBlankCell(obj.motivation) || !_isBlankCell(obj.mood) || !_isBlankCell(obj.memo)) {
        byDate[d].condition = {
          date: d,
          fatigue: Number(obj.fatigue) || 0,
          muscleSoreness: Number(obj.muscleSoreness) || 0,
          sorenessAreas: obj.sorenessAreas || '',
          motivation: Number(obj.motivation) || 3,
          mood: Number(obj.mood) || 3,
          note: obj.memo || ''
        };
      }
      // judgmentデータ
      if (obj.judgmentResult) {
        byDate[d].judgment = {
          date: d,
          result: Number(obj.judgmentResult),
          score: Number(obj.judgmentScore) || 0,
          resultLabel: obj.judgmentReason || ''
        };
      }
      // workoutデータ。詳細な開始/終了時刻は workout_sessions があれば後で上書きする。
      if (!_isBlankCell(obj.didWorkout) || !_isBlankCell(obj.workoutType)) {
        var workoutStatus = obj.didWorkout === 'skip'
          ? 'skipped'
          : (obj.didWorkout === 'in_progress' ? 'in_progress' : (obj.didWorkout === 'yes' || obj.didWorkout === true ? 'completed' : 'draft'));
        byDate[d].workout = {
          date: d,
          type: obj.workoutType || (obj.didWorkout === 'skip' ? 'skip' : 'full'),
          status: workoutStatus,
          durationMinutes: _numberOrNull(obj.totalDurationMinutes) || 0,
          skipReason: obj.skipReason || '',
          memo: obj.memo || ''
        };
      }
      // daily_summary の revision (最大値を使用)
      if (!byDate[d]._revision || dsRevision > byDate[d]._revision) {
        byDate[d]._revision = dsRevision;
      }
      if (obj.updatedAt && _safeDateTs(obj.updatedAt) > _safeDateTs(byDate[d].updatedAt)) {
        byDate[d].updatedAt = obj.updatedAt;
      }
    }
  }

  // --- workout_sessions -> タイマー/実測時間メタデータ ---
  var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('workout_sessions');
  if (sessionSheet && sessionSheet.getLastRow() > 1) {
    sessionSheet = _sheetWithHeaders('workout_sessions', _workoutSessionHeaders());
    var sessionHeaders = sessionSheet.getRange(1, 1, 1, sessionSheet.getLastColumn()).getValues()[0];
    var sessionRows = sessionSheet.getRange(2, 1, sessionSheet.getLastRow() - 1, sessionSheet.getLastColumn()).getValues();
    for (var si = 0; si < sessionRows.length; si++) {
      var sessionRaw = {};
      sessionHeaders.forEach(function(h, idx) { sessionRaw[h] = sessionRows[si][idx]; });
      var session = _normalizeWorkoutSession(sessionRaw);
      var sd = session.date;
      if (!sd) continue;
      if (!byDate[sd]) byDate[sd] = { date: sd };
      byDate[sd].workout = {
        date: sd,
        type: session.workoutType || (session.status === 'skipped' ? 'skip' : 'full'),
        status: session.status,
        startAt: session.startAt || '',
        startTime: session.startTime || '',
        endAt: session.endAt || '',
        endTime: session.endTime || '',
        durationMinutes: session.durationMinutes !== '' ? session.durationMinutes : 0,
        timerState: session.timerState || '',
        timerStartedAt: session.timerStartedAt || '',
        timerElapsedSeconds: session.timerElapsedSeconds !== '' ? session.timerElapsedSeconds : 0,
        timerUpdatedAt: session.timerUpdatedAt || '',
        feeling: session.feeling !== '' ? session.feeling : null,
        memo: session.memo || '',
        skipReason: session.skipReason || '',
        updatedAt: session.updatedAt || '',
        _revision: session._revision || 0
      };
      if (session.updatedAt && _safeDateTs(session.updatedAt) > _safeDateTs(byDate[sd].updatedAt)) {
        byDate[sd].updatedAt = session.updatedAt;
      }
    }
  }

  // --- workout_details -> exercises ---
  var detailsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('workout_details');
  if (detailsSheet && detailsSheet.getLastRow() > 1) {
    var detailHeaders = detailsSheet.getRange(1, 1, 1, detailsSheet.getLastColumn()).getValues()[0];
    var detailRows = detailsSheet.getRange(2, 1, detailsSheet.getLastRow() - 1, detailsSheet.getLastColumn()).getValues();
    var currentByDate = {};
    for (var wi = 0; wi < detailRows.length; wi++) {
      var detail = {};
      detailHeaders.forEach(function(h, idx) { detail[h] = detailRows[wi][idx]; });
      var wd = _normDate(detail.date);
      if (!wd) continue;
      if (!byDate[wd]) byDate[wd] = { date: wd };
      if (!byDate[wd].workout) {
        byDate[wd].workout = {
          date: wd,
          type: detail.workoutType || 'full'
        };
      }
      if (!byDate[wd].exercises) byDate[wd].exercises = [];

      var exerciseName = detail.exerciseName || '';
      var setIndex = Number(detail.setIndex) || 1;
      var weight = _numberOrNull(detail.weightKg);
      var reps = _numberOrNull(detail.reps);
      var targetWeight = _numberOrNull(detail.targetWeightKg);
      var targetReps = _numberOrNull(detail.targetReps);
      var speedKmh = _numberOrNull(detail.speedKmh);
      var durationMin = _numberOrNull(detail.durationMin);
      var note = detail.note || '';
      var isCardio = _looksLikeDurationNote(note) || (weight === 0 && reps === 0 && Number(detail.setCount) === 1);
      var cardioDuration = isCardio ? (durationMin || _extractMinutes(note) || (reps != null && reps > 0 ? reps : 0)) : 0;
      var cardioSpeed = isCardio ? (speedKmh || _extractSpeed(note) || (weight != null && weight > 0 ? weight : 5)) : 0;
      var current = currentByDate[wd];
      var shouldStartExercise = !current
        || current.name !== exerciseName
        || (setIndex <= current._lastSetIndex && current.sets.length > 0);

      if (shouldStartExercise) {
        current = {
          name: exerciseName,
          sets: [],
          isCardio: isCardio,
          durationMin: cardioDuration,
          speed: cardioSpeed,
          recommended: {
            weight: targetWeight != null ? targetWeight : 0,
            reps: targetReps != null ? targetReps : 0,
            sets: Number(detail.setCount) || 0,
            note: isCardio ? '' : (detail.note || '')
          },
          _lastSetIndex: 0
        };
        byDate[wd].exercises.push(current);
        currentByDate[wd] = current;
      }

      current.sets.push({
        setNumber: setIndex,
        weight: weight != null ? weight : 0,
        reps: reps != null ? reps : 0,
        completed: _isYes(detail.completed)
      });
      current._lastSetIndex = setIndex;
      if (isCardio) {
        current.durationMin = current.durationMin || cardioDuration;
        current.speed = current.speed || cardioSpeed;
      }

      if (detail.updatedAt && _safeDateTs(detail.updatedAt) > _safeDateTs(byDate[wd].updatedAt)) {
        byDate[wd].updatedAt = detail.updatedAt;
      }
    }
    for (var ed in byDate) {
      if (!byDate[ed].exercises) continue;
      byDate[ed].exercises.forEach(function(ex, idx) {
        delete ex._lastSetIndex;
        ex.orderIndex = idx;
      });
    }
  }

  // --- RawData (後方互換) ---
  var rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RawData');
  if (rawSheet && rawSheet.getLastRow() > 0) {
    var rawValues = rawSheet.getDataRange().getValues();
    for (var i = 0; i < rawValues.length; i++) {
      if (rawValues[i][1]) {
        try {
          var parsed = _normalizePayload(JSON.parse(rawValues[i][1]));
          if (parsed.date === '_settings') continue;
          if (parsed.date && !byDate[parsed.date]) {
            byDate[parsed.date] = parsed;
          }
        } catch(ex){}
      }
    }
  }

  // --- tombstones: 他端末への削除伝搬 ---
  var tombstones = _getTombstones();
  for (var tDate in tombstones) {
    if (!byDate[tDate]) byDate[tDate] = { date: tDate };
    byDate[tDate]._deleted = tombstones[tDate];
  }

  // 設定
  var settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('settings');
  if (settingsSheet) {
    var settingsData = _loadSettings(settingsSheet);
    if (settingsData) {
      var results = [];
      for (var key in byDate) {
        results.push(byDate[key]);
      }
      results.push(settingsData);
      return results;
    }
  }

  var results = [];
  for (var key in byDate) {
    results.push(byDate[key]);
  }
  return results;
}

function _getDate(dateStr) {
  if (!dateStr) throw new Error('date required');
  var target = _normDate(dateStr);
  var items = _getAll();
  for (var i = 0; i < items.length; i++) {
    if (_normDate(items[i].date) === target) return items[i];
  }
  return null;
}

// ============ 同期ログ ============
function _appendSyncLog(timestamp, action, date, device, status, error) {
  var sheet = _sheetWithHeaders('sync_log', [
    'timestamp','action','date','device','status','error'
  ]);
  sheet.appendRow([timestamp, action, date, device, status, error]);
  var rows = sheet.getLastRow();
  if (rows > 201) {
    sheet.deleteRows(2, rows - 201);
  }
}

function _getSyncLog() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('sync_log');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  }).reverse().slice(0, 50);
}

// ============ アーカイブ ============
function _archiveOldRows(olderThanDays) {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  var cutoffStr = cutoff.toISOString().slice(0, 10);
  var archived = 0;

  // workout_details のアーカイブ
  var wdSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('workout_details');
  if (wdSheet && wdSheet.getLastRow() > 1) {
    var wdHeaders = wdSheet.getRange(1, 1, 1, wdSheet.getLastColumn()).getValues()[0];
    var archSheet = _sheetWithHeaders('archive_workout_details', wdHeaders);
    var data = wdSheet.getDataRange().getValues();
    var toDelete = [];
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) < cutoffStr) {
        archSheet.appendRow(data[i]);
        toDelete.push(i + 1);
        archived++;
      }
    }
    for (var j = 0; j < toDelete.length; j++) {
      wdSheet.deleteRow(toDelete[j]);
    }
  }

  // daily_summary のアーカイブ（365日超え分のみ）
  var dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('daily_summary');
  if (dsSheet && dsSheet.getLastRow() > 1) {
    var archCutoff = new Date();
    archCutoff.setDate(archCutoff.getDate() - 365);
    var archCutoffStr = archCutoff.toISOString().slice(0, 10);
    var dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
    var archDsSheet = _sheetWithHeaders('archive_daily', dsHeaders);
    var dsData = dsSheet.getDataRange().getValues();
    var dsToDelete = [];
    for (var i = dsData.length - 1; i >= 1; i--) {
      if (String(dsData[i][0]) < archCutoffStr) {
        archDsSheet.appendRow(dsData[i]);
        dsToDelete.push(i + 1);
        archived++;
      }
    }
    for (var j = 0; j < dsToDelete.length; j++) {
      dsSheet.deleteRow(dsToDelete[j]);
    }
  }

  // tombstones のクリーンアップ（90日超え分を削除）
  var tsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tombstones');
  if (tsSheet && tsSheet.getLastRow() > 1) {
    var tsData = tsSheet.getDataRange().getValues();
    for (var i = tsData.length - 1; i >= 1; i--) {
      var delAt = tsData[i][2];
      if (delAt && _safeDateTs(delAt) < cutoff.getTime()) {
        tsSheet.deleteRow(i + 1);
      }
    }
  }

  return { archived: archived, olderThan: cutoffStr };
}

// ============ 設定 ============
function _saveSettings(settings, updatedAt) {
  var sheet = _sheetWithHeaders('settings', ['key', 'value', 'updatedAt']);
  var normalized = _normalizeSharedSettings(settings);
  for (var key in normalized) {
    var value = normalized[key];
    var idx = _findRow(sheet, key);
    if (idx > -1) {
      sheet.getRange(idx, 2).setValue(String(value));
      sheet.getRange(idx, 3).setValue(updatedAt);
    } else {
      sheet.appendRow([key, String(value), updatedAt]);
    }
  }
}

function _loadSettings(sheet) {
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  var settings = {};
  var latestUpdate = '';
  for (var i = 1; i < data.length; i++) {
    var key = data[i][0];
    if (SHARED_SETTING_KEYS.indexOf(key) === -1) continue;
    var val = _coerceSharedSettingValue(key, data[i][1]);
    settings[key] = val;
    if (data[i][2] && data[i][2] > latestUpdate) latestUpdate = data[i][2];
  }
  return { date: '_settings', updatedAt: latestUpdate, settingsType: 'shared', settings: settings };
}

// ============ ヘルパー ============

function _safeDateTs(v) {
  if (!v && v !== 0) return 0;
  if (v instanceof Date) return v.getTime();
  var t = new Date(String(v)).getTime();
  return isNaN(t) ? 0 : t;
}

function _normDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var y = v.getFullYear();
    var m = ('0' + (v.getMonth() + 1)).slice(-2);
    var d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var y = dt.getFullYear();
    var m = ('0' + (dt.getMonth() + 1)).slice(-2);
    var d = ('0' + dt.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return s;
}

function _normTime(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var h = ('0' + v.getHours()).slice(-2);
    var m = ('0' + v.getMinutes()).slice(-2);
    return h + ':' + m;
  }
  var s = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0');
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var h = ('0' + dt.getHours()).slice(-2);
    var m = ('0' + dt.getMinutes()).slice(-2);
    return h + ':' + m;
  }
  return s;
}

function _sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  return s;
}

function _sheetWithHeaders(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    s.setFrozenRows(1);
    return s;
  }

  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    s.setFrozenRows(1);
    return s;
  }

  var lastRow = s.getLastRow();
  var lastCol = Math.max(s.getLastColumn(), 1);
  var values = s.getRange(1, 1, lastRow, lastCol).getValues();
  var currentHeaders = values[0].map(function(h) { return String(h || '').trim(); });
  var currentIndex = {};
  for (var i = 0; i < currentHeaders.length; i++) {
    if (currentHeaders[i] && currentIndex[currentHeaders[i]] == null) {
      currentIndex[currentHeaders[i]] = i;
    }
  }

  var needsNormalize = false;
  for (var hi = 0; hi < headers.length; hi++) {
    if (currentHeaders[hi] !== headers[hi]) {
      needsNormalize = true;
      break;
    }
  }
  if (!needsNormalize) return s;

  var extraHeaders = [];
  for (var ei = 0; ei < currentHeaders.length; ei++) {
    var existingHeader = currentHeaders[ei];
    if (existingHeader && headers.indexOf(existingHeader) === -1 && extraHeaders.indexOf(existingHeader) === -1) {
      extraHeaders.push(existingHeader);
    }
  }

  var desiredIndex = {};
  for (var di = 0; di < headers.length; di++) desiredIndex[headers[di]] = di;
  var newHeaders = headers.concat(extraHeaders);
  var missingSorenessAreas = name === 'daily_summary' && currentIndex.sorenessAreas == null && desiredIndex.sorenessAreas != null;
  var newValues = [newHeaders];

  for (var r = 1; r < values.length; r++) {
    var sourceRow = values[r];
    var useDailySummaryPosition = missingSorenessAreas && _dailySummaryRowLooksCanonical(sourceRow, desiredIndex, headers.length);
    var newRow = [];
    for (var c = 0; c < newHeaders.length; c++) {
      var header = newHeaders[c];
      var sourceIdx = null;
      if (useDailySummaryPosition && c < headers.length) {
        sourceIdx = c;
      } else if (currentIndex[header] != null) {
        sourceIdx = currentIndex[header];
      }
      newRow.push(sourceIdx != null && sourceRow[sourceIdx] != null ? sourceRow[sourceIdx] : '');
    }
    newValues.push(newRow);
  }

  if (s.getMaxColumns() < newHeaders.length) {
    s.insertColumnsAfter(s.getMaxColumns(), newHeaders.length - s.getMaxColumns());
  }
  if (s.getMaxRows() < newValues.length) {
    s.insertRowsAfter(s.getMaxRows(), newValues.length - s.getMaxRows());
  }
  s.clearContents();
  s.getRange(1, 1, newValues.length, newHeaders.length).setValues(newValues);
  s.getRange(1, 1, 1, newHeaders.length).setFontWeight('bold');
  s.setFrozenRows(1);
  return s;
}

function _dailySummaryRowLooksCanonical(row, desiredIndex, expectedLength) {
  if (!row || row.length < expectedLength) return false;
  var area = row[desiredIndex.sorenessAreas];
  if (_looksLikeAreaList(area)) return true;
  if (_isBlankCell(area)) {
    return _isLikelyScore(row[desiredIndex.motivation]) && _isLikelyScore(row[desiredIndex.mood]);
  }
  return false;
}

function _looksLikeAreaList(v) {
  if (_isBlankCell(v)) return false;
  var s = String(v).trim();
  return s.indexOf(',') > -1 || isNaN(Number(s));
}

function _isLikelyScore(v) {
  if (_isBlankCell(v)) return false;
  var n = Number(v);
  return !isNaN(n) && n >= 0 && n <= 5;
}

function _numberOrNull(v) {
  if (_isBlankCell(v)) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function _isYes(v) {
  if (v === true) return true;
  var s = String(v || '').toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'done';
}

function _looksLikeDurationNote(v) {
  if (_isBlankCell(v)) return false;
  return /(\d+)\s*(分|min)/i.test(String(v));
}

function _extractMinutes(v) {
  if (_isBlankCell(v)) return 0;
  var m = String(v).match(/(\d+)\s*(分|min)/i);
  return m ? Number(m[1]) || 0 : 0;
}

function _extractSpeed(v) {
  if (_isBlankCell(v)) return 0;
  var m = String(v).match(/(\d+(?:\.\d+)?)\s*km\s*\/?\s*h/i);
  return m ? Number(m[1]) || 0 : 0;
}

function _isBlankCell(v) {
  return v === '' || v === null || v === undefined;
}

function _findRow(sheet, key) {
  var data = sheet.getDataRange().getValues();
  var normKey = _normDate(key) || String(key).trim();
  for (var i = 1; i < data.length; i++) {
    var cellVal = _normDate(data[i][0]) || String(data[i][0]).trim();
    if (cellVal === normKey) return i + 1;
  }
  return -1;
}

function _upsertRow(sheet, key, row, clientRevision) {
  var idx = _findRow(sheet, key);
  if (idx > -1) {
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var revIdx = headers.indexOf('revision');
    if (revIdx > -1) {
      var serverRev = parseInt(sheet.getRange(idx, revIdx + 1).getValue()) || 0;
      // conflict検出: クライアントがrevisionを明示的に送信した場合のみ照合
      if (clientRevision != null && clientRevision > 0 && serverRev > clientRevision) {
        throw new Error('CONFLICT: revision mismatch (server=' + serverRev + ', client=' + clientRevision + ') for key=' + key);
      }
      row[revIdx] = serverRev + 1;
    }
    sheet.getRange(idx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function _deleteRowsByDate(sheet, dateStr) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (_normDate(data[i][0]) === _normDate(dateStr)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
