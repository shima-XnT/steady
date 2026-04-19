// ============================================
// Steady — トレーニング生成エンジン
// チョコザップ機材ベースのメニュー設計
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};

  // チョコザップ利用可能機材
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

  // デフォルト初期値（初心者向け）
  const DEFAULTS = {
    leg_press:      { weight: 20, reps: 10, sets: 2 },
    lat_pulldown:   { weight: 15, reps: 10, sets: 2 },
    chest_press:    { weight: 10, reps: 10, sets: 2 },
    shoulder_press: { weight: 5,  reps: 10, sets: 2 },
    biceps_curl:    { weight: 5,  reps: 10, sets: 2 },
    dips:           { weight: 0,  reps: 5,  sets: 2 },
    ab_bench:       { weight: 0,  reps: 10, sets: 2 },
    adduction:      { weight: 10, reps: 12, sets: 2 },
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
      estimatedMin: 40
    },
    // 短縮メニュー（20-30分）: 主要種目のみ
    short: {
      label: '短縮メニュー',
      warmup: ['treadmill'],
      main: ['leg_press', 'chest_press', 'lat_pulldown'],
      optional: ['ab_bench'],
      cooldown: [],
      estimatedMin: 25
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

  const Training = {
    EQUIPMENT,
    DEFAULTS,
    MENU_CONFIGS,

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

      // ストレッチメニューは特別
      if (menuType === 'stretch') {
        return config.homeExercises.map(ex => ({
          ...ex,
          type: 'stretch',
          completed: false
        }));
      }

      const exercises = [];

      // ウォームアップ
      for (const id of config.warmup) {
        const eq = EQUIPMENT.find(e => e.id === id);
        const prev = await App.DB.getLastExerciseByName(eq.name);
        exercises.push(this._buildExercise(eq, prev, { isWarmup: true, menuType }));
      }

      // メイン種目
      for (const id of config.main) {
        const eq = EQUIPMENT.find(e => e.id === id);
        if (!eq) continue;
        const prev = await App.DB.getLastExerciseByName(eq.name);
        exercises.push(this._buildExercise(eq, prev, { menuType }));
      }

      // オプション種目
      for (const id of config.optional) {
        const eq = EQUIPMENT.find(e => e.id === id);
        if (!eq) continue;
        const prev = await App.DB.getLastExerciseByName(eq.name);
        exercises.push(this._buildExercise(eq, prev, { optional: true, menuType }));
      }

      // クールダウン
      for (const id of config.cooldown) {
        const eq = EQUIPMENT.find(e => e.id === id);
        const prev = await App.DB.getLastExerciseByName(eq.name);
        exercises.push(this._buildExercise(eq, prev, { isCooldown: true, menuType }));
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
    _buildExercise(equipment, prevData, flags = {}) {
      const def = DEFAULTS[equipment.id] || { weight: 0, reps: 10, sets: 2 };
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
            // 未完了 → 据え置き（無理しない）
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
