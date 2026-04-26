// ============================================
// Steady — トレーニング生成エンジン
// 標準ジム機材ベースのメニュー設計
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};

  // 利用可能機材
  const EQUIPMENT = [
    { id: 'leg_press', name: 'レッグプレス', category: '下半身', icon: '🦵' },
    { id: 'lat_pulldown', name: 'ラットプルダウン', category: '背中', icon: '🔙' },
    { id: 'chest_press', name: 'チェストプレス', category: '胸', icon: '💪' },
    { id: 'shoulder_press', name: 'ショルダープレス', category: '肩', icon: '🤸' },
    { id: 'biceps_curl', name: 'バイセップスカール', category: '腕', icon: '💪' },
    { id: 'dips', name: 'ディップス', category: '胸/腕', icon: '🏋️' },
    { id: 'ab_bench', name: 'アブベンチ', category: '体幹', icon: '🧱' },
    { id: 'adduction', name: 'アダクション', category: '内転筋', icon: '🦵' },
    { id: 'treadmill', name: 'トレッドミル', category: '有酸素', icon: '🏃' }
  ];

  // デフォルト初期値
  const DEFAULTS = {
    leg_press:      { weight: 20, reps: 10, sets: 3 },
    lat_pulldown:   { weight: 15, reps: 10, sets: 3 },
    chest_press:    { weight: 10, reps: 10, sets: 3 },
    shoulder_press: { weight: 5,  reps: 10, sets: 3 },
    biceps_curl:    { weight: 5,  reps: 10, sets: 3 },
    dips:           { weight: 0,  reps: 5,  sets: 3 },
    ab_bench:       { weight: 0,  reps: 10, sets: 3 },
    adduction:      { weight: 10, reps: 12, sets: 3 },
    treadmill:      { weight: 0,  reps: 0,  sets: 1, durationMin: 10, speed: 5 }
  };

  // メニュータイプ別の種目構成
  const MENU_CONFIGS = {
    // 通常メニュー（30-45分）: 全身バランス
    full: {
      label: '通常メニュー',
      warmup: ['treadmill'],  // 5分ウォームアップ
      main: ['leg_press', 'chest_press', 'lat_pulldown', 'shoulder_press', 'ab_bench'],
      optional: ['biceps_curl', 'adduction', 'dips'],
      cooldown: ['treadmill'],      // 5分クールダウン
      estimatedMin: 50,
      targetMainCount: 4,
      targetOptionalCount: 1
    },
    // 短縮メニュー（20-30分）: 主要種目のみ
    short: {
      label: '短縮メニュー',
      warmup: ['treadmill'],
      main: ['leg_press', 'chest_press', 'lat_pulldown'],
      optional: ['ab_bench'],
      cooldown: [],
      estimatedMin: 35,
      targetMainCount: 3,
      targetOptionalCount: 0
    },
    // 有酸素（15-30分）
    cardio: {
      label: '有酸素のみ',
      warmup: [],
      main: ['treadmill'],
      optional: [],
      cooldown: [],
      estimatedMin: 20
    },
    // 回復ストレッチ（自宅）
    stretch: {
      label: '家で軽いストレッチ',
      warmup: [],
      main: [],
      optional: [],
      cooldown: [],
      estimatedMin: 10,
      homeExercises: [
        { name: '首回し', duration: '30秒 × 左右', icon: '🔄' },
        { name: '肩甲骨ストレッチ', duration: '30秒', icon: '🤸' },
        { name: '前屈（ハムストリング）', duration: '30秒', icon: '🙇' },
        { name: '股関節ストレッチ', duration: '30秒 × 左右', icon: '🧘' },
        { name: 'キャット&カウ', duration: '10回', icon: '🐱' },
        { name: '深呼吸', duration: '1分', icon: '🌬️' }
      ]
    }
  };

  const PROGRESSION = {
    repMin: 8,
    repMax: 12,
    legPressWeightCap: 60,
    legPressRepCap: 30,
    weightStep: 5,
    weightStableStreak: 2,
    setStableStreak: 4,
    legSetStableStreak: 3
  };

  const EXERCISE_PROFILES = {
    leg_press: { role: 'main', maxSets: 4, weightCap: 60, highRepCap: 30, weightStep: 5 },
    chest_press: { role: 'main', maxSets: 4, weightStep: 5 },
    lat_pulldown: { role: 'main', maxSets: 4, weightStep: 5 },
    shoulder_press: { role: 'main', maxSets: 4, weightStep: 5 },
    biceps_curl: { role: 'assist', maxSets: 3, weightStep: 5 },
    dips: { role: 'assist', maxSets: 3, weightStep: 0 },
    ab_bench: { role: 'assist', maxSets: 3, weightStep: 0 },
    adduction: { role: 'assist', maxSets: 3, weightStep: 5 }
  };

  const EXERCISE_BODY_AREAS = {
    leg_press: ['脚'],
    lat_pulldown: ['背中', '腕'],
    chest_press: ['胸', '肩', '腕'],
    shoulder_press: ['肩', '腕'],
    biceps_curl: ['腕'],
    dips: ['胸', '肩', '腕'],
    ab_bench: ['体幹'],
    adduction: ['脚']
  };

  const EXERCISE_ID_BY_NAME = EQUIPMENT.reduce((map, item) => {
    map[item.name] = item.id;
    return map;
  }, {});

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundToStep(value, step = PROGRESSION.weightStep) {
    if (!step) return Math.max(0, value);
    return Math.max(0, Math.round(value / step) * step);
  }

  function formatWeightStep(step) {
    const normalized = num(step, PROGRESSION.weightStep);
    return Number.isInteger(normalized) ? String(normalized) : String(normalized).replace(/\.0+$/, '');
  }

  function parseSorenessAreas(value) {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    return String(value || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  }

  function sorenessContext(condition = {}) {
    const level = num(condition.muscleSoreness, 0);
    const areas = parseSorenessAreas(condition.sorenessAreas);
    return {
      active: level >= 2 && areas.length > 0,
      level,
      areas,
      areaSet: new Set(areas)
    };
  }

  function equipmentIdFor(item) {
    return item?.id || item?.equipmentId || EXERCISE_ID_BY_NAME[item?.name] || '';
  }

  function blockedAreasFor(item, context) {
    if (!context.active) return [];
    const id = equipmentIdFor(item);
    const areas = EXERCISE_BODY_AREAS[id] || [];
    return areas.filter(area => context.areaSet.has(area));
  }

  function shouldAvoidForSoreness(item, context) {
    const id = equipmentIdFor(item);
    if (!id || id === 'treadmill') return false;
    return blockedAreasFor(item, context).length > 0;
  }

  function profileFor(equipment, flags, defaults) {
    const base = EXERCISE_PROFILES[equipment.id] || {};
    const isAssist = flags.optional || base.role === 'assist';
    return {
      ...base,
      repMin: base.repMin || PROGRESSION.repMin,
      repMax: base.repMax || PROGRESSION.repMax,
      maxSets: base.maxSets || (isAssist ? 3 : 4),
      defaultWeight: defaults.weight || 0,
      defaultReps: defaults.reps || 10,
      defaultSets: defaults.sets || 3,
      weightStep: base.weightStep ?? PROGRESSION.weightStep,
      isMain: !isAssist,
      isLegPress: equipment.id === 'leg_press'
    };
  }

  function analyzeRun(run, profile) {
    const sets = Array.isArray(run?.sets)
      ? [...run.sets].sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0))
      : [];
    const completed = sets.filter(set => set.completed);
    const measured = completed.length > 0 ? completed : sets;
    const repsList = measured.map(set => num(set.reps, 0)).filter(v => v > 0);
    const weightList = measured.map(set => num(set.weight, 0)).filter(v => v >= 0);
    const minReps = repsList.length ? Math.min(...repsList) : profile.defaultReps;
    const maxReps = repsList.length ? Math.max(...repsList) : profile.defaultReps;
    const workingWeight = weightList.length ? Math.min(...weightList) : profile.defaultWeight;
    const setCount = sets.length || profile.defaultSets;
    const allCompleted = sets.length > 0 && completed.length === sets.length;
    return {
      allCompleted,
      completedSets: completed.length,
      setCount,
      weight: workingWeight,
      minReps,
      maxReps,
      hitUpper: allCompleted && minReps >= profile.repMax,
      failedHard: sets.length > 0 && (!allCompleted || minReps < profile.repMin)
    };
  }

  function stableStreak(history, profile) {
    let stable = 0;
    for (const item of history) {
      if (item.workoutType && item.workoutType !== 'full') continue;
      const perf = analyzeRun(item, profile);
      if (!perf.allCompleted || perf.minReps < profile.repMax) break;
      stable++;
    }
    return stable;
  }

  function failureStreak(history, profile) {
    let failures = 0;
    for (const item of history) {
      if (item.workoutType && item.workoutType !== 'full') continue;
      const perf = analyzeRun(item, profile);
      if (!perf.failedHard) break;
      failures++;
    }
    return failures;
  }

  function daysBetween(dateStr, todayStr) {
    if (!dateStr || !todayStr) return 0;
    const from = new Date(`${dateStr}T00:00:00`);
    const to = new Date(`${todayStr}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
    return Math.max(0, Math.floor((to - from) / 86400000));
  }

  function nextLegPressReps(reps) {
    if (reps < 12) return reps + 1;
    if (reps < 15) return reps + 1;
    if (reps < 25) return Math.min(25, reps + 2);
    return Math.min(PROGRESSION.legPressRepCap, reps + 1);
  }

  function buildSets(count, weight, reps) {
    return Array.from({ length: count }, (_, index) => ({
      setNumber: index + 1,
      weight,
      reps,
      completed: false
    }));
  }

  const MENU_SLOT_BY_EXERCISE = {
    leg_press: 'lower',
    adduction: 'lower',
    chest_press: 'push',
    shoulder_press: 'push',
    dips: 'push',
    lat_pulldown: 'pull',
    biceps_curl: 'pull',
    ab_bench: 'core',
    treadmill: 'cardio'
  };

  const MENU_BASE_PRIORITY = {
    leg_press: 96,
    chest_press: 94,
    lat_pulldown: 93,
    shoulder_press: 74,
    ab_bench: 72,
    biceps_curl: 58,
    adduction: 56,
    dips: 52
  };

  function historyDaysAgo(history, todayStr) {
    const lastDate = Array.isArray(history) ? history.find(item => item?.workoutDate)?.workoutDate : '';
    if (!lastDate) return 99;
    return daysBetween(lastDate, todayStr);
  }

  function menuSignals(condition = {}) {
    const fatigue = num(condition.fatigue, 0);
    const soreness = num(condition.muscleSoreness, 0);
    const sleepMinutes = num(condition.sleepMinutes, 0);
    const motivation = num(condition.motivation, 3);
    const mood = num(condition.mood, 3);
    const steps = num(condition.steps, 0);
    const shiftType = String(condition.shiftType || '');
    const areas = new Set(parseSorenessAreas(condition.sorenessAreas));
    return {
      fatigue,
      soreness,
      sleepMinutes,
      motivation,
      mood,
      steps,
      shiftType,
      areas,
      recoveryLow: fatigue >= 4 || soreness >= 3 || (sleepMinutes > 0 && sleepMinutes < 360),
      recoveryVeryLow: fatigue >= 5 || soreness >= 4 || (sleepMinutes > 0 && sleepMinutes < 300),
      lowerLoadHigh: steps >= 12000 || shiftType === 'project' || shiftType === 'business_trip',
      upperSlightlySore: soreness >= 1 && ['胸', '肩', '腕', '背中'].some(area => areas.has(area)),
      lowerSlightlySore: soreness >= 1 && ['脚', '体幹'].some(area => areas.has(area)),
      motivationLow: motivation <= 2,
      moodLow: mood <= 2
    };
  }

  function scoreMenuCandidate(exerciseId, history, condition, todayStr, menuType, optional = false) {
    const slot = MENU_SLOT_BY_EXERCISE[exerciseId] || 'other';
    const signals = menuSignals(condition);
    const daysAgo = historyDaysAgo(history, todayStr);
    let score = MENU_BASE_PRIORITY[exerciseId] ?? 40;

    score += Math.min(daysAgo, 6) * 3;
    if (daysAgo <= 1) score -= 10;

    if (signals.recoveryLow) {
      if (slot === 'core') score += 10;
      if (exerciseId === 'shoulder_press' || exerciseId === 'dips' || exerciseId === 'biceps_curl') score -= 14;
      if (exerciseId === 'leg_press' || exerciseId === 'adduction') score -= 8;
    }

    if (signals.recoveryVeryLow) {
      if (optional) score -= 20;
      if (exerciseId === 'shoulder_press' || exerciseId === 'dips') score -= 10;
    }

    if (signals.lowerLoadHigh && (exerciseId === 'leg_press' || exerciseId === 'adduction')) {
      score -= 18;
    }

    if (signals.upperSlightlySore && (slot === 'push' || slot === 'pull')) {
      score -= 10;
    }

    if (signals.lowerSlightlySore && slot === 'lower') {
      score -= 10;
    }

    if (menuType === 'short') {
      if (slot === 'core') score += 6;
      if (optional) score -= 6;
    }

    if (signals.motivationLow || signals.moodLow) {
      if (exerciseId === 'ab_bench') score += 4;
      if (exerciseId === 'shoulder_press' || exerciseId === 'dips') score -= 6;
    }

    return { score, slot, daysAgo };
  }

  const Training = {
    EQUIPMENT,
    DEFAULTS,
    MENU_CONFIGS,

    sorenessContext,

    isBlockedBySoreness(exercise, condition) {
      return shouldAvoidForSoreness(exercise, sorenessContext(condition));
    },

    _pickBestCandidate(pool, used, predicate = null) {
      for (const candidate of pool) {
        if (used.has(candidate.exercise.equipmentId)) continue;
        if (predicate && !predicate(candidate)) continue;
        used.add(candidate.exercise.equipmentId);
        return candidate;
      }
      return null;
    },

    _selectStrengthMenu(config, mainPool, optionalPool, condition = {}, menuType = 'full') {
      const signals = menuSignals(condition);
      const used = new Set();
      const selectedMain = [];
      const selectedOptional = [];
      const mainTarget = Math.max(1, num(config.targetMainCount, mainPool.length));
      const optionalTarget = Math.max(0, num(config.targetOptionalCount, optionalPool.length));

      const requiredSlots = menuType === 'short'
        ? (signals.lowerLoadHigh ? ['push', 'pull', 'core'] : ['lower', 'push', 'pull'])
        : (signals.lowerLoadHigh ? ['push', 'pull', 'core'] : ['lower', 'push', 'pull', 'core']);

      requiredSlots.forEach(slot => {
        if (selectedMain.length >= mainTarget) return;
        const candidate = this._pickBestCandidate(mainPool, used, item => item.slot === slot);
        if (candidate) selectedMain.push(candidate);
      });

      while (selectedMain.length < mainTarget) {
        const candidate = this._pickBestCandidate(mainPool, used);
        if (!candidate) break;
        selectedMain.push(candidate);
      }

      const allowedOptional = signals.recoveryVeryLow
        ? 0
        : (signals.recoveryLow ? Math.min(optionalTarget, 1) : optionalTarget);

      while (selectedOptional.length < allowedOptional) {
        const candidate = this._pickBestCandidate(optionalPool, used);
        if (!candidate) break;
        selectedOptional.push(candidate);
      }

      return {
        main: selectedMain.map(item => item.exercise),
        optional: selectedOptional.map(item => item.exercise)
      };
    },

    filterExercisesForCondition(exercises, condition) {
      const context = sorenessContext(condition);
      if (!context.active || !Array.isArray(exercises)) {
        return { exercises: Array.isArray(exercises) ? exercises : [], removed: [] };
      }

      const removed = [];
      const filtered = exercises.filter(exercise => {
        if (!shouldAvoidForSoreness(exercise, context)) return true;
        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        const alreadyCompleted = sets.length > 0 && sets.every(set => set.completed);
        if (alreadyCompleted) return true;
        removed.push({
          name: exercise.name,
          areas: blockedAreasFor(exercise, context)
        });
        return false;
      });

      return { exercises: filtered, removed };
    },

    /**
     * 判定結果に基づいてメニュー種別を返す
     */
    getMenuType(judgmentResult) {
      switch (judgmentResult) {
        case 1: return 'full';
        case 2: return 'short';
        case 3: return 'cardio';
        case 4: return 'stretch';
        default: return null; // 5: skip
      }
    },

    /**
     * メニューを生成する
     * @param {string} menuType - full | short | cardio | stretch
     * @param {Object} options - { previousExercises }
     * @returns {Array} 生成されたエクササイズリスト
     */
    async generateMenu(menuType, options = {}) {
      const config = MENU_CONFIGS[menuType];
      if (!config) return [];
      const soreness = sorenessContext(options.condition || {});

      // ストレッチメニューは特別
      if (menuType === 'stretch') {
        return config.homeExercises.map(ex => ({
          ...ex,
          type: 'stretch',
          completed: false
        }));
      }

      const beforeDate = options.beforeDate || null;
      const historyFor = async (exerciseName) => {
        if (App.DB.getExerciseHistoryByName) {
          return App.DB.getExerciseHistoryByName(exerciseName, beforeDate, 8);
        }
        const last = await App.DB.getLastExerciseByName(exerciseName, beforeDate);
        return last ? [last] : [];
      };

      const allIds = [
        ...config.warmup,
        ...config.main,
        ...config.optional,
        ...config.cooldown
      ].filter((id, index, list) => list.indexOf(id) === index);
      const historyMap = new Map();
      for (const id of allIds) {
        const eq = EQUIPMENT.find(e => e.id === id);
        if (!eq) continue;
        historyMap.set(id, await historyFor(eq.name));
      }

      const exercises = [];

      // ウォームアップ
      for (const id of config.warmup) {
        const eq = EQUIPMENT.find(e => e.id === id);
        const history = historyMap.get(id) || [];
        exercises.push(this._buildExercise(eq, history, { isWarmup: true, menuType, today: beforeDate }));
      }

      const mainPool = config.main.map(id => {
        const eq = EQUIPMENT.find(e => e.id === id);
        if (!eq || shouldAvoidForSoreness(eq, soreness)) return null;
        const history = historyMap.get(id) || [];
        const exercise = this._buildExercise(eq, history, { menuType, today: beforeDate });
        const scored = scoreMenuCandidate(id, history, options.condition || {}, beforeDate, menuType, false);
        return { exercise, history, ...scored };
      }).filter(Boolean).sort((a, b) => b.score - a.score);

      const optionalPool = config.optional.map(id => {
        const eq = EQUIPMENT.find(e => e.id === id);
        if (!eq || shouldAvoidForSoreness(eq, soreness)) return null;
        const history = historyMap.get(id) || [];
        const exercise = this._buildExercise(eq, history, { optional: true, menuType, today: beforeDate });
        const scored = scoreMenuCandidate(id, history, options.condition || {}, beforeDate, menuType, true);
        return { exercise, history, ...scored };
      }).filter(Boolean).sort((a, b) => b.score - a.score);

      const selected = this._selectStrengthMenu(config, mainPool, optionalPool, options.condition || {}, menuType);
      exercises.push(...selected.main, ...selected.optional);

      if (!selected.main.length && !selected.optional.length && menuType !== 'cardio') {
        const fallbackCore = EQUIPMENT.find(e => e.id === 'ab_bench');
        if (fallbackCore && !shouldAvoidForSoreness(fallbackCore, soreness)) {
          exercises.push(this._buildExercise(fallbackCore, historyMap.get('ab_bench') || [], { optional: true, menuType, today: beforeDate }));
        }
      }

      // クールダウン
      for (const id of config.cooldown) {
        const eq = EQUIPMENT.find(e => e.id === id);
        const history = historyMap.get(id) || [];
        exercises.push(this._buildExercise(eq, history, { isCooldown: true, menuType, today: beforeDate }));
      }

      return exercises;
    },

    /**
     * 個別エクササイズの構築（安全な漸進的負荷ロジック）
     * 
     * 進歩判定の方針:
     * - 通常メニュー(full)のみ進歩判定を行う
     * - 短縮/有酸素/ストレッチ日は据え置き
     * - 全セット完了 + 全セット12回達成 × 2回連続 → 重量+2.5kg, 回数8にリセット
     * - まだ12回未達 → 回数+1のみ（ゆっくり伸ばす）
     * - 未完了セットあり → 据え置き
     * - 7日以上ブランク → -10%軽減して再開
     */
    // Deprecated reference only. Active menu generation uses _buildExercise() below.
    _buildExerciseLegacy(equipment, prevData, flags = {}) {
      const def = DEFAULTS[equipment.id] || { weight: 0, reps: 10, sets: 3 };
      const isCardio = equipment.category === '有酸素';
      const menuType = flags.menuType || 'full';
      const TARGET_REPS = 12;  // 目標上限回数
      const MIN_REPS = 8;      // 重量アップ後の初期回数
      const REQUIRED_STREAK = 2; // 重量アップに必要な連続達成数
      
      let weight = def.weight;
      let reps = def.reps;
      let sets = def.sets;
      let durationMin = def.durationMin || 0;
      let prevInfo = null;

      // 前回のデータがあれば参考にする
      if (prevData && prevData.sets) {
        const prevSets = typeof prevData.sets === 'object' ? prevData.sets : null;
        if (prevSets && prevSets.length > 0) {
          const lastSet = prevSets[prevSets.length - 1];
          weight = lastSet.weight ?? weight;
          reps = lastSet.reps ?? reps;
          sets = prevSets.length || sets;
          prevInfo = {
            date: prevData.workoutDate,
            weight,
            reps,
            sets,
            successStreak: prevData.successStreak || 0
          };
        } else {
          weight = prevData.weight ?? weight;
          reps = prevData.reps ?? reps;
        }
      }

      // 漸進的負荷の推奨値計算
      let recommendedWeight = weight;
      let recommendedReps = reps;
      let progressionNote = '';

      if (prevInfo && !isCardio) {
        // ブランク判定: 7日以上空いていたら軽減して再開
        const daysSince = prevInfo.date ? 
          Math.floor((new Date() - new Date(prevInfo.date + 'T00:00:00')) / 86400000) : 0;
        
        if (daysSince >= 7 && weight > 0) {
          // ブランク: -10%軽減（2.5kg単位に丸め）
          recommendedWeight = Math.max(0, Math.round((weight * 0.9) / 2.5) * 2.5);
          recommendedReps = MIN_REPS;
          progressionNote = `${daysSince}日ぶり → 軽めから再開`;
        } else if (menuType === 'full') {
          // 通常メニューのみ進歩判定
          const streak = prevInfo.successStreak || 0;
          const allCompleted = (prevData.sets || []).every?.(s => s.completed);

          if (allCompleted && streak >= REQUIRED_STREAK && reps >= TARGET_REPS) {
            // ★重量アップ条件: 2回連続で全セット完了+12回達成
            recommendedWeight = weight + 2.5;
            recommendedReps = MIN_REPS;
            progressionNote = `${streak}回連続達成 → +2.5kg`;
          } else if (allCompleted && reps < TARGET_REPS) {
            // まだ上限未達 → 回数+1のみ
            recommendedReps = Math.min(reps + 1, TARGET_REPS);
            recommendedWeight = weight;
            progressionNote = reps < TARGET_REPS ? `回数を増やす (${reps}→${recommendedReps})` : '';
          } else {
    // 未完了 → 据え置き
            recommendedWeight = weight;
            recommendedReps = reps;
            progressionNote = '前回のメニューを継続';
          }
        } else {
          // 短縮/有酸素日 → 進歩判定なし、据え置き
          recommendedWeight = weight;
          recommendedReps = reps;
          progressionNote = '今日は調整日';
        }
      }

      // ウォームアップ・クールダウン
      if (flags.isWarmup) {
        durationMin = 5;
        sets = 1;
      }
      if (flags.isCooldown) {
        durationMin = 5;
        sets = 1;
      }

      // ★★★ 推奨値を実際のセットに適用する ★★★
      // UIに表示する「今日のメニュー」は recommended 値を使用する
      const actualWeight = isCardio ? 0 : recommendedWeight;
      const actualReps = isCardio ? 0 : recommendedReps;

      const setsArray = [];
      for (let i = 0; i < sets; i++) {
        setsArray.push({
          setNumber: i + 1,
          weight: actualWeight,
          reps: actualReps,
          completed: false
        });
      }

      return {
        name: equipment.name,
        equipmentId: equipment.id,
        category: equipment.category,
        icon: equipment.icon,
        isCardio,
        isWarmup: flags.isWarmup || false,
        isCooldown: flags.isCooldown || false,
        optional: flags.optional || false,
        sets: setsArray,
        durationMin: isCardio ? durationMin : 0,
        previous: prevInfo,
        recommended: {
          weight: isCardio ? 0 : recommendedWeight,
          reps: isCardio ? 0 : recommendedReps,
          note: progressionNote
        }
      };
    },

    /**
     * メニュータイプの推定所要時間
     */
    _buildExercise(equipment, historyInput, flags = {}) {
      const def = DEFAULTS[equipment.id] || { weight: 0, reps: 10, sets: 3 };
      const isCardio = equipment.id === 'treadmill' || equipment.category === '有酸素';
      const menuType = flags.menuType || 'full';
      const profile = profileFor(equipment, flags, def);
      const history = Array.isArray(historyInput)
        ? historyInput.filter(Boolean)
        : (historyInput ? [historyInput] : []);
      const latest = history[0] || null;
      const basis = menuType === 'full'
        ? (history.find(item => !item.workoutType || item.workoutType === 'full') || latest)
        : latest;
      const perf = basis ? analyzeRun(basis, profile) : null;
      const stable = stableStreak(history, profile);
      const failures = failureStreak(history, profile);
      const today = flags.today || App.Utils?.today?.() || new Date().toISOString().slice(0, 10);
      const daysSinceLast = latest?.workoutDate ? daysBetween(latest.workoutDate, today) : 0;
      const progressAllowed = menuType === 'full' && !flags.isWarmup && !flags.isCooldown;

      let weight = perf ? perf.weight : def.weight;
      let reps = perf ? perf.minReps : def.reps;
      let sets = perf ? perf.setCount : def.sets;
      let note = '初回設定';
      let phase = 'form';
      let capReached = false;

      if (isCardio) {
        const durationMin = flags.isWarmup || flags.isCooldown ? 5 : (def.durationMin || 10);
        const speed = num(latest?.speed, def.speed || 5);
        return {
          name: equipment.name,
          equipmentId: equipment.id,
          category: equipment.category,
          icon: equipment.icon,
          isCardio,
          isWarmup: !!flags.isWarmup,
          isCooldown: !!flags.isCooldown,
          optional: !!flags.optional,
          sets: buildSets(1, 0, 0),
          durationMin,
          speed,
          previous: latest ? {
            date: latest.workoutDate,
            weight: 0,
            reps: 0,
            speed: num(latest.speed, speed),
            durationMin: num(latest.durationMin, durationMin),
            sets: latest.sets?.length || 1,
            successStreak: stable
          } : null,
          recommended: { weight: 0, reps: 0, sets: 1, note: '時間だけ調整' },
          progressionState: { phase: 'cardio', stableStreak: stable, failureStreak: failures, daysSince: daysSinceLast }
        };
      }

      if (flags.isWarmup || flags.isCooldown) {
        sets = 1;
        reps = 0;
        note = flags.isWarmup ? 'ウォームアップ' : 'クールダウン';
        phase = 'warmup';
      } else if (!basis) {
        weight = def.weight;
        reps = def.reps;
        sets = def.sets;
      } else if (daysSinceLast >= 14 && weight > 0) {
        weight = roundToStep(weight * 0.85, profile.weightStep);
        reps = profile.repMin;
        sets = Math.max(profile.defaultSets, Math.min(sets, profile.defaultSets + 1));
        note = '14日以上空いたので軽め';
        phase = 'deload';
      } else if (daysSinceLast >= 7 && weight > 0) {
        weight = roundToStep(weight * 0.9, profile.weightStep);
        reps = profile.repMin;
        note = '7日以上空いたので軽め';
        phase = 'deload';
      } else if (!progressAllowed) {
        reps = clamp(reps, profile.repMin, profile.isLegPress && weight >= PROGRESSION.legPressWeightCap ? PROGRESSION.legPressRepCap : profile.repMax);
        sets = Math.min(sets, Math.max(profile.defaultSets, 2));
        note = '調整日: 据え置き';
        phase = 'maintain';
      } else if (perf?.failedHard) {
        if (failures >= 2 && weight > 0) {
          weight = roundToStep(Math.max(0, weight - profile.weightStep), profile.weightStep);
          reps = profile.repMin;
          note = '未達が続いたので軽め';
        } else {
          reps = clamp(Math.max(profile.repMin, reps - 1), profile.repMin, profile.repMax);
          note = '重量維持で整える';
        }
        phase = 'reset';
      } else if (profile.isLegPress) {
        if (weight >= PROGRESSION.legPressWeightCap) {
          weight = PROGRESSION.legPressWeightCap;
          capReached = true;
          if (perf?.allCompleted && stable >= PROGRESSION.legSetStableStreak && reps >= 20 && sets < profile.maxSets) {
            sets += 1;
            reps = 20;
            note = '60kg固定でセット追加';
            phase = 'volume';
          } else if (perf?.allCompleted && reps < PROGRESSION.legPressRepCap) {
            reps = nextLegPressReps(reps);
            note = '60kg固定で回数を伸ばす';
            phase = 'high-rep';
          } else {
            reps = Math.min(reps, PROGRESSION.legPressRepCap);
            note = '60kg上限を維持';
            phase = 'cap-maintain';
          }
        } else if (perf?.allCompleted && reps < profile.repMax) {
          reps += 1;
          note = '回数を1つ増やす';
          phase = 'reps';
        } else if (perf?.allCompleted && stable >= PROGRESSION.weightStableStreak) {
          weight = Math.min(PROGRESSION.legPressWeightCap, roundToStep(weight + profile.weightStep, profile.weightStep));
          reps = weight >= PROGRESSION.legPressWeightCap ? 10 : profile.repMin;
          note = weight >= PROGRESSION.legPressWeightCap ? '60kg到達。次は回数' : `+${formatWeightStep(profile.weightStep)}kg候補`;
          phase = 'weight';
          capReached = weight >= PROGRESSION.legPressWeightCap;
        } else if (perf?.allCompleted) {
          note = '重量維持。次回アップ候補';
          phase = 'stabilize';
        }
      } else if (perf?.allCompleted && reps < profile.repMax) {
        reps += 1;
        note = '回数を1つ増やす';
        phase = 'reps';
      } else if (perf?.allCompleted && stable >= PROGRESSION.setStableStreak && sets < profile.maxSets) {
        sets += 1;
        reps = profile.repMin;
        note = profile.isMain ? '安定したのでセット追加' : '補助は軽くセット追加';
        phase = 'volume';
      } else if (perf?.allCompleted && stable >= PROGRESSION.weightStableStreak && profile.weightStep > 0) {
        weight = roundToStep(weight + profile.weightStep, profile.weightStep);
        reps = profile.repMin;
        note = `+${formatWeightStep(profile.weightStep)}kg候補`;
        phase = 'weight';
      } else if (perf?.allCompleted) {
        note = '重量維持。次回アップ候補';
        phase = 'stabilize';
      }

      if (profile.isLegPress) {
        weight = Math.min(PROGRESSION.legPressWeightCap, weight);
        if (weight >= PROGRESSION.legPressWeightCap) {
          capReached = true;
          reps = Math.min(reps, PROGRESSION.legPressRepCap);
        }
      }

      sets = clamp(Math.round(sets), 1, profile.maxSets);
      reps = Math.max(0, Math.round(reps));
      weight = profile.weightStep ? roundToStep(weight, profile.weightStep) : Math.max(0, weight);

      const prevInfo = basis ? {
        date: basis.workoutDate,
        weight: perf.weight,
        reps: perf.minReps,
        sets: perf.setCount,
        completedSets: perf.completedSets,
        successStreak: stable,
        phase
      } : null;

      return {
        name: equipment.name,
        equipmentId: equipment.id,
        category: equipment.category,
        icon: equipment.icon,
        isCardio,
        isWarmup: !!flags.isWarmup,
        isCooldown: !!flags.isCooldown,
        optional: !!flags.optional,
        weightStep: profile.weightStep,
        sets: buildSets(sets, weight, reps),
        durationMin: 0,
        previous: prevInfo,
        recommended: {
          weight,
          reps,
          sets,
          note
        },
        progressionState: {
          phase,
          stableStreak: stable,
          failureStreak: failures,
          daysSince: daysSinceLast,
          capReached,
          progressAllowed
        }
      };
    },

    getEstimatedDuration(menuType) {
      const config = MENU_CONFIGS[menuType];
      return config ? config.estimatedMin : 0;
    },

    /**
     * 全機材リストを返す
     */
    getEquipmentList() {
      return EQUIPMENT;
    },

    /**
     * 機材情報を取得
     */
    getEquipment(id) {
      return EQUIPMENT.find(e => e.id === id);
    }
  };

  App.Training = Training;
})();
