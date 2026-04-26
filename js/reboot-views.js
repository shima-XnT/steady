(function() {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  const CONDITION_OPTIONS = {
    fatigue: {
      label: 'コンディション',
      helper: '今日の状態を選びます。',
      options: [
        { value: 1, label: '良好', hint: '通常' },
        { value: 2, label: '標準', hint: '通常' },
        { value: 3, label: '調整', hint: '短め' },
        { value: 4, label: '軽め', hint: '軽め' },
        { value: 5, label: 'オフ', hint: '休み' }
      ]
    },
    muscleSoreness: {
      label: '張り',
      helper: '気になる部位の強さを選びます。',
      options: [
        { value: 0, label: 'なし', hint: '問題なし' },
        { value: 1, label: '少し', hint: '軽い張り' },
        { value: 2, label: '中', hint: '部位選択' },
        { value: 3, label: '強め', hint: '調整' },
        { value: 4, label: '回復優先', hint: '休み' }
      ]
    },
    motivation: {
      label: '集中度',
      helper: '進めやすさを選びます。',
      options: [
        { value: 1, label: '低', hint: '軽め' },
        { value: 2, label: 'やや低', hint: '短め' },
        { value: 3, label: '普通', hint: '標準' },
        { value: 4, label: '高', hint: '通常' },
        { value: 5, label: '高め', hint: '通常' }
      ]
    },
    mood: {
      label: '全体状態',
      helper: '全体の状態を選びます。',
      options: [
        { value: 1, label: '休み寄り', hint: '調整' },
        { value: 2, label: '軽め', hint: '短め' },
        { value: 3, label: '普通', hint: '標準' },
        { value: 4, label: '良好', hint: '通常' },
        { value: 5, label: '高め', hint: '通常' }
      ]
    }
  };

  const SORENESS_AREAS = ['脚', '背中', '胸', '肩', '腕', '体幹'];

  const SHIFT_PRESETS = {
    off: { label: '休み', start: '', end: '' },
    paid_leave: { label: '有給', start: '', end: '' },
    normal: { label: '通常勤務', start: '09:00', end: '18:00' },
    project: { label: '案件あり勤務', start: '09:00', end: '18:00' },
    business_trip: { label: '出張勤務', start: '09:00', end: '18:00' }
  };

  function isRestShiftType(type) {
    return App.FinalPolish?.isRestShiftType
      ? App.FinalPolish.isRestShiftType(type)
      : type === 'off' || type === 'paid_leave';
  }

  const WORKOUT_TIMER_START_KEY = 'steady_workout_timer_start';
  const WORKOUT_TIMER_DATE_KEY = 'steady_workout_timer_date';
  const WORKOUT_TIMER_ELAPSED_KEY = 'steady_workout_timer_elapsed_seconds';
  const WORKOUT_TIMER_STATE_KEY = 'steady_workout_timer_state';
  let workoutTimer = null;
  let workoutStartTime = (() => {
    const saved = Number(localStorage.getItem(WORKOUT_TIMER_START_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  })();
  let workoutElapsedSeconds = (() => {
    const saved = Number(localStorage.getItem(WORKOUT_TIMER_ELAPSED_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  })();
  let workoutTimerState = (() => {
    const saved = localStorage.getItem(WORKOUT_TIMER_STATE_KEY);
    if (saved === 'paused' || saved === 'running') return saved;
    return workoutStartTime ? 'running' : 'idle';
  })();
  let currentExercises = [];
  let currentWorkoutId = null;
  let currentWorkoutType = null;
  let workoutCloudSaveTimer = null;
  let workoutCloudSaveInFlight = false;
  let workoutCloudSaveAgain = false;
  let workoutLocalSaveChain = Promise.resolve();
  const WORKOUT_DRAFT_SHADOW_PREFIX = 'steady_workout_draft_';

  function workoutDraftShadowKey(dateStr) {
    return `${WORKOUT_DRAFT_SHADOW_PREFIX}${dateStr}`;
  }

  function safeShadowTs(value) {
    if (!value) return 0;
    const ts = new Date(String(value)).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  function cloneWorkoutDraftExercises(exercises) {
    if (!Array.isArray(exercises) || exercises.length === 0) return [];
    try {
      return JSON.parse(JSON.stringify(exercises));
    } catch (error) {
      console.warn('[Workout] Failed to clone exercises for shadow draft:', error);
      return [];
    }
  }

  function readWorkoutDraftShadow(dateStr) {
    if (!dateStr) return null;
    try {
      const raw = localStorage.getItem(workoutDraftShadowKey(dateStr));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.date !== dateStr) return null;
      return parsed;
    } catch (error) {
      console.warn('[Workout] Failed to read draft shadow:', error);
      return null;
    }
  }

  function buildWorkoutDraftShadow(dateStr, overrides = {}) {
    if (!dateStr) return null;
    const base = {
      date: dateStr,
      workoutId: currentWorkoutId || null,
      workoutType: currentWorkoutType || null,
      exercises: cloneWorkoutDraftExercises(currentExercises),
      timerState: workoutTimerState || 'idle',
      timerStart: workoutStartTime || null,
      timerElapsedSeconds: getWorkoutElapsedSeconds(),
      updatedAt: new Date().toISOString()
    };
    const shadow = { ...base, ...overrides };
    if (Object.prototype.hasOwnProperty.call(overrides, 'exercises')) {
      shadow.exercises = cloneWorkoutDraftExercises(overrides.exercises);
    }
    return shadow;
  }

  function persistWorkoutDraftShadow(dateStr, overrides = {}) {
    const shadow = buildWorkoutDraftShadow(dateStr, overrides);
    if (!shadow) return null;
    try {
      localStorage.setItem(workoutDraftShadowKey(dateStr), JSON.stringify(shadow));
      return shadow;
    } catch (error) {
      console.warn('[Workout] Failed to persist draft shadow:', error);
      return null;
    }
  }

  function clearWorkoutDraftShadow(dateStr) {
    if (!dateStr) return;
    localStorage.removeItem(workoutDraftShadowKey(dateStr));
  }

  function workoutDraftShadowIsNewer(dateStr, updatedAt = '') {
    const shadow = readWorkoutDraftShadow(dateStr);
    if (!shadow) return false;
    return safeShadowTs(shadow.updatedAt) > safeShadowTs(updatedAt);
  }

  function buildWorkoutFromShadow(existingWorkout, draftShadow, dateStr) {
    if (!draftShadow) return existingWorkout;
    const timerStartIso = draftShadow.timerStart ? new Date(draftShadow.timerStart).toISOString() : '';
    const hasDraftContent =
      safeNumber(draftShadow.timerElapsedSeconds, 0) > 0 ||
      draftShadow.timerState === 'running' ||
      draftShadow.timerState === 'paused' ||
      (Array.isArray(draftShadow.exercises) && draftShadow.exercises.length > 0);

    return {
      ...(existingWorkout || {}),
      id: draftShadow.workoutId || existingWorkout?.id || null,
      date: dateStr,
      type: draftShadow.workoutType || existingWorkout?.type || 'custom',
      status: workoutIsFinished(existingWorkout)
        ? (existingWorkout?.status || 'completed')
        : (hasDraftContent ? 'in_progress' : (existingWorkout?.status || 'draft')),
      startAt: timerStartIso || existingWorkout?.startAt || '',
      startTime: draftShadow.timerStart ? timerTimeLabel(draftShadow.timerStart) : (existingWorkout?.startTime || ''),
      updatedAt: draftShadow.updatedAt || existingWorkout?.updatedAt || '',
      timerState: draftShadow.timerState || existingWorkout?.timerState || 'idle',
      timerStartedAt: draftShadow.timerState === 'paused' ? '' : (timerStartIso || existingWorkout?.timerStartedAt || ''),
      timerElapsedSeconds: safeNumber(draftShadow.timerElapsedSeconds, existingWorkout?.timerElapsedSeconds || 0),
      timerUpdatedAt: draftShadow.updatedAt || existingWorkout?.timerUpdatedAt || ''
    };
  }

  App.WorkoutDraftShadow = {
    read: readWorkoutDraftShadow,
    writeCurrent: persistWorkoutDraftShadow,
    clear: clearWorkoutDraftShadow,
    isNewer: workoutDraftShadowIsNewer
  };

  window.addEventListener('pagehide', () => {
    const dateStr = App.Utils?.today?.() || localStorage.getItem(WORKOUT_TIMER_DATE_KEY) || '';
    const hasDraftState =
      !!currentWorkoutId ||
      !!currentWorkoutType ||
      (Array.isArray(currentExercises) && currentExercises.length > 0) ||
      getWorkoutElapsedSeconds() > 0;
    if (dateStr && hasDraftState) {
      persistWorkoutDraftShadow(dateStr);
    }
  });

  function clearWorkoutTimerState() {
    if (workoutTimer) {
      clearInterval(workoutTimer);
      workoutTimer = null;
    }
    workoutStartTime = null;
    workoutElapsedSeconds = 0;
    workoutTimerState = 'idle';
    localStorage.removeItem(WORKOUT_TIMER_START_KEY);
    localStorage.removeItem(WORKOUT_TIMER_DATE_KEY);
    localStorage.removeItem(WORKOUT_TIMER_ELAPSED_KEY);
    localStorage.removeItem(WORKOUT_TIMER_STATE_KEY);
  }

  function timerTimeLabel(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toTimeString().slice(0, 5);
  }

  function timerDateLabel(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return App.Utils?._localDateStr ? App.Utils._localDateStr(date) : date.toISOString().slice(0, 10);
  }

  function persistWorkoutTimerState(dateStr = null) {
    if (workoutStartTime) {
      localStorage.setItem(WORKOUT_TIMER_START_KEY, String(workoutStartTime));
      localStorage.setItem(WORKOUT_TIMER_DATE_KEY, dateStr || timerDateLabel(workoutStartTime));
    } else {
      localStorage.removeItem(WORKOUT_TIMER_START_KEY);
      if (dateStr) localStorage.setItem(WORKOUT_TIMER_DATE_KEY, dateStr);
    }
    localStorage.setItem(WORKOUT_TIMER_ELAPSED_KEY, String(Math.max(0, Math.floor(workoutElapsedSeconds || 0))));
    localStorage.setItem(WORKOUT_TIMER_STATE_KEY, workoutTimerState || 'idle');
  }

  function setWorkoutTimerStart(timestamp, dateStr = null, elapsedSeconds = workoutElapsedSeconds) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return;
    workoutStartTime = value;
    workoutElapsedSeconds = Math.max(0, Math.floor(safeNumber(elapsedSeconds, 0)));
    workoutTimerState = 'running';
    persistWorkoutTimerState(dateStr || timerDateLabel(value));
  }

  function setWorkoutTimerPaused(elapsedSeconds, dateStr = null) {
    if (workoutTimer) {
      clearInterval(workoutTimer);
      workoutTimer = null;
    }
    workoutStartTime = null;
    workoutElapsedSeconds = Math.max(0, Math.floor(safeNumber(elapsedSeconds, 0)));
    workoutTimerState = workoutElapsedSeconds > 0 ? 'paused' : 'idle';
    persistWorkoutTimerState(dateStr);
  }

  function savedWorkoutTimerForDate(dateStr) {
    const saved = Number(localStorage.getItem(WORKOUT_TIMER_START_KEY));
    const savedDate = localStorage.getItem(WORKOUT_TIMER_DATE_KEY) || timerDateLabel(saved);
    if (savedDate !== dateStr) return null;
    const elapsed = Number(localStorage.getItem(WORKOUT_TIMER_ELAPSED_KEY));
    const state = localStorage.getItem(WORKOUT_TIMER_STATE_KEY) || (Number.isFinite(saved) && saved > 0 ? 'running' : 'idle');
    return {
      start: Number.isFinite(saved) && saved > 0 ? saved : null,
      elapsedSeconds: Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0,
      state
    };
  }

  function parseWorkoutStart(workout) {
    if (!workout) return null;
    const startAt = workout.startAt ? Date.parse(workout.startAt) : NaN;
    if (Number.isFinite(startAt) && startAt > 0) return startAt;
    if (workout.date && workout.startTime && /^\d{1,2}:\d{2}$/.test(String(workout.startTime))) {
      const t = Date.parse(`${workout.date}T${String(workout.startTime).padStart(5, '0')}:00`);
      if (Number.isFinite(t) && t > 0) return t;
    }
    return null;
  }

  function workoutIsFinished(workout) {
    if (!workout) return false;
    return workout.type === 'skip' ||
      workout.status === 'completed' ||
      workout.status === 'skipped' ||
      !!workout.endAt ||
      !!workout.endTime;
  }

  function timerDisplayText() {
    const seconds = getWorkoutElapsedSeconds();
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
  }

  function getWorkoutElapsedSeconds() {
    const base = Math.max(0, Math.floor(safeNumber(workoutElapsedSeconds, 0)));
    if (workoutTimerState !== 'running' || !workoutStartTime) return base;
    return base + Math.max(0, Math.floor((Date.now() - workoutStartTime) / 1000));
  }

  function h(value) {
    return App.Utils.escapeHtml(value == null ? '' : String(value));
  }

  function resultValue(judgment) {
    if (!judgment) return null;
    return judgment.userOverride || judgment.result || null;
  }

  function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function editableNumberValue(value, fallback = '') {
    if (value == null || value === '') return fallback;
    return String(value);
  }

  function parseEditableNumber(value) {
    if (value == null || String(value).trim() === '') return null;
    return safeNumber(value, 0);
  }

  const EXERCISE_WEIGHT_STEPS = {
    leg_press: 5,
    chest_press: 5,
    lat_pulldown: 5,
    shoulder_press: 5,
    biceps_curl: 5,
    adduction: 5,
    dips: 0,
    ab_bench: 0
  };

  function getExerciseWeightStep(exercise) {
    const explicit = Number(exercise?.weightStep);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    const fallback = EXERCISE_WEIGHT_STEPS[exercise?.equipmentId];
    return Number.isFinite(fallback) ? fallback : 5;
  }

  function formatRecommendationNote(exercise) {
    const note = String(exercise?.recommended?.note || '').trim();
    if (!note) return '無理なく進める設定';
    const step = getExerciseWeightStep(exercise);
    return step > 0 ? note.replace(/\+?2\.5kg/g, `+${step}kg`) : note;
  }

  function formatMinutes(minutes) {
    if (minutes == null || minutes === '') return '未計算';
    return `${minutes}分`;
  }

  function formatWorkoutKind(type) {
    const labels = {
      full: '通常メニュー',
      short: '短縮メニュー',
      cardio: '有酸素中心',
      stretch: 'ストレッチ',
      skip: '休み'
    };
    return labels[type] || 'ワークアウト';
  }

  function formatTriplet(weight, reps, sets) {
    if (sets <= 0) return '未設定';
    if (weight > 0) return `${weight}kg × ${reps}回 × ${sets}セット`;
    return `${reps}回 × ${sets}セット`;
  }

  function summarizeExercise(exercise) {
    if (!exercise) return '未設定';
    if (exercise.isCardio) {
      return `速度${safeNumber(exercise.speed, 5)}km/h × ${safeNumber(exercise.durationMin || 0, 0)}分`;
    }
    const firstSet = exercise.sets?.[0] || {};
    return formatTriplet(safeNumber(firstSet.weight, 0), safeNumber(firstSet.reps, 0), exercise.sets?.length || 0);
  }

  function formatClockFromIso(value) {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }

  function formatSleepWindow(health) {
    const start = formatClockFromIso(health?.sleepStartAt);
    const end = formatClockFromIso(health?.sleepEndAt);
    return start && end ? `${start}-${end}` : '';
  }
  function normalizeNapSessions(health) {
    if (!health) return [];
    let sessions = health.napSessions;
    if (typeof sessions === 'string' && sessions.trim()) {
      try {
        sessions = JSON.parse(sessions);
      } catch (error) {
        sessions = null;
      }
    }
    if (Array.isArray(sessions) && sessions.length > 0) {
      return sessions.filter(Boolean);
    }
    if (health.napMinutes != null) {
      return [{
        minutes: health.napMinutes,
        startAt: health.napStartAt,
        endAt: health.napEndAt
      }];
    }
    return [];
  }
  function formatNapWindow(health) {
    const sessions = normalizeNapSessions(health);
    if (sessions.length === 0) return '';
    return sessions.map(session => {
      const minutes = session.minutes ?? session.durationMinutes ?? session.napMinutes;
      const start = formatClockFromIso(session.startAt ?? session.napStartAt);
      const end = formatClockFromIso(session.endAt ?? session.napEndAt);
      const duration = App.Utils.formatSleep(minutes) || (minutes != null ? `${minutes}分` : '');
      return start && end ? `${duration} ${start}-${end}` : duration;
    }).filter(Boolean).join(' / ');
  }
  function formatSleepDetail(health, fallback = '') {
    if (health?.sleepSummary) return String(health.sleepSummary);
    const parts = [];
    const sleepWindow = formatSleepWindow(health);
    const napWindow = formatNapWindow(health);
    if (sleepWindow) parts.push(sleepWindow);
    if (napWindow) parts.push(`仮眠 ${napWindow}`);
    return parts.join(' / ') || fallback;
  }
  App.Utils.formatClockFromIso = App.Utils.formatClockFromIso || formatClockFromIso;
  App.Utils.formatSleepWindow = App.Utils.formatSleepWindow || formatSleepWindow;
  App.Utils.formatNapWindow = App.Utils.formatNapWindow || formatNapWindow;
  App.Utils.normalizeNapSessions = App.Utils.normalizeNapSessions || normalizeNapSessions;
  App.Utils.formatSleepDetail = App.Utils.formatSleepDetail || formatSleepDetail;

  function countExerciseDone(exercise) {
    return (exercise.sets || []).filter(set => set.completed).length;
  }

  function isExerciseDone(exercise) {
    const sets = exercise.sets || [];
    return sets.length > 0 && sets.every(set => set.completed);
  }

  function workoutProgress(exercises) {
    const required = exercises.filter(ex => !ex.optional && ex.type !== 'stretch');
    const optional = exercises.filter(ex => ex.optional && ex.type !== 'stretch');
    const completedSets = exercises.reduce((sum, ex) => sum + countExerciseDone(ex), 0);
    const totalSets = exercises.reduce((sum, ex) => sum + ((ex.sets || []).length), 0);
    return {
      requiredDone: required.filter(isExerciseDone).length,
      requiredTotal: required.length,
      optionalDone: optional.filter(isExerciseDone).length,
      optionalTotal: optional.length,
      completedSets,
      totalSets
    };
  }

  function parseCsvAreas(text) {
    return new Set(String(text || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean));
  }

  function chipToneForResult(result) {
    if (result === 1) return 'success';
    if (result === 2 || result === 3) return 'busy';
    return 'warning';
  }

  function shiftLabel(type) {
    return App.FinalPolish.getShiftLabel(type);
  }

  function normalizeShiftType(type) {
    return App.FinalPolish.normalizeShiftType ? App.FinalPolish.normalizeShiftType(type) : type;
  }

  function availableMinutes(schedule) {
    return App.FinalPolish.getAvailableMinutes(schedule);
  }

  async function renderSyncPanel(actionHandler, actionLabel = '再同期') {
    const state = await App.DB.getSaveState();
    return App.Utils.renderSaveState(state, {
      actionLabel,
      actionHandler
    });
  }

  function describePlan(judgment, workout) {
    if (workout?.type === 'skip') {
      return {
        tone: 'warning',
        badge: '休み記録あり',
        title: '今日は休む判断まで残せています',
        body: workout.memo || '今日は調整日として記録します。',
        primaryLabel: '休み理由を見る',
        primaryRoute: 'workout',
        secondaryLabel: '履歴を見る',
        secondaryRoute: 'history'
      };
    }

    if (workout && workout.type !== 'skip') {
      return {
        tone: 'success',
        badge: '記録済み',
        title: '今日はもう記録まで完了しています',
        body: workout.memo || '必要なら内容を見直して、次回の負荷に活かします。',
        primaryLabel: '今日の記録を見る',
        primaryRoute: 'workout',
        secondaryLabel: '履歴を見る',
        secondaryRoute: 'history'
      };
    }

    const result = resultValue(judgment);

    if (!judgment || !result) {
      return {
        tone: 'neutral',
        badge: '最初の一歩',
        title: '先に当日判定を済ませる',
        body: '勤務、体調、健康データを合わせて、今日は行くか軽くやるか休むかを先に決めます。',
        primaryLabel: '当日判定へ',
        primaryRoute: 'condition',
        secondaryLabel: '勤務を確認',
        secondaryRoute: 'schedule'
      };
    }

    if (result === 1) {
      return {
        tone: 'success',
        badge: '通常メニュー',
        title: '今日はしっかり進めて大丈夫です',
      body: judgment.message || '必須種目を軸に、前回の実績から段階的に更新します。',
        primaryLabel: 'ワークアウト開始',
        primaryRoute: 'workout',
        secondaryLabel: '理由を確認',
        secondaryRoute: 'condition'
      };
    }

    if (result === 2) {
      return {
        tone: 'busy',
        badge: '短縮メニュー',
        title: '今日は短く確実に終える日です',
        body: judgment.message || '必須種目だけでも十分です。長引かせずに完了を優先します。',
        primaryLabel: '短時間で始める',
        primaryRoute: 'workout',
        secondaryLabel: '勤務を確認',
        secondaryRoute: 'schedule'
      };
    }

    if (result === 3 || result === 4) {
      return {
        tone: 'warning',
        badge: result === 3 ? '軽め推奨' : '回復推奨',
        title: result === 3 ? '今日は軽めの設定です' : '今日は回復優先です',
        body: judgment.message || '次回に向けて整える設定です。',
        primaryLabel: '内容を見る',
        primaryRoute: 'workout',
        secondaryLabel: '判定を見直す',
        secondaryRoute: 'condition'
      };
    }

    return {
      tone: 'warning',
      badge: '休み推奨',
      title: '今日は回復優先です',
      body: judgment.message || '今日は回復優先として、理由だけ残します。',
      primaryLabel: '休みを記録する',
      primaryRoute: 'workout',
      secondaryLabel: '判定を見直す',
      secondaryRoute: 'condition'
    };
  }

  function renderWeekRail(today, weekDates, weekWorkouts, weekJudgments) {
    const workoutMap = new Map(weekWorkouts.map(item => [item.date, item]));
    const judgmentMap = new Map(weekJudgments.map(item => [item.date, item]));

    return weekDates.map(date => {
      const workout = workoutMap.get(date);
      const judgment = judgmentMap.get(date);
      let state = 'idle';
      let label = '未記録';
      let note = 'まだ判断待ち';

      if (workout?.type === 'skip') {
        state = 'skip';
        label = '休み';
        note = workout.skipReason || workout.memo || '回復日';
      } else if (workout) {
        state = 'done';
        label = '完了';
        note = workout.memo || formatWorkoutKind(workout.type);
      } else if (judgment) {
        state = 'planned';
        label = '判定済';
        note = judgment.resultLabel || judgment.message || '今日は方針だけ決定';
      }

      return `
        <button class="reboot-week-card ${state} ${date === today ? 'today' : ''}" onclick="App.Views.Dashboard.openDate('${date}')">
          <span class="reboot-week-day">${h(App.Utils.getDayOfWeek(date))}</span>
          <strong class="reboot-week-date">${h(date.slice(-2))}</strong>
          <span class="reboot-week-label">${h(label)}</span>
          <span class="reboot-week-note">${h(note)}</span>
        </button>`;
    }).join('');
  }

  function renderDashboardLinks() {
    return `
      <div class="reboot-link-list reboot-dashboard-links">
        <button class="reboot-link-card" onclick="App.navigate('health')">
          <strong>健康</strong>
          <span>睡眠と心拍を見る</span>
        </button>
        <button class="reboot-link-card" onclick="App.navigate('schedule')">
          <strong>勤務</strong>
          <span>月表示と一覧</span>
        </button>
        <button class="reboot-link-card" onclick="App.navigate('analytics')">
          <strong>分析</strong>
          <span>睡眠と運動を比較</span>
        </button>
        <button class="reboot-link-card" onclick="App.navigate('history')">
          <strong>履歴</strong>
          <span>前回内容を確認</span>
        </button>
      </div>`;
  }

  function addDays(dateStr, offset) {
    const date = new Date(`${dateStr}T00:00:00`);
    date.setDate(date.getDate() + offset);
    return App.Utils._localDateStr(date);
  }

  function pickNextWorkoutWindow(today, schedules, targetMinutes = 40) {
    const scheduleMap = new Map((schedules || []).map(item => [item.date, item]));
    let fallback = null;

    for (let i = 1; i <= 10; i += 1) {
      const date = addDays(today, i);
      const schedule = scheduleMap.get(date);
      const minutes = availableMinutes(schedule);

      if (!schedule) {
        if (!fallback) {
          fallback = {
            date,
            label: '予定なし',
            note: '勤務未登録です。確認できれば候補にできます。'
          };
        }
        continue;
      }

      if (isRestShiftType(schedule.shiftType)) {
        return {
          date,
          label: shiftLabel(schedule.shiftType),
          note: 'いちばん動きやすい候補です。'
        };
      }

      if (schedule.shiftType === 'remote') {
        return {
          date,
          label: '在宅',
          note: '移動負荷が少なく、動きやすい日です。'
        };
      }

      if (minutes >= targetMinutes) {
        return {
          date,
          label: `${minutes}分`,
          note: '目安時間を確保しやすい日です。'
        };
      }

      if (!fallback && minutes >= 20) {
        fallback = {
          date,
          label: `${minutes}分`,
          note: '短めならつなぎやすい日です。'
        };
      }
    }

    return fallback;
  }

  async function buildDashboardData() {
    const today = App.Utils.today();
    const day = new Date(`${today}T00:00:00`);
    const monthStart = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-01`;
    const weekDates = App.Utils.getWeekDates(today);
    const lookaheadEnd = addDays(today, 10);
    const [judgment, condition, health, schedule, workout, lastWorkout, pendingCount, monthWorkoutCount, daysSinceLastWorkout, weekWorkouts, weekJudgments, sharedSettings, upcomingSchedules] = await Promise.all([
      App.DB.getJudgment(today),
      App.DB.getCondition(today),
      App.DB.getHealth(today),
      App.DB.getSchedule(today),
      App.DB.getWorkoutByDate(today),
      App.DB.getLastWorkout(),
      App.DB.getPendingCount(),
      App.DB.getWorkoutCountInRange(monthStart, today),
      App.DB.getDaysSinceLastWorkout(today),
      App.DB.getWorkoutsRange(weekDates[0], weekDates[6]),
      App.DB.getJudgmentRange(weekDates[0], weekDates[6]),
      App.DB.getSharedSettings(),
      App.DB.getScheduleRange(addDays(today, 1), lookaheadEnd)
    ]);

    return {
      today,
      judgment,
      condition,
      health,
      schedule,
      workout,
      lastWorkout,
      pendingCount,
      monthWorkoutCount,
      daysSinceLastWorkout,
      weekDates,
      weekWorkouts,
      weekJudgments,
      sharedSettings,
      nextChance: pickNextWorkoutWindow(today, upcomingSchedules, Number(sharedSettings?.sessionDuration || 40)),
      plan: describePlan(judgment, workout)
    };
  }

  App.Views.Dashboard = {
    async render() {
      const data = await buildDashboardData();
      this._data = data;

      const schedulePlace = schedulePlaceLine(data.schedule);
      const scheduleLine = data.schedule
        ? `${shiftLabel(data.schedule.shiftType)} / ${App.FinalPolish.formatShiftRange(data.schedule).replace(/\s+/g, ' ').trim()}${schedulePlace ? ` / ${schedulePlace}` : ''}`
        : '未設定';
      const todayState = data.workout
        ? (data.workout.type === 'skip' ? '休み記録済み' : 'ワークアウト記録済み')
        : (data.judgment ? '判定済み / 記録待ち' : '未判定');
      const tone = data.plan.tone === 'neutral' ? 'busy' : data.plan.tone;
      const judgmentValue = resultValue(data.judgment);
      const judgmentLabel = judgmentValue != null
        ? (App.Judgment.RESULT_LABELS[judgmentValue] || data.plan.badge)
        : '未判定';
      const reasonLine = ((data.judgment?.reasons && data.judgment.reasons[0]) || data.judgment?.message || data.plan.body || '勤務と体調を入れると、ここに理由が出ます。').replace(/\s+/g, ' ').trim();
      const nextChanceLabel = data.nextChance
        ? `${App.Utils.formatDate(data.nextChance.date)} / ${data.nextChance.label}`
        : '';

      return `
        <div class="container animate-in reboot-shell reboot-dashboard-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Dashboard</span>
              <h2>今日どうする？</h2>
              <p>判定、勤務、未送信を先に見ます。</p>
            </div>
            <div class="reboot-head-tools">
              ${await renderSyncPanel('App.Views.Dashboard.manualSync()')}
            </div>
          </section>

          <div class="reboot-dashboard-grid">
            <div class="reboot-main-stack">
              <section class="reboot-panel reboot-command-panel reboot-tone-${tone}">
                <div class="reboot-command-top reboot-command-top-compact">
                  <div class="reboot-command-copy">
                    <span class="reboot-eyebrow">今日の判定</span>
                    <h3>${h(judgmentLabel)}</h3>
                    <p>${h(data.plan.title)}</p>
                  </div>
                  <div class="reboot-command-score">${data.judgment?.score != null ? h(data.judgment.score) : '--'}</div>
                </div>

                <div class="reboot-command-meta">
                  <span class="reboot-pill reboot-pill-${tone}">${h(App.Utils.formatDate(data.today))}</span>
                  <span class="reboot-pill reboot-pill-neutral">${h(todayState)}</span>
                  ${data.pendingCount > 0 ? `<span class="reboot-pill reboot-pill-warning">未送信 ${data.pendingCount}件</span>` : '<span class="reboot-pill reboot-pill-success">未送信 0件</span>'}
                </div>

                <div class="reboot-highlight-line">
                  <span class="reboot-highlight-label">理由</span>
                  <strong>${h(reasonLine)}</strong>
                </div>

                <div class="reboot-metric-grid reboot-metric-grid-3 reboot-home-summary-grid">
                  <article class="reboot-stat-card">
                    <span>今日の勤務</span>
                    <strong>${h(scheduleLine)}</strong>
                    <small>${h(data.schedule?.note || '勤務メモなし')}</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>利用可能時間</span>
                    <strong>${h(formatMinutes(availableMinutes(data.schedule)))}</strong>
                    <small>終業後30分以降で計算</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>未送信</span>
                    <strong>${data.pendingCount}件</strong>
                    <small>${data.pendingCount > 0 ? '再同期で再送できます' : '共有側まで反映済みです'}</small>
                  </article>
                </div>

                <div class="reboot-home-actions">
                  <button class="btn btn-primary" onclick="App.navigate('condition')">判定する</button>
                  <button class="btn btn-secondary" onclick="App.navigate('workout')">トレーニング開始</button>
                  <button class="btn btn-ghost" onclick="App.navigate('health')">健康データ確認</button>
                </div>

                <div class="reboot-home-shortcuts">
                  <button class="reboot-link-card" onclick="App.navigate('schedule')">
                    <strong>勤務表</strong>
                    <span>今日と次の勤務を見る</span>
                  </button>
                  <button class="reboot-link-card" onclick="App.navigate('history')">
                    <strong>履歴</strong>
                    <span>前回内容を見返す</span>
                  </button>
                </div>
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>今週の記録</h3>
                    <p>今週の流れだけ下で確認できます。</p>
                  </div>
                  <span class="reboot-inline-note">${data.weekWorkouts.filter(item => item.type !== 'skip').length}回完了</span>
                </div>
                <div class="reboot-week-rail">
                  ${renderWeekRail(data.today, data.weekDates, data.weekWorkouts, data.weekJudgments)}
                </div>
              </section>
            </div>

            <aside class="reboot-side-stack">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>次に行けそうな日</h3>
                    <p>勤務から見た候補です。</p>
                  </div>
                </div>
                ${data.nextChance ? `
                  <div class="reboot-next-slot">
                    <strong class="reboot-next-date">${h(nextChanceLabel)}</strong>
                    <p class="reboot-next-note">${h(data.nextChance.note)}</p>
                    <button class="btn btn-secondary" onclick="App.Views.Dashboard.openDate('${data.nextChance.date}')">勤務を見る</button>
                  </div>` : `
                  <div class="reboot-empty-card">
                    <strong>候補なし</strong>
                    <span>直近の勤務からは候補が見つかりません。勤務表を見て調整します。</span>
                  </div>`}
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>前回の記録</h3>
                    <p>負荷を上げるか迷ったとき用です。</p>
                  </div>
                </div>
                ${data.lastWorkout ? `
                  <div class="reboot-detail-stack">
                    <div class="reboot-stat-row">
                      <span>日付</span>
                      <strong>${h(App.Utils.formatDate(data.lastWorkout.date))}</strong>
                    </div>
                    <div class="reboot-stat-row">
                      <span>種別</span>
                      <strong>${h(formatWorkoutKind(data.lastWorkout.type))}</strong>
                    </div>
                    <div class="reboot-stat-row">
                      <span>メモ</span>
                      <strong>${h(data.lastWorkout.memo || 'メモなし')}</strong>
                    </div>
                  </div>` : `
                  <div class="reboot-empty-card">
                    <strong>まだ履歴がありません</strong>
                    <span>最初の1回を記録すると、次回の推奨負荷に活かせます。</span>
                  </div>`}
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>その他</h3>
                    <p>PC で比較、スマホで補助導線として使います。</p>
                  </div>
                </div>
                ${renderDashboardLinks()}
              </section>
            </aside>
          </div>
        </div>`;
    },

    async manualSync() {
      App.Utils.showToast('再同期しています...', 'info', 2000);
      const result = await App.DB.syncNow('ダッシュボードから再同期');
      App.Utils.showSyncResult(result, {
        successMessage: result?.resent > 0 ? `再同期しました（未送信 ${result.resent}件を再送）` : '再同期しました',
        warningMessage: '未送信が残っています',
        errorPrefix: '再同期に失敗しました'
      });
      await App.refreshView();
    },

    openDate(dateStr) {
      if (dateStr === App.Utils.today()) {
        App.navigate('condition');
        return;
      }
      App.Views.WorkSchedule._selectedDate = dateStr;
      App.Views.WorkSchedule._tab = 'month';
      const parsed = new Date(`${dateStr}T00:00:00`);
      App.Views.WorkSchedule._year = parsed.getFullYear();
      App.Views.WorkSchedule._month = parsed.getMonth() + 1;
      App.navigate('schedule');
    },

    init() {},
    destroy() {
      this._data = null;
    }
  };

  function renderChoiceGroup(field, selectedValue) {
    const config = CONDITION_OPTIONS[field];
    return `
      <section class="reboot-choice-section">
        <div class="reboot-section-head">
          <div>
            <h3>${h(config.label)}</h3>
            <p>${h(config.helper)}</p>
          </div>
        </div>
        <div class="reboot-choice-grid">
          ${config.options.map(option => `
            <button type="button"
              class="reboot-choice-chip ${selectedValue === option.value ? 'selected' : ''}"
              data-field="${field}"
              data-value="${option.value}">
              <strong>${h(option.label)}</strong>
              <span>${h(option.hint)}</span>
            </button>`).join('')}
        </div>
      </section>`;
  }

  function renderConditionResult(judgment) {
    if (!judgment) {
      return `
        <div class="reboot-result-card reboot-tone-neutral">
          <div class="reboot-result-top">
            <div>
              <span class="reboot-eyebrow">判定待ち</span>
              <h3>入力がそろったらここで今日の方針が決まります</h3>
            </div>
            <div class="reboot-score-box">--</div>
          </div>
              <p>コンディション、張り、集中度、睡眠を合わせて今日のメニューを決めます。</p>
        </div>`;
    }

    const currentResult = resultValue(judgment);
    const tone = chipToneForResult(currentResult);
    const menuType = App.Training.getMenuType(currentResult);
    const menu = menuType ? App.Training.MENU_CONFIGS[menuType] : null;

    return `
      <div class="reboot-result-card reboot-tone-${tone}">
        <div class="reboot-result-top">
          <div>
            <span class="reboot-eyebrow">判定結果</span>
            <h3>${h(App.Judgment.RESULT_ICONS[currentResult] || '•')} ${h(App.Judgment.RESULT_LABELS[currentResult] || '未判定')}</h3>
            <p>${h(judgment.message || '今日の進め方をここで確認できます。')}</p>
          </div>
          <div class="reboot-score-box">${h(judgment.score || '--')}</div>
        </div>

        ${menu ? `
          <div class="reboot-result-summary">
            <span class="reboot-pill reboot-pill-${tone}">${h(menu.label)}</span>
            <span class="reboot-result-meta">目安 ${h(menu.estimatedMin)}分</span>
          </div>` : ''}

        <div class="reboot-reason-list">
          ${(judgment.reasons && judgment.reasons.length > 0 ? judgment.reasons : ['理由はここに表示されます。']).map(reason => `
            <span class="reboot-reason-chip">${h(reason)}</span>`).join('')}
        </div>

        <div class="reboot-inline-actions">
          ${currentResult && currentResult <= 4 ? `
            <button class="btn btn-primary" type="button" onclick="App.navigate('workout')">この内容で進める</button>` : `
            <button class="btn btn-secondary" type="button" onclick="App.navigate('schedule')">勤務を見直す</button>`}
          <button class="btn btn-ghost" type="button" onclick="App.navigate('history')">履歴を見る</button>
        </div>

        <div class="reboot-override-grid">
          ${[1, 2, 3, 4, 5].map(value => `
            <button type="button"
              class="reboot-override-chip ${currentResult === value ? 'selected' : ''}"
              onclick="App.Views.ConditionInput.overrideJudgment(${value})">
              <strong>${h(App.Judgment.RESULT_ICONS[value])}</strong>
              <span>${h(App.Judgment.RESULT_LABELS[value])}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  App.Views.ConditionInput = {
    _result: null,

    async render() {
      const today = App.Utils.today();
      const [condition, health, schedule, judgment] = await Promise.all([
        App.DB.getCondition(today),
        App.DB.getHealth(today),
        App.DB.getSchedule(today),
        App.DB.getJudgment(today)
      ]);

      this._result = judgment || null;
      const sorenessSet = parseCsvAreas(condition?.sorenessAreas);

      return `
        <div class="container animate-in reboot-shell reboot-condition-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Condition</span>
              <h2>当日判定</h2>
              <p>今日は行くか、軽くやるか、休むかをここで決めます。判定後にそのままワークアウトへ進めます。</p>
            </div>
            <div class="reboot-head-tools">
              ${await renderSyncPanel('App.Views.ConditionInput.syncNow()')}
            </div>
          </section>

          <div class="reboot-condition-grid">
            <div class="reboot-main-stack">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>今日の入力</h3>
                    <p id="condition-live-summary">${h(this._buildLiveSummary(condition, health))}</p>
                  </div>
                  <span class="reboot-inline-note">状態は必須</span>
                </div>

                <div class="reboot-form-stack">
                  ${renderChoiceGroup('fatigue', condition?.fatigue ?? null)}
                  ${renderChoiceGroup('muscleSoreness', condition?.muscleSoreness ?? 0)}
                  <section class="reboot-choice-section">
                    <div class="reboot-section-head">
                      <div>
                    <h3>張りの部位</h3>
                        <p>痛みが残る部位を選ぶと、あとで見返しやすくなります。</p>
                      </div>
                    </div>
                    <div class="reboot-area-grid">
                      ${SORENESS_AREAS.map(area => `
                        <button type="button"
                          class="reboot-area-chip ${sorenessSet.has(area) ? 'selected' : ''}"
                          data-area="${area}">
                          ${h(area)}
                        </button>`).join('')}
                    </div>
                  </section>
                  ${renderChoiceGroup('motivation', condition?.motivation ?? 3)}
                  ${renderChoiceGroup('mood', condition?.mood ?? 3)}

                  <section class="reboot-choice-section">
                    <div class="reboot-section-head">
                      <div>
                        <h3>睡眠</h3>
                        <p>${window.SteadyBridge ? 'Health Connect の値をそのまま使います。' : 'スマホで同期した値を表示します。'}</p>
                      </div>
                      <span class="reboot-inline-note" id="condition-sleep-value">${h(App.Utils.formatSleep(health?.sleepMinutes) || (window.SteadyBridge ? '未設定' : 'スマホ同期待ち'))}</span>
                    </div>
                    <div class="reboot-readonly-block">
                      <strong>${h(App.Utils.formatSleep(health?.sleepMinutes) || '未取得')}</strong>
                      <span>${window.SteadyBridge ? 'ここでは変更できません。' : 'PC では表示のみです。'}</span>
                    </div>
                  </section>

                  <label class="reboot-field-block">
                    <span>メモ</span>
                    <textarea id="condition-note" class="paste-area reboot-textarea" placeholder="寝不足気味、脚だけ張っている、仕事が重い など">${h(condition?.note || '')}</textarea>
                  </label>
                </div>

                <div class="reboot-inline-actions">
                  <button class="btn btn-primary" type="button" id="condition-run-judge">今日の判定を更新</button>
                  <button class="btn btn-secondary" type="button" onclick="App.navigate('schedule')">勤務を確認</button>
                </div>
              </section>
            </div>

            <aside class="reboot-side-stack">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>今日の勤務</h3>
                    <p>終業時刻と空き時間を一緒に見ます。</p>
                  </div>
                </div>
                <div class="reboot-detail-stack">
                  <div class="reboot-stat-row">
                    <span>勤務タイプ</span>
                    <strong>${h(schedule ? shiftLabel(schedule.shiftType) : '未設定')}</strong>
                  </div>
                  <div class="reboot-stat-row">
                    <span>時間</span>
                    <strong>${h(schedule ? App.FinalPolish.formatShiftRange(schedule).replace(/\s+/g, ' ').trim() : '未設定')}</strong>
                  </div>
                  ${schedulePlaceLine(schedule) ? `
                    <div class="reboot-stat-row">
                      <span>出張先</span>
                      <strong>${h(schedulePlaceLine(schedule))}</strong>
                    </div>
                  ` : ''}
                  <div class="reboot-stat-row">
                    <span>使える時間</span>
                    <strong>${h(formatMinutes(availableMinutes(schedule)))}</strong>
                  </div>
                </div>
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>健康データ</h3>
                    <p>健康データはスマホからのみ送信します。</p>
                  </div>
                </div>
                <div class="reboot-detail-stack">
                  <div class="reboot-stat-row">
                    <span>睡眠</span>
                    <strong>${h(App.Utils.formatSleep(health?.sleepMinutes) || '未取得')}</strong>
                    <small>${h(App.Utils.formatSleepDetail?.(health, '時刻は未取得') || '時刻は未取得')}</small>
                  </div>
                  <div class="reboot-stat-row">
                    <span>歩数</span>
                    <strong>${health?.steps != null ? h(health.steps.toLocaleString()) : '未取得'}</strong>
                  </div>
                  <div class="reboot-stat-row">
                    <span>心拍</span>
                    <strong>${health?.heartRateAvg != null ? `${h(health.heartRateAvg)} bpm` : '未取得'}</strong>
                  </div>
                </div>
              </section>

              <section id="condition-result-slot">
                ${renderConditionResult(this._result)}
              </section>
            </aside>
          </div>
        </div>`;
    },

    _buildLiveSummary(condition, health) {
      const fatigueText = CONDITION_OPTIONS.fatigue.options.find(option => option.value === condition?.fatigue)?.label || '未入力';
      const sorenessText = CONDITION_OPTIONS.muscleSoreness.options.find(option => option.value === (condition?.muscleSoreness ?? null))?.label || '未入力';
      const motivationText = CONDITION_OPTIONS.motivation.options.find(option => option.value === (condition?.motivation ?? null))?.label || '未入力';
      const moodText = CONDITION_OPTIONS.mood.options.find(option => option.value === (condition?.mood ?? null))?.label || '未入力';
      const sleepText = App.Utils.formatSleep(health?.sleepMinutes) || '睡眠未取得';
      return `状態 ${fatigueText} / 張り ${sorenessText} / 集中度 ${motivationText} / 全体 ${moodText} / 睡眠 ${sleepText}`;
    },

    _selectedValue(field) {
      const selected = document.querySelector(`.reboot-choice-chip.selected[data-field="${field}"]`);
      return selected ? safeNumber(selected.dataset.value, null) : null;
    },

    _selectedAreas() {
      return [...document.querySelectorAll('.reboot-area-chip.selected')]
        .map(button => button.dataset.area)
        .filter(Boolean);
    },

    _refreshLiveSummary() {
      const fatigue = CONDITION_OPTIONS.fatigue.options.find(option => option.value === this._selectedValue('fatigue'))?.label || '未入力';
      const soreness = CONDITION_OPTIONS.muscleSoreness.options.find(option => option.value === this._selectedValue('muscleSoreness'))?.label || '未入力';
      const motivation = CONDITION_OPTIONS.motivation.options.find(option => option.value === this._selectedValue('motivation'))?.label || '未入力';
      const mood = CONDITION_OPTIONS.mood.options.find(option => option.value === this._selectedValue('mood'))?.label || '未入力';
      const sleepValue = document.getElementById('condition-sleep-value')?.textContent || '睡眠未取得';
      const line = `状態 ${fatigue} / 張り ${soreness} / 集中度 ${motivation} / 全体 ${mood} / 睡眠 ${sleepValue}`;
      const summary = document.getElementById('condition-live-summary');
      if (summary) summary.textContent = line;
    },

    async runJudge() {
      const button = document.getElementById('condition-run-judge');
      if (button) {
        button.disabled = true;
        button.textContent = '判定中...';
      }

      try {
        const today = App.Utils.today();
        const fatigue = this._selectedValue('fatigue');
        if (fatigue == null) {
          App.Utils.showToast('状態を選択してください', 'warning');
          return;
        }

        const conditionData = {
          date: today,
          fatigue,
          muscleSoreness: this._selectedValue('muscleSoreness') ?? 0,
          sorenessAreas: this._selectedAreas().join(', '),
          motivation: this._selectedValue('motivation') ?? 3,
          mood: this._selectedValue('mood') ?? 3,
          note: document.getElementById('condition-note')?.value.trim() || ''
        };

        await App.DB.upsertCondition(conditionData);

        const overrides = {
          fatigue: conditionData.fatigue,
          muscleSoreness: conditionData.muscleSoreness,
          motivation: conditionData.motivation,
          mood: conditionData.mood
        };

        await App.Judgment.judgeAndSave(today, overrides);
        const pushResult = await App.DB.pushToCloud(today, { sections: ['condition', 'judgment'] });

        await App.Utils.showSharedSaveResult(pushResult, {
          subject: '判定結果',
          successMessage: '判定と体調を保存しました',
          warningMessage: '判定は保存されましたが、共有側への確定はまだです',
          errorPrefix: '判定の保存に失敗しました'
        });
        await App.refreshView();
      } catch (error) {
        App.Utils.showToast(`判定処理に失敗しました: ${error.message}`, 'error');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = '今日の判定を更新';
        }
      }
    },

    async overrideJudgment(newResult) {
      const today = App.Utils.today();
      const existing = await App.DB.getJudgment(today);
      if (!existing) {
        App.Utils.showToast('先に通常の判定を実行してください', 'warning');
        return;
      }

      await App.DB.upsertJudgment({
        ...existing,
        userOverride: newResult
      });
      const pushResult = await App.DB.pushToCloud(today, { sections: ['judgment'] });
      await App.Utils.showSharedSaveResult(pushResult, {
        subject: '判定変更',
        successMessage: `判定を「${App.Judgment.RESULT_LABELS[newResult]}」へ変更しました`,
        warningMessage: '判定変更は保存されましたが、共有側への確定はまだです',
        errorPrefix: '判定変更の保存に失敗しました'
      });
      await App.refreshView();
    },

    async syncNow() {
      App.Utils.showToast('再同期しています...', 'info', 1800);
      const result = await App.DB.syncNow('当日判定から再同期');
      App.Utils.showSyncResult(result, {
        successMessage: '再同期しました',
        warningMessage: '再同期は完了しましたが、未送信データが残っています',
        errorPrefix: '再同期に失敗しました'
      });
      await App.refreshView();
    },

    init() {
      document.querySelectorAll('.reboot-choice-chip[data-field]').forEach(button => {
        button.addEventListener('click', () => {
          const { field } = button.dataset;
          document.querySelectorAll(`.reboot-choice-chip[data-field="${field}"]`).forEach(item => item.classList.remove('selected'));
          button.classList.add('selected');
          this._refreshLiveSummary();
        });
      });

      document.querySelectorAll('.reboot-area-chip').forEach(button => {
        button.addEventListener('click', () => {
          button.classList.toggle('selected');
        });
      });

      document.getElementById('condition-note')?.addEventListener('input', () => this._refreshLiveSummary());
      document.getElementById('condition-run-judge')?.addEventListener('click', () => this.runJudge());
    },

    destroy() {
      this._result = null;
    }
  };

  App.Views.ConditionInput.init = function() {
    document.querySelectorAll('.reboot-choice-chip[data-field]').forEach(button => {
      button.addEventListener('click', () => {
        const { field } = button.dataset;
        document.querySelectorAll(`.reboot-choice-chip[data-field="${field}"]`).forEach(item => item.classList.remove('selected'));
        button.classList.add('selected');
        this._refreshLiveSummary();
      });
    });

    document.querySelectorAll('.reboot-area-chip').forEach(button => {
      button.addEventListener('click', () => {
        button.classList.toggle('selected');
      });
    });

    const sleepInput = document.getElementById('condition-sleep-input');
    const sleepSection = document.getElementById('condition-sleep-value')?.closest('.reboot-choice-section');
    const sleepCopy = sleepSection?.querySelector('.reboot-section-head p');
    if (sleepCopy) {
      sleepCopy.textContent = window.SteadyBridge ? 'Health Connect の値をそのまま使います。' : 'スマホで同期した値を表示します。';
    }
    if (sleepInput) {
      const readonly = document.createElement('div');
      readonly.className = 'reboot-readonly-block';
      readonly.innerHTML = `
        <strong>${h(document.getElementById('condition-sleep-value')?.textContent || '未取得')}</strong>
        <span>${window.SteadyBridge ? 'Health Connect の値を使います。' : 'スマホで同期した値を表示します。'}</span>`;
      sleepInput.replaceWith(readonly);
    }

    document.getElementById('condition-note')?.addEventListener('input', () => this._refreshLiveSummary());
    document.getElementById('condition-run-judge')?.addEventListener('click', () => this.runJudge());
  };

  const originalConditionRender = App.Views.ConditionInput.render.bind(App.Views.ConditionInput);
  App.Views.ConditionInput.render = async function() {
    const html = await originalConditionRender.call(this);
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const root = template.content.firstElementChild;
    const sleepValue = root?.querySelector('#condition-sleep-value');
    const sleepSection = sleepValue?.closest('.reboot-choice-section');
    const sleepCopy = sleepSection?.querySelector('.reboot-section-head p');
    const sleepInput = root?.querySelector('#condition-sleep-input');

    if (sleepCopy) {
      sleepCopy.textContent = window.SteadyBridge ? 'Health Connect の値をそのまま使います。' : 'スマホで同期した値を表示します。';
    }

    if (sleepInput) {
      const readonly = document.createElement('div');
      readonly.className = 'reboot-readonly-block';
      readonly.innerHTML = `
        <strong>${h(sleepValue?.textContent || '未取得')}</strong>
        <span>${window.SteadyBridge ? 'ここでは変更できません。' : 'PC では表示のみです。'}</span>`;
      sleepInput.replaceWith(readonly);
    }

    return root ? root.outerHTML : html;
  };

  function resizeExerciseSets(exercise, targetCount, weight, reps) {
    if (!exercise || exercise.isCardio) return;
    const count = Math.max(1, Math.round(safeNumber(targetCount, exercise.sets?.length || 1)));
    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    while (sets.length < count) {
      sets.push({
        setNumber: sets.length + 1,
        weight,
        reps,
        completed: false
      });
    }
    if (sets.length > count) sets.length = count;
    sets.forEach((set, index) => {
      set.setNumber = index + 1;
      set.weight = weight;
      set.reps = reps;
    });
    exercise.sets = sets;
  }

  function renderWorkoutExercise(exercise, index) {
    // カテゴリが有酸素なら isCardio を自動復元
    if (!exercise.isCardio && exercise.category === '有酸素') exercise.isCardio = true;
    const done = countExerciseDone(exercise);
    const total = exercise.sets?.length || 0;
    const currentLine = summarizeExercise(exercise);
    const weightStep = getExerciseWeightStep(exercise);
    const previousLine = exercise.previous
      ? (exercise.isCardio
        ? `速度${safeNumber(exercise.previous.speed, 5)}km/h × ${safeNumber(exercise.previous.durationMin || exercise.previous.reps, 0)}分`
        : formatTriplet(exercise.previous.weight || 0, exercise.previous.reps || 0, exercise.previous.sets || total))
      : '履歴なし';
    const recommendedLine = exercise.isCardio
      ? `速度${safeNumber(exercise.speed, 5)}km/h × ${safeNumber(exercise.durationMin, 10)}分`
      : formatTriplet(exercise.recommended?.weight || 0, exercise.recommended?.reps || 0, exercise.recommended?.sets || exercise.sets?.length || 0);

    return `
      <article class="reboot-exercise-card ${isExerciseDone(exercise) ? 'is-done' : ''}" data-workout-idx="${index}">
        <div class="reboot-exercise-head">
          <div class="reboot-exercise-copy">
            <div class="reboot-exercise-badges">
              <span class="reboot-pill reboot-pill-${exercise.optional ? 'warning' : 'success'}">${exercise.optional ? '任意' : '必須'}</span>
              ${exercise.isWarmup ? '<span class="reboot-pill reboot-pill-neutral">ウォームアップ</span>' : ''}
              ${exercise.isCooldown ? '<span class="reboot-pill reboot-pill-neutral">クールダウン</span>' : ''}
            </div>
            <h3>${h(exercise.icon || '•')} ${h(exercise.name)}</h3>
            <p id="workout-summary-${index}">${h(currentLine)}</p>
          </div>
          <div class="reboot-complete-box" id="workout-complete-${index}">${isExerciseDone(exercise) ? '完了' : `${done}/${total}`}</div>
        </div>

        <div class="reboot-metric-grid reboot-metric-grid-2">
          <div class="reboot-mini-stat">
            <span>前回</span>
            <strong>${h(previousLine)}</strong>
          </div>
          <div class="reboot-mini-stat">
            <span>今日の推奨</span>
            <strong>${h(recommendedLine)}</strong>
                    <small>${h(formatRecommendationNote(exercise))}</small>
          </div>
        </div>

        ${exercise.isCardio ? `
          <div class="reboot-set-table">
            <div class="reboot-set-row">
              <div class="reboot-set-label">速度</div>
              <div class="reboot-set-inputs reboot-cardio-inputs">
                <input class="form-input" type="number" inputmode="decimal" min="0" step="0.5" value="${h(editableNumberValue(exercise.speed, 5))}"
                  oninput="App.Views.Workout.updateCardio(${index}, 'speed', this.value)">
                <span>km/h</span>
              </div>
            </div>
            <div class="reboot-set-row">
              <div class="reboot-set-label">時間</div>
              <div class="reboot-set-inputs reboot-cardio-inputs">
                <input class="form-input" type="number" inputmode="numeric" min="1" step="1" value="${h(editableNumberValue(exercise.durationMin, 10))}"
                  oninput="App.Views.Workout.updateCardio(${index}, 'durationMin', this.value)">
                <span>分</span>
              </div>
              <button class="reboot-check-btn ${exercise.sets?.[0]?.completed ? 'done' : ''}"
                type="button"
                data-set-index="0"
                onclick="App.Views.Workout.toggleSet(${index}, 0)">完了</button>
            </div>
          </div>` : `
          <div class="reboot-set-table">
            ${(exercise.sets || []).map((set, setIndex) => `
              <div class="reboot-set-row">
                <div class="reboot-set-label">${set.setNumber}セット目</div>
                <div class="reboot-set-inputs">
                  <input class="form-input" type="number" inputmode="decimal" min="0" step="${h(editableNumberValue(weightStep > 0 ? weightStep : 1, 5))}" value="${h(editableNumberValue(set.weight))}"
                    oninput="App.Views.Workout.updateSet(${index}, ${setIndex}, 'weight', this.value)">
                  <span>kg</span>
                  <input class="form-input" type="number" inputmode="numeric" min="0" step="1" value="${h(editableNumberValue(set.reps))}"
                    oninput="App.Views.Workout.updateSet(${index}, ${setIndex}, 'reps', this.value)">
                  <span>回</span>
                </div>
                <button class="reboot-check-btn ${set.completed ? 'done' : ''}"
                  type="button"
                  data-set-index="${setIndex}"
                  onclick="App.Views.Workout.toggleSet(${index}, ${setIndex})">${set.completed ? '完了' : '未完'}</button>
              </div>`).join('')}
          </div>`}

        <div class="reboot-inline-actions">
          ${exercise.previous && !exercise.isCardio ? `
            <button class="btn btn-ghost" type="button" onclick="App.Views.Workout.copyPrevious(${index})">前回コピー</button>` : ''}
          ${!exercise.isCardio ? `
            <button class="btn btn-ghost" type="button" onclick="App.Views.Workout.applyRecommended(${index})">推奨に戻す</button>` : ''}
          <button class="btn btn-secondary" type="button" onclick="App.Views.Workout.toggleWholeExercise(${index})">${isExerciseDone(exercise) ? '未完に戻す' : '全部完了'}</button>
        </div>
      </article>`;
  }

  async function hydrateExerciseHistory(exercises, menuType, beforeDate, condition = null) {
    if (!Array.isArray(exercises) || !exercises.length || !menuType) return false;
    const generated = await App.Training.generateMenu(menuType, { beforeDate, condition });
    const queues = new Map();
    generated.forEach(seed => {
      if (!queues.has(seed.name)) queues.set(seed.name, []);
      queues.get(seed.name).push(seed);
    });

    let changed = false;
    exercises.forEach(exercise => {
      const seed = queues.get(exercise.name)?.shift();
      if (!seed) return;

      ['isCardio', 'isWarmup', 'isCooldown', 'optional', 'category', 'icon', 'durationMin', 'weightStep'].forEach(key => {
        if (exercise[key] == null && seed[key] != null) {
          exercise[key] = seed[key];
          changed = true;
        }
      });

      if (!exercise.previous && seed.previous) {
        exercise.previous = seed.previous;
        changed = true;
      }
      if ((!exercise.recommended || !exercise.recommended.note || !exercise.recommended.sets) && seed.recommended) {
        exercise.recommended = seed.recommended;
        changed = true;
      }
      if (!exercise.progressionState && seed.progressionState) {
        exercise.progressionState = seed.progressionState;
        changed = true;
      }
    });
    return changed;
  }

  App.Views.Workout = {
    _manualMenuType: null,
    _restTimerInterval: null,

    async render() {
      const today = App.Utils.today();
      const [judgment, schedule, existingWorkout, condition] = await Promise.all([
        App.DB.getJudgment(today),
        App.DB.getSchedule(today),
        App.DB.getWorkoutByDate(today),
        App.DB.getCondition(today)
      ]);

      currentExercises = [];
      currentWorkoutId = null;
      const draftShadow = readWorkoutDraftShadow(today);
      const activeShadow = existingWorkout && workoutIsFinished(existingWorkout) ? null : draftShadow;
      if (existingWorkout && workoutIsFinished(existingWorkout) && draftShadow) {
        clearWorkoutDraftShadow(today);
      }
      const preferShadow = !!activeShadow && (!existingWorkout || workoutDraftShadowIsNewer(today, existingWorkout?.updatedAt));
      const displayWorkout = preferShadow ? buildWorkoutFromShadow(existingWorkout, activeShadow, today) : existingWorkout;

      const chosenResult = resultValue(judgment) || (displayWorkout?.type === 'skip' ? 5 : 2);
      currentWorkoutType =
        this._manualMenuType ||
        (activeShadow?.workoutType && activeShadow.workoutType !== 'skip' ? activeShadow.workoutType : null) ||
        (displayWorkout?.type && displayWorkout.type !== 'skip' ? displayWorkout.type : App.Training.getMenuType(chosenResult));

      this._syncTimerFromWorkout(displayWorkout, today);

      if (displayWorkout) {
        currentWorkoutId = displayWorkout.id || activeShadow?.workoutId || null;
        if (displayWorkout.type === currentWorkoutType) {
          if (activeShadow?.workoutType === currentWorkoutType && Array.isArray(activeShadow.exercises) && activeShadow.exercises.length > 0 && preferShadow) {
            currentExercises = cloneWorkoutDraftExercises(activeShadow.exercises);
            await hydrateExerciseHistory(currentExercises, currentWorkoutType, today, condition);
          } else if (displayWorkout.id) {
            const savedExercises = await App.DB.getExercises(displayWorkout.id);
            if (savedExercises.length > 0) {
              currentExercises = savedExercises;
              await hydrateExerciseHistory(currentExercises, currentWorkoutType, today, condition);
              const filtered = App.Training.filterExercisesForCondition(currentExercises, condition);
              if (filtered.removed.length > 0) {
                currentExercises = filtered.exercises;
                await App.DB.saveExercises(currentWorkoutId, currentExercises);
                persistWorkoutDraftShadow(today);
                App.DB.pushToCloud(today, { sections: ['workout', 'exercises'] }).catch(error => {
                  console.warn('[Workout] Failed to push soreness-adjusted draft:', error);
                });
              }
            }
          }
        }
      }

      if (!currentWorkoutType && this._manualMenuType) currentWorkoutType = this._manualMenuType;

      if (displayWorkout?.type === 'skip' && !this._manualMenuType) {
        return this._renderRecoveryView(judgment, displayWorkout, schedule);
      }

      if (chosenResult === 5 && !this._manualMenuType) {
        return this._renderRecoveryView(judgment, displayWorkout, schedule);
      }

      if (currentExercises.length === 0 && currentWorkoutType) {
        currentExercises = await App.Training.generateMenu(currentWorkoutType, { beforeDate: today, condition });
        persistWorkoutDraftShadow(today);
      }

      if (currentWorkoutType === 'stretch') {
        return this._renderStretchView(displayWorkout);
      }

      const requiredExercises = currentExercises.filter(exercise => !exercise.optional && exercise.type !== 'stretch');
      const optionalExercises = currentExercises.filter(exercise => exercise.optional && exercise.type !== 'stretch');
      const menuConfig = App.Training.MENU_CONFIGS[currentWorkoutType];
      const progress = workoutProgress(currentExercises);
      const estimated = menuConfig?.estimatedMin || App.Training.getEstimatedDuration(currentWorkoutType);
      const isCompleted = workoutIsFinished(displayWorkout);
      const footerLabel = isCompleted ? '記録を更新する' : '今日はここまでで終了';
      const timerRunning = workoutTimerState === 'running';
      const timerHasValue = timerRunning || getWorkoutElapsedSeconds() > 0;
      const soreness = App.Training.sorenessContext(condition || {});
      const sorenessNote = soreness.active
          ? `<div class="reboot-empty-card reboot-soreness-note"><strong>張りのある部位を避けています</strong><span>${h(soreness.areas.join('、'))}にかかる種目は外しました。</span></div>`
        : '';

      return `
        <div class="container animate-in reboot-shell reboot-workout-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Workout</span>
              <h2>ワークアウト</h2>
              <p>必須種目を先に終えて、前回実績と今日の推奨を見ながら進めます。</p>
            </div>
            <div class="reboot-head-tools">
              ${await renderSyncPanel('App.Views.Workout.syncNow()')}
            </div>
          </section>

          <div class="reboot-workout-grid">
            <div class="reboot-main-stack">
              ${sorenessNote}
              <section class="reboot-panel reboot-session-panel">
                <div class="reboot-session-top">
                  <div>
                    <div class="reboot-command-meta">
                      <span class="reboot-pill reboot-pill-${chipToneForResult(chosenResult)}">${h(menuConfig?.label || formatWorkoutKind(currentWorkoutType))}</span>
                      <span class="reboot-pill reboot-pill-neutral">目安 ${estimated}分</span>
                      ${schedule ? `<span class="reboot-pill reboot-pill-neutral">${h(shiftLabel(schedule.shiftType))}</span>` : ''}
                    </div>
                    <h3>${h(App.Judgment.RESULT_LABELS[chosenResult] || '短縮メニュー')}</h3>
                    <p>${h(judgment?.message || '未判定でも短縮メニューから始められます。')}</p>
                  </div>
                  <div class="reboot-timer-box">
                    <div class="reboot-timer-display" id="workout-timer-display">${timerDisplayText()}</div>
                    <button class="btn ${timerRunning ? 'btn-danger' : 'btn-primary'}" id="workout-timer-toggle">${timerRunning ? '一時停止' : (timerHasValue ? '再開' : '開始')}</button>
                    <button class="btn btn-ghost" id="workout-timer-reset" ${timerHasValue ? '' : 'disabled'}>リセット</button>
                  </div>
                </div>

                <div class="reboot-metric-grid reboot-metric-grid-4">
                  <article class="reboot-stat-card">
                    <span>必須種目</span>
                    <strong id="workout-progress-required">${progress.requiredDone}/${progress.requiredTotal}</strong>
                    <small>まずここを終える</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>任意種目</span>
                    <strong id="workout-progress-optional">${progress.optionalDone}/${progress.optionalTotal}</strong>
              <small>任意で追加</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>完了セット</span>
                    <strong id="workout-progress-sets">${progress.completedSets}/${progress.totalSets}</strong>
                    <small>こまめに完了を付ける</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>下書き</span>
                    <strong id="workout-draft-status">入力途中</strong>
                    <small>共有確定は終了時のみ</small>
                  </article>
                </div>
              </section>

              <div id="rest-timer-bar" class="reboot-rest-bar" style="display:none;">
                <div class="reboot-rest-progress">
                  <div class="reboot-rest-progress-fill"></div>
                </div>
                <span class="reboot-rest-text">休憩 60s</span>
                <button class="btn btn-ghost" type="button" onclick="App.Views.Workout.dismissRestTimer()">閉じる</button>
              </div>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>必須種目</h3>
                    <p>今日はここを終えれば十分です。迷ったら必須だけで終了して大丈夫です。</p>
                  </div>
                </div>
                <div class="reboot-exercise-list">
                  ${requiredExercises.map(exercise => renderWorkoutExercise(exercise, currentExercises.indexOf(exercise))).join('')}
                </div>
              </section>

              ${optionalExercises.length > 0 ? `
                <section class="reboot-panel">
                  <div class="reboot-section-head">
                    <div>
                      <h3>任意種目</h3>
                      <p>時間と状態に合わせて追加します。任意種目はスキップできます。</p>
                    </div>
                  </div>
                  <div class="reboot-exercise-list">
                    ${optionalExercises.map(exercise => renderWorkoutExercise(exercise, currentExercises.indexOf(exercise))).join('')}
                  </div>
                </section>` : ''}
            </div>

            <aside class="reboot-side-stack">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>今日の進め方</h3>
                    <p>迷いにくくするための要点です。</p>
                  </div>
                </div>
                <div class="reboot-detail-stack">
                  <div class="reboot-stat-row">
                    <span>1</span>
                    <strong>必須種目を上から順に進める</strong>
                  </div>
                  <div class="reboot-stat-row">
                    <span>2</span>
                    <strong>完了したセットにだけ完了を付ける</strong>
                  </div>
                  <div class="reboot-stat-row">
                    <span>3</span>
              <strong>任意はスキップ可</strong>
                  </div>
                </div>
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>ショートカット</h3>
                    <p>今日の終わり方をすぐ選べます。</p>
                  </div>
                </div>
                <div class="reboot-link-list">
                  <button class="reboot-link-card" onclick="App.Views.Workout.forceMenu('short')">
                    <strong>短縮メニューに切替</strong>
                    <span>時間が押したら最小構成へ</span>
                  </button>
                  <button class="reboot-link-card" onclick="App.Views.Workout.forceMenu('stretch')">
                    <strong>ストレッチに切替</strong>
                    <span>今日は回復優先にする</span>
                  </button>
                  <button class="reboot-link-card" onclick="App.Views.Workout.saveSkip()">
                    <strong>休みとして記録</strong>
                    <span>今日はここでやめる</span>
                  </button>
                </div>
              </section>
            </aside>
          </div>

          <div class="reboot-sticky-bar">
            <div class="reboot-sticky-copy">
              <strong id="workout-footer-summary">${progress.requiredDone}/${progress.requiredTotal}種目完了</strong>
              <span>入力途中は端末下書きです。終了時に共有保存を確定します。</span>
            </div>
            <div class="reboot-inline-actions">
              <button class="btn btn-primary" type="button" id="finish-workout-btn">${footerLabel}</button>
              <button class="btn btn-ghost" type="button" id="skip-workout-btn">今日は休みにする</button>
            </div>
          </div>
        </div>`;
    },

    _renderRecoveryView(judgment, existingWorkout, schedule) {
      return `
        <div class="container animate-in reboot-shell reboot-workout-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Recovery</span>
              <h2>今日は回復優先</h2>
              <p>調整日として記録します。必要なら軽いメニューへ切り替えられます。</p>
            </div>
          </section>

          <div class="reboot-workout-grid">
            <div class="reboot-main-stack">
              <section class="reboot-panel reboot-tone-warning">
                <div class="reboot-command-top">
                  <div>
                    <span class="reboot-eyebrow">${existingWorkout?.type === 'skip' ? '休み記録あり' : '休み推奨'}</span>
                    <h3>${h(existingWorkout?.type === 'skip' ? '今日は休みとして記録済みです' : (judgment?.resultLabel || '今日は休み優先です'))}</h3>
            <p>${h(existingWorkout?.memo || judgment?.message || '回復を優先し、次回に向けて整えます。')}</p>
                  </div>
                  <div class="reboot-command-score">${judgment?.score != null ? h(judgment.score) : '--'}</div>
                </div>

                <div class="reboot-detail-stack">
                  <div class="reboot-stat-row">
                    <span>勤務</span>
                    <strong>${h(schedule ? shiftLabel(schedule.shiftType) : '未設定')}</strong>
                  </div>
                  <div class="reboot-stat-row">
                    <span>判定理由</span>
                    <strong>${h((judgment?.reasons && judgment.reasons[0]) || existingWorkout?.skipReason || '理由未入力')}</strong>
                  </div>
                </div>

                <div class="reboot-inline-actions">
                  <button class="btn btn-secondary" type="button" onclick="App.Views.Workout.saveSkip()">${existingWorkout?.type === 'skip' ? '休み理由を更新' : '休みとして記録する'}</button>
                  <button class="btn btn-primary" type="button" onclick="${existingWorkout?.type === 'skip' ? "App.Views.Workout.resumeAfterSkip('short')" : "App.Views.Workout.forceMenu('short')"}">${existingWorkout?.type === 'skip' ? 'やっぱりやる' : 'それでも短くやる'}</button>
                  <button class="btn btn-ghost" type="button" onclick="${existingWorkout?.type === 'skip' ? "App.Views.Workout.resumeAfterSkip('stretch')" : "App.Views.Workout.forceMenu('stretch')"}">${existingWorkout?.type === 'skip' ? '軽く動く' : 'ストレッチにする'}</button>
                </div>
              </section>
            </div>
          </div>
        </div>`;
    },

    _renderStretchView(existingWorkout) {
      const list = currentExercises.map((exercise, index) => `
        <button class="reboot-list-card" data-stretch-idx="${index}" onclick="App.Views.Workout.toggleStretchItem(${index})">
          <div>
            <strong>${h(exercise.icon || '•')} ${h(exercise.name)}</strong>
            <span>${h(exercise.duration || '5〜10分')}</span>
          </div>
          <div class="reboot-list-aside">
            <span id="stretch-status-${index}">${exercise.completed ? '完了' : '未完'}</span>
          </div>
        </button>`).join('');

      return `
        <div class="container animate-in reboot-shell reboot-workout-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Stretch</span>
              <h2>回復メニュー</h2>
          <p>今日は調整日です。5〜10分で終えて、次回へつなげます。</p>
            </div>
            <div class="reboot-head-tools">
              ${existingWorkout?.type === 'stretch' ? '<span class="reboot-pill reboot-pill-success">本日記録あり</span>' : ''}
            </div>
          </section>

          <section class="reboot-panel">
            <div class="reboot-section-head">
              <div>
                <h3>今日の回復メニュー</h3>
                <p>終わった種目だけ完了にして、最後にまとめて保存します。</p>
              </div>
            </div>
            <div class="reboot-link-list">${list}</div>
            <div class="reboot-inline-actions">
              <button class="btn btn-primary" type="button" id="finish-stretch-btn">${existingWorkout?.type === 'stretch' ? '記録を更新する' : 'ストレッチを保存する'}</button>
              <button class="btn btn-ghost" type="button" onclick="App.Views.Workout.forceMenu('short')">短縮メニューに戻す</button>
            </div>
          </section>
        </div>`;
    },

    _updateDraftStatus(text) {
      const slot = document.getElementById('workout-draft-status');
      if (slot) slot.textContent = text;
    },

    _refreshExerciseCard(index) {
      const exercise = currentExercises[index];
      const card = document.querySelector(`[data-workout-idx="${index}"]`);
      if (!exercise || !card) return;

      const summary = summarizeExercise(exercise);
      const done = countExerciseDone(exercise);
      const total = exercise.sets?.length || 0;
      const complete = card.querySelector(`#workout-complete-${index}`);
      const header = card.querySelector(`#workout-summary-${index}`);

      if (complete) complete.textContent = isExerciseDone(exercise) ? '完了' : `${done}/${total}`;
      if (header) header.textContent = summary;
      card.classList.toggle('is-done', isExerciseDone(exercise));

      card.querySelectorAll('.reboot-check-btn[data-set-index]').forEach(button => {
        const setIndex = safeNumber(button.dataset.setIndex, 0);
        const set = exercise.sets?.[setIndex];
        const doneState = !!set?.completed;
        button.classList.toggle('done', doneState);
        button.textContent = doneState ? '完了' : '未完';
      });
    },

    _syncTimerFromWorkout(workout, dateStr) {
      if (workoutIsFinished(workout)) {
        clearWorkoutTimerState();
        return;
      }

      const timerState = workout?.timerState || '';
      const timerElapsed = safeNumber(workout?.timerElapsedSeconds, 0);
      if (timerState === 'paused') {
        setWorkoutTimerPaused(timerElapsed, dateStr);
        return;
      }
      if (timerState === 'idle') {
        const saved = savedWorkoutTimerForDate(dateStr);
        if (saved && saved.state !== 'idle') {
          saved.state === 'paused'
            ? setWorkoutTimerPaused(saved.elapsedSeconds, dateStr)
            : setWorkoutTimerStart(saved.start || Date.now(), dateStr, saved.elapsedSeconds);
          return;
        }
        clearWorkoutTimerState();
        return;
      }
      if (timerState === 'running') {
        const timerStartedAt = workout?.timerStartedAt ? Date.parse(workout.timerStartedAt) : NaN;
        const segmentStart = Number.isFinite(timerStartedAt) && timerStartedAt > 0 ? timerStartedAt : parseWorkoutStart(workout);
        if (segmentStart) {
          setWorkoutTimerStart(segmentStart, dateStr, timerElapsed);
          return;
        }
      }

      const cloudStart = parseWorkoutStart(workout);
      if (cloudStart) {
        setWorkoutTimerStart(cloudStart, dateStr, 0);
        return;
      }

      const saved = savedWorkoutTimerForDate(dateStr);
      if (saved && saved.state !== 'idle') {
        saved.state === 'paused'
          ? setWorkoutTimerPaused(saved.elapsedSeconds, dateStr)
          : setWorkoutTimerStart(saved.start || Date.now(), dateStr, saved.elapsedSeconds);
        return;
      }

      clearWorkoutTimerState();
    },

    _refreshProgress() {
      const progress = workoutProgress(currentExercises);
      const required = document.getElementById('workout-progress-required');
      const optional = document.getElementById('workout-progress-optional');
      const sets = document.getElementById('workout-progress-sets');
      const footer = document.getElementById('workout-footer-summary');

      if (required) required.textContent = `${progress.requiredDone}/${progress.requiredTotal}`;
      if (optional) optional.textContent = `${progress.optionalDone}/${progress.optionalTotal}`;
      if (sets) sets.textContent = `${progress.completedSets}/${progress.totalSets}`;
      if (footer) footer.textContent = `${progress.requiredDone}/${progress.requiredTotal}種目完了`;
    },

    _autoSave() {
      persistWorkoutDraftShadow(App.Utils.today());
      const run = async () => {
        try {
          await this._persistWorkoutDraft();
        } catch (error) {
          console.error('[Workout] Draft save failed:', error);
          this._updateDraftStatus('保存失敗');
        }
      };
      workoutLocalSaveChain = workoutLocalSaveChain.then(run, run);
      return workoutLocalSaveChain;
    },

    async _persistWorkoutDraft() {
      const today = App.Utils.today();
      this._updateDraftStatus('下書き保存中');
      const elapsedSeconds = getWorkoutElapsedSeconds();
      const timerFields = {
        timerState: workoutTimerState || 'idle',
        timerStartedAt: workoutTimerState === 'running' && workoutStartTime ? new Date(workoutStartTime).toISOString() : '',
        timerElapsedSeconds: elapsedSeconds,
        timerUpdatedAt: new Date().toISOString()
      };
      if (!currentWorkoutId) {
        const startAt = workoutStartTime ? new Date(workoutStartTime).toISOString() : '';
        currentWorkoutId = await App.DB.saveWorkout({
          date: today,
          type: currentWorkoutType || 'custom',
          status: (startAt || elapsedSeconds > 0) ? 'in_progress' : 'draft',
          startAt,
          startTime: workoutStartTime ? timerTimeLabel(workoutStartTime) : '',
          endAt: '',
          endTime: '',
          ...timerFields
        });
      } else {
        const existing = await App.DB.getWorkout(currentWorkoutId);
        const convertingSkip = existing?.type === 'skip' && currentWorkoutType && currentWorkoutType !== 'skip';
        const startAt = convertingSkip
          ? (workoutStartTime ? new Date(workoutStartTime).toISOString() : '')
          : (existing?.startAt || (workoutStartTime ? new Date(workoutStartTime).toISOString() : ''));
        const ended = convertingSkip ? false : !!(existing?.endAt || existing?.endTime || existing?.status === 'completed');
        await App.DB.saveWorkout({
          ...(existing || {}),
          id: currentWorkoutId,
          date: today,
          type: currentWorkoutType || existing?.type || 'custom',
          status: ended ? (existing?.status || 'completed') : ((startAt || elapsedSeconds > 0) ? 'in_progress' : (existing?.status || 'draft')),
          startAt,
          startTime: existing?.startTime || (workoutStartTime ? timerTimeLabel(workoutStartTime) : ''),
          endAt: convertingSkip ? '' : (existing?.endAt || ''),
          endTime: convertingSkip ? '' : (existing?.endTime || ''),
          durationMinutes: convertingSkip ? 0 : (existing?.durationMinutes || 0),
          feeling: convertingSkip ? '' : existing?.feeling,
          memo: convertingSkip ? '' : (existing?.memo || ''),
          skipReason: convertingSkip ? '' : (existing?.skipReason || ''),
          ...timerFields
        });
      }
      await App.DB.saveExercises(currentWorkoutId, currentExercises);
      persistWorkoutDraftShadow(today, { workoutId: currentWorkoutId });
      this._updateDraftStatus('下書き保存済み');
      this._queueCloudSave(today);
    },

    _queueCloudSave(dateStr) {
      if (workoutCloudSaveTimer) clearTimeout(workoutCloudSaveTimer);
      this._updateDraftStatus('同期待ち');
      workoutCloudSaveTimer = setTimeout(() => {
        workoutCloudSaveTimer = null;
        this._flushCloudSave(dateStr);
      }, 900);
    },

    async _flushCloudSave(dateStr) {
      if (!dateStr) return { ok: false, error: 'date required' };
      if (workoutCloudSaveTimer) {
        clearTimeout(workoutCloudSaveTimer);
        workoutCloudSaveTimer = null;
      }
      if (workoutCloudSaveInFlight) {
        workoutCloudSaveAgain = true;
        return { ok: false, error: 'sync in flight' };
      }

      workoutCloudSaveInFlight = true;
      this._updateDraftStatus('同期中');
      try {
        const result = await App.DB.pushToCloud(dateStr, { sections: ['workout', 'exercises'] });
        if (result.ok) {
          this._updateDraftStatus('同期済み');
        } else if (result.error === 'Sync URL未設定') {
          this._updateDraftStatus('同期URL未設定');
        } else {
          this._updateDraftStatus('未送信');
        }
        return result;
      } catch (error) {
        console.error('[Workout] Cloud save failed:', error);
        this._updateDraftStatus('未送信');
        return { ok: false, error: error.message };
      } finally {
        workoutCloudSaveInFlight = false;
        if (workoutCloudSaveAgain) {
          workoutCloudSaveAgain = false;
          this._queueCloudSave(dateStr);
        }
      }
    },

    updateSet(exerciseIndex, setIndex, field, value) {
      const exercise = currentExercises[exerciseIndex];
      if (!exercise?.sets?.[setIndex]) return;
      exercise.sets[setIndex][field] = parseEditableNumber(value);
      this._refreshExerciseCard(exerciseIndex);
      this._refreshProgress();
      this._autoSave();
    },

    updateCardio(exerciseIndex, field, value) {
      const exercise = currentExercises[exerciseIndex];
      if (!exercise) return;
      exercise[field] = parseEditableNumber(value);
      this._refreshExerciseCard(exerciseIndex);
      this._autoSave();
    },

    toggleSet(exerciseIndex, setIndex) {
      const exercise = currentExercises[exerciseIndex];
      if (!exercise?.sets?.[setIndex]) return;
      const previousState = !!exercise.sets[setIndex].completed;
      exercise.sets[setIndex].completed = !previousState;
      this._refreshExerciseCard(exerciseIndex);
      this._refreshProgress();
      this._autoSave();
      if (!previousState && !exercise.isCardio) this.startRestTimer(60);
    },

    toggleWholeExercise(exerciseIndex) {
      const exercise = currentExercises[exerciseIndex];
      if (!exercise?.sets?.length) return;
      const shouldComplete = !isExerciseDone(exercise);
      exercise.sets.forEach(set => {
        set.completed = shouldComplete;
      });
      this._refreshExerciseCard(exerciseIndex);
      this._refreshProgress();
      this._autoSave();
    },

    applyRecommended(exerciseIndex) {
      const exercise = currentExercises[exerciseIndex];
      if (!exercise || exercise.isCardio) return;
      const weight = safeNumber(exercise.recommended?.weight, 0);
      const reps = safeNumber(exercise.recommended?.reps, 0);
      resizeExerciseSets(exercise, exercise.recommended?.sets || exercise.sets?.length || 1, weight, reps);
      exercise.sets.forEach(set => { set.completed = false; });
      this._refreshExerciseCard(exerciseIndex);
      this._refreshProgress();
      this._autoSave();
    },

    copyPrevious(exerciseIndex) {
      const exercise = currentExercises[exerciseIndex];
      if (!exercise?.previous || exercise.isCardio) return;
      const weight = safeNumber(exercise.previous.weight, 0);
      const reps = safeNumber(exercise.previous.reps, 0);
      resizeExerciseSets(exercise, exercise.previous.sets || exercise.sets?.length || 1, weight, reps);
      exercise.sets.forEach(set => { set.completed = false; });
      this._refreshExerciseCard(exerciseIndex);
      this._refreshProgress();
      this._autoSave();
    },

    toggleStretchItem(index) {
      const exercise = currentExercises[index];
      if (!exercise) return;
      exercise.completed = !exercise.completed;
      const card = document.querySelector(`[data-stretch-idx="${index}"]`);
      const status = document.getElementById(`stretch-status-${index}`);
      if (status) status.textContent = exercise.completed ? '完了' : '未完';
      if (card) card.classList.toggle('is-done', exercise.completed);
      this._refreshProgress();
      this._autoSave();
    },

    async syncNow() {
      App.Utils.showToast('再同期しています...', 'info', 1800);
      const result = await App.DB.syncNow('ワークアウトから再同期');
      App.Utils.showSyncResult(result, {
        successMessage: '再同期しました',
        warningMessage: '再同期は完了しましたが、未送信データが残っています',
        errorPrefix: '再同期に失敗しました'
      });
      await App.refreshView();
    },

    forceMenu(type) {
      this._manualMenuType = type;
      persistWorkoutDraftShadow(App.Utils.today(), {
        workoutId: null,
        workoutType: type,
        exercises: []
      });
      currentWorkoutId = null;
      currentExercises = [];
      App.refreshView();
    },

    async resumeAfterSkip(type = 'short') {
      this._manualMenuType = type;
      persistWorkoutDraftShadow(App.Utils.today(), {
        workoutId: null,
        workoutType: type,
        exercises: []
      });
      currentWorkoutId = null;
      currentExercises = [];
      await App.refreshView();

      const today = App.Utils.today();
      if (!workoutStartTime) {
        setWorkoutTimerStart(Date.now(), today);
      }
      if (!workoutTimer) {
        workoutTimer = setInterval(() => this._updateTimerDisplay(), 1000);
      }
      this._updateTimerDisplay();
      persistWorkoutDraftShadow(today);

      try {
        await this._persistWorkoutDraft();
        const pushResult = await this._flushCloudSave(today);
        if (pushResult.ok) {
          App.Utils.showToast('休みを取り消して開始しました', 'success');
        } else {
          App.Utils.showToast('開始しました。未送信です', 'warning');
        }
      } catch (error) {
        App.Utils.showToast(`開始に失敗しました: ${error.message}`, 'error');
      }
    },

    startRestTimer(seconds) {
      if (this._restTimerInterval) clearInterval(this._restTimerInterval);
      const bar = document.getElementById('rest-timer-bar');
      if (!bar) return;

      let remaining = seconds;
      const label = bar.querySelector('.reboot-rest-text');
      const fill = bar.querySelector('.reboot-rest-progress-fill');
      bar.style.display = 'flex';

      const render = () => {
        if (label) label.textContent = `休憩 ${remaining}s`;
        if (fill) fill.style.width = `${(remaining / seconds) * 100}%`;
      };

      render();

      this._restTimerInterval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(this._restTimerInterval);
          this._restTimerInterval = null;
          bar.style.display = 'none';
          if (navigator.vibrate) navigator.vibrate(180);
          return;
        }
        render();
      }, 1000);
    },

    dismissRestTimer() {
      if (this._restTimerInterval) clearInterval(this._restTimerInterval);
      this._restTimerInterval = null;
      const bar = document.getElementById('rest-timer-bar');
      if (bar) bar.style.display = 'none';
    },

    async _toggleTimer() {
      const button = document.getElementById('workout-timer-toggle');
      if (!button) return;
      button.disabled = true;

      try {
        const today = App.Utils.today();
        if (workoutTimerState === 'running') {
          if (workoutTimer) {
            clearInterval(workoutTimer);
            workoutTimer = null;
          }
          setWorkoutTimerPaused(getWorkoutElapsedSeconds(), today);
        } else {
          setWorkoutTimerStart(Date.now(), today, getWorkoutElapsedSeconds());
          if (!workoutTimer) {
            workoutTimer = setInterval(() => this._updateTimerDisplay(), 1000);
          }
        }
        this._updateTimerDisplay();
        persistWorkoutDraftShadow(today);
        await this._persistWorkoutDraft();
        await this._flushCloudSave(today);
      } finally {
        button.disabled = false;
        this._updateTimerDisplay();
      }
    },

    _updateTimerDisplay() {
      const slot = document.getElementById('workout-timer-display');
      if (slot) slot.textContent = timerDisplayText();
      const toggle = document.getElementById('workout-timer-toggle');
      const reset = document.getElementById('workout-timer-reset');
      const running = workoutTimerState === 'running';
      const hasValue = running || getWorkoutElapsedSeconds() > 0;
      if (toggle) {
        toggle.classList.toggle('btn-danger', running);
        toggle.classList.toggle('btn-primary', !running);
        toggle.textContent = running ? '一時停止' : (hasValue ? '再開' : '開始');
      }
      if (reset) reset.disabled = !hasValue;
    },

    async resetTimer() {
      const button = document.getElementById('workout-timer-reset');
      if (button) button.disabled = true;
      const today = App.Utils.today();
      if (workoutTimer) {
        clearInterval(workoutTimer);
        workoutTimer = null;
      }
      clearWorkoutTimerState();
      this._updateTimerDisplay();
      persistWorkoutDraftShadow(today, {
        timerState: 'idle',
        timerStart: null,
        timerElapsedSeconds: 0
      });
      try {
        if (currentWorkoutId) {
          const existing = await App.DB.getWorkout(currentWorkoutId);
          await App.DB.saveWorkout({
            ...(existing || {}),
            id: currentWorkoutId,
            date: today,
            type: currentWorkoutType || existing?.type || 'custom',
            status: 'draft',
            startAt: '',
            startTime: '',
            endAt: '',
            endTime: '',
            durationMinutes: 0,
            timerState: 'idle',
            timerStartedAt: '',
            timerElapsedSeconds: 0,
            timerUpdatedAt: new Date().toISOString()
          });
          if (currentExercises.length > 0) await App.DB.saveExercises(currentWorkoutId, currentExercises);
          persistWorkoutDraftShadow(today, { workoutId: currentWorkoutId });
          await this._flushCloudSave(today);
        }
        App.Utils.showToast('タイマーをリセットしました', 'success');
      } catch (error) {
        App.Utils.showToast(`リセットに失敗しました: ${error.message}`, 'error');
      } finally {
        if (button) button.disabled = false;
        this._updateTimerDisplay();
      }
    },

    async _finishWorkout() {
      const button = document.getElementById('finish-workout-btn');
      if (button) {
        button.disabled = true;
        button.textContent = '保存中...';
      }

      if (workoutTimer) {
        clearInterval(workoutTimer);
        workoutTimer = null;
      }

      const html = `
        <div class="reboot-form-stack">
          <section class="reboot-choice-section">
            <div class="reboot-section-head">
              <div>
                <h3>今日の感触</h3>
                <p>最後の負荷感を残しておくと、次回の判断に役立ちます。</p>
              </div>
            </div>
            <div class="reboot-choice-grid" id="finish-feeling-grid">
              ${[
                { value: 1, label: '重め', hint: '調整' },
                { value: 2, label: '少し重い', hint: '調整したい' },
                { value: 3, label: '普通', hint: '標準' },
          { value: 4, label: '良好', hint: '通常' },
          { value: 5, label: '高め', hint: '通常' }
              ].map(option => `
                <button type="button" class="reboot-choice-chip ${option.value === 3 ? 'selected' : ''}" data-finish-feeling="${option.value}">
                  <strong>${h(option.label)}</strong>
                  <span>${h(option.hint)}</span>
                </button>`).join('')}
            </div>
          </section>
          <label class="reboot-field-block">
            <span>メモ</span>
            <textarea id="finish-memo" class="paste-area reboot-textarea" placeholder="今日は脚が重かった、時間内に終えられた など"></textarea>
          </label>
          <button class="btn btn-primary" type="button" id="confirm-finish-btn">保存して終了</button>
        </div>`;

      const close = App.Utils.showModal('ワークアウト終了', html);

      document.querySelectorAll('[data-finish-feeling]').forEach(node => {
        node.addEventListener('click', () => {
          document.querySelectorAll('[data-finish-feeling]').forEach(item => item.classList.remove('selected'));
          node.classList.add('selected');
        });
      });

      document.getElementById('confirm-finish-btn')?.addEventListener('click', async () => {
        const confirmButton = document.getElementById('confirm-finish-btn');
        if (confirmButton) {
          confirmButton.disabled = true;
          confirmButton.textContent = '保存中...';
        }

        try {
          const feeling = safeNumber(document.querySelector('[data-finish-feeling].selected')?.dataset.finishFeeling, 3);
          const memo = document.getElementById('finish-memo')?.value.trim() || '';
          const existing = currentWorkoutId ? await App.DB.getWorkout(currentWorkoutId) : null;
          const startMs = workoutStartTime || parseWorkoutStart(existing) || Date.now();
          const endAt = new Date().toISOString();
          const elapsedSeconds = getWorkoutElapsedSeconds();
          const durationMinutes = elapsedSeconds > 0
            ? Math.max(1, Math.round(elapsedSeconds / 60))
            : (startMs ? Math.max(1, Math.round((Date.now() - startMs) / 60000)) : 0);
          const endTime = timerTimeLabel(Date.now());

          currentWorkoutId = await App.DB.saveWorkout({
            id: currentWorkoutId,
            date: App.Utils.today(),
            type: currentWorkoutType || 'custom',
            status: 'completed',
            startAt: existing?.startAt || new Date(startMs).toISOString(),
            startTime: existing?.startTime || timerTimeLabel(startMs),
            endAt,
            endTime,
            durationMinutes,
            feeling,
            memo,
            skipReason: '',
            timerState: 'completed',
            timerStartedAt: '',
            timerElapsedSeconds: elapsedSeconds,
            timerUpdatedAt: new Date().toISOString()
          }, currentExercises);

          const pushResult = await App.DB.pushToCloud(App.Utils.today(), { sections: ['workout', 'exercises'] });
          close();
          await App.Utils.showSharedSaveResult(pushResult, {
            subject: 'ワークアウト記録',
            successMessage: 'ワークアウトを保存しました',
            warningMessage: 'ワークアウトは保存されましたが、共有側への確定はまだです',
            errorPrefix: 'ワークアウトの保存に失敗しました'
          });
          clearWorkoutDraftShadow(App.Utils.today());
          clearWorkoutTimerState();
          App.navigate('home');
        } catch (error) {
          if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.textContent = '保存して終了';
          }
          App.Utils.showToast(`保存に失敗しました: ${error.message}`, 'error');
        }
      });
    },

    async saveSkip() {
      const html = `
        <div class="reboot-form-stack">
          <section class="reboot-choice-section">
            <div class="reboot-section-head">
              <div>
                <h3>休みの理由</h3>
                <p>理由を残しておくと、あとで見返しやすくなります。</p>
              </div>
            </div>
            <div class="reboot-area-grid">
              ${['コンディション調整', '体調都合', '仕事が長引いた', '時間不足', '集中度調整', 'その他'].map(reason => `
                <button type="button" class="reboot-area-chip" data-skip-reason="${reason}">${h(reason)}</button>`).join('')}
            </div>
          </section>
          <label class="reboot-field-block">
            <span>メモ</span>
            <textarea id="skip-note" class="paste-area reboot-textarea" placeholder="残業が長引いた、脚の張りが強い など"></textarea>
          </label>
          <button class="btn btn-primary" type="button" id="confirm-skip-btn">休みとして保存</button>
        </div>`;

      const close = App.Utils.showModal('休みを記録', html);
      document.querySelectorAll('[data-skip-reason]').forEach(node => {
        node.addEventListener('click', () => node.classList.toggle('selected'));
      });

      document.getElementById('confirm-skip-btn')?.addEventListener('click', async () => {
        const button = document.getElementById('confirm-skip-btn');
        if (button) {
          button.disabled = true;
          button.textContent = '保存中...';
        }

        try {
          const reasons = [...document.querySelectorAll('[data-skip-reason].selected')].map(node => node.dataset.skipReason).filter(Boolean);
          const memo = document.getElementById('skip-note')?.value.trim() || '';
          currentWorkoutId = await App.DB.saveWorkout({
            id: currentWorkoutId,
            date: App.Utils.today(),
            type: 'skip',
            status: 'skipped',
            endAt: new Date().toISOString(),
            endTime: timerTimeLabel(Date.now()),
            skipReason: reasons.join(', '),
            memo,
            feeling: 0,
            durationMinutes: 0,
            timerState: 'idle',
            timerStartedAt: '',
            timerElapsedSeconds: 0,
            timerUpdatedAt: new Date().toISOString()
          });

          const pushResult = await App.DB.pushToCloud(App.Utils.today(), { sections: ['workout'] });
          close();
          await App.Utils.showSharedSaveResult(pushResult, {
            subject: '休み記録',
            successMessage: '休みとして保存しました',
            warningMessage: '休み記録は保存されましたが、共有側への確定はまだです',
            errorPrefix: '休み記録の保存に失敗しました'
          });
          clearWorkoutDraftShadow(App.Utils.today());
          clearWorkoutTimerState();
          App.navigate('home');
        } catch (error) {
          if (button) {
            button.disabled = false;
            button.textContent = '休みとして保存';
          }
          App.Utils.showToast(`保存に失敗しました: ${error.message}`, 'error');
        }
      });
    },

    init() {
      document.getElementById('workout-timer-toggle')?.addEventListener('click', () => this._toggleTimer());
      document.getElementById('workout-timer-reset')?.addEventListener('click', () => this.resetTimer());
      document.getElementById('finish-workout-btn')?.addEventListener('click', () => this._finishWorkout());
      document.getElementById('skip-workout-btn')?.addEventListener('click', () => this.saveSkip());
      document.getElementById('finish-stretch-btn')?.addEventListener('click', async () => {
        const button = document.getElementById('finish-stretch-btn');
        if (button) {
          button.disabled = true;
          button.textContent = '保存中...';
        }

        try {
          await App.DB.saveWorkout({
            id: currentWorkoutId,
            date: App.Utils.today(),
            type: 'stretch',
            status: 'completed',
            startAt: workoutStartTime ? new Date(workoutStartTime).toISOString() : '',
            startTime: workoutStartTime ? timerTimeLabel(workoutStartTime) : '',
            endAt: new Date().toISOString(),
            endTime: timerTimeLabel(Date.now()),
            feeling: 4,
            memo: 'ストレッチ完了',
            skipReason: '',
            durationMinutes: 10,
            timerState: 'completed',
            timerStartedAt: '',
            timerElapsedSeconds: getWorkoutElapsedSeconds(),
            timerUpdatedAt: new Date().toISOString()
          });
          const pushResult = await App.DB.pushToCloud(App.Utils.today(), { sections: ['workout'] });
          await App.Utils.showSharedSaveResult(pushResult, {
            subject: 'ストレッチ記録',
            successMessage: 'ストレッチを保存しました',
            warningMessage: 'ストレッチ記録は保存されましたが、共有側への確定はまだです',
            errorPrefix: 'ストレッチ記録の保存に失敗しました'
          });
          clearWorkoutDraftShadow(App.Utils.today());
          clearWorkoutTimerState();
          App.navigate('home');
        } catch (error) {
          if (button) {
            button.disabled = false;
            button.textContent = 'ストレッチを保存する';
          }
          App.Utils.showToast(`保存に失敗しました: ${error.message}`, 'error');
        }
      });

      // タイマーがlocalStorageから復元されていたら自動再開
      if (workoutTimerState === 'running' && workoutStartTime && !workoutTimer) {
        workoutTimer = setInterval(() => this._updateTimerDisplay(), 1000);
        this._updateTimerDisplay();
      } else if (workoutTimer) {
        this._updateTimerDisplay();
      } else {
        this._updateTimerDisplay();
      }
    },

    async destroy() {
      const dateStr = App.Utils?.today?.() || localStorage.getItem(WORKOUT_TIMER_DATE_KEY) || '';
      if (dateStr) {
        persistWorkoutDraftShadow(dateStr);
      }
      await workoutLocalSaveChain.catch(error => {
        console.warn('[Workout] Draft save chain failed during destroy:', error);
      });
      if (workoutCloudSaveTimer && dateStr) {
        await this._flushCloudSave(dateStr);
      }
      this.dismissRestTimer();
      this._manualMenuType = null;
      currentExercises = [];
      currentWorkoutId = null;
      currentWorkoutType = null;
      if (workoutTimer) {
        clearInterval(workoutTimer);
        workoutTimer = null;
      }
    }
  };

  function renderScheduleList(schedules) {
    if (!schedules.length) {
      return `
        <div class="reboot-empty-card">
          <strong>この月の勤務はまだありません</strong>
          <span>カレンダーか一括入力から登録できます。</span>
        </div>`;
    }

    return `
      <div class="reboot-schedule-list">
        ${schedules
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(schedule => {
            const placeLine = schedulePlaceLine(schedule);
            return `
              <button class="reboot-list-card reboot-schedule-row" onclick="App.Views.WorkSchedule.openDate('${schedule.date}')">
                <div class="reboot-schedule-date-block">
                  <strong>${h(App.Utils.formatDate(schedule.date))}</strong>
                  <span>${h(schedule.date)}</span>
                </div>
                <div class="reboot-schedule-main">
                  <strong>${h(shiftLabel(schedule.shiftType))}</strong>
                  <span>${h(App.FinalPolish.formatShiftRange(schedule).replace(/\s+/g, ' ').trim() || '時刻未設定')}</span>
                </div>
                <div class="reboot-list-aside">
                  <span>${h(placeLine || schedule.note || 'メモなし')}</span>
                  <small>${h(schedule.date === App.Utils.today() ? '今日' : App.Utils.getDayOfWeek(schedule.date))}</small>
                </div>
              </button>`;
          })
          .join('')}
      </div>`;
  }

  function schedulePlaceLine(schedule) {
    if (!schedule || schedule.shiftType !== 'business_trip') return '';
    const parts = [];
    if (schedule.destination) parts.push(`行き先: ${schedule.destination}`);
    if (schedule.hotelName) parts.push(`ホテル: ${schedule.hotelName}`);
    return parts.join(' / ');
  }

  function isLegacyShiftType(type) {
    const normalized = normalizeShiftType(type);
    return !!normalized && !Object.prototype.hasOwnProperty.call(SHIFT_PRESETS, normalized);
  }

  function scheduleCalendarNote(schedule) {
    if (!schedule) return '';
    return schedulePlaceLine(schedule) || schedule.note || '';
  }

  function summarizeMonthSchedules(schedules) {
      const summary = {
        total: schedules.length,
        off: 0,
        working: 0,
        project: 0,
        trip: 0
      };

      schedules.forEach(schedule => {
        if (isRestShiftType(schedule.shiftType)) summary.off += 1;
        else summary.working += 1;
        if (schedule.shiftType === 'project') summary.project += 1;
        if (schedule.shiftType === 'business_trip') summary.trip += 1;
      });

    return summary;
  }

  App.Views.WorkSchedule = {
    _year: null,
    _month: null,
    _selectedDate: null,
    _tab: 'month',

    async render() {
      const today = new Date();
      if (!this._year || !this._month) {
        this._year = today.getFullYear();
        this._month = today.getMonth() + 1;
      }

      const monthDates = App.Utils.getMonthDates(this._year, this._month);
      const firstDate = monthDates[0].date;
      const lastDate = monthDates[monthDates.length - 1].date;
      const schedules = await App.DB.getScheduleRange(firstDate, lastDate);
      const monthSummary = summarizeMonthSchedules(schedules.filter(schedule => schedule.date.startsWith(`${this._year}-${String(this._month).padStart(2, '0')}-`)));
      const scheduleMap = new Map(schedules.map(schedule => [schedule.date, schedule]));
      const monthLabel = `${this._year}年${this._month}月`;
      const todayStr = App.Utils.today();

      if (!this._selectedDate || !monthDates.some(item => item.date === this._selectedDate && !item.otherMonth)) {
        this._selectedDate = monthDates.find(item => item.date === todayStr && !item.otherMonth)?.date
          || monthDates.find(item => !item.otherMonth)?.date
          || todayStr;
      }

      const selectedSchedule = await App.DB.getSchedule(this._selectedDate);
      const selectedShiftType = normalizeShiftType(selectedSchedule?.shiftType || 'normal') || 'normal';
      const selectedIsLegacy = isLegacyShiftType(selectedShiftType);
      const selectedPreset = SHIFT_PRESETS[selectedShiftType] || SHIFT_PRESETS.normal;
      const selectedPlaceLine = schedulePlaceLine(selectedSchedule);

      return `
        <div class="container animate-in reboot-shell reboot-schedule-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Schedule</span>
              <h2>勤務スケジュール</h2>
              <p>PC は一覧、スマホはその日の修正を素早く行えます。</p>
            </div>
            <div class="reboot-head-tools">
              ${await renderSyncPanel('App.Views.WorkSchedule.syncNow()')}
            </div>
          </section>

          <div class="reboot-tabs">
            ${[
              ['month', '月表示'],
              ['list', '一覧'],
              ['batch', '一括入力']
            ].map(([tab, label]) => `
              <button class="reboot-tab ${this._tab === tab ? 'active' : ''}" onclick="App.Views.WorkSchedule.switchTab('${tab}')">${h(label)}</button>`).join('')}
          </div>

          ${this._tab === 'month' ? `
            <div class="reboot-schedule-grid">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>${h(monthLabel)}</h3>
                    <p>月全体を見ながら編集します。</p>
                  </div>
                  <div class="reboot-inline-actions">
                    <button class="btn btn-ghost" type="button" onclick="App.Views.WorkSchedule.changeMonth(-1)">前月</button>
                    <button class="btn btn-ghost" type="button" onclick="App.Views.WorkSchedule.changeMonth(1)">次月</button>
                  </div>
                </div>

                <div class="reboot-metric-grid reboot-metric-grid-4">
                  <article class="reboot-stat-card">
                    <span>登録</span>
                    <strong>${monthSummary.total}</strong>
                    <small>登録済み</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>休み / 有給</span>
                    <strong>${monthSummary.off}</strong>
                    <small>回復日</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>案件あり</span>
                    <strong>${monthSummary.project}</strong>
                    <small>移動多め</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>出張</span>
                    <strong>${monthSummary.trip}</strong>
                    <small>宿泊あり</small>
                  </article>
                </div>

                <div class="reboot-calendar-weekdays">
                  ${['日', '月', '火', '水', '木', '金', '土'].map(day => `<span>${day}</span>`).join('')}
                </div>
                <div class="reboot-calendar-grid">
                  ${monthDates.map(({ date, otherMonth }) => {
                    const schedule = scheduleMap.get(date);
                    const dayNum = new Date(`${date}T00:00:00`).getDate();
                    const normalizedSchedule = schedule ? { ...schedule, shiftType: normalizeShiftType(schedule.shiftType) || schedule.shiftType } : null;
                    const rangeLine = normalizedSchedule ? App.FinalPolish.formatShiftRange(normalizedSchedule).replace(/\s+/g, ' ').trim() : '';
                    const noteLine = scheduleCalendarNote(normalizedSchedule);
                    return `
                      <button class="reboot-day-cell ${otherMonth ? 'other' : ''} ${date === todayStr ? 'today' : ''} ${date === this._selectedDate ? 'selected' : ''}"
                        ${otherMonth ? 'disabled' : `onclick="App.Views.WorkSchedule.selectDate('${date}')"`}>
                        <span class="reboot-day-number">${dayNum}</span>
                        <span class="reboot-day-type">${h(normalizedSchedule ? shiftLabel(normalizedSchedule.shiftType) : '未設定')}</span>
                        <small>${h(rangeLine)}</small>
                        ${noteLine ? `<small class="reboot-day-note">${h(noteLine)}</small>` : ''}
                      </button>`;
                  }).join('')}
                </div>

                <div class="reboot-inline-actions">
                  <button class="btn btn-secondary" type="button" onclick="App.Views.WorkSchedule.syncMonth()">今月を共有保存</button>
                </div>
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>${h(App.Utils.formatDate(this._selectedDate))}</h3>
                    <p>右側でそのまま保存できます。</p>
                  </div>
                  <span class="reboot-pill reboot-pill-neutral" id="schedule-selected-shift">${h(shiftLabel(selectedSchedule?.shiftType || 'normal'))}</span>
                </div>
                <input type="hidden" id="schedule-current-shift" value="${h(selectedShiftType)}">

                <div class="reboot-shift-grid">
                  ${Object.entries(SHIFT_PRESETS).map(([type, preset]) => `
                    <button type="button"
                      class="reboot-shift-chip ${selectedShiftType === type ? 'selected' : ''}"
                      data-shift-type="${type}">
                      ${h(preset.label)}
                    </button>`).join('')}
                </div>
                ${selectedIsLegacy ? `
                  <p class="reboot-inline-note">過去の勤務種別「${h(shiftLabel(selectedShiftType))}」はそのまま保存できます。変更する場合は上の種別を選んでください。</p>
                ` : ''}

                <div id="schedule-time-wrap" class="${isRestShiftType(selectedShiftType) ? 'hidden' : ''}">
                  <div class="grid-2">
                    <label class="reboot-field-block">
                      <span>開始時刻</span>
                      <input id="schedule-start-time" class="form-input" type="time" value="${h(selectedSchedule?.startTime || selectedPreset.start || '09:00')}">
                    </label>
                    <label class="reboot-field-block">
                      <span>終了時刻</span>
                      <input id="schedule-end-time" class="form-input" type="time" value="${h(selectedSchedule?.endTime || selectedPreset.end || '18:00')}">
                    </label>
                  </div>
                </div>

                <div id="schedule-trip-wrap" class="${selectedShiftType === 'business_trip' ? '' : 'hidden'}">
                  <div class="grid-2">
                    <label class="reboot-field-block">
                      <span>行き先</span>
                      <input id="schedule-destination" class="form-input" type="text" value="${h(selectedSchedule?.destination || '')}" placeholder="例: 名古屋">
                    </label>
                    <label class="reboot-field-block">
                      <span>ホテル名</span>
                      <input id="schedule-hotel-name" class="form-input" type="text" value="${h(selectedSchedule?.hotelName || '')}" placeholder="例: 駅前ホテル">
                    </label>
                  </div>
                  ${selectedPlaceLine ? `<p class="reboot-inline-note">${h(selectedPlaceLine)}</p>` : ''}
                </div>

                <label class="reboot-field-block">
                  <span>メモ</span>
                  <textarea id="schedule-note" class="paste-area reboot-textarea" placeholder="移動多め、残業予定、翌朝早い など">${h(selectedSchedule?.note || '')}</textarea>
                </label>

                <div class="reboot-inline-actions">
                  <button class="btn btn-primary" type="button" id="schedule-save-btn">この日を保存</button>
                  <button class="btn btn-ghost" type="button" id="schedule-delete-btn">${selectedSchedule ? 'この日を削除' : '未登録です'}</button>
                </div>
              </section>
            </div>` : ''}

          ${this._tab === 'list' ? `
            <section class="reboot-panel">
              <div class="reboot-section-head">
                <div>
                  <h3>${h(monthLabel)} の一覧</h3>
                  <p>日付順で確認します。</p>
                </div>
              </div>
              <div class="reboot-link-list">
                ${renderScheduleList(schedules.filter(schedule => schedule.date.startsWith(`${this._year}-${String(this._month).padStart(2, '0')}-`)))}
              </div>
            </section>` : ''}

          ${this._tab === 'batch' ? `
            <section class="reboot-panel">
              <div class="reboot-section-head">
                <div>
                  <h3>テキスト一括入力</h3>
                  <p>勤務表をまとめて貼り付けます。</p>
                </div>
              </div>
              <div class="reboot-detail-stack">
                <div class="reboot-empty-card">
                  <strong>入力例</strong>
                  <span>2026-04-01 通常 09:00-18:00</span>
                  <span>2026-04-02 案件 09:00-18:00</span>
                  <span>2026-04-03 出張 大阪 / ホテル中央</span>
                  <span>2026-04-04 有給</span>
                  <span>2026-04-05 休み</span>
                </div>
              </div>
              <textarea id="schedule-paste" class="paste-area reboot-textarea" placeholder="2026-04-01 通常 09:00-18:00&#10;2026-04-02 案件 09:00-18:00&#10;2026-04-03 出張 大阪 / ホテル中央&#10;2026-04-04 有給&#10;2026-04-05 休み"></textarea>
              <div class="reboot-inline-actions">
                <button class="btn btn-primary" type="button" id="schedule-parse-btn">読み取って登録</button>
                <button class="btn btn-secondary" type="button" onclick="App.Views.WorkSchedule.switchTab('month')">月表示へ戻る</button>
              </div>
            </section>` : ''}
        </div>`;
    },

    switchTab(tab) {
      this._tab = tab;
      App.refreshView();
    },

    selectDate(dateStr) {
      this._selectedDate = dateStr;
      App.refreshView();
    },

    openDate(dateStr) {
      const parsed = new Date(`${dateStr}T00:00:00`);
      this._year = parsed.getFullYear();
      this._month = parsed.getMonth() + 1;
      this._selectedDate = dateStr;
      this._tab = 'month';
      App.refreshView();
    },

    changeMonth(delta) {
      this._month += delta;
      if (this._month > 12) {
        this._month = 1;
        this._year += 1;
      }
      if (this._month < 1) {
        this._month = 12;
        this._year -= 1;
      }
      this._selectedDate = null;
      App.refreshView();
    },

    _selectedShiftType() {
      return document.querySelector('.reboot-shift-chip.selected')?.dataset.shiftType
        || document.getElementById('schedule-current-shift')?.value
        || 'normal';
    },

    _refreshShiftUi(type) {
      document.querySelectorAll('.reboot-shift-chip').forEach(button => {
        button.classList.toggle('selected', button.dataset.shiftType === type);
      });

      const currentShift = document.getElementById('schedule-current-shift');
      if (currentShift) currentShift.value = type;

      const label = document.getElementById('schedule-selected-shift');
      if (label) label.textContent = shiftLabel(type);

      const timeWrap = document.getElementById('schedule-time-wrap');
      if (timeWrap) timeWrap.classList.toggle('hidden', isRestShiftType(type));

      const tripWrap = document.getElementById('schedule-trip-wrap');
      if (tripWrap) tripWrap.classList.toggle('hidden', type !== 'business_trip');

      if (!isRestShiftType(type)) {
        const preset = SHIFT_PRESETS[type] || SHIFT_PRESETS.normal;
        const startInput = document.getElementById('schedule-start-time');
        const endInput = document.getElementById('schedule-end-time');
        if (startInput && !startInput.value) startInput.value = preset.start;
        if (endInput && !endInput.value) endInput.value = preset.end;
      }
    },

    async saveSelected() {
      const button = document.getElementById('schedule-save-btn');
      if (button) {
        button.disabled = true;
        button.textContent = '保存中...';
      }

      try {
        const shiftType = this._selectedShiftType();
        const payload = {
          date: this._selectedDate,
          shiftType,
          startTime: isRestShiftType(shiftType) ? '' : (document.getElementById('schedule-start-time')?.value || ''),
          endTime: isRestShiftType(shiftType) ? '' : (document.getElementById('schedule-end-time')?.value || ''),
          note: document.getElementById('schedule-note')?.value.trim() || '',
          destination: shiftType === 'business_trip' ? (document.getElementById('schedule-destination')?.value.trim() || '') : '',
          hotelName: shiftType === 'business_trip' ? (document.getElementById('schedule-hotel-name')?.value.trim() || '') : ''
        };

        await App.DB.upsertSchedule(payload);
        const pushResult = await App.DB.pushToCloud(this._selectedDate, { sections: ['schedule'] });
        await App.Utils.showSharedSaveResult(pushResult, {
          subject: '勤務データ',
          successMessage: '勤務を保存しました',
          warningMessage: '勤務は保存されましたが、共有側への確定はまだです',
          errorPrefix: '勤務の保存に失敗しました'
        });
        await App.refreshView();
      } catch (error) {
        App.Utils.showToast(`保存に失敗しました: ${error.message}`, 'error');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'この日を保存';
        }
      }
    },

    async deleteSelected() {
      const exists = await App.DB.getSchedule(this._selectedDate);
      if (!exists) {
        App.Utils.showToast('この日はまだ登録されていません', 'warning');
        return;
      }

      if (!window.confirm('この日の勤務を削除しますか？')) return;

      const result = await App.DB.deleteScheduleRemote(this._selectedDate);
      if (!result.success) {
        App.Utils.showToast(`削除に失敗しました: ${result.error || '不明なエラー'}`, 'error');
        return;
      }

      App.Utils.showToast('この日の勤務を削除しました', 'info');
      await App.refreshView();
    },

    async syncMonth() {
      App.Utils.showToast('この月の勤務を共有保存しています...', 'info', 1800);
      const result = await App.DB.pushMonthSchedules(this._year, this._month);
      if (result.success) {
        App.Utils.showToast(`${this._year}年${this._month}月の勤務 ${result.count}件を送信しました`, 'success');
      } else {
        App.Utils.showToast(result.error || '送信に失敗しました', /Apps Script URL|Sync URL/.test(result.error || '') ? 'warning' : 'error');
      }
      await App.refreshView();
    },

    async syncNow() {
      App.Utils.showToast('再同期しています...', 'info', 1800);
      const result = await App.DB.syncNow('勤務表から再同期');
      App.Utils.showSyncResult(result, {
        successMessage: '再同期しました',
        warningMessage: '再同期は完了しましたが、未送信データが残っています',
        errorPrefix: '再同期に失敗しました'
      });
      await App.refreshView();
    },

    async parseBatch() {
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

        const offMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(休み|休日|off)/i);
        if (offMatch) {
          await App.DB.upsertSchedule({ date: offMatch[1], shiftType: 'off', startTime: '', endTime: '', note: '', destination: '', hotelName: '' });
          count += 1;
          continue;
        }

        const paidLeaveMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(有給|有休|paid|paid_leave)/i);
        if (paidLeaveMatch) {
          await App.DB.upsertSchedule({ date: paidLeaveMatch[1], shiftType: 'paid_leave', startTime: '', endTime: '', note: '', destination: '', hotelName: '' });
          count += 1;
          continue;
        }

        const tripMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(出張|trip|business_trip)(?:\s+(.+?))?(?:\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2}))?$/i);
        if (tripMatch) {
          const [, date, , placeText = '', start = '09:00', end = '18:00'] = tripMatch;
          const [destination = '', hotelName = ''] = placeText.split(/\s*[/／]\s*/).map(value => value.trim());
          await App.DB.upsertSchedule({
            date,
            shiftType: 'business_trip',
            startTime: start.padStart(5, '0'),
            endTime: end.padStart(5, '0'),
            destination,
            hotelName,
            note: ''
          });
          count += 1;
          continue;
        }

        const projectMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(案件あり|案件|project)(?:\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2}))?/i);
        if (projectMatch) {
          const [, date, , start = '09:00', end = '18:00'] = projectMatch;
          await App.DB.upsertSchedule({ date, shiftType: 'project', startTime: start.padStart(5, '0'), endTime: end.padStart(5, '0'), note: '', destination: '', hotelName: '' });
          count += 1;
          continue;
        }

        const normalMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(通常|通常勤務|normal)(?:\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2}))?/i);
        if (normalMatch) {
          const [, date, , start = '09:00', end = '18:00'] = normalMatch;
          await App.DB.upsertSchedule({ date, shiftType: 'normal', startTime: start.padStart(5, '0'), endTime: end.padStart(5, '0'), note: '', destination: '', hotelName: '' });
          count += 1;
          continue;
        }

        const timeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
          const [, date, start, end] = timeMatch;
          await App.DB.upsertSchedule({
            date,
            shiftType: 'normal',
            startTime: start.padStart(5, '0'),
            endTime: end.padStart(5, '0'),
            note: '',
            destination: '',
            hotelName: ''
          });
          count += 1;
        }
      }

      if (count <= 0) {
        App.Utils.showToast('読み取れる行がありませんでした', 'warning');
        return;
      }

      App.Utils.showToast(`${count}件の勤務を登録しました`, 'success');
      this._tab = 'month';
      await App.refreshView();
    },

    init() {
      document.querySelectorAll('.reboot-shift-chip').forEach(button => {
        button.addEventListener('click', () => {
          const type = button.dataset.shiftType;
          const preset = SHIFT_PRESETS[type] || SHIFT_PRESETS.normal;
          const startInput = document.getElementById('schedule-start-time');
          const endInput = document.getElementById('schedule-end-time');

          if (startInput && type !== 'off') startInput.value = preset.start;
          if (endInput && type !== 'off') endInput.value = preset.end;
          this._refreshShiftUi(type);
        });
      });

      this._refreshShiftUi(this._selectedShiftType());

      document.getElementById('schedule-save-btn')?.addEventListener('click', () => this.saveSelected());
      document.getElementById('schedule-delete-btn')?.addEventListener('click', () => this.deleteSelected());
      document.getElementById('schedule-parse-btn')?.addEventListener('click', () => this.parseBatch());
    },

    destroy() {}
  };
})();
(function() {
  'use strict';

  window.App = window.App || {};
  App.Views = App.Views || {};

  const analyticsCharts = [];
  let onboardingStep = 0;

  function isRestShiftType(type) {
    return App.FinalPolish?.isRestShiftType
      ? App.FinalPolish.isRestShiftType(type)
      : type === 'off' || type === 'paid_leave';
  }

  function h(value) {
    return App.Utils.escapeHtml(value == null ? '' : String(value));
  }

  function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function workoutKind(type) {
    const labels = {
      full: '通常メニュー',
      short: '短縮メニュー',
      cardio: '有酸素中心',
      stretch: 'ストレッチ',
      skip: '休み',
      custom: 'カスタム'
    };
    return labels[type] || type || '未設定';
  }

  function formatShift(schedule) {
    if (!schedule) return '未設定';
    const place = schedulePlaceLine(schedule);
    return `${App.FinalPolish.getShiftLabel(schedule.shiftType)} / ${App.FinalPolish.formatShiftRange(schedule).replace(/\s+/g, ' ').trim()}${place ? ` / ${place}` : ''}`;
  }

  async function renderSyncPanel(actionHandler, actionLabel = '再同期') {
    const state = await App.DB.getSaveState();
    return App.Utils.renderSaveState(state, {
      actionLabel,
      actionHandler
    });
  }

  function formatProviderStatus(provider) {
    const status = provider?.getStatus?.() || 'manual';
    const label = provider?.getStatusLabel?.() || '手入力';
    const copyMap = {
      manual: '手入力 / 閲覧',
      connected: '同期中',
      disconnected: '未接続',
      permission_denied: '権限確認が必要',
      error: '取得エラー'
    };
    return {
      status,
      label,
      copy: copyMap[status] || '健康データを管理します。'
    };
  }

  function formatHealthSource(source) {
    const labels = {
      health_connect: 'Health Connect',
      manual: '手入力'
    };
    return labels[source] || '未設定';
  }

  function formatProviderStatus(provider) {
    const status = provider?.getStatus?.() || 'manual';
    const copyMap = {
      manual: '表示のみ',
      connected: '同期中',
      disconnected: '未接続',
      permission_denied: '権限確認が必要',
      error: '取得エラー'
    };
    return {
      status,
      label: provider?.name === 'health_connect' ? 'Health Connect' : '表示のみ',
      copy: copyMap[status] || '健康データを表示します。'
    };
  }

  function formatHealthSource(source) {
    const labels = {
      health_connect: 'Health Connect',
      manual: '同期データ'
    };
    return labels[source] || '未設定';
  }

  function formatSyncTimestamp(value, emptyLabel = '未取得') {
    if (!value) return emptyLabel;
    return App.Utils.formatTimeShort(value);
  }

  function average(values) {
    const nums = values.filter(value => Number.isFinite(value));
    if (nums.length === 0) return null;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
  }

  function chartTheme() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#dbe5f4',
            font: { size: 11 }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#a4b7cf', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          ticks: { color: '#a4b7cf', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.06)' }
        }
      }
    };
  }

  function renderRecentHealthList(records) {
    if (!records.length) {
      return `
        <div class="reboot-empty-card">
          <strong>まだ健康データがありません</strong>
          <span>同期されると、ここに日ごとの記録が並びます。</span>
        </div>`;
    }

    return records
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(record => `
        <div class="reboot-list-card">
          <div>
            <strong>${h(App.Utils.formatDate(record.date))}</strong>
            <span>睡眠 ${h(App.Utils.formatSleep(record.sleepMinutes) || '—')}${App.Utils.formatSleepDetail?.(record) ? ` (${h(App.Utils.formatSleepDetail(record))})` : ''} / 歩数 ${record.steps != null ? h(record.steps.toLocaleString()) : '—'}</span>
          </div>
          <div class="reboot-list-aside">
            <span>平均心拍 ${record.heartRateAvg != null ? `${h(record.heartRateAvg)} bpm` : '—'}</span>
            <small>安静時心拍 ${record.restingHeartRate != null ? `${h(record.restingHeartRate)} bpm` : '—'}</small>
          </div>
        </div>`)
      .join('');
  }

  function renderWorkoutHistoryItems(workouts) {
    if (!workouts.length) {
      return `
        <div class="reboot-empty-card">
          <strong>まだトレーニング記録がありません</strong>
          <span>ワークアウトを保存すると、ここで前回の内容と流れを見返せます。</span>
        </div>`;
    }

    return workouts.map(workout => `
      <button class="reboot-list-card" onclick="App.Views.History.showWorkoutDetail(${workout.id})">
        <div>
          <strong>${h(App.Utils.formatDate(workout.date))}</strong>
          <span>${h(workoutKind(workout.type))} ${workout.startTime ? ` / ${App.Utils.normTime(workout.startTime)}-${App.Utils.normTime(workout.endTime) || ''}` : ''}</span>
        </div>
        <div class="reboot-list-aside">
          <span>${h(workout.memo || 'メモなし')}</span>
          <small>${workout.durationMinutes ? `${h(workout.durationMinutes)}分` : ''}</small>
        </div>
      </button>`).join('');
  }

  function renderJudgmentHistoryItems(judgments) {
    if (!judgments.length) {
      return `
        <div class="reboot-empty-card">
          <strong>まだ判定履歴がありません</strong>
          <span>当日判定を行うと、判断の流れをここで確認できます。</span>
        </div>`;
    }

    return judgments
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(judgment => {
        const current = judgment.userOverride || judgment.result;
        return `
          <div class="reboot-list-card">
            <div>
              <strong>${h(App.Utils.formatDate(judgment.date))}</strong>
              <span>${h(App.Judgment.RESULT_ICONS[current] || '•')} ${h(App.Judgment.RESULT_LABELS[current] || '未判定')}</span>
            </div>
            <div class="reboot-list-aside">
              <span>スコア ${h(judgment.score)}</span>
              <small>${h((judgment.reasons && judgment.reasons[0]) || judgment.message || '')}</small>
            </div>
          </div>`;
      }).join('');
  }

  App.Views.Health = {
    _selectedDate: null,
    _historyExpanded: false,

    async render() {
      const today = App.Utils.today();
      const dateStr = this._selectedDate || today;
      const [
        health,
        recent,
        lastSyncAt,
        pendingCount,
        lastHealthFetchAt,
        lastHealthPushAt,
        lastHealthPushState,
        lastHealthPushLabel,
        lastHealthPushDetail,
        lastHealthSource
      ] = await Promise.all([
        App.DB.getHealth(dateStr),
        App.DB.getHealthRange(App.Utils._localDateStr(new Date(new Date().setDate(new Date().getDate() - 6))), today),
        App.DB.getSetting('_lastSyncAt', ''),
        App.DB.getPendingCount(),
        App.DB.getSetting('_lastHealthFetchAt', ''),
        App.DB.getSetting('_lastHealthPushAt', ''),
        App.DB.getSetting('_lastHealthPushState', ''),
        App.DB.getSetting('_lastHealthPushLabel', ''),
        App.DB.getSetting('_lastHealthPushDetail', ''),
        App.DB.getSetting('_lastHealthSource', '')
      ]);
      const provider = App.healthProvider;
      const providerMeta = formatProviderStatus(provider);
      const sleepAvg = average(recent.map(item => item.sleepMinutes != null ? item.sleepMinutes / 60 : null));
      const stepAvg = average(recent.map(item => item.steps));
      const visibleRecent = this._historyExpanded ? recent : recent.slice(0, 4);
      const sourceLabel = formatHealthSource(health?.source || lastHealthSource || provider?.name || 'manual');
      const saveLabel = lastHealthPushLabel || (pendingCount > 0 ? '未送信' : '未確認');
      const saveDetail = lastHealthPushDetail || (pendingCount > 0 ? `再送待ち ${pendingCount}件` : '最新の送信結果を待っています。');
      const saveTone = lastHealthPushState === 'success'
        ? 'success'
        : (lastHealthPushState === 'error' ? 'error' : 'warning');
      return `
        <div class="container animate-in reboot-shell reboot-health-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Health</span>
              <h2>健康データ</h2>
              <p>同期状態と今日の値を先に見ます。PC は閲覧中心です。</p>
            </div>
            <div class="reboot-head-tools">
              ${await renderSyncPanel('App.Views.Health.syncNow()')}
            </div>
          </section>

          ${!window.SteadyBridge ? `
            <div class="reboot-panel">
              <div class="reboot-readonly-block">
                <strong>PC は閲覧専用</strong>
                <span>入力と Health Connect 同期はスマホで行います。</span>
              </div>
            </div>` : ''}

          <div class="reboot-dashboard-grid">
            <div class="reboot-main-stack">
              <section class="reboot-panel reboot-health-sync-card">
                <div class="reboot-section-head">
                  <div>
                    <h3>同期状態</h3>
                  </div>
                </div>
                <div class="reboot-health-sync-grid">
                  <div class="reboot-health-sync-item">
                    <span>最終更新</span>
                    <strong>${h(formatSyncTimestamp(lastSyncAt, '未同期'))}</strong>
                  </div>
                </div>
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>今日の主要値</h3>
                  </div>
                  <span class="reboot-inline-note">${h(App.Utils.formatDate(dateStr))}</span>
                </div>

                <div class="reboot-health-date-row">
                  <label class="reboot-field-block">
                    <span>対象日</span>
                    <input id="health-date" class="form-input" type="date" value="${h(dateStr)}">
                  </label>
                </div>

                <div class="reboot-health-primary-grid">
                  <article class="reboot-stat-card">
                    <span>歩数</span>
                    <strong>${health?.steps != null ? h(health.steps.toLocaleString()) : '未取得'}</strong>
                    <small>平均 ${stepAvg != null ? `${Math.round(stepAvg).toLocaleString()} 歩` : '—'}</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>睡眠</span>
                    <strong>${h(App.Utils.formatSleep(health?.sleepMinutes) || '未取得')}</strong>
                    <small>${h(App.Utils.formatSleepDetail?.(health, sleepAvg != null ? `平均 ${sleepAvg.toFixed(1)}h` : '—') || '—')}</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>平均心拍</span>
                    <strong>${health?.heartRateAvg != null ? `${h(health.heartRateAvg)} bpm` : '未取得'}</strong>
                    <small>直近の平均値です</small>
                  </article>
                  <article class="reboot-stat-card">
                    <span>安静時心拍</span>
                    <strong>${health?.restingHeartRate != null ? `${h(health.restingHeartRate)} bpm` : '未取得'}</strong>
                    <small>起床後の基準に近い値です</small>
                  </article>
                </div>
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>取得データ</h3>
                    <p>Health Connect から取得した値を表示します。</p>
                  </div>
                </div>
                <div class="reboot-form-stack">
                  <div class="reboot-empty-card">
                    <strong>${window.SteadyBridge ? 'Health Connect の取得結果' : '閲覧のみ'}</strong>
                    <span>${window.SteadyBridge ? '手入力はできません。必要なときは再取得してください。' : 'スマホで取得した健康データを表示します。'}</span>
                  </div>
                  ${provider?.triggerSync ? `
                    <div class="reboot-inline-actions">
                      <button class="btn btn-secondary" type="button" id="health-trigger-sync-btn">再取得</button>
                    </div>` : ''}
                </div>
              </section>

              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>履歴</h3>
                    <p>直近の記録です。</p>
                  </div>
                </div>
                <div class="reboot-link-list">
                  ${renderRecentHealthList(visibleRecent)}
                </div>
                ${recent.length > 4 ? `
                  <div class="reboot-inline-actions">
                    <button class="btn btn-ghost" type="button" id="health-history-toggle">${this._historyExpanded ? '閉じる' : 'もっと見る'}</button>
                  </div>` : ''}
              </section>
            </div>

            <aside class="reboot-side-stack">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>関連導線</h3>
                    <p>次の画面へ移ります。</p>
                  </div>
                </div>
                <div class="reboot-link-list">
                  <button class="reboot-link-card" onclick="App.navigate('condition')">
                    <strong>当日判定</strong>
                    <span>今日の判断へ進む</span>
                  </button>
                  <button class="reboot-link-card" onclick="App.navigate('schedule')">
                    <strong>勤務表</strong>
                    <span>勤務を確認する</span>
                  </button>
                  <button class="reboot-link-card" onclick="App.navigate('analytics')">
                    <strong>分析</strong>
                    <span>睡眠と運動を比べる</span>
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </div>`;
    },

    async loadDate(dateStr) {
      this._selectedDate = dateStr || App.Utils.today();
      await App.refreshView();
    },

    async syncNow() {
      App.Utils.showToast('再同期しています...', 'info', 1800);
      const result = await App.DB.syncNow('健康データから再同期');
      App.Utils.showSyncResult(result, {
        successMessage: '再同期しました',
        warningMessage: '未送信が残っています',
        errorPrefix: '再同期に失敗しました'
      });
      await App.refreshView();
    },

    init() {
      document.getElementById('health-date')?.addEventListener('change', event => this.loadDate(event.target.value));
      document.getElementById('health-trigger-sync-btn')?.addEventListener('click', () => {
        if (App.healthProvider?.triggerSync) {
          App.Utils.showToast('再取得しています', 'info', 1800);
          App.healthProvider.triggerSync(document.getElementById('health-date')?.value || App.Utils.today());
        }
      });
      document.getElementById('health-history-toggle')?.addEventListener('click', async () => {
        this._historyExpanded = !this._historyExpanded;
        await App.refreshView();
      });
    },

    destroy() {}
  };

  App.Views.Health.init = function() {
    document.getElementById('health-date')?.addEventListener('change', event => this.loadDate(event.target.value));

    const saveButton = document.getElementById('save-health-btn');
    const manualStack = saveButton?.closest('.reboot-form-stack');
    const manualPanel = document.querySelector('.reboot-main-stack .reboot-panel:nth-of-type(3)');

    if (manualPanel) {
      const heading = manualPanel.querySelector('.reboot-section-head h3');
      const note = manualPanel.querySelector('.reboot-section-head p');
      if (heading) heading.textContent = '取得データ';
      if (note) note.textContent = 'Health Connect から取得した値を表示します。';
    }

    if (manualStack) {
      const replacement = document.createElement('div');
      replacement.className = 'reboot-form-stack';
      replacement.innerHTML = `
        <div class="reboot-empty-card">
          <strong>${window.SteadyBridge ? 'Health Connect の取得結果' : '閲覧のみ'}</strong>
          <span>${window.SteadyBridge ? '手入力はできません。必要なときは再取得してください。' : 'スマホで取得した健康データを表示します。'}</span>
        </div>
        ${App.healthProvider?.triggerSync ? `
          <div class="reboot-inline-actions">
            <button class="btn btn-secondary" type="button" id="health-trigger-sync-btn">再取得</button>
          </div>` : ''}`;
      manualStack.replaceWith(replacement);
    }

    document.getElementById('health-trigger-sync-btn')?.addEventListener('click', () => {
      if (App.healthProvider?.triggerSync) {
        App.Utils.showToast('再取得しています', 'info', 1800);
        App.healthProvider.triggerSync(document.getElementById('health-date')?.value || App.Utils.today());
      }
    });

    document.getElementById('health-history-toggle')?.addEventListener('click', async () => {
      this._historyExpanded = !this._historyExpanded;
      await App.refreshView();
    });
  };

  const originalHealthRender = App.Views.Health.render.bind(App.Views.Health);
  App.Views.Health.render = async function() {
    const html = await originalHealthRender.call(this);
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const root = template.content.firstElementChild;
    const panel = root?.querySelector('.reboot-main-stack .reboot-panel:nth-of-type(3)');
    const heading = panel?.querySelector('.reboot-section-head h3');
    const note = panel?.querySelector('.reboot-section-head p');
    const manualStack = panel?.querySelector('#save-health-btn')?.closest('.reboot-form-stack');

    if (heading) heading.textContent = '取得データ';
    if (note) note.textContent = 'Health Connect から取得した値を表示します。';

    if (manualStack) {
      const replacement = document.createElement('div');
      replacement.className = 'reboot-form-stack';
      replacement.innerHTML = `
        <div class="reboot-empty-card">
          <strong>${window.SteadyBridge ? 'Health Connect の取得結果' : '閲覧のみ'}</strong>
          <span>${window.SteadyBridge ? '手入力はできません。必要なときは再取得してください。' : 'スマホで取得した健康データを表示します。'}</span>
        </div>
        ${App.healthProvider?.triggerSync ? `
          <div class="reboot-inline-actions">
            <button class="btn btn-secondary" type="button" id="health-trigger-sync-btn">再取得</button>
          </div>` : ''}`;
      manualStack.replaceWith(replacement);
    }

    return root ? root.outerHTML : html;
  };

  App.Views.History = {
    _tab: 'workouts',
    _year: null,
    _month: null,

    async render() {
      const now = new Date();
      if (!this._year || !this._month) {
        this._year = now.getFullYear();
        this._month = now.getMonth() + 1;
      }
      const today = App.Utils.today();
      const thirtyDaysAgo = App.Utils._localDateStr(new Date(new Date().setDate(new Date().getDate() - 30)));
      const [recentWorkouts, judgments, lastWorkout, daysSince] = await Promise.all([
        App.DB.getWorkouts(24),
        App.DB.getJudgmentRange(thirtyDaysAgo, today),
        App.DB.getLastWorkout(),
        App.DB.getDaysSinceLastWorkout(today)
      ]);
      const actual = recentWorkouts.filter(item => item.type !== 'skip');
      const skipped = recentWorkouts.filter(item => item.type === 'skip');

      return `
        <div class="container animate-in reboot-shell reboot-history-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">History</span>
              <h2>履歴</h2>
              <p>ワークアウトと当日判定を一覧で確認します。</p>
            </div>
            <div class="reboot-head-tools">
              <div class="reboot-tabs">
                <button class="reboot-tab ${this._tab === 'workouts' ? 'active' : ''}" onclick="App.Views.History.switchTab('workouts')">トレーニング</button>
                <button class="reboot-tab ${this._tab === 'judgments' ? 'active' : ''}" onclick="App.Views.History.switchTab('judgments')">判定履歴</button>
                <button class="reboot-tab ${this._tab === 'calendar' ? 'active' : ''}" onclick="App.Views.History.switchTab('calendar')">月カレンダー</button>
              </div>
            </div>
          </section>

          <section class="reboot-panel">
            <div class="reboot-metric-grid reboot-metric-grid-4">
              <article class="reboot-stat-card">
                <span>直近30日の実施</span>
                <strong>${actual.length}回</strong>
                <small>休み ${skipped.length}回</small>
              </article>
              <article class="reboot-stat-card">
                <span>前回の種別</span>
                <strong>${h(lastWorkout ? workoutKind(lastWorkout.type) : '未記録')}</strong>
                <small>${h(lastWorkout ? App.Utils.formatDate(lastWorkout.date) : 'まだ記録がありません')}</small>
              </article>
              <article class="reboot-stat-card">
                <span>前回からの日数</span>
                <strong>${daysSince >= 999 ? '初回' : `${daysSince}日`}</strong>
                <small>空きすぎと詰めすぎを見直す材料</small>
              </article>
              <article class="reboot-stat-card">
                <span>判定回数</span>
                <strong>${judgments.length}回</strong>
                <small>変更も含めて確認できます</small>
              </article>
            </div>
          </section>

          ${this._tab === 'workouts' ? `
            <section class="reboot-panel">
              <div class="reboot-section-head">
                <div>
                  <h3>トレーニング履歴</h3>
                  <p>前回実績、感触、メモをまとめて見返せます。</p>
                </div>
              </div>
              <div class="reboot-link-list">${renderWorkoutHistoryItems(recentWorkouts)}</div>
            </section>` : ''}

          ${this._tab === 'judgments' ? `
            <section class="reboot-panel">
              <div class="reboot-section-head">
                <div>
                  <h3>判定履歴</h3>
                  <p>どんな日にどの判定になったかを見返します。</p>
                </div>
              </div>
              <div class="reboot-link-list">${renderJudgmentHistoryItems(judgments)}</div>
            </section>` : ''}

          ${this._tab === 'calendar' ? await this._renderCalendar() : ''}
        </div>`;
    },

    async _renderCalendar() {
      const dates = App.Utils.getMonthDates(this._year, this._month);
      const startDate = dates[0].date;
      const endDate = dates[dates.length - 1].date;
      const [workouts, judgments] = await Promise.all([
        App.DB.getWorkoutsRange(startDate, endDate),
        App.DB.getJudgmentRange(startDate, endDate)
      ]);
      const workoutMap = new Map(workouts.map(item => [item.date, item]));
      const judgmentMap = new Map(judgments.map(item => [item.date, item]));
      const activeCount = workouts.filter(item => item.type !== 'skip').length;
      const skipCount = workouts.filter(item => item.type === 'skip').length;

      return `
        <section class="reboot-panel">
          <div class="reboot-section-head">
            <div>
              <h3>${this._year}年${this._month}月</h3>
              <p>実施、休み、判定済みを月単位で見返します。</p>
            </div>
            <div class="reboot-inline-actions">
              <button class="btn btn-ghost" type="button" onclick="App.Views.History.changeMonth(-1)">前月</button>
              <button class="btn btn-ghost" type="button" onclick="App.Views.History.changeMonth(1)">次月</button>
            </div>
          </div>

          <div class="reboot-metric-grid reboot-metric-grid-3">
            <article class="reboot-stat-card">
              <span>実施</span>
              <strong>${activeCount}日</strong>
              <small>ワークアウト完了</small>
            </article>
            <article class="reboot-stat-card">
              <span>休み</span>
              <strong>${skipCount}日</strong>
              <small>回復優先の日</small>
            </article>
            <article class="reboot-stat-card">
              <span>判定済み</span>
              <strong>${judgments.length}日</strong>
              <small>判断だけ残っている日も含む</small>
            </article>
          </div>

          <div class="reboot-calendar-weekdays">
            ${['日', '月', '火', '水', '木', '金', '土'].map(day => `<span>${day}</span>`).join('')}
          </div>
          <div class="reboot-calendar-grid">
            ${dates.map(({ date, otherMonth }) => {
              const workout = workoutMap.get(date);
              const judgment = judgmentMap.get(date);
              const stateClass = workout?.type === 'skip' ? 'skip' : workout ? 'done' : judgment ? 'planned' : '';
              return `
                <div class="reboot-day-cell ${otherMonth ? 'other' : ''} ${date === App.Utils.today() ? 'today' : ''} ${stateClass}">
                  <span class="reboot-day-number">${new Date(`${date}T00:00:00`).getDate()}</span>
                  <span class="reboot-day-type">${h(workout ? workoutKind(workout.type) : (judgment ? '判定済み' : '未記録'))}</span>
                  <small>${h(workout?.memo || judgment?.message || '')}</small>
                </div>`;
            }).join('')}
          </div>
        </section>`;
    },

    async showWorkoutDetail(workoutId) {
      const workout = await App.DB.getWorkout(workoutId);
      if (!workout) return;
      const exercises = await App.DB.getExercises(workoutId);
      const html = `
        <div class="reboot-form-stack">
          <div class="reboot-empty-card">
            <strong>${h(App.Utils.formatDate(workout.date))}</strong>
            <span>${h(workoutKind(workout.type))} ${workout.durationMinutes ? ` / ${h(workout.durationMinutes)}分` : ''}</span>
            <span>${h(workout.memo || 'メモなし')}</span>
          </div>
          <div class="reboot-link-list">
            ${exercises.map(exercise => {
              if (exercise.isCardio || exercise.durationMin) {
                const cardioLine = `速度${safeNumber(exercise.speed, 5)}km/h × ${safeNumber(exercise.durationMin, 0)}分`;
                return `<div class="reboot-list-card reboot-workout-detail-line"><div class="reboot-workout-detail-main"><strong>${h(exercise.name)}</strong><span>${h(cardioLine)}</span></div><div class="reboot-list-aside"><span>${exercise.sets?.[0]?.completed ? '完了' : '未完'}</span></div></div>`;
              }
              const sets = exercise.sets || [];
              const first = sets[0] || {};
              const strengthLine = (first.weight || 0) > 0 ? `${first.weight}kg × ${first.reps}回 × ${sets.length}セット` : `${first.reps || 0}回 × ${sets.length}セット`;
              return `<div class="reboot-list-card reboot-workout-detail-line"><div class="reboot-workout-detail-main"><strong>${h(exercise.name)}</strong><span>${h(strengthLine)}</span></div><div class="reboot-list-aside"><span>${sets.filter(set => set.completed).length}/${sets.length} 完了</span></div></div>`;
            }).join('')}
          </div>
        </div>`;
      App.Utils.showModal(App.Utils.formatDate(workout.date), html);
    },

    switchTab(tab) {
      this._tab = tab;
      App.refreshView();
    },

    changeMonth(delta) {
      this._month += delta;
      if (this._month > 12) {
        this._month = 1;
        this._year += 1;
      }
      if (this._month < 1) {
        this._month = 12;
        this._year -= 1;
      }
      App.refreshView();
    },

    init() {},
    destroy() {}
  };

  App.Views.Analytics = {
    _tab: 'overview',

    async render() {
      const today = App.Utils.today();
      const start = App.Utils._localDateStr(new Date(new Date().setDate(new Date().getDate() - 30)));
      const [workouts, judgments, healthRecords, schedules] = await Promise.all([
        App.DB.getWorkoutsRange(start, today),
        App.DB.getJudgmentRange(start, today),
        App.DB.getHealthRange(start, today),
        App.DB.getScheduleRange(start, today)
      ]);

      const actual = workouts.filter(item => item.type !== 'skip');
      const skipped = workouts.filter(item => item.type === 'skip');
      const avgScore = average(judgments.map(item => item.score));
      const avgSleep = average(healthRecords.map(item => item.sleepMinutes != null ? item.sleepMinutes / 60 : null));
      const avgSteps = average(healthRecords.map(item => item.steps));
      const activeWorkDays = schedules.filter(item => item.shiftType === 'project' || item.shiftType === 'business_trip').length;
      const activeWorkWorkouts = actual.filter(item => {
        const schedule = schedules.find(s => s.date === item.date);
        return schedule && (schedule.shiftType === 'project' || schedule.shiftType === 'business_trip');
      }).length;
      const offDayWorkouts = actual.filter(item => {
        const schedule = schedules.find(s => s.date === item.date);
        return App.FinalPolish.isRestShiftType(schedule?.shiftType);
      }).length;

      return `
        <div class="container animate-in reboot-shell reboot-analytics-shell">
          <section class="reboot-page-head">
            <div class="reboot-title-block">
              <span class="reboot-eyebrow">Analytics</span>
              <h2>分析</h2>
            <p>睡眠、勤務、運動の関係を比較します。</p>
            </div>
            <div class="reboot-head-tools">
              <div class="reboot-tabs">
                <button class="reboot-tab ${this._tab === 'overview' ? 'active' : ''}" onclick="App.Views.Analytics.switchTab('overview')">概要</button>
                <button class="reboot-tab ${this._tab === 'training' ? 'active' : ''}" onclick="App.Views.Analytics.switchTab('training')">トレーニング</button>
                <button class="reboot-tab ${this._tab === 'health' ? 'active' : ''}" onclick="App.Views.Analytics.switchTab('health')">健康</button>
              </div>
            </div>
          </section>

          <section class="reboot-panel">
            <div class="reboot-metric-grid reboot-metric-grid-4">
              <article class="reboot-stat-card">
                <span>実施回数</span>
                <strong>${actual.length}回</strong>
                <small>休み ${skipped.length}回</small>
              </article>
              <article class="reboot-stat-card">
                <span>平均スコア</span>
                <strong>${avgScore != null ? Math.round(avgScore) : '—'}</strong>
                <small>当日判定の平均</small>
              </article>
              <article class="reboot-stat-card">
                <span>平均睡眠</span>
                <strong>${avgSleep != null ? `${avgSleep.toFixed(1)}h` : '—'}</strong>
                <small>直近30日</small>
              </article>
              <article class="reboot-stat-card">
                <span>平均歩数</span>
                <strong>${avgSteps != null ? Math.round(avgSteps).toLocaleString() : '—'}</strong>
                <small>直近30日</small>
              </article>
            </div>
          </section>

          ${this._tab === 'overview' ? `
            <div class="reboot-dashboard-grid">
              <div class="reboot-main-stack">
                <section class="reboot-panel">
                  <div class="reboot-section-head">
                    <div>
                      <h3>関係の見え方</h3>
                      <p>今の運用で見えている傾向をざっくり掴みます。</p>
                    </div>
                  </div>
                  <div class="reboot-metric-grid reboot-metric-grid-3">
                    <article class="reboot-stat-card">
                      <span>案件 / 出張</span>
                      <strong>${activeWorkDays}日</strong>
                      <small>そのうち実施 ${activeWorkWorkouts}回</small>
                    </article>
                    <article class="reboot-stat-card">
                      <span>休みの日の実施</span>
                      <strong>${offDayWorkouts}回</strong>
                    <small>状態が良い日に進みやすい傾向</small>
                    </article>
                    <article class="reboot-stat-card">
                      <span>判定記録</span>
                      <strong>${judgments.length}件</strong>
                      <small>判断の蓄積量</small>
                    </article>
                  </div>
                </section>

                <section class="reboot-panel">
                  <div class="reboot-section-head">
                    <div>
                      <h3>最近の気づき</h3>
                      <p>あとで見返しやすいよう、短い文章で整理します。</p>
                    </div>
                  </div>
                  <div class="reboot-link-list">
                    <div class="reboot-list-card">
                      <div>
                        <strong>睡眠と判定</strong>
                        <span>${avgSleep != null ? `平均睡眠は ${avgSleep.toFixed(1)} 時間です。` : '睡眠データがまだ少ないです。'}</span>
                      </div>
                    </div>
                    <div class="reboot-list-card">
                      <div>
                        <strong>勤務との相性</strong>
                        <span>${activeWorkDays > 0 ? `案件・出張 ${activeWorkDays} 日のうち ${activeWorkWorkouts} 回トレーニングしています。` : '案件・出張のデータはまだありません。'}</span>
                      </div>
                    </div>
                    <div class="reboot-list-card">
                      <div>
                        <strong>継続の見え方</strong>
              <span>${actual.length > 0 ? `直近30日で ${actual.length} 回の実施です。` : 'まだ実施データが少ないので、1回目の記録から傾向を作ります。'}</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <aside class="reboot-side-stack">
                <section class="reboot-panel">
                  <div class="reboot-section-head">
                    <div>
                      <h3>次の確認先</h3>
                      <p>分析から行動へ戻りやすくします。</p>
                    </div>
                  </div>
                  <div class="reboot-link-list">
                    <button class="reboot-link-card" onclick="App.navigate('history')">
                      <strong>履歴を見る</strong>
                      <span>具体的な日付単位で見返す</span>
                    </button>
                    <button class="reboot-link-card" onclick="App.navigate('schedule')">
                      <strong>勤務表を見る</strong>
                      <span>勤務パターンを整える</span>
                    </button>
                    <button class="reboot-link-card" onclick="App.navigate('condition')">
                      <strong>今日の判定へ</strong>
                      <span>今の状態で今日を決める</span>
                    </button>
                  </div>
                </section>
              </aside>
            </div>` : ''}

          ${this._tab === 'training' ? `
            <div class="reboot-chart-grid">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>週別トレーニング回数</h3>
                    <p>直近4週間の実施回数です。</p>
                  </div>
                </div>
                <div class="reboot-chart-card"><canvas id="chart-frequency"></canvas></div>
              </section>
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>判定結果の分布</h3>
                    <p>どの判断が多いかを見ます。</p>
                  </div>
                </div>
                <div class="reboot-chart-card"><canvas id="chart-judgment"></canvas></div>
              </section>
            </div>` : ''}

          ${this._tab === 'health' ? `
            <div class="reboot-chart-grid">
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>睡眠時間</h3>
                    <p>30日間の睡眠時間です。</p>
                  </div>
                </div>
                <div class="reboot-chart-card"><canvas id="chart-sleep"></canvas></div>
              </section>
              <section class="reboot-panel">
                <div class="reboot-section-head">
                  <div>
                    <h3>歩数</h3>
                    <p>30日間の歩数です。</p>
                  </div>
                </div>
                <div class="reboot-chart-card"><canvas id="chart-steps"></canvas></div>
              </section>
            </div>` : ''}
        </div>`;
    },

    switchTab(tab) {
      this._tab = tab;
      App.refreshView();
    },

    async init() {
      await this._initCharts(this._tab);
    },

    async _initCharts(tabId) {
      if (typeof Chart === 'undefined') return;
      analyticsCharts.forEach(chart => chart.destroy());
      analyticsCharts.length = 0;

      const today = App.Utils.today();
      const start = App.Utils._localDateStr(new Date(new Date().setDate(new Date().getDate() - 30)));

      if (tabId === 'training') {
        const workouts = await App.DB.getWorkoutsRange(start, today);
        const judgments = await App.DB.getJudgmentRange(start, today);
        const weekData = [0, 0, 0, 0];
        workouts.filter(item => item.type !== 'skip').forEach(item => {
          const diff = App.Utils.daysBetween(item.date, today);
          const index = Math.min(3, Math.floor(diff / 7));
          weekData[3 - index] += 1;
        });

        const freqCanvas = document.getElementById('chart-frequency');
        if (freqCanvas) {
          analyticsCharts.push(new Chart(freqCanvas, {
            type: 'bar',
            data: {
              labels: ['3週前', '2週前', '先週', '今週'],
              datasets: [{
                data: weekData,
                backgroundColor: ['rgba(115,166,255,0.35)', 'rgba(115,166,255,0.5)', 'rgba(115,166,255,0.65)', 'rgba(83,211,166,0.75)'],
                borderRadius: 10
              }]
            },
            options: {
              ...chartTheme(),
              plugins: { legend: { display: false } },
              scales: {
                ...chartTheme().scales,
                y: { ...chartTheme().scales.y, beginAtZero: true, ticks: { ...chartTheme().scales.y.ticks, stepSize: 1 } }
              }
            }
          }));
        }

        const distribution = [0, 0, 0, 0, 0];
        judgments.forEach(item => {
          const index = (item.userOverride || item.result) - 1;
          if (index >= 0 && index < 5) distribution[index] += 1;
        });
        const judgmentCanvas = document.getElementById('chart-judgment');
        if (judgmentCanvas) {
          analyticsCharts.push(new Chart(judgmentCanvas, {
            type: 'doughnut',
            data: {
              labels: App.Judgment.RESULT_LABELS.slice(1),
              datasets: [{
                data: distribution,
                backgroundColor: ['#53d3a6', '#73a6ff', '#ffbe6b', '#f59e71', '#8ea2bc']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: {
                    color: '#dbe5f4',
                    font: { size: 11 },
                    padding: 14
                  }
                }
              }
            }
          }));
        }
      }

      if (tabId === 'health') {
        const records = (await App.DB.getHealthRange(start, today)).sort((a, b) => a.date.localeCompare(b.date));
        const sleepCanvas = document.getElementById('chart-sleep');
        if (sleepCanvas) {
          analyticsCharts.push(new Chart(sleepCanvas, {
            type: 'bar',
            data: {
              labels: records.filter(item => item.sleepMinutes != null).map(item => App.Utils.formatDateShort(item.date)),
              datasets: [{
                data: records.filter(item => item.sleepMinutes != null).map(item => +(item.sleepMinutes / 60).toFixed(1)),
                backgroundColor: records.filter(item => item.sleepMinutes != null).map(item => item.sleepMinutes < 360 ? 'rgba(255, 126, 126, 0.7)' : 'rgba(115, 166, 255, 0.7)'),
                borderRadius: 8
              }]
            },
            options: chartTheme()
          }));
        }

        const stepsCanvas = document.getElementById('chart-steps');
        if (stepsCanvas) {
          analyticsCharts.push(new Chart(stepsCanvas, {
            type: 'bar',
            data: {
              labels: records.filter(item => item.steps != null).map(item => App.Utils.formatDateShort(item.date)),
              datasets: [{
                data: records.filter(item => item.steps != null).map(item => item.steps),
                backgroundColor: 'rgba(83, 211, 166, 0.72)',
                borderRadius: 8
              }]
            },
            options: chartTheme()
          }));
        }
      }
    },

    destroy() {
      analyticsCharts.forEach(chart => chart.destroy());
      analyticsCharts.length = 0;
    }
  };

  App.Views.Onboarding = {
    async render() {
      const steps = [
        {
          kicker: '記録の設計',
          title: '今日はどうするかを、まず決める',
          body: '勤務、体調、健康データから、今日は行くか軽くやるか休むかを先に判断します。',
          bullets: ['勤務後でも確認しやすい', '調整日も記録できる', '標準メニュー']
        },
        {
          kicker: '毎日の流れ',
          title: '判定から記録までを短くつなぐ',
          body: 'スマホでは3タップ前後で判定、開始、保存まで進める構成にしています。',
          bullets: ['必須種目と任意種目を分離', '前回実績と推奨を同時表示', '未送信があれば再同期で回収']
        },
        {
          kicker: '運用の前提',
          title: 'Google スプレッドシートを唯一の正にする',
          body: '共有データは Apps Script 保存成功後にのみ確定し、端末ローカルは補助用途に限定します。',
          bullets: ['sharedSettings と localDeviceSettings を分離', '健康データはスマホ送信のみ', 'PC は閲覧と比較に強い構成']
        }
      ];
      const step = steps[onboardingStep] || steps[0];

      return `
        <div class="container animate-in reboot-shell reboot-onboarding-shell">
          <section class="reboot-onboarding-hero">
            <div class="reboot-onboarding-copy">
              <span class="reboot-eyebrow">${h(step.kicker)}</span>
              <h1>からだログ</h1>
              <h2>${h(step.title)}</h2>
              <p>${h(step.body)}</p>
              <div class="reboot-link-list">
                ${step.bullets.map(item => `<div class="reboot-list-card"><div><strong>${h(item)}</strong></div></div>`).join('')}
              </div>
              <div class="reboot-inline-actions">
                ${onboardingStep > 0 ? `<button class="btn btn-ghost" type="button" onclick="App.Views.Onboarding.prevStep()">戻る</button>` : ''}
                ${onboardingStep < steps.length - 1 ? `<button class="btn btn-primary" type="button" onclick="App.Views.Onboarding.nextStep()">次へ</button>` : `<button class="btn btn-primary" type="button" onclick="App.Views.Onboarding.finish()">使い始める</button>`}
              </div>
            </div>
            <div class="reboot-onboarding-side">
              <div class="reboot-stepper">
                ${steps.map((item, index) => `
                  <button class="reboot-step-card ${index === onboardingStep ? 'active' : ''}" type="button" onclick="App.Views.Onboarding.goTo(${index})">
                    <span>STEP ${index + 1}</span>
                    <strong>${h(item.kicker)}</strong>
                  </button>`).join('')}
              </div>
            </div>
          </section>
        </div>`;
    },

    nextStep() {
      onboardingStep = Math.min(onboardingStep + 1, 2);
      App.refreshView();
    },

    prevStep() {
      onboardingStep = Math.max(onboardingStep - 1, 0);
      App.refreshView();
    },

    goTo(step) {
      onboardingStep = step;
      App.refreshView();
    },

    async finish() {
      await App.DB.setSetting('onboardingDone', true);
      App.navigate('home');
    },

    init() {},
    destroy() {}
  };
})();
